// Tide (Attention Chart) — engine + routes.
// Covers: deterministic seeded source, panel ground-truth breakdown, reading
// generation (volume/momentum/sentiment/why/confidence), CRUD + RBAC gates,
// the tideTopics plan quota, panel summary, and sample-data seeding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const tideApp = (await import('../routes/tide.js')).default;
const service = await import('../lib/tide/service.js');
const { buildReading } = await import('../lib/tide/index.js');
const { panelBreakdown, panelComposition } = await import('../lib/tide/panel.js');
const seedSource = await import('../lib/tide/seed-source.js');
const { classify, distribution } = await import('../lib/tide/sentiment.js');

// ── Fixtures: one workspace, an editor + a viewer ──
const WS = 'ws_tide';
const ADMIN = 'sess_admin', VIEWER = 'sess_viewer';
await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'free' });
await db.insert(schema.users).values([
  { id: 'u_admin', email: 'a@t.com', passwordHash: 'x', name: 'Admin', role: 'super_admin', workspaceId: WS },
  { id: 'u_view', email: 'v@t.com', passwordHash: 'x', name: 'Viewer', role: 'viewer', workspaceId: WS },
]);
await db.insert(schema.sessions).values([
  { id: ADMIN, userId: 'u_admin', expiresAt: new Date(Date.now() + 3600e3) },
  { id: VIEWER, userId: 'u_view', expiresAt: new Date(Date.now() + 3600e3) },
]);

const rq = (method, path, body, sid = ADMIN) => tideApp.request(path, {
  method,
  headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' },
  body: body != null ? JSON.stringify(body) : undefined,
});

// ── Unit: deterministic seeded source ──
test('seed source is deterministic and well-formed', () => {
  const topic = { id: 't1', name: 'Housing', slug: 'housing', keywords: ['rent'], refreshHours: 4 };
  const at = 1_700_000_000_000;
  const a = seedSource.collect({ topic, at });
  const b = seedSource.collect({ topic, at });
  assert.deepEqual(a, b, 'same inputs → same signal');
  assert.ok(a.volume > 0);
  const s = a.sentiment.pos + a.sentiment.neu + a.sentiment.neg;
  assert.ok(Math.abs(s - 1) < 1e-9, 'sentiment fractions sum to 1');
  assert.ok(a.drivers.length >= 1 && a.drivers[0].pull >= a.drivers[a.drivers.length - 1].pull, 'drivers ranked by pull');
});

test('sentiment lexicon classifies and distributes', () => {
  assert.equal(classify('a great win for support'), 'pos');
  assert.equal(classify('a scandal and crisis, total failure'), 'neg');
  assert.equal(classify('the meeting is at noon'), 'neu');
  assert.deepEqual(distribution(['pos', 'pos', 'neg', 'neu']), { pos: 0.5, neg: 0.25, neu: 0.25 });
});

// ── Unit: panel breakdown ground truth ──
test('panel breakdown yields weighted demographic cuts + confidence', () => {
  const topic = { id: 't', name: 'Schools', slug: 'schools', keywords: ['schools'], refreshHours: 4 };
  const panelists = [];
  const ages = ['18-24', '25-34', '35-44'], genders = ['female', 'male'], regions = ['urban', 'rural'];
  for (let i = 0; i < 80; i++) {
    panelists.push({
      id: `p${i}`, weight: 1, profileCompleteness: 0.8,
      ageBand: ages[i % 3], gender: genders[i % 2], region: regions[i % 2],
      interests: i % 2 ? ['schools'] : ['transit'],
    });
  }
  const a = panelBreakdown(panelists, topic, { at: 1_700_000_000_000 });
  const b = panelBreakdown(panelists, topic, { at: 1_700_000_000_000 });
  assert.deepEqual(a, b, 'deterministic');
  assert.ok(a.panelN > 0 && a.panelN <= 80);
  assert.ok(a.confidence > 0 && a.confidence <= 1);
  const ageShare = Object.values(a.cuts.age).reduce((s, x) => s + x.share, 0);
  assert.ok(Math.abs(ageShare - 1) < 0.05, 'age shares ~sum to 1');
  assert.ok(['18-24', '25-34', '35-44'].includes(a.top.age));
});

test('panelComposition summarizes the whole panel', () => {
  const panelists = [
    { ageBand: '25-34', gender: 'female', region: 'urban', profileCompleteness: 1 },
    { ageBand: '25-34', gender: 'male', region: 'rural', profileCompleteness: 0.5 },
  ];
  const c = panelComposition(panelists);
  assert.equal(c.size, 2);
  assert.equal(c.age['25-34'], 1);
  assert.equal(c.avgCompleteness, 0.75);
});

// ── Unit: buildReading momentum + why ──
test('buildReading computes momentum vs previous and a why-narrative', async () => {
  const topic = { id: 't', name: 'Transit', slug: 'transit', keywords: ['transit'], refreshHours: 4 };
  const r0 = await buildReading({ topic, panelists: [], prev: null, at: 1_700_000_000_000 });
  assert.equal(r0.momentum, 0, 'no previous → flat');
  const r1 = await buildReading({ topic, panelists: [], prev: { volume: r0.volume * 2 }, at: 1_700_000_000_000 });
  assert.ok(r1.momentum < 0, 'volume below previous → cooling');
  assert.match(r1.why, /Transit/);
  assert.ok(r1.sources.some((s) => s.layer === 'public'));
});

// ── Routes: RBAC ──
test('viewer cannot create a topic (403); editor can (201)', async () => {
  assert.equal((await rq('POST', '/topics', { name: 'X' }, VIEWER)).status, 403);
  const res = await rq('POST', '/topics', { name: 'Housing affordability', keywords: ['rent', 'zoning'] });
  assert.equal(res.status, 201);
  const j = await res.json();
  assert.ok(j.id);
  assert.ok(j.latest && j.latest.why, 'a first reading is generated on create');
});

test('topics list + history + refresh', async () => {
  const list = await (await rq('GET', '/topics')).json();
  assert.ok(list.topics.length >= 1);
  const id = list.topics[0].id;
  assert.ok(list.topics[0].latest, 'latest reading folded in');

  const hist = await (await rq('GET', `/topics/${id}`)).json();
  assert.ok(hist.topic.readings.length >= 1);

  const before = hist.topic.readings.length;
  const ref = await (await rq('POST', `/topics/${id}/refresh`)).json();
  assert.ok(ref.reading.id);
  const after = await (await rq('GET', `/topics/${id}`)).json();
  assert.ok(after.topic.readings.length > before, 'refresh adds a reading');
});

test('tideTopics quota enforced on the free plan (limit 3 → 402)', async () => {
  // Fresh workspace so the count starts clean.
  const WS2 = 'ws_quota';
  await db.insert(schema.workspaces).values({ id: WS2, name: 'Q', tz: 'PT', plan: 'free' });
  await db.insert(schema.users).values({ id: 'u_q', email: 'q@t.com', passwordHash: 'x', name: 'Q', role: 'admin', workspaceId: WS2 });
  await db.insert(schema.sessions).values({ id: 'sess_q', userId: 'u_q', expiresAt: new Date(Date.now() + 3600e3) });
  const mk = (n) => rq('POST', '/topics', { name: n }, 'sess_q');
  assert.equal((await mk('Alpha')).status, 201);
  assert.equal((await mk('Bravo')).status, 201);
  assert.equal((await mk('Charlie')).status, 201);
  const over = await mk('Delta');
  assert.equal(over.status, 402);
  assert.equal((await over.json()).code, 'QUOTA_EXCEEDED');
});

test('duplicate topic name in a workspace → 409', async () => {
  await rq('POST', '/topics', { name: 'Unique Subject' });
  const dup = await rq('POST', '/topics', { name: 'Unique Subject' });
  assert.equal(dup.status, 409);
});

// ── Routes: panel + seed + status ──
test('add a panelist and read panel summary', async () => {
  const res = await rq('POST', '/panel', { ageBand: '25-34', gender: 'female', region: 'urban', interests: ['housing'] });
  assert.equal(res.status, 201);
  const sum = await (await rq('GET', '/panel')).json();
  assert.ok(sum.panel.size >= 1);
});

test('seed sample data is idempotent and produces readings', async () => {
  const WS3 = 'ws_seed';
  await db.insert(schema.workspaces).values({ id: WS3, name: 'S', tz: 'PT', plan: 'enterprise' });
  await db.insert(schema.users).values({ id: 'u_s', email: 's@t.com', passwordHash: 'x', name: 'S', role: 'admin', workspaceId: WS3 });

  const first = await service.seedSampleData(WS3, { createdById: 'u_s' });
  assert.equal(first.seeded, true);
  assert.ok(first.topics === 5 && first.panelists === 240);
  const again = await service.seedSampleData(WS3, { createdById: 'u_s' });
  assert.equal(again.seeded, false, 'second seed is a no-op');

  const topics = await service.listTopics(WS3);
  assert.equal(topics.length, 5);
  const t = topics[0];
  assert.ok(t.latest.panelN > 0, 'readings read off the seeded panel');
  assert.ok(t.latest.confidence > 0);
  assert.notEqual(t.latest.momentum, 0, 'two seeded readings → real momentum');
  assert.ok(t.latest.demographics.top.age, 'a leading demographic is identified');
});

test('status reports worker + counts', async () => {
  const s = await (await rq('GET', '/status')).json();
  assert.ok(s.worker && typeof s.worker.running === 'boolean');
  assert.ok(s.counts.topics >= 1);
});
