// Tide (Attention Chart) routes — tracked topics, the consented panel, and the
// attention readings computed off them.
//   GET    /api/tide/status                 worker liveness + counts
//   GET    /api/tide/sources                source catalogue (by layer)
//   GET    /api/tide/topics                 topics + latest reading
//   POST   /api/tide/topics                 create a topic (editor+, quota'd)
//   GET    /api/tide/topics/:id             topic + reading history
//   PUT    /api/tide/topics/:id             update a topic (editor+)
//   DELETE /api/tide/topics/:id             delete a topic (editor+)
//   POST   /api/tide/topics/:id/refresh     generate a reading now (editor+)
//   GET    /api/tide/panel                  panel composition summary
//   POST   /api/tide/panel                  add a consented panelist (editor+)
//   POST   /api/tide/seed                   load sample data (editor+)
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { and, eq, count } from 'drizzle-orm';
import { db } from '../db/index.js';
import { tideTopics, tidePanelists, tideReadings, auditLog } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { assertQuota, QuotaError } from '../lib/plans.js';
import { sourceCatalog } from '../lib/tide/index.js';
import { STEPS, publicStep } from '../lib/tide/profiling.js';
import {
  slugify, listTopics, topicHistory, generateReading,
  panelSummary, seedSampleData, recordStep, mirrorFor, journeyState, exportCsv,
} from '../lib/tide/service.js';
import { getTideWorkerStatus } from '../lib/tide-worker.js';

const app = new Hono();
const newId = (p) => p + randomBytes(9).toString('hex');
const audit = (userId, action, target, meta) =>
  db.insert(auditLog).values({ id: newId('a_'), userId, action, target, meta: meta ? JSON.stringify(meta) : null }).catch(() => {});

const cleanKeywords = (v) => (Array.isArray(v) ? v : String(v || '').split(','))
  .map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 24);

app.use('*', requireAuth);

// ── Observability ───────────────────────────────────────────────────────────
app.get('/status', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const where = eq(tideTopics.workspaceId, me.workspaceId);
  const [topics, panelists, readings] = await Promise.all([
    db.select({ c: count() }).from(tideTopics).where(where),
    db.select({ c: count() }).from(tidePanelists).where(eq(tidePanelists.workspaceId, me.workspaceId)),
    db.select({ c: count() }).from(tideReadings).where(eq(tideReadings.workspaceId, me.workspaceId)),
  ]);
  return c.json({
    worker: getTideWorkerStatus(),
    counts: { topics: topics[0].c, panelists: panelists[0].c, readings: readings[0].c },
  });
});

app.get('/sources', requireRole('viewer'), (c) => c.json({ sources: sourceCatalog() }));

// CSV export of every reading (newest first).
app.get('/export', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const csv = await exportCsv(me.workspaceId);
  return new Response(csv, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="tide-readings.csv"' } });
});

// ── Topics ──────────────────────────────────────────────────────────────────
app.get('/topics', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  return c.json({ topics: await listTopics(me.workspaceId) });
});

app.post('/topics', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { name, keywords = [], refreshHours = 4 } = await c.req.json().catch(() => ({}));
  if (!name || !String(name).trim()) return c.json({ error: 'name is required' }, 400);

  try { await assertQuota(me.workspaceId, 'tideTopics'); }
  catch (e) { if (e instanceof QuotaError) return c.json({ error: e.message, code: e.code, quota: e.quota, limit: e.limit, current: e.current }, 402); throw e; }

  const slug = slugify(name);
  const dupe = (await db.select().from(tideTopics)
    .where(and(eq(tideTopics.workspaceId, me.workspaceId), eq(tideTopics.slug, slug))).limit(1))[0];
  if (dupe) return c.json({ error: 'A topic with a similar name already exists.' }, 409);

  const id = newId('tt_');
  const hours = Math.min(24, Math.max(1, parseInt(refreshHours, 10) || 4));
  await db.insert(tideTopics).values({
    id, workspaceId: me.workspaceId, name: String(name).trim().slice(0, 120), slug,
    keywordsJson: JSON.stringify(cleanKeywords(keywords)), status: 'active',
    refreshHours: hours, createdById: me.id,
  });
  await audit(me.id, 'tide.topic.create', id, { name });
  // First reading immediately, so a new topic isn't empty.
  let latest = null;
  try { latest = await generateReading(me.workspaceId, id, {}); } catch { /* worker will retry */ }
  return c.json({ id, latest }, 201);
});

app.get('/topics/:id', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const topic = await topicHistory(me.workspaceId, c.req.param('id'));
  if (!topic) return c.json({ error: 'not found' }, 404);
  return c.json({ topic });
});

app.put('/topics/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(tideTopics)
    .where(and(eq(tideTopics.id, id), eq(tideTopics.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);

  const body = await c.req.json().catch(() => ({}));
  const updates = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim().slice(0, 120);
  if (body.keywords !== undefined) updates.keywordsJson = JSON.stringify(cleanKeywords(body.keywords));
  if (body.status === 'active' || body.status === 'paused') updates.status = body.status;
  if (body.refreshHours !== undefined) updates.refreshHours = Math.min(24, Math.max(1, parseInt(body.refreshHours, 10) || 4));
  await db.update(tideTopics).set(updates).where(eq(tideTopics.id, id));
  await audit(me.id, 'tide.topic.update', id);
  return c.json({ ok: true });
});

app.delete('/topics/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(tideTopics)
    .where(and(eq(tideTopics.id, id), eq(tideTopics.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(tideTopics).where(eq(tideTopics.id, id)); // readings cascade
  await audit(me.id, 'tide.topic.delete', id);
  return c.json({ ok: true });
});

app.post('/topics/:id/refresh', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(tideTopics)
    .where(and(eq(tideTopics.id, id), eq(tideTopics.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  const reading = await generateReading(me.workspaceId, id, {});
  return c.json({ reading });
});

// ── Panel ─────────────────────────────────────────────────────────────────
app.get('/panel', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  return c.json({ panel: await panelSummary(me.workspaceId) });
});

app.post('/panel', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const b = await c.req.json().catch(() => ({}));
  const id = newId('tp_');
  const interests = Array.isArray(b.interests) ? b.interests.map((s) => String(s).toLowerCase()).slice(0, 12) : [];
  // Progressive profiling: completeness scales with how much they've told us.
  const filled = ['ageBand', 'gender', 'region'].filter((k) => b[k]).length + (interests.length ? 1 : 0);
  await db.insert(tidePanelists).values({
    id, workspaceId: me.workspaceId,
    externalRef: b.externalRef ? String(b.externalRef).slice(0, 80) : null,
    consentAt: new Date(),
    ageBand: b.ageBand || null, gender: b.gender || null, region: b.region || null,
    interestsJson: JSON.stringify(interests),
    profileCompleteness: Math.round((filled / 4) * 100) / 100,
    weight: 1, status: 'active',
  });
  await audit(me.id, 'tide.panelist.add', id);
  return c.json({ id }, 201);
});

// ── Gamified opt-in journey + value-back mirror ──
// Static path registered before /panel/:id so it isn't captured as an id.
app.get('/panel/steps', requireRole('viewer'), (c) => c.json({ steps: STEPS.map(publicStep) }));

// Start a fresh journey: create an empty (pre-consent) panelist to walk through.
app.post('/panel/start', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const id = newId('tp_');
  await db.insert(tidePanelists).values({
    id, workspaceId: me.workspaceId, status: 'active', weight: 1, profileCompleteness: 0, points: 0,
  });
  const j = await journeyState(me.workspaceId, id);
  return c.json(j, 201);
});

app.get('/panel/:id/mirror', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const mirror = await mirrorFor(me.workspaceId, c.req.param('id'));
  if (!mirror) return c.json({ error: 'not found' }, 404);
  return c.json({ mirror });
});

app.post('/panel/:id/step', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const { step, value } = await c.req.json().catch(() => ({}));
  const result = await recordStep(me.workspaceId, c.req.param('id'), step, value);
  if (result.error) return c.json({ error: result.error }, result.status || 400);
  return c.json(result);
});

app.get('/panel/:id', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const j = await journeyState(me.workspaceId, c.req.param('id'));
  if (!j) return c.json({ error: 'not found' }, 404);
  return c.json(j);
});

// ── Sample data ─────────────────────────────────────────────────────────────
app.post('/seed', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const result = await seedSampleData(me.workspaceId, { createdById: me.id });
  if (result.seeded) await audit(me.id, 'tide.seed', me.workspaceId, result);
  return c.json(result);
});

export default app;
