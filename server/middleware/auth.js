// Auth + RBAC middleware
import { createHash } from 'crypto';
import { db } from '../db/index.js';
import { sessions, users, apiTokens } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';

const SESSION_COOKIE = 'mdt_session';
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function getSessionId(c) {
  const cookie = c.req.header('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)mdt_session=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function setSessionCookie(c, sessionId, maxAgeSec = 60 * 60 * 24 * 14) {
  c.header(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSec}`
  );
}

export function clearSessionCookie(c) {
  c.header('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

// Resolves the current user from either a session cookie or a Bearer API token.
// For Bearer tokens, also returns scopes (cookie sessions = full ['read','write']).
export async function resolveUser(c) {
  // Try Bearer token first (machine clients)
  const authHeader = c.req.header('authorization') || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('mdt_')) {
      const hash = sha256(token);
      const now = new Date();
      const rows = await db.select({
        user: users,
        token: apiTokens,
      }).from(apiTokens)
        .innerJoin(users, eq(users.id, apiTokens.userId))
        .where(eq(apiTokens.tokenHash, hash))
        .limit(1);
      if (rows.length) {
        const { user, token: tok } = rows[0];
        if (tok.revoked || !user.active) return null;
        if (tok.expiresAt && tok.expiresAt < now) return null;
        // Update lastUsedAt async (don't await)
        db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, tok.id))
          .catch(() => {});
        // Attach scopes for downstream middleware to inspect
        let scopes = ['read', 'write'];
        try { scopes = JSON.parse(tok.scopes || '["read","write"]'); } catch {}
        c.set('tokenScopes', Array.isArray(scopes) && scopes.length ? scopes : ['read', 'write']);
        c.set('authMethod', 'token');
        return user;
      }
      return null;
    }
  }

  // Fall back to session cookie (browser clients) — full scope
  const sid = getSessionId(c);
  if (!sid) return null;
  const now = new Date();
  const rows = await db.select({
    user: users,
    expiresAt: sessions.expiresAt,
  }).from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!rows.length) return null;
  const u = rows[0].user;
  if (!u.active) return null;
  c.set('tokenScopes', ['read', 'write']);
  c.set('authMethod', 'session');
  return u;
}

// Middleware: requires authenticated user
export const requireAuth = async (c, next) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  c.set('user', user);
  await next();
};

// RBAC: role hierarchy
const ROLE_RANK = { viewer: 1, editor: 2, admin: 3, super_admin: 4 };

export const requireRole = (minRole) => async (c, next) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const have = ROLE_RANK[user.role] || 0;
  const need = ROLE_RANK[minRole] || 0;
  if (have < need) return c.json({ error: 'forbidden', need: minRole }, 403);
  await next();
};

export const ROLES = ['viewer', 'editor', 'admin', 'super_admin'];

// Scopes apply only to Bearer tokens. Cookie sessions always have ['read','write'].
// `read` allows GET, `write` allows POST/PUT/DELETE/PATCH.
export const requireScope = (scope) => async (c, next) => {
  const scopes = c.get('tokenScopes') || ['read', 'write'];
  if (!scopes.includes(scope)) {
    return c.json({ error: `token missing required scope: ${scope}`, scopes }, 403);
  }
  await next();
};

export const SCOPES = ['read', 'write'];
