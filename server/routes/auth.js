// Auth routes: signup (first run), login, logout, /me
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { users, sessions, workspaces, auditLog } from '../db/schema.js';
import { eq, count } from 'drizzle-orm';
import { resolveUser, setSessionCookie, clearSessionCookie, getSessionId, requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/ratelimit.js';
import { verifyTotpOrRecovery } from './totp.js';

const app = new Hono();

const newId = (prefix = '') => prefix + randomBytes(12).toString('hex');
const initialsOf = (name) => name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const SESSION_DAYS = 14;

// GET /api/auth/setup-state
// Returns whether the system has been set up (any users exist).
app.get('/setup-state', async (c) => {
  const [{ n }] = await db.select({ n: count() }).from(users);
  return c.json({ setupComplete: n > 0 });
});

// POST /api/auth/signup
// Only works if no users exist yet (first-run setup) — creates a workspace + super_admin user.
app.post('/signup', rateLimit({ key: 'signup', max: 5, windowMs: 60_000 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password, name, workspaceName, candidate, party } = body;

  if (!email || !password || !name) return c.json({ error: 'email, password, name required' }, 400);
  if (password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);

  const [{ n }] = await db.select({ n: count() }).from(users);
  if (n > 0) return c.json({ error: 'setup already complete' }, 403);

  const wsId = newId('ws_');
  const userId = newId('u_');
  const passwordHash = await bcrypt.hash(password, 10);

  await db.insert(workspaces).values({
    id: wsId,
    name: workspaceName || 'Default Workspace',
    kind: 'PROVINCIAL · MLA',
    candidate: candidate || name,
    party: party || '',
    phase: 'Persuasion',
    daysToVote: 127,
    tz: 'PT',
    settings: '{}',
  });

  await db.insert(users).values({
    id: userId,
    email: email.toLowerCase(),
    passwordHash,
    name,
    initials: initialsOf(name),
    role: 'super_admin',
    workspaceId: wsId,
    active: true,
  });

  // create session immediately
  const sid = newId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.insert(sessions).values({ id: sid, userId, expiresAt });
  setSessionCookie(c, sid, SESSION_DAYS * 86400);

  await db.insert(auditLog).values({ id: newId(), userId, action: 'auth.signup', target: userId });

  return c.json({ ok: true, user: { id: userId, email, name, role: 'super_admin', workspaceId: wsId } });
});

// POST /api/auth/login
app.post('/login', rateLimit({ key: 'login', max: 10, windowMs: 60_000 }), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { email, password } = body;
  if (!email || !password) return c.json({ error: 'email and password required' }, 400);

  const rows = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  const user = rows[0];
  // Reject pending-invite accounts (passwordHash starts with INVITE: sentinel — bcrypt would fail anyway, but be explicit)
  if (user && user.passwordHash.startsWith('INVITE:')) return c.json({ error: 'pending invite — please check your invite link' }, 401);
  // Always run bcrypt to avoid timing oracle on existence
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidiu7OBh4WfknSCmYCa9LUf9jJ5rdQFbKO');
  if (!user || !ok || !user.active) return c.json({ error: 'invalid credentials' }, 401);

  // 2FA gate
  if (user.totpEnabled) {
    const totpCode = body.totpCode || body.code;
    if (!totpCode) return c.json({ error: '2FA code required', requires_2fa: true }, 401);
    const totpOk = await verifyTotpOrRecovery(user, totpCode);
    if (!totpOk) return c.json({ error: 'invalid 2FA code', requires_2fa: true }, 401);
  }

  const sid = newId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400 * 1000);
  await db.insert(sessions).values({ id: sid, userId: user.id, expiresAt });
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  setSessionCookie(c, sid, SESSION_DAYS * 86400);

  await db.insert(auditLog).values({ id: newId(), userId: user.id, action: 'auth.login' });

  return c.json({ ok: true, user: sanitize(user) });
});

// POST /api/auth/logout
app.post('/logout', async (c) => {
  const sid = getSessionId(c);
  if (sid) {
    await db.delete(sessions).where(eq(sessions.id, sid));
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

// POST /api/auth/logout-all  — kill every session for the current user
app.post('/logout-all', requireAuth, async (c) => {
  const me = c.get('user');
  await db.delete(sessions).where(eq(sessions.userId, me.id));
  clearSessionCookie(c);
  await db.insert(auditLog).values({ id: newId(), userId: me.id, action: 'auth.logout_all' });
  return c.json({ ok: true });
});

// GET /api/auth/me
app.get('/me', async (c) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ user: null });
  return c.json({ user: sanitize(user) });
});

// PUT /api/auth/me  — change profile + password
app.put('/me', requireAuth, async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const updates = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
    updates.initials = initialsOf(body.name);
  }
  if (typeof body.email === 'string' && body.email.trim()) {
    updates.email = body.email.trim().toLowerCase();
  }
  if (typeof body.password === 'string' && body.password) {
    if (!body.currentPassword) return c.json({ error: 'currentPassword required to change password' }, 400);
    const ok = await bcrypt.compare(body.currentPassword, me.passwordHash);
    if (!ok) return c.json({ error: 'current password incorrect' }, 400);
    if (body.password.length < 8) return c.json({ error: 'new password must be at least 8 characters' }, 400);
    updates.passwordHash = await bcrypt.hash(body.password, 10);
  }
  if (Object.keys(updates).length === 0) return c.json({ ok: true, user: sanitize(me) });
  updates.updatedAt = new Date();
  await db.update(users).set(updates).where(eq(users.id, me.id));
  const fresh = (await db.select().from(users).where(eq(users.id, me.id)).limit(1))[0];
  return c.json({ ok: true, user: sanitize(fresh) });
});

function sanitize(u) {
  if (!u) return null;
  const { passwordHash, totpSecret, recoveryCodesHash, ...rest } = u;
  // Expose only `totpEnabled` flag
  return rest;
}

export default app;
