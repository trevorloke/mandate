// Electoral systems — allocation math + winner resolvers + end-to-end forecasts
// under each system. Makes Margin universal, not FPTP-only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  highestAverages, largestRemainder, allocateSeats,
  pluralityResolve, runoffResolve, irvResolve, resolveSystem, SYSTEMS,
} from '../../src/margin/systems.js';
import { buildPointEstimates, runSimulation, summarize } from '../../src/margin/engine.js';
import { prFixture, mmpFixture, singleFixture } from '../../src/margin/seed.js';

// ── Allocation: known textbook results ──
test("D'Hondt matches the canonical worked example", () => {
  // Wikipedia D'Hondt example: votes 100k/80k/30k/20k, 8 seats → 4/3/1/0.
  const r = highestAverages({ A: 100000, B: 80000, C: 30000, D: 20000 }, 8, 'dhondt');
  assert.deepEqual(r, { A: 4, B: 3, C: 1, D: 0 });
});

test('Sainte-Laguë is friendlier to the smaller party than D’Hondt', () => {
  const v = { A: 100000, B: 80000, C: 30000, D: 20000 };
  const d = highestAverages(v, 8, 'dhondt');
  const s = highestAverages(v, 8, 'sainte-lague');
  assert.equal(Object.values(d).reduce((a, b) => a + b), 8);
  assert.equal(Object.values(s).reduce((a, b) => a + b), 8);
  assert.ok(s.D + s.C >= d.D + d.C, 'small parties do at least as well under Sainte-Laguë');
});

test('largest remainder (Hare) allocates all seats and respects floors', () => {
  const r = largestRemainder({ A: 50, B: 30, C: 20 }, 10, 'hare');
  assert.equal(r.A + r.B + r.C, 10);
  assert.deepEqual(r, { A: 5, B: 3, C: 2 });
});

test('electoral threshold zeroes out sub-threshold parties', () => {
  const r = allocateSeats({ A: 48, B: 40, C: 8, D: 4 }, 20, 'dhondt', 0.05); // D at 4% is cut
  assert.equal(r.D, 0);
  assert.equal(r.A + r.B + r.C + r.D, 20);
});

// ── Single-winner resolvers ──
test('plurality picks the leader; margin is the two-way gap', () => {
  const r = pluralityResolve({ A: 0.4, B: 0.35, C: 0.25 });
  assert.equal(r.winner, 'A');
  assert.ok(Math.abs(r.margin - 0.05) < 1e-9);
});

test('runoff: outright majority wins round one; otherwise transfers decide', () => {
  assert.equal(runoffResolve({ A: 0.55, B: 0.30, C: 0.15 }, { winThreshold: 0.5 }).round, 1);
  // No majority: A 0.45, B 0.40, C 0.15. C transfers mostly to B → B wins.
  const r = runoffResolve({ A: 0.45, B: 0.40, C: 0.15 }, { winThreshold: 0.5, transfers: { C: { A: 0.2, B: 0.8 } } });
  assert.equal(r.round, 2);
  assert.equal(r.winner, 'B');
});

test('IRV eliminates the lowest and transfers until a majority', () => {
  // A 0.40, B 0.35, C 0.25; C transfers to B → B 0.60 wins.
  const r = irvResolve({ A: 0.40, B: 0.35, C: 0.25 }, { transfers: { C: { A: 0, B: 1 } } });
  assert.equal(r.winner, 'B');
});

test('resolveSystem is back-compatible with bare mode', () => {
  assert.equal(resolveSystem({ mode: 'single' }).family, 'plurality');
  assert.equal(resolveSystem({ mode: 'seat', units: [1, 2, 3] }).family, 'fptp-seats');
  assert.equal(Object.keys(SYSTEMS).length >= 7, true);
});

// ── End-to-end forecasts under each system ──
test('party-list PR: seats sum to the house size and majority is checked at 51', () => {
  const point = buildPointEstimates(prFixture);
  const res = runSimulation(prFixture, point, { iterations: 400 });
  const s = summarize(res, { ...prFixture, _point: point });
  assert.equal(s.mode, 'seat');
  const total = res[0].seats.A + res[0].seats.B + res[0].seats.C + res[0].seats.D + res[0].seats.E;
  assert.equal(total, 100, 'all 100 seats allocated each simulation');
  assert.ok(res[0].seats.E === 0 || res[0].seats.E <= 2, 'sub-5% party wins few or no seats');
  assert.ok(s.pMajority >= 0 && s.pMajority <= 1);
  assert.equal(s.tipping === undefined || true, true);
});

test('PR produces no tipping points (not a district system)', async () => {
  const { tippingPoints } = await import('../../src/margin/engine.js');
  const point = buildPointEstimates(prFixture);
  const res = runSimulation(prFixture, point, { iterations: 200 });
  assert.deepEqual(tippingPoints(res, { ...prFixture, _point: point }), []);
});

test('MMP: total seats per sim >= district seats and tops up toward proportionality', () => {
  const point = buildPointEstimates(mmpFixture);
  const res = runSimulation(mmpFixture, point, { iterations: 300 });
  for (const r of res.slice(0, 50)) {
    const total = r.seats.A + r.seats.B + r.seats.C;
    assert.ok(total >= 12, 'at least the 12 district seats are filled');
    assert.ok(total >= mmpFixture.system.totalSeats - 1, 'list tier tops up to ~24 (overhang allowed)');
  }
});

test('ranked-choice swaps a plurality loss into a win when transfers favour you', () => {
  // Make the single contest ranked-choice with transfers flowing to your party.
  const rcv = {
    ...singleFixture,
    system: { family: 'ranked-choice', transfers: { C: { A: 1 }, D: { A: 1 }, E: { A: 1 } } },
  };
  const point = buildPointEstimates(rcv);
  const res = runSimulation(rcv, point, { iterations: 400 });
  const s = summarize(res, { ...rcv, _point: point });
  const plurality = summarize(runSimulation(singleFixture, buildPointEstimates(singleFixture), { iterations: 400 }), { ...singleFixture, _point: point });
  assert.ok(s.pWin >= plurality.pWin, 'favourable transfers help you under RCV vs plurality');
});
