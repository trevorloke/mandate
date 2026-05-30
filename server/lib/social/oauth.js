// Generic OAuth 2.0 connect framework shared by the gated providers (X,
// LinkedIn, Meta). Each provider supplies an `oauth` config (authorize/token
// URLs, scopes, pkce flag, identity()); this module drives the redirect dance:
//   buildAuthorizeUrl()  → store state(+PKCE), return provider authorize URL
//   handleCallback()      → verify state, exchange code, fetch identity, store account
import { randomBytes, createHash } from 'crypto';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { socialApps, socialOauthStates, socialAccounts, auditLog } from '../../db/schema.js';
import { encryptJson, decrypt } from '../crypto.js';
import { getProvider } from './index.js';

const STATE_TTL_MS = 10 * 60 * 1000;
const newId = (p) => p + randomBytes(12).toString('hex');
const safeJson = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// Resolve a workspace's configured developer app for a platform (secret decrypted).
export async function getApp(workspaceId, platform) {
  const row = (await db.select().from(socialApps)
    .where(and(eq(socialApps.workspaceId, workspaceId), eq(socialApps.platform, platform))).limit(1))[0];
  if (!row || !row.active) return null;
  return { clientId: row.clientId, clientSecret: decrypt(row.clientSecret), extra: safeJson(row.extra) };
}

export async function buildAuthorizeUrl({ provider, app, workspaceId, userId, redirectUri, returnTo }) {
  const oa = provider.oauth;
  const state = newId('st_');
  let codeVerifier = null;
  const extra = {};
  if (oa.pkce) {
    const { verifier, challenge } = pkcePair();
    codeVerifier = verifier;
    extra.code_challenge = challenge;
    extra.code_challenge_method = 'S256';
  }
  await db.insert(socialOauthStates).values({
    id: state, workspaceId, userId, platform: provider.id,
    codeVerifier, redirectUri, returnTo: returnTo || null,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: app.clientId,
    redirect_uri: redirectUri,
    scope: (oa.scopes || []).join(oa.scopeSep || ' '),
    state,
    ...extra,
    ...(oa.authorizeParams ? oa.authorizeParams(app) : {}),
  });
  return `${oa.authorizeUrl}?${params.toString()}`;
}

async function defaultExchange({ oa, code, redirectUri, codeVerifier, app }) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: app.clientId,
  });
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  if (oa.clientAuth === 'basic') {
    headers.Authorization = 'Basic ' + Buffer.from(`${app.clientId}:${app.clientSecret}`).toString('base64');
  } else if (app.clientSecret) {
    body.set('client_secret', app.clientSecret);
  }
  const res = await fetch(oa.tokenUrl, { method: 'POST', headers, body });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error_description || j.error || `token exchange failed (${res.status})`);
  return j;
}

export async function handleCallback({ code, state }) {
  const row = (await db.select().from(socialOauthStates).where(eq(socialOauthStates.id, state)).limit(1))[0];
  if (!row) throw new Error('invalid or expired connection state');
  await db.delete(socialOauthStates).where(eq(socialOauthStates.id, state));
  if (new Date(row.expiresAt).getTime() < Date.now()) throw new Error('connection request expired — try again');

  const provider = getProvider(row.platform);
  if (!provider?.oauth) throw new Error('unknown platform');
  const app = await getApp(row.workspaceId, row.platform);
  if (!app) throw new Error('developer app is not configured');

  const oa = provider.oauth;
  const tokens = oa.exchange
    ? await oa.exchange({ code, redirectUri: row.redirectUri, codeVerifier: row.codeVerifier, app })
    : await defaultExchange({ oa, code, redirectUri: row.redirectUri, codeVerifier: row.codeVerifier, app });

  const profile = await oa.identity({ tokens, app });

  const id = newId('sa_');
  await db.insert(socialAccounts).values({
    id, workspaceId: row.workspaceId, platform: provider.id,
    handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl || null,
    remoteId: profile.remoteId || null, instanceUrl: profile.instanceUrl || null,
    credentials: encryptJson(profile.credentials),
    scopes: (profile.scopes || oa.scopes || []).join(' '),
    status: 'connected', lastVerifiedAt: new Date(), createdById: row.userId || null,
  });

  // Some providers surface additional linked accounts (e.g. Meta → Instagram).
  for (const extra of (profile.extraAccounts || [])) {
    await db.insert(socialAccounts).values({
      id: newId('sa_'), workspaceId: row.workspaceId, platform: extra.platform,
      handle: extra.handle, displayName: extra.displayName, avatarUrl: extra.avatarUrl || null,
      remoteId: extra.remoteId || null, instanceUrl: extra.instanceUrl || null,
      credentials: encryptJson(extra.credentials),
      scopes: (extra.scopes || []).join(' '),
      status: 'connected', lastVerifiedAt: new Date(), createdById: row.userId || null,
    });
  }

  try {
    await db.insert(auditLog).values({ id: newId('a_'), userId: row.userId || null,
      action: 'social.account.connect', target: id, meta: JSON.stringify({ platform: provider.id, via: 'oauth', extra: (profile.extraAccounts || []).length }) });
  } catch { /* non-fatal */ }

  return { workspaceId: row.workspaceId, accountId: id, returnTo: row.returnTo, platform: provider.id };
}

export async function purgeExpiredStates() {
  try { await db.delete(socialOauthStates).where(lt(socialOauthStates.expiresAt, new Date())); } catch { /* ignore */ }
}
