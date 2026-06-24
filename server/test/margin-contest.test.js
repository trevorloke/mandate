// Margin Phase 4 — building a forecast contest from live workspace records, then
// running the real engine on it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';
import { buildContestConfig } from '../lib/margin/build-contest.js';
import { buildPointEstimates, runSimulation, summarize } from '../../src/margin/engine.js';
import { MARGIN_CONTEST, MARGIN_DISTRICTS, MARGIN_POLLS } from '../../src/margin-data.js';

test('buildContestConfig errors clearly when nothing is configured', () => {
  assert.match(buildContestConfig(null, [], []).error, /No contest/);
  assert.match(buildContestConfig(MARGIN_CONTEST[0], [], []).error, /No districts/);
});

test('buildContestConfig assembles a valid, engine-ready config from records', () => {
  const { config, error } = buildContestConfig(MARGIN_CONTEST[0], MARGIN_DISTRICTS, MARGIN_POLLS);
  assert.ok(!error, error);
  assert.equal(config.synthetic, false);
  assert.equal(config.units.length, MARGIN_DISTRICTS.length);
  assert.ok(config.units[0].partisan_baseline && typeof config.units[0].partisan_baseline === 'object');
  assert.ok(config.polls.length >= 1);
  assert.equal(config.yourParty, 'A');
  assert.ok(config.ledger.cap_remaining > 0);

  // The real engine runs on it and yields a sane forecast.
  const point = buildPointEstimates(config);
  const res = runSimulation(config, point, { iterations: 400 });
  const s = summarize(res, { ...config, _point: point });
  assert.ok(s.pMajority >= 0 && s.pMajority <= 1);
  assert.ok(s.seats.p10 <= s.seats.p90);
});

test('builder accepts flat baseline_<party> and share_<party> fields', () => {
  const contest = { parties: [{ id: 'A', name: 'A' }, { id: 'B', name: 'B' }], yourParty: 'A', system: { family: 'fptp-seats' }, threshold: 1 };
  const districts = [{ id: 'u1', unit_id: 'u1', region: 'r', eligible_voters: 1000, turnout_history: 0.5, baseline_A: 0.55, baseline_B: 0.45 }];
  const polls = [{ id: 'p1', poll_id: 'p1', field_date: '2025-05-01', sample_size: 500, scope: 'contest', share_A: 0.5, share_B: 0.5 }];
  const { config, error } = buildContestConfig(contest, districts, polls);
  assert.ok(!error, error);
  assert.equal(config.units[0].partisan_baseline.A, 0.55);
  assert.equal(config.polls[0].shares.B, 0.5);
});

test('the route serves the seeded contest', async () => {
  const { db, schema } = await setupDb();
  const marginApp = (await import('../routes/margin.js')).default;
  const WS = 'ws_mc';
  await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'enterprise' });
  await db.insert(schema.users).values({ id: 'u_mc', email: 'm@c.com', passwordHash: 'x', name: 'M', role: 'viewer', workspaceId: WS });
  await db.insert(schema.sessions).values({ id: 'sess_mc', userId: 'u_mc', expiresAt: new Date(Date.now() + 3600e3) });
  const md = (kind, rec) => db.insert(schema.moduleData).values({ id: `${kind}_${rec.id}`, workspaceId: WS, module: 'margin', kind, data: JSON.stringify(rec) });
  await md('contest', MARGIN_CONTEST[0]);
  for (const d of MARGIN_DISTRICTS) await md('district', d);
  for (const p of MARGIN_POLLS) await md('poll', p);

  const res = await marginApp.request('/contest', { headers: { Cookie: 'mdt_session=sess_mc' } });
  const body = await res.json();
  assert.ok(body.config, body.reason);
  assert.equal(body.counts.districts, MARGIN_DISTRICTS.length);
  assert.equal(body.config.units.length, MARGIN_DISTRICTS.length);
});

test('scenarios persist: save, list, delete (RBAC-gated)', async () => {
  const { db, schema } = await setupDb();
  const marginApp = (await import('../routes/margin.js')).default;
  const WS = 'ws_sc';
  await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'enterprise' });
  await db.insert(schema.users).values([
    { id: 'u_ed2', email: 'e2@c.com', passwordHash: 'x', name: 'E', role: 'editor', workspaceId: WS },
    { id: 'u_vw2', email: 'v2@c.com', passwordHash: 'x', name: 'V', role: 'viewer', workspaceId: WS },
  ]);
  await db.insert(schema.sessions).values([
    { id: 'sess_ed2', userId: 'u_ed2', expiresAt: new Date(Date.now() + 3600e3) },
    { id: 'sess_vw2', userId: 'u_vw2', expiresAt: new Date(Date.now() + 3600e3) },
  ]);
  const rq = (m, p, b, sid) => marginApp.request(p, { method: m, headers: { Cookie: `mdt_session=${sid}`, 'Content-Type': 'application/json' }, body: b != null ? JSON.stringify(b) : undefined });

  // viewer cannot save
  assert.equal((await rq('POST', '/scenarios', { name: 'X' }, 'sess_vw2')).status, 403);
  const saved = await rq('POST', '/scenarios', { name: 'Full GOTV push', win: 0.61, detail: 'seats 45 to 51', modeLabel: 'majority probability', levers: { gotvLift: 0.12 } }, 'sess_ed2');
  assert.equal(saved.status, 201);
  const { id } = await saved.json();

  const list = await (await rq('GET', '/scenarios', null, 'sess_vw2')).json();
  assert.equal(list.scenarios.length, 1);
  assert.equal(list.scenarios[0].name, 'Full GOTV push');
  assert.equal(list.scenarios[0].levers.gotvLift, 0.12, 'levers round-trip for restore');

  assert.equal((await rq('DELETE', `/scenarios/${id}`, null, 'sess_ed2')).status, 200);
  assert.equal((await (await rq('GET', '/scenarios', null, 'sess_ed2')).json()).scenarios.length, 0);
});
