// OAuth/OIDC SSO. Two surfaces:
//   /api/auth/oauth/providers   — public, returns the providers visible at sign-in
//   /api/auth/oauth/start/:id   — public, redirects to provider's authorize URL
//   /api/auth/oauth/callback    — public, handles ?code=…&state=…
//   /api/oauth-providers        — admin CRUD
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { oauthProviders, users, sessions, workspaces, auditLog } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { requireAuth, requireRole, setSessionCookie } from '../middleware/auth.js';
import { planFor, hasFeature, assertQuota, QuotaError } from '../lib/plans.js';
import { getDiscovery, buildAuthorizeUrl, exchangeCodeForUser } from '../lib/oauth.js';

const SESSION_DAYS = 14;
const newId = (p='') => p + randomBytes(12).toString('hex');
const initialsOf = (n) => n.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const STATE_COOKIE = 'mdt_oauth_state';

function setStateCookie(c, value) {
  c.header('Set-Cookie', `${STATE_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600`);
}
function clearStateCookie(c) {
  c.header('Set-Cookie', `${STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}
function getStateCookie(c) {
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)mdt_oauth_state=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ── Public surface ─────────────────────────────────────────────────────

export const publicApp = new Hono();

// GET /api/auth/oauth/providers → providers across ALL workspaces (the email-based
// link strategy means we don't know which workspace the user is going to until
// after they sign in). For prototype, we return all providers from all workspaces;
// in production, scope to a hostname allowlist or enrollment domain.
publicApp.get('/providers', async (c) => {
  const rows = await db.select().from(oauthProviders).where(eq(oauthProviders.active, true));
  return c.json({
    providers: rows.map(p => ({
      id: p.id, label: p.label, kind: p.kind, workspaceId: p.workspaceId,
    })),
  });
});

publicApp.get('/start/:id', async (c) => {
  const id = c.req.param('id');
  const p = (await db.select().from(oauthProviders).where(and(eq(oauthProviders.id, id), eq(oauthProviders.active, true))).limit(1))[0];
  if (!p) return c.text('provider not found', 404);

  const state = randomBytes(16).toString('hex');
  const nonce = randomBytes(12).toString('hex');
  // Pack state with provider id for the callback
  const stateWithProvider = `${id}:${state}`;
  setStateCookie(c, stateWithProvider);

  const origin = c.req.header('origin') || new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/oauth/callback`;
  const meta = await getDiscovery(p);
  const url = buildAuthorizeUrl(meta, p, { state: stateWithProvider, nonce, redirectUri });
  return c.redirect(url);
});

publicApp.get('/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.text('missing code or state', 400);

  const expected = getStateCookie(c);
  if (!expected || expected !== state) return c.text('invalid state', 400);
  clearStateCookie(c);

  const [providerId] = state.split(':');
  const p = (await db.select().from(oauthProviders).where(eq(oauthProviders.id, providerId)).limit(1))[0];
  if (!p) return c.text('provider not found', 404);

  const origin = new URL(c.req.url).origin;
  const redirectUri = `${origin}/api/auth/oauth/callback`;

  let userInfo;
  try {
    const meta = await getDiscovery(p);
    userInfo = await exchangeCodeForUser(meta, p, { code, redirectUri });
  } catch (e) {
    return c.text('OAuth callback failed: ' + e.message, 500);
  }

  // Find or auto-create user
  let user = (await db.select().from(users).where(eq(users.email, userInfo.email)).limit(1))[0];

  if (!user) {
    if (!p.autoProvision) {
      // Don't auto-create — redirect to login with an error
      return c.redirect(`/?oauth_error=${encodeURIComponent('No Mandate account for ' + userInfo.email)}`);
    }
    // Provision a new user in the provider's workspace
    const id = newId('u_');
    await db.insert(users).values({
      id,
      email: userInfo.email,
      passwordHash: '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalid_',  // unusable (must use OAuth)
      name: userInfo.name,
      initials: initialsOf(userInfo.name),
      role: p.autoProvisionRole || 'viewer',
      workspaceId: p.workspaceId,
      active: true,
    });
    user = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    await db.insert(auditLog).values({ id: newId('a_'), userId: user.id, action: 'oauth.provision', target: id });
  }

  if (!user.active) return c.text('account disabled', 403);

  // Sign in
  const sid = newId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  setSessionCookie(c, sid, SESSION_DAYS * 86400);

  await db.insert(auditLog).values({
    id: newId('a_'), userId: user.id, action: 'auth.oauth_login',
    target: providerId, meta: JSON.stringify({ kind: p.kind }),
  });

  // Redirect home
  return c.redirect('/');
});

// ── Admin surface ──────────────────────────────────────────────────────

export const adminApp = new Hono();
adminApp.use('*', requireAuth, requireRole('admin'));

const sanitize = (p) => {
  if (!p) return null;
  const { clientSecret, discoveryCache, ...rest } = p;
  return { ...rest, hasSecret: !!clientSecret };
};

adminApp.get('/', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(oauthProviders)
    .where(eq(oauthProviders.workspaceId, me.workspaceId));
  return c.json({ providers: rows.map(sanitize) });
});

adminApp.post('/', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { label, kind, issuerUrl, clientId, clientSecret, scopes, autoProvision, autoProvisionRole } = body;
  if (!label || !kind || !clientId || !clientSecret) return c.json({ error: 'label, kind, clientId, clientSecret required' }, 400);
  if (!['google', 'oidc'].includes(kind)) return c.json({ error: 'kind must be google or oidc' }, 400);
  if (kind === 'oidc' && !issuerUrl) return c.json({ error: 'issuerUrl required for generic oidc' }, 400);

  const plan = await planFor(me.workspaceId);
  if (!hasFeature(plan, 'sso')) return c.json({ error: `SSO requires a higher plan (current: ${plan.label}). Upgrade to enable.`, code: 'FEATURE_GATED', feature: 'sso', plan: plan.key }, 402);
  try { await assertQuota(me.workspaceId, 'oauthProviders'); }
  catch (e) { if (e instanceof QuotaError) return c.json({ error: e.message, code: e.code, quota: e.quota, limit: e.limit, current: e.current }, 402); throw e; }

  const id = newId('oap_');
  await db.insert(oauthProviders).values({
    id, workspaceId: me.workspaceId, label, kind,
    issuerUrl: issuerUrl || null,
    clientId, clientSecret,
    scopes: scopes || 'openid email profile',
    autoProvision: !!autoProvision,
    autoProvisionRole: autoProvisionRole || 'viewer',
    active: true,
  });
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'oauth_provider.create', target: id });
  const fresh = (await db.select().from(oauthProviders).where(eq(oauthProviders.id, id)).limit(1))[0];
  return c.json({ ok: true, provider: sanitize(fresh) });
});

adminApp.put('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const row = (await db.select().from(oauthProviders).where(and(eq(oauthProviders.id, id), eq(oauthProviders.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);

  const updates = {};
  for (const k of ['label', 'issuerUrl', 'clientId', 'clientSecret', 'scopes', 'autoProvisionRole']) {
    if (typeof body[k] === 'string' && body[k].trim()) updates[k] = body[k].trim();
  }
  if (typeof body.autoProvision === 'boolean') updates.autoProvision = body.autoProvision;
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (Object.keys(updates).length === 0) return c.json({ ok: true });

  await db.update(oauthProviders).set(updates).where(eq(oauthProviders.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'oauth_provider.update', target: id });
  return c.json({ ok: true });
});

adminApp.delete('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(oauthProviders).where(and(eq(oauthProviders.id, id), eq(oauthProviders.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(oauthProviders).where(eq(oauthProviders.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'oauth_provider.delete', target: id });
  return c.json({ ok: true });
});

export default adminApp;
