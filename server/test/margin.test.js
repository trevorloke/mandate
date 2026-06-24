// Margin engine — the forecasting + path-to-victory core. Pure module, so it's
// tested directly with no DB/UI. The headline test is §5.3: the shared national
// swing must produce realistically WIDE seat variance — independent districts
// would collapse it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32, normal, buildPointEstimates, runSimulation, summarize,
  tippingPoints, opponentScenarios, sensitivity, optimizeMoves, winNumberAndGap, backtest,
} from '../../src/margin/engine.js';
import { singleFixture, seatFixture, seatBacktestActual } from '../../src/margin/seed.js';

const std = (xs) => { const m = xs.reduce((s, x) => s + x, 0) / xs.length; return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length); };
const seatPoint = () => buildPointEstimates(seatFixture);
const singlePoint = () => buildPointEstimates(singleFixture);

test('mulberry32 is deterministic; normal ~ N(0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42);
  assert.equal(a(), b());
  const r = mulberry32(7); const xs = []; for (let i = 0; i < 20000; i++) xs.push(normal(r, 0, 1));
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  assert.ok(Math.abs(m) < 0.05, `mean ~0 (got ${m})`);
  assert.ok(Math.abs(std(xs) - 1) < 0.05, 'sd ~1');
});

test('buildPointEstimates: shares sum to 1, weights sum to 1, confidence set', () => {
  const point = seatPoint();
  assert.equal(point.units.length, 12);
  for (const u of point.units) {
    const s = Object.values(u.mu).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(s - 1) < 1e-9, `μ sums to 1 (${u.unit_id})`);
    const w = u.weights.fund + u.weights.poll + u.weights.ground;
    assert.ok(Math.abs(w - 1) < 1e-9, 'weights sum to 1');
    assert.ok(['high', 'medium', 'low'].includes(u.confidence));
  }
  // The deliberately thin-data units should read lower-confidence.
  const thin = point.units.find((u) => u.unit_id === 'interior-2');
  assert.ok(thin.confidence !== 'high', 'thin-contact unit flagged');
});

test('runs are reproducible from the seed', () => {
  const point = seatPoint();
  const a = runSimulation(seatFixture, point, { iterations: 300 });
  const b = runSimulation(seatFixture, point, { iterations: 300 });
  assert.deepEqual(a.map((r) => r.seats.A), b.map((r) => r.seats.A), 'same seed → identical seat draws');
});

test('§5.3 shared national swing produces WIDE seat variance (not collapsed)', () => {
  const point = seatPoint();
  const withSwing = runSimulation(seatFixture, point, { iterations: 1500, params: { ...point.params, sigma_nat: 0.03 } });
  // Truly independent baseline: remove BOTH correlated terms (national + regional).
  const noSwing = runSimulation(seatFixture, point, { iterations: 1500, params: { ...point.params, sigma_nat: 0.0001, sigma_reg: 0.0001 } });
  const sdWith = std(withSwing.map((r) => r.seats.A));
  const sdWithout = std(noSwing.map((r) => r.seats.A));
  assert.ok(sdWith > sdWithout * 1.5, `shared swing widens seat dist (with ${sdWith.toFixed(2)} vs without ${sdWithout.toFixed(2)})`);
  assert.ok(sdWith > 0.8, 'seat distribution is realistically wide, not a spike');
});

test('seat summary: probabilities, ordered intervals, histogram, per-unit', () => {
  const point = seatPoint();
  const res = runSimulation(seatFixture, point, { iterations: 1000 });
  const s = summarize(res, { ...seatFixture, _point: point });
  assert.ok(s.pMajority >= 0 && s.pMajority <= 1);
  assert.ok(s.seats.p2_5 <= s.seats.p10 && s.seats.p10 <= s.seats.median && s.seats.median <= s.seats.p90 && s.seats.p90 <= s.seats.p97_5);
  assert.ok(s.seats.histogram.length > 0);
  assert.equal(s.perUnit.length, 12);
  for (const u of s.perUnit) assert.ok(u.winProb >= 0 && u.winProb <= 1);
});

test('tipping points are non-empty and ranked', () => {
  const point = seatPoint();
  const res = runSimulation(seatFixture, point, { iterations: 1500 });
  const tips = tippingPoints(res, { ...seatFixture, _point: point });
  assert.ok(tips.length > 0, 'tipping ranking non-empty');
  for (let i = 1; i < tips.length; i++) assert.ok(tips[i - 1].count >= tips[i].count, 'sorted desc');
  // Swing units should feature near the top.
  const top = tips.slice(0, 5).map((t) => t.unit_id);
  assert.ok(top.some((u) => ['metro-2', 'metro-4', 'valley-2', 'valley-4'].includes(u)), 'a swing unit ranks high');
});

test('single mode: win prob + ordered margin intervals', () => {
  const point = singlePoint();
  const res = runSimulation(singleFixture, point, { iterations: 1000 });
  const s = summarize(res, { ...singleFixture, _point: point });
  assert.equal(s.mode, 'single');
  assert.ok(s.pWin > 0 && s.pWin < 1);
  assert.ok(s.margin.p2_5 <= s.margin.p10 && s.margin.p10 <= s.margin.p90 && s.margin.p90 <= s.margin.p97_5);
});

test('opponent scenarios: weaker opponents never lower your win prob vs stronger', () => {
  const point = seatPoint();
  const grid = opponentScenarios(seatFixture, point, 800);
  assert.equal(grid.length, 4);
  const by = Object.fromEntries(grid.map((g) => [g.id, g.pWin]));
  assert.ok(by.weak >= by.strong, `weak (${by.weak}) >= strong (${by.strong})`);
});

test('sensitivity: rows ranked by swing, each with low/high', () => {
  const point = seatPoint();
  const t = sensitivity(seatFixture, point, 400);
  assert.ok(t.rows.length >= 4);
  for (let i = 1; i < t.rows.length; i++) assert.ok(t.rows[i - 1].swing >= t.rows[i].swing, 'sorted by |swing|');
  for (const r of t.rows) assert.ok(typeof r.low === 'number' && typeof r.high === 'number');
});

test('optimizer: ranked, costed, never exceeds cap_remaining', () => {
  const point = seatPoint();
  const opt = optimizeMoves(seatFixture, point, { iterations: 400 });
  assert.ok(opt.moves.length > 0);
  const cap = seatFixture.ledger.cap_remaining;
  for (const m of opt.moves) if (m.accepted) assert.ok(m.runningTotal <= cap, `running ${m.runningTotal} <= cap ${cap}`);
  // Ranking is by win-prob gain per dollar (descending) among positive moves.
  const pos = opt.moves.filter((m) => m.winProbGain > 0);
  for (let i = 1; i < pos.length; i++) assert.ok(pos[i - 1].perDollar >= pos[i].perDollar - 1e-9);
});

test('win number + gap decomposition into three pools', () => {
  const point = singlePoint();
  const rows = winNumberAndGap(singleFixture, point);
  const r = rows[0];
  assert.ok(r.winNumber > 0);
  assert.ok('persuasion' in r.pools && 'mobilization' in r.pools && 'registration' in r.pools);
  assert.equal(typeof r.feasible, 'boolean');
});

test('backtest reports calibration against a held-out result', () => {
  const bt = backtest(seatFixture, seatBacktestActual, 800);
  assert.equal(bt.mode, 'seat');
  assert.equal(bt.actualSeats, 6);
  assert.equal(typeof bt.within80, 'boolean');
  assert.ok(bt.predicted.p2_5 <= bt.predicted.p97_5);
});

test('performance: 1000 iters across ~96 units in under ~1.5s', () => {
  // Scale the 12-unit fixture up to ~96 units to approximate provincial scale.
  const big = { ...seatFixture, units: [] };
  for (let k = 0; k < 8; k++) for (const u of seatFixture.units) big.units.push({ ...u, unit_id: `${u.unit_id}-${k}` });
  const point = buildPointEstimates(big);
  const t0 = Date.now();
  runSimulation(big, point, { iterations: 1000 });
  const ms = Date.now() - t0;
  assert.ok(ms < 1500, `1000×${big.units.length} units took ${ms}ms`);
});
