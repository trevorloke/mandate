// Personal access tokens — bearer auth for /api/* routes.
// Token format: `mdt_{prefix}{secret}` where prefix is 8 hex chars and secret is 32 hex chars.
// We store SHA-256(token) in DB. Plaintext is shown only at creation time.
import { Hono } from 'hono';
import { randomBytes, createHash } from 'crypto';
import { db } from '../db/index.js';
import { apiTokens, auditLog } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth.js';

const newId = (p='') => p + randomBytes(12).toString('hex');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

const app = new Hono();
app.use('*', requireAuth);

// GET /api/tokens — list current user's tokens (no token strings revealed)
app.get('/', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(apiTokens)
    .where(eq(apiTokens.userId, me.id))
    .orderBy(desc(apiTokens.createdAt));
  return c.json({
    tokens: rows.map(t => ({
      id: t.id, label: t.label, prefix: t.prefix,
      scopes: tryParse(t.scopes),
      expiresAt: t.expiresAt, lastUsedAt: t.lastUsedAt, revoked: t.revoked,
      createdAt: t.createdAt,
    })),
  });
});

// POST /api/tokens — create a new token, returns plaintext ONCE
app.post('/', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { label, scopes = ['read', 'write'], expiresInDays } = body;
  if (!label || !label.trim()) return c.json({ error: 'label required' }, 400);

  // Validate scopes
  const cleanScopes = Array.isArray(scopes) ? scopes.filter(s => s === 'read' || s === 'write') : ['read', 'write'];
  if (cleanScopes.length === 0) return c.json({ error: 'token must have at least one scope' }, 400);

  // Generate token: mdt_{8 hex prefix}{32 hex secret}
  const prefix = randomBytes(4).toString('hex');             // 8 chars
  const secret = randomBytes(16).toString('hex');            // 32 chars
  const plaintext = `mdt_${prefix}${secret}`;
  const tokenHash = sha256(plaintext);
  const id = newId('tok_');

  let expiresAt = null;
  if (typeof expiresInDays === 'number' && expiresInDays > 0) {
    expiresAt = new Date(Date.now() + expiresInDays * 86400 * 1000);
  }

  await db.insert(apiTokens).values({
    id, userId: me.id, label: label.trim(),
    tokenHash, prefix,
    scopes: JSON.stringify(cleanScopes),
    expiresAt, revoked: false,
  });

  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'token.create', target: id,
    meta: JSON.stringify({ label, prefix }),
  });

  return c.json({
    ok: true,
    token: plaintext,        // shown ONCE
    id, label, prefix,
    expiresAt,
  });
});

// DELETE /api/tokens/:id — revoke a token
app.delete('/:id', async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(apiTokens).where(and(eq(apiTokens.id, id), eq(apiTokens.userId, me.id))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.update(apiTokens).set({ revoked: true }).where(eq(apiTokens.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'token.revoke', target: id });
  return c.json({ ok: true });
});

function tryParse(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }

export default app;
