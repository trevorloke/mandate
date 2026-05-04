// Audit log — admin+ read-only
import { Hono } from 'hono';
import { db } from '../db/index.js';
import { auditLog, users } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';

const app = new Hono();
app.use('*', requireAuth, requireRole('admin'));

app.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit')) || 100, 2000);
  const rows = await db.select({
    id: auditLog.id,
    userId: auditLog.userId,
    action: auditLog.action,
    target: auditLog.target,
    meta: auditLog.meta,
    createdAt: auditLog.createdAt,
    actorName: users.name,
    actorEmail: users.email,
  }).from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt))
    .limit(limit);

  return c.json({
    log: rows.map(r => ({
      ...r,
      meta: tryParse(r.meta),
    })),
  });
});

// CSV export of the audit log
app.get('/export', async (c) => {
  const rows = await db.select({
    id: auditLog.id,
    userId: auditLog.userId,
    action: auditLog.action,
    target: auditLog.target,
    meta: auditLog.meta,
    createdAt: auditLog.createdAt,
    actorName: users.name,
    actorEmail: users.email,
  }).from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .orderBy(desc(auditLog.createdAt));

  const head = 'timestamp,actor_name,actor_email,action,target,meta';
  const body = rows.map(r =>
    [
      new Date(r.createdAt).toISOString(),
      esc(r.actorName || ''),
      esc(r.actorEmail || ''),
      esc(r.action),
      esc(r.target || ''),
      esc(r.meta || ''),
    ].join(',')
  ).join('\n');

  c.header('content-type', 'text/csv');
  c.header('content-disposition', `attachment; filename="audit-${new Date().toISOString().slice(0, 10)}.csv"`);
  return c.body(head + '\n' + body);
});

function esc(s) {
  s = String(s);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Verify the hash chain — replay the SHA-256 from the start.
// Returns ok:true plus the count, or ok:false plus the index of the first break.
app.get('/verify', async (c) => {
  // Order by rowid (insertion order) to match the trigger; created_at is only
  // per-second and collisions would scramble chain order vs. ascending-id reads.
  const { sql } = await import('drizzle-orm');
  const rows = await db.select({
    id: auditLog.id,
    userId: auditLog.userId,
    action: auditLog.action,
    target: auditLog.target,
    meta: auditLog.meta,
    createdAt: auditLog.createdAt,
    prevHash: auditLog.prevHash,
    hash: auditLog.hash,
  }).from(auditLog).orderBy(sql`rowid ASC`);

  const { createHash } = await import('crypto');
  let prev = '';
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Drizzle reads the integer column as a Date; the trigger used the underlying unix-epoch integer.
    const ts = Math.floor(new Date(r.createdAt).getTime() / 1000);
    const canonical = `${prev}|${r.id}|${r.userId || ''}|${r.action}|${r.target || ''}|${r.meta || ''}|${ts}`;
    const expected = createHash('sha256').update(canonical).digest('hex');
    // The trigger uses NEW.created_at which is the unix epoch integer; compare to that.
    if (r.hash !== expected || r.prevHash !== prev) {
      return c.json({
        ok: false,
        chainLength: rows.length,
        firstBreakAt: i,
        breakAtId: r.id,
        expected,
        got: r.hash,
      });
    }
    prev = r.hash;
  }
  return c.json({ ok: true, chainLength: rows.length, head: prev || null });
});

function tryParse(s) { try { return JSON.parse(s || '{}'); } catch { return s; } }

export default app;
