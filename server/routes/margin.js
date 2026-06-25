// Margin Phase 4 — serve a forecast contest assembled from live workspace data.
//   GET /api/margin/contest   build a config from margin.contest/district/poll records
// The forecasting engine itself runs client-side; this just supplies real inputs
// in place of the bundled sample fixtures.
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { and, eq, isNull, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { moduleData, marginScenarios } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildContestConfig } from '../lib/margin/build-contest.js';

const app = new Hono();
const newId = (p) => p + randomBytes(9).toString('hex');
const parse = (s) => { try { return JSON.parse(s); } catch { return {}; } };

const loadKind = async (workspaceId, kind) => (await db.select().from(moduleData)
  .where(and(eq(moduleData.workspaceId, workspaceId), eq(moduleData.module, 'margin'), eq(moduleData.kind, kind), isNull(moduleData.deletedAt))))
  .map((r) => ({ id: r.id, ...parse(r.data) }));

app.use('*', requireAuth);

app.get('/contest', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const [contests, districts, polls] = await Promise.all([
    loadKind(me.workspaceId, 'contest'), loadKind(me.workspaceId, 'district'), loadKind(me.workspaceId, 'poll'),
  ]);
  const result = buildContestConfig(contests[0] || null, districts, polls);
  if (result.error) return c.json({ config: null, reason: result.error });
  return c.json({ config: result.config, counts: { districts: districts.length, polls: polls.length } });
});

// ── Saved scenarios (scenario lab persistence) ──
app.get('/scenarios', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(marginScenarios)
    .where(eq(marginScenarios.workspaceId, me.workspaceId)).orderBy(desc(marginScenarios.createdAt)).limit(50);
  return c.json({ scenarios: rows.map((r) => ({ id: r.id, name: r.name, win: r.win, detail: r.detail, modeLabel: r.modeLabel, levers: parse(r.leversJson) })) });
});

app.post('/scenarios', requireRole('editor'), async (c) => {
  const me = c.get('user');
  const b = await c.req.json().catch(() => ({}));
  if (!b.name) return c.json({ error: 'name required' }, 400);
  const id = newId('ms_');
  await db.insert(marginScenarios).values({
    id, workspaceId: me.workspaceId, name: String(b.name).slice(0, 120),
    win: Number(b.win) || 0, detail: b.detail ? String(b.detail).slice(0, 200) : null,
    modeLabel: b.modeLabel ? String(b.modeLabel).slice(0, 60) : null,
    leversJson: JSON.stringify(b.levers || {}), createdById: me.id,
  });
  return c.json({ id }, 201);
});

app.delete('/scenarios/:id', requireRole('editor'), async (c) => {
  const me = c.get('user');
  await db.delete(marginScenarios).where(and(eq(marginScenarios.id, c.req.param('id')), eq(marginScenarios.workspaceId, me.workspaceId)));
  return c.json({ ok: true });
});

export default app;
