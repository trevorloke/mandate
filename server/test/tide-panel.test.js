// Tide panel — gamified opt-in, progressive profiling, and the value-back mirror.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const tideApp = (await import('../routes/tide.js')).default;
const service = await import('../lib/tide/service.js');
const { applyStep, nextStep, completenessOf, levelFor, STEPS } = await import('../lib/tide/profiling.js');

const WS = 'ws_panel';
const ADMIN = 'sess_a', VIEWER = 'sess_v';
await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'enterprise' });
await db.insert(schema.users).values([
  { id: 'u_a', email: 'a@p.com', passwordHash: 'x', name: 'A', role: 'admin', workspaceId: WS },
  { id: 'u_v', email: 'v@p.com', passwordHash: 'x', name: 'V', role: 'viewer', workspaceId: WS },
]);
await db.insert(schema.sessions).values([
  { id: ADMIN, userId: 'u_a', expiresAt: new Date(Date.now() + 3600e3) },
  { id: VIEWER, userId: 'u_v', expiresAt: new Date(Date.now() + 3600e3) },
]);
const rq = (method, path, body, sid = ADMIN) => tideApp.request(path, {
  method, headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' },
  body: body != null ? JSON.stringify(body) : undefined,
});

// ── Unit: profiling progression ──
test('levelFor crosses tiers as points accrue', () => {
  assert.equal(levelFor(0).name, 'Observer');
  assert.equal(levelFor(0).level, 1);
  assert.equal(levelFor(65).name, 'Insider');
  assert.equal(levelFor(200).nextAt, null, 'top tier has no next');
});

test('applyStep walks the journey: rewards, completeness, badges', () => {
  let p = { id: 'p1', points: 0 };                 // blank, pre-consent
  assert.equal(nextStep(p).id, 'consent');
  assert.equal(completenessOf(p), 0);

  // Answers keyed by the canonical step order.
  const answers = {
    consent: undefined, age: '25-34', gender: 'female', region: 'urban',
    interests: ['housing', 'transit'], link: 'bluesky', newsHabit: 'daily',
  };
  let totalPts = 0;
  const badges = new Set();
  for (const step of STEPS) {
    const r = applyStep(p, step.id, answers[step.id]);
    assert.ok(!r.error, `step ${step.id}: ${r.error || 'ok'}`);
    totalPts += step.points;
    assert.equal(r.points, totalPts, `points accrue through ${step.id}`);
    r.newBadges.forEach((b) => badges.add(b.id));
    p = { ...p, ...r.updates };                     // simulate persistence
  }
  assert.equal(completenessOf(p), 1, 'all steps → complete');
  assert.equal(nextStep(p), null, 'journey done');
  assert.ok(badges.has('consented') && badges.has('connected') && badges.has('profile-complete'));
});

test('applyStep rejects bad input', () => {
  const p = { id: 'p2', points: 0, consentAt: new Date() };
  assert.equal(applyStep(p, 'age', 'ninety').error, 'invalid option');
  assert.equal(applyStep(p, 'consent', undefined).error, 'already consented');
  assert.equal(applyStep(p, 'interests', []).error, 'pick at least one');
  assert.ok(applyStep(p, 'nope', 1).error);
});

// ── Routes: journey ──
test('journey via the API: start → step → state', async () => {
  const start = await rq('POST', '/panel/start');
  assert.equal(start.status, 201);
  const { id, next } = await start.json();
  assert.equal(next.id, 'consent');

  // viewer cannot advance the journey
  assert.equal((await rq('POST', `/panel/${id}/step`, { step: 'consent' }, VIEWER)).status, 403);

  const r1 = await (await rq('POST', `/panel/${id}/step`, { step: 'consent' })).json();
  assert.equal(r1.reward, 10);
  assert.equal(r1.next.id, 'age');
  const r2 = await (await rq('POST', `/panel/${id}/step`, { step: 'age', value: '25-34' })).json();
  assert.ok(r2.points > r1.points);

  const state = await (await rq('GET', `/panel/${id}`)).json();
  assert.ok(state.completeness > 0 && state.points >= 25);
  assert.ok(state.badges.includes('consented'));

  const steps = await (await rq('GET', '/panel/steps')).json();
  assert.equal(steps.steps.length, STEPS.length);
  assert.equal(steps.steps[0].id, 'consent');
});

// ── Mirror ──
test('mirror reflects a panelist against their cohort', async () => {
  await service.seedSampleData(WS, { createdById: 'u_a' });
  // Grab any seeded panelist id.
  const panel = await service.activePanelists(WS);
  const someone = panel[10];
  const mirror = await service.mirrorFor(WS, someone.id);
  assert.ok(mirror, 'mirror built');
  assert.equal(mirror.topics.length, 5, 'one row per active topic');
  assert.ok(mirror.topics[0].mine >= mirror.topics[mirror.topics.length - 1].mine, 'topics sorted by personal engagement');
  for (const t of mirror.topics) {
    assert.ok(t.mine >= 0 && t.mine <= 1);
    assert.ok(['early', 'late', 'in step'].includes(t.timing));
    assert.ok(['with your cohort', 'against your cohort', 'undecided'].includes(t.agreement));
  }
  assert.ok(mirror.signature.length >= 1 && mirror.signature.length <= 3);
  assert.ok(typeof mirror.summary === 'string' && mirror.summary.length > 0);
  assert.ok(mirror.panelist.cohortLabel.includes('·') || mirror.panelist.cohortLabel.length > 0);
  assert.ok(mirror.panelist.level.name);

  // Same inputs → same mirror (deterministic).
  const again = await service.mirrorFor(WS, someone.id);
  assert.deepEqual(again.topics, mirror.topics);
});

test('mirror over the API + 404 for unknown panelist', async () => {
  const panel = await service.activePanelists(WS);
  const res = await rq('GET', `/panel/${panel[0].id}/mirror`);
  assert.equal(res.status, 200);
  assert.ok((await res.json()).mirror.topics.length === 5);
  assert.equal((await rq('GET', '/panel/tp_nope/mirror')).status, 404);
});
