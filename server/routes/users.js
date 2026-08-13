// User management — admin only
import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { users, auditLog, sessions } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';
import { assertQuota, QuotaError } from '../lib/plans.js';
import { PERSONAS } from '../lib/persona.js';

const app = new Hono();

const newId = (prefix = '') => prefix + randomBytes(12).toString('hex');
const initialsOf = (name) => name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

const sanitize = (u) => {
  if (!u) return null;
  const { passwordHash, totpSecret, recoveryCodesHash, ...rest } = u;
  return rest;
};

app.use('*', requireAuth);

// GET /api/users — list users in same workspace (admin+)
app.get('/', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const list = await db.select().from(users)
    .where(eq(users.workspaceId, me.workspaceId))
    .orderBy(desc(users.createdAt));
  return c.json({ users: list.map(sanitize) });
});

// POST /api/users — create user (admin+)
app.post('/', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { email, name, password, role = 'viewer' } = body;
  if (!email || !name || !password) return c.json({ error: 'email, name, password required' }, 400);
  if (password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
  if (!ROLES.includes(role)) return c.json({ error: 'invalid role' }, 400);

  // Only super_admin can create super_admin
  if (role === 'super_admin' && me.role !== 'super_admin') {
    return c.json({ error: 'only super_admin can create super_admin' }, 403);
  }

  const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  if (existing.length) return c.json({ error: 'email already in use' }, 409);

  try { await assertQuota(me.workspaceId, 'users'); }
  catch (e) { if (e instanceof QuotaError) return c.json({ error: e.message, code: e.code, quota: e.quota, limit: e.limit, current: e.current }, 402); throw e; }

  const id = newId('u_');
  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    id, email: email.toLowerCase(), passwordHash,
    name, initials: initialsOf(name),
    role, workspaceId: me.workspaceId, active: true,
  });

  await db.insert(auditLog).values({ id: newId(), userId: me.id, action: 'user.create', target: id, meta: JSON.stringify({ email, role }) });

  const fresh = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  return c.json({ ok: true, user: sanitize(fresh) });
});

// PUT /api/users/:id — edit user (admin+; super_admin to escalate)
app.put('/:id', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const target = (await db.select().from(users).where(and(eq(users.id, id), eq(users.workspaceId, me.workspaceId))).limit(1))[0];
  if (!target) return c.json({ error: 'not found' }, 404);

  const updates = {};
  if (typeof body.name === 'string' && body.name.trim()) {
    updates.name = body.name.trim();
    updates.initials = initialsOf(body.name);
  }
  if (typeof body.email === 'string' && body.email.trim()) updates.email = body.email.trim().toLowerCase();
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.role === 'string') {
    if (!ROLES.includes(body.role)) return c.json({ error: 'invalid role' }, 400);
    if (body.role === 'super_admin' && me.role !== 'super_admin') return c.json({ error: 'only super_admin can assign super_admin' }, 403);
    if (target.role === 'super_admin' && me.id !== target.id && me.role !== 'super_admin') return c.json({ error: 'cannot demote super_admin' }, 403);
    updates.role = body.role;
  }
  if ('persona' in body) {
    // Explicit persona, or null to clear back to role-derived default.
    if (body.persona !== null && !PERSONAS.includes(body.persona)) {
      return c.json({ error: 'invalid persona' }, 400);
    }
    updates.persona = body.persona;
  }
  if (typeof body.password === 'string' && body.password) {
    if (body.password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
    updates.passwordHash = await bcrypt.hash(body.password, 10);
    // invalidate other sessions for this user
    await db.delete(sessions).where(eq(sessions.userId, id));
  }
  if (Object.keys(updates).length === 0) return c.json({ ok: true, user: sanitize(target) });
  updates.updatedAt = new Date();
  await db.update(users).set(updates).where(eq(users.id, id));

  await db.insert(auditLog).values({ id: newId(), userId: me.id, action: 'user.update', target: id, meta: JSON.stringify(updates) });

  const fresh = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
  return c.json({ ok: true, user: sanitize(fresh) });
});

// POST /api/users/_bulk_invite — admin-only bulk invite from CSV-like rows
// Body: { rows: [{ email, name, role }, ...] }
// Returns: { invites: [{ email, ok, error?, inviteUrl? }] }
app.post('/_bulk_invite', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (rows.length === 0) return c.json({ error: 'no rows provided' }, 400);
  if (rows.length > 500) return c.json({ error: 'max 500 rows per batch' }, 400);

  // Lazy-import the existing invite logic to avoid circular deps; reuse via direct DB writes.
  const { invites: invitesTable } = await import('../db/schema.js');
  const { createHash } = await import('crypto');
  const sha256 = (s) => createHash('sha256').update(s).digest('hex');

  const origin = c.req.header('origin') || '';
  const results = [];
  const TTL_DAYS = 7;

  for (const row of rows) {
    const email = String(row.email || '').trim().toLowerCase();
    const name = String(row.name || '').trim();
    const role = String(row.role || 'viewer').trim().toLowerCase();
    if (!email || !name) { results.push({ email, ok: false, error: 'email and name required' }); continue; }
    if (!ROLES.includes(role)) { results.push({ email, ok: false, error: `bad role: ${role}` }); continue; }
    if (role === 'super_admin' && me.role !== 'super_admin') { results.push({ email, ok: false, error: 'cannot invite super_admin' }); continue; }
    const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existing.length) { results.push({ email, ok: false, error: 'email already in use' }); continue; }

    const token = newId();
    const tokenHash = sha256(token);
    const inviteId = newId('inv_');
    const expiresAt = new Date(Date.now() + TTL_DAYS * 86400 * 1000);
    await db.insert(invitesTable).values({
      id: inviteId, workspaceId: me.workspaceId, invitedById: me.id,
      email, name, role, tokenHash, expiresAt,
    });
    await db.insert(auditLog).values({
      id: newId(), userId: me.id, action: 'invite.create', target: inviteId,
      meta: JSON.stringify({ email, role, bulk: true }),
    });
    results.push({ email, ok: true, inviteUrl: `${origin}/invite/${token}` });
  }

  return c.json({ ok: true, invites: results });
});

// DELETE /api/users/:id (admin+)
app.delete('/:id', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  if (id === me.id) return c.json({ error: 'cannot delete yourself' }, 400);

  const target = (await db.select().from(users).where(and(eq(users.id, id), eq(users.workspaceId, me.workspaceId))).limit(1))[0];
  if (!target) return c.json({ error: 'not found' }, 404);
  if (target.role === 'super_admin' && me.role !== 'super_admin') {
    return c.json({ error: 'only super_admin can delete super_admin' }, 403);
  }

  await db.delete(users).where(eq(users.id, id));
  await db.insert(auditLog).values({ id: newId(), userId: me.id, action: 'user.delete', target: id });
  return c.json({ ok: true });
});

export default app;
