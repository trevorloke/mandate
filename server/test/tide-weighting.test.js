// Tide — post-stratification (raking) honesty pass: weighted panel matches
// population targets, effective sample size is reported, and confidence keys off
// it. Network not needed; uses the seed + service directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb } from './helpers.js';

const { db, schema } = await setupDb();
const service = await import('../lib/tide/service.js');
const { rakeWeights, defaultTargets } = await import('../lib/tide/weighting.js');

const WS = 'ws_weight';
await db.insert(schema.workspaces).values({ id: WS, name: 'W', tz: 'PT', plan: 'enterprise' });
await db.insert(schema.users).values({ id: 'u_w', email: 'w@t.com', passwordHash: 'x', name: 'W', role: 'admin', workspaceId: WS });

test('raking pulls a skewed panel toward the targets', () => {
  // Heavily young/urban panel — unrepresentative on purpose.
  const panel = [];
  for (let i = 0; i < 100; i++) {
    panel.push({ id: `p${i}`, ageBand: i < 70 ? '18-24' : '65+', gender: i % 2 ? 'female' : 'male', region: i < 80 ? 'urban' : 'rural' });
  }
  const targets = defaultTargets();
  const { weights, effectiveN, designEffect, drift } = rakeWeights(panel, targets);
  // Weighted age share for 18-24 should move down toward the 0.12 target.
  let w1824 = 0, wtot = 0;
  for (const p of panel) { const w = weights.get(p.id); wtot += w; if (p.ageBand === '18-24') w1824 += w; }
  const share = w1824 / wtot;
  // Only two age bands are present, so raking matches the *relative* target
  // (0.12 : 0.20 → ~0.375), not the absolute 0.12 — it can't invent absent bands.
  assert.ok(share < 0.5 && share > 0.28, `raw 0.70 raked down toward the relative target (got ${share.toFixed(2)})`);
  assert.ok(drift > 0, 'a skewed panel registers drift');
  assert.ok(effectiveN > 0 && effectiveN <= 100, 'effective N never exceeds the count');
  assert.ok(designEffect >= 1, 'weighting only adds variance');
});

test('an already-representative panel needs little weighting (designEffect ~1)', () => {
  const targets = defaultTargets();
  const ages = Object.keys(targets.age);
  const panel = [];
  // Build a panel roughly matching the age target.
  ages.forEach((a, idx) => { const n = Math.round(targets.age[a] * 200); for (let i = 0; i < n; i++) panel.push({ id: `${a}-${i}-${idx}`, ageBand: a, gender: 'female', region: 'urban' }); });
  const { designEffect } = rakeWeights(panel, { age: targets.age });
  assert.ok(designEffect < 1.2, `little correction needed (deff ${designEffect.toFixed(2)})`);
});

test('panel summary exposes representativeness + weighted shares', async () => {
  await service.seedSampleData(WS, { createdById: 'u_w' });
  const sum = await service.panelSummary(WS);
  assert.ok(sum.representativeness && sum.representativeness.effectiveN > 0);
  assert.ok(sum.representativeness.designEffect >= 1);
  assert.ok(sum.weighted && sum.weighted.age && sum.targets);
  // weighted shares sum to ~1
  const tot = Object.values(sum.weighted.age).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(tot - 1) < 0.05);
});

test('readings run off the weighted panel and report effective N', async () => {
  const topics = await service.listTopics(WS);
  const t = topics[0];
  assert.ok(t.latest.confidence > 0 && t.latest.confidence <= 1);
  // effectiveN flows through generateReading's in-memory reading.
  const fresh = await service.generateReading(WS, t.id, {});
  assert.ok(fresh.effectiveN >= 0 && fresh.effectiveN <= fresh.panelN + 1, 'effective N at most the engaged count');
});
