// Tide — CSV export + momentum alerts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const service = await import('../lib/tide/service.js');
const { readingsCsv } = await import('../lib/tide/report.js');

test('readingsCsv writes a header + escaped rows', () => {
  const csv = readingsCsv([
    { topic: 'Housing, rent', capturedAt: '2025-06-01T00:00:00.000Z', volume: 1234, momentum: 0.18, sentiment: { pos: 0.5, neu: 0.3, neg: 0.2 }, confidence: 0.62, panelN: 80, demographics: { top: { age: '25-34', gender: 'female', region: 'urban' } }, why: 'Rising, "carried" by locals' },
  ]);
  const lines = csv.split('\n');
  assert.match(lines[0], /^topic,captured_at,volume,momentum_pct/);
  assert.match(lines[1], /^"Housing, rent",/, 'comma-containing field is quoted');
  assert.match(lines[1], /"Rising, ""carried"" by locals"/, 'quotes are doubled');
  assert.match(lines[1], /,18,50,30,20,62,80,25-34,female,urban,/, 'percentages rounded to whole numbers');
});

test('exportCsv returns one row per reading across the workspace', async () => {
  const WS = 'ws_csv';
  await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'enterprise' });
  await db.insert(schema.users).values({ id: 'u_csv', email: 'c@t.com', passwordHash: 'x', name: 'C', role: 'admin', workspaceId: WS });
  await service.seedSampleData(WS, { createdById: 'u_csv' });
  const csv = await service.exportCsv(WS);
  const lines = csv.trim().split('\n');
  // 5 topics × 2 seeded readings = 10 rows + header.
  assert.equal(lines.length, 11);
});

test('a fresh momentum spike notifies editors and flags the reading', async () => {
  const WS = 'ws_alert';
  await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'enterprise' });
  await db.insert(schema.users).values([
    { id: 'u_ed', email: 'e@t.com', passwordHash: 'x', name: 'E', role: 'editor', workspaceId: WS },
    { id: 'u_vw', email: 'vw@t.com', passwordHash: 'x', name: 'V', role: 'viewer', workspaceId: WS },
  ]);
  const tid = 'tt_spike';
  await db.insert(schema.tideTopics).values({ id: tid, workspaceId: WS, name: 'Sudden surge', slug: 'sudden-surge', keywordsJson: '["surge"]', status: 'active', refreshHours: 4 });
  // Seed a previous reading with a tiny, calm volume so the next reading spikes.
  await db.insert(schema.tideReadings).values({
    id: 'tr_prev', workspaceId: WS, topicId: tid, capturedAt: new Date(Date.now() - 8 * 3600 * 1000),
    volume: 1, momentum: 0, sentimentJson: '{}', demographicsJson: '{}', driversJson: '[]', sourcesJson: '[]', confidence: 0.3, panelN: 0,
  });

  const r = await service.generateReading(WS, tid, {});
  assert.equal(r.alerted, true, 'crossing the threshold raises an alert');

  const notes = await db.select().from(schema.notifications);
  const tideNotes = notes.filter((n) => n.kind === 'tide.momentum');
  assert.ok(tideNotes.length >= 1, 'editor notified');
  assert.ok(tideNotes.some((n) => n.userId === 'u_ed'), 'the editor got it');
  assert.ok(!tideNotes.some((n) => n.userId === 'u_vw'), 'viewers are not alerted');

  // A second refresh while still elevated should NOT re-alert (no fresh crossing).
  const r2 = await service.generateReading(WS, tid, {});
  assert.equal(r2.alerted, false, 'no duplicate alert while it stays elevated');
});
