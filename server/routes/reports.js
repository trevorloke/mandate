// Scheduled reports — admin-only CRUD + run-now.
// /api/reports                GET  list  (admin+)
// /api/reports                POST create (admin+)
// /api/reports/:id            PUT  update (admin+)
// /api/reports/:id            DELETE     (admin+)
// /api/reports/:id/run-now    POST run synchronously (admin+)
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { scheduledReports, auditLog } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { runReport } from '../lib/reports.js';
import { assertQuota, QuotaError } from '../lib/plans.js';

const VALID_KINDS = ['bucket_csv', 'audit_log', 'social_analytics'];

const newId = () => 'rep_' + randomBytes(12).toString('hex');
const audit = (userId, action, target, meta = {}) =>
  db.insert(auditLog).values({ id: 'a_' + randomBytes(12).toString('hex'), userId, action, target, meta: JSON.stringify(meta) });

const app = new Hono();
app.use('*', requireAuth, requireRole('admin'));

const presentRow = (r) => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  params: tryParse(r.params, {}),
  targetEmail: r.targetEmail,
  intervalMinutes: r.intervalMinutes,
  active: !!r.active,
  lastRunAt: r.lastRunAt,
  lastStatus: r.lastStatus,
  lastError: r.lastError,
  nextRunAt: r.nextRunAt,
  createdAt: r.createdAt,
});
function tryParse(s, fallback) { try { return JSON.parse(s); } catch { return fallback; } }

// GET /api/reports
app.get('/', async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(scheduledReports)
    .where(eq(scheduledReports.workspaceId, me.workspaceId))
    .orderBy(desc(scheduledReports.createdAt));
  return c.json({ reports: rows.map(presentRow) });
});

// POST /api/reports  { name, kind, params, targetEmail, intervalMinutes, active? }
app.post('/', async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { name, kind, params = {}, targetEmail, intervalMinutes = 1440, active = true } = body;
  if (!name || !kind || !targetEmail) return c.json({ error: 'name, kind, targetEmail required' }, 400);
  if (!VALID_KINDS.includes(kind)) return c.json({ error: `kind must be one of ${VALID_KINDS.join(', ')}` }, 400);
  if (typeof intervalMinutes !== 'number' || intervalMinutes < 1) return c.json({ error: 'intervalMinutes must be >= 1' }, 400);

  try { await assertQuota(me.workspaceId, 'scheduledReports'); }
  catch (e) { if (e instanceof QuotaError) return c.json({ error: e.message, code: e.code, quota: e.quota, limit: e.limit, current: e.current }, 402); throw e; }

  const id = newId();
  const next = active ? new Date(Date.now() + intervalMinutes * 60_000) : null;
  await db.insert(scheduledReports).values({
    id, workspaceId: me.workspaceId, createdById: me.id,
    name: String(name), kind, params: JSON.stringify(params),
    targetEmail: String(targetEmail), intervalMinutes, active: !!active,
    nextRunAt: next,
  });
  await audit(me.id, 'report.create', id, { name, kind });
  const fresh = (await db.select().from(scheduledReports).where(eq(scheduledReports.id, id)).limit(1))[0];
  return c.json({ ok: true, report: presentRow(fresh) });
});

// PUT /api/reports/:id
app.put('/:id', async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const body = await c.req.json().catch(() => ({}));
  const row = (await db.select().from(scheduledReports)
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);

  const updates = {};
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (typeof body.kind === 'string') {
    if (!VALID_KINDS.includes(body.kind)) return c.json({ error: 'invalid kind' }, 400);
    updates.kind = body.kind;
  }
  if (body.params && typeof body.params === 'object') updates.params = JSON.stringify(body.params);
  if (typeof body.targetEmail === 'string' && body.targetEmail) updates.targetEmail = body.targetEmail;
  if (typeof body.intervalMinutes === 'number' && body.intervalMinutes >= 1) updates.intervalMinutes = body.intervalMinutes;
  if (typeof body.active === 'boolean') {
    updates.active = body.active;
    // If reactivated, schedule the next run; if paused, clear nextRunAt.
    updates.nextRunAt = body.active
      ? new Date(Date.now() + (updates.intervalMinutes || row.intervalMinutes) * 60_000)
      : null;
  }
  if (!Object.keys(updates).length) return c.json({ ok: true, report: presentRow(row) });
  await db.update(scheduledReports).set(updates).where(eq(scheduledReports.id, id));
  await audit(me.id, 'report.update', id, updates);
  const fresh = (await db.select().from(scheduledReports).where(eq(scheduledReports.id, id)).limit(1))[0];
  return c.json({ ok: true, report: presentRow(fresh) });
});

// DELETE /api/reports/:id
app.delete('/:id', async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const row = (await db.select().from(scheduledReports)
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(scheduledReports).where(eq(scheduledReports.id, id));
  await audit(me.id, 'report.delete', id, { name: row.name });
  return c.json({ ok: true });
});

// POST /api/reports/:id/run-now
app.post('/:id/run-now', async (c) => {
  const me = c.get('user');
  const { id } = c.req.param();
  const row = (await db.select().from(scheduledReports)
    .where(and(eq(scheduledReports.id, id), eq(scheduledReports.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  try {
    const out = await runReport(row);
    const now = new Date();
    const nextRun = row.active ? new Date(Date.now() + (row.intervalMinutes || 1440) * 60_000) : row.nextRunAt;
    await db.update(scheduledReports).set({
      lastRunAt: now, lastStatus: 'ok', lastError: null, nextRunAt: nextRun,
    }).where(eq(scheduledReports.id, id));
    await audit(me.id, 'report.run', id, { count: out.count });
    return c.json({ ok: true, count: out.count, summary: out.summary });
  } catch (e) {
    const errMsg = String(e.message || e).slice(0, 500);
    await db.update(scheduledReports).set({
      lastRunAt: new Date(), lastStatus: 'failed', lastError: errMsg,
    }).where(eq(scheduledReports.id, id));
    return c.json({ ok: false, error: errMsg }, 500);
  }
});

export default app;
