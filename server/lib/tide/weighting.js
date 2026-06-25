// Post-stratification (raking) — the honesty layer for an opt-in panel. Every
// opt-in panel skews; weighting corrects it toward known population targets so a
// surge "among 25-34 women in urban areas" reflects the population, not who
// happened to join. We also report the effective sample size (design effect), so
// heavy correction honestly *lowers* confidence rather than hiding the skew.
import { round2 } from './rng.js';

const dimsOf = (p) => ({
  age: p.ageBand ?? p.age_band ?? 'unknown',
  gender: p.gender ?? 'unknown',
  region: p.region ?? 'unknown',
});

// A plausible population target over the bands the seed uses. In production these
// come from the census/voter file per contest; here they are a sensible default.
export function defaultTargets() {
  return {
    age: { '18-24': 0.12, '25-34': 0.18, '35-44': 0.17, '45-54': 0.17, '55-64': 0.16, '65+': 0.20 },
    gender: { female: 0.51, male: 0.48, nonbinary: 0.01 },
    region: { urban: 0.55, suburban: 0.30, rural: 0.15 },
  };
}

// Iterative proportional fitting (raking): scale each panelist's weight so the
// weighted marginals match the targets on every dimension. Returns { weights:
// id->weight (mean 1), effectiveN, designEffect, drift } — drift is how far the
// raw panel sat from the targets (0 = already representative).
export function rakeWeights(panelists, targets = defaultTargets(), iterations = 30) {
  const n = panelists.length;
  const w = new Map(panelists.map((p) => [p.id, 1]));
  if (!n) return { weights: w, effectiveN: 0, designEffect: 1, drift: 0 };

  const dims = ['age', 'gender', 'region'];
  const cats = panelists.map((p) => ({ id: p.id, ...dimsOf(p) }));

  // Raw drift: summed absolute gap between raw shares and targets (before raking).
  let drift = 0;
  for (const dim of dims) {
    const tgt = targets[dim] || {};
    const obs = {};
    for (const c of cats) obs[c[dim]] = (obs[c[dim]] || 0) + 1 / n;
    for (const k of Object.keys(tgt)) drift += Math.abs((obs[k] || 0) - tgt[k]);
  }

  for (let it = 0; it < iterations; it++) {
    for (const dim of dims) {
      const tgt = targets[dim] || {};
      const totW = {};
      let sumW = 0;
      for (const c of cats) { const wi = w.get(c.id); totW[c[dim]] = (totW[c[dim]] || 0) + wi; sumW += wi; }
      for (const c of cats) {
        const key = c[dim];
        const targetShare = tgt[key];
        if (targetShare == null || !totW[key]) continue;       // no target for this cell → leave it
        const factor = (targetShare * sumW) / totW[key];
        w.set(c.id, w.get(c.id) * factor);
      }
    }
  }
  // Normalize to mean 1, then compute the effective sample size (Kish).
  let sum = 0; for (const v of w.values()) sum += v;
  const scale = n / (sum || 1);
  let s1 = 0, s2 = 0;
  for (const [id, v] of w) { const nv = v * scale; w.set(id, nv); s1 += nv; s2 += nv * nv; }
  const effectiveN = s2 > 0 ? (s1 * s1) / s2 : 0;
  return { weights: w, effectiveN, designEffect: effectiveN ? n / effectiveN : 1, drift: round2(drift) };
}
