// The panel engine — the defensible core. Given the consented panel and a topic,
// it computes WHO is paying attention (demographic ground truth, not inference)
// and how each cut feels, with an honest confidence score and post-stratification
// weighting. Output is directional, never census-grade — and the API says so.
import { rng, timeBucket, clamp01, round2 } from './rng.js';
import { distribution, moodLabel } from './sentiment.js';

const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

// Per-panelist engagement with a topic in a given window: interest overlap plus
// a stable idiosyncratic component. Deterministic in (panelist, topic, window).
function engagement(p, topic, bucket) {
  const interests = Array.isArray(p.interests) ? p.interests : parse(p.interestsJson, []);
  const terms = [topic.slug, ...(topic.keywords || parse(topic.keywordsJson, []))].map((t) => String(t).toLowerCase());
  const hits = interests.filter((i) => terms.includes(String(i).toLowerCase())).length;
  const match = clamp01(hits / Math.max(1, Math.min(3, terms.length)));
  const noise = rng(`${p.id}|${topic.slug}|${bucket}|eng`);
  // Interested panelists almost always engage; others engage at a base rate.
  const score = clamp01(0.15 + 0.65 * match + 0.4 * noise - 0.15);
  return { engaged: score > 0.35, score, weight: (p.weight || 1) * score, match };
}

// Polarity of an engaged panelist: a blend of the window's mood and the
// panelist's stable lean → 'pos' | 'neu' | 'neg'.
function polarity(p, topic, bucket) {
  const mood = rng(`${topic.slug}|${bucket}|mood`);
  const lean = rng(`${p.id}|${topic.slug}|lean`);
  const s = 0.55 * mood + 0.45 * lean;
  return s > 0.6 ? 'pos' : s < 0.4 ? 'neg' : 'neu';
}

// Public, time-based wrappers for one panelist — used by the value-back mirror to
// compare a person against their cohort. Engagement is a 0..1 score; polarity is
// the labelled lean. Both are deterministic in (panelist, topic, window).
export function panelistEngagement(p, topic, at) {
  return engagement(p, topic, timeBucket(at || Date.now(), topic.refreshHours || 4));
}
export function panelistPolarity(p, topic, at) {
  return polarity(p, topic, timeBucket(at || Date.now(), topic.refreshHours || 4));
}

function addCut(cuts, dim, key, w, label) {
  if (!key) key = 'unknown';
  const d = (cuts[dim] ||= {});
  const e = (d[key] ||= { weight: 0, n: 0, labels: [] });
  e.weight += w;
  e.n += 1;
  e.labels.push(label);
}

function finalizeCuts(cuts) {
  const out = {};
  for (const [dim, buckets] of Object.entries(cuts)) {
    const total = Object.values(buckets).reduce((s, b) => s + b.weight, 0) || 1;
    out[dim] = {};
    for (const [key, b] of Object.entries(buckets)) {
      out[dim][key] = {
        share: round2(b.weight / total),
        n: b.n,
        sentiment: distribution(b.labels),
      };
    }
  }
  return out;
}

const topKey = (dimObj) => Object.entries(dimObj || {}).sort((a, b) => b[1].share - a[1].share)[0]?.[0] || null;

// Compute the panel breakdown for a topic. `panelists` are raw DB rows (snake or
// camel) or already-parsed objects; we read both json string + array forms.
export function panelBreakdown(panelists, topic, { at } = {}) {
  const bucket = timeBucket(at || Date.now(), topic.refreshHours || 4);
  const cuts = {};
  const allLabels = [];
  let engagedN = 0;
  let completenessSum = 0;
  let sumW = 0, sumW2 = 0; // for the effective (Kish) sample size

  for (const p of panelists) {
    const { engaged, weight } = engagement(p, topic, bucket);
    if (!engaged) continue;
    engagedN += 1;
    sumW += (p.weight || 1); sumW2 += (p.weight || 1) ** 2;
    completenessSum += (p.profileCompleteness ?? p.profile_completeness ?? 0);
    const label = polarity(p, topic, bucket);
    allLabels.push(label);
    addCut(cuts, 'age', p.ageBand ?? p.age_band, weight, label);
    addCut(cuts, 'gender', p.gender, weight, label);
    addCut(cuts, 'region', p.region, weight, label);
  }

  const finalized = finalizeCuts(cuts);
  const sentiment = distribution(allLabels);
  const avgCompleteness = engagedN ? completenessSum / engagedN : 0;
  // Effective sample size (Kish): post-stratification weighting trades bias for
  // variance, so confidence keys off effective N, not raw count — heavy
  // correction honestly lowers confidence.
  const effectiveN = sumW2 > 0 ? (sumW * sumW) / sumW2 : engagedN;
  const depth = effectiveN / (effectiveN + 25);
  const confidence = round2(clamp01(depth * (0.55 + 0.45 * avgCompleteness)));

  return {
    cuts: finalized,
    sentiment,
    panelN: engagedN,
    effectiveN: Math.round(effectiveN),
    confidence,
    top: { age: topKey(finalized.age), gender: topKey(finalized.gender), region: topKey(finalized.region) },
    mood: moodLabel(sentiment),
  };
}

// Panel composition independent of any topic — for the Panel tab / health view.
export function panelComposition(panelists) {
  const cuts = { age: {}, gender: {}, region: {} };
  let completeness = 0;
  for (const p of panelists) {
    completeness += (p.profileCompleteness ?? p.profile_completeness ?? 0);
    for (const [dim, val] of [['age', p.ageBand ?? p.age_band], ['gender', p.gender], ['region', p.region]]) {
      const k = val || 'unknown';
      cuts[dim][k] = (cuts[dim][k] || 0) + 1;
    }
  }
  const n = panelists.length || 1;
  const pct = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, round2(v / n)]));
  return {
    size: panelists.length,
    avgCompleteness: round2(completeness / n),
    age: pct(cuts.age),
    gender: pct(cuts.gender),
    region: pct(cuts.region),
  };
}
