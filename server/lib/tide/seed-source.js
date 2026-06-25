// Seeded sample source — the only source wired in the foundational slice.
//
// It implements the source-adapter contract every real source will follow:
//
//   meta:    { id, label, layer, live }
//   collect({ topic, at }) -> {
//     volume,                       // attention volume index for this window
//     sentiment: { pos, neu, neg }, // public-signal sentiment (panel is ground truth)
//     drivers: [{ name, kind, pull }],  // who/what is carrying the surge
//     sampleN,                      // how many items the signal was read off
//   }
//
// `layer: 'public'` marks this as commodity public-signal data — the least
// defensible layer in the brief. The panel (ground truth) is handled separately
// in panel.js, not as a collect() source.
import { rng, pick, timeBucket, round2 } from './rng.js';
import { distribution } from './sentiment.js';

export const meta = { id: 'seed', label: 'Seeded sample', layer: 'public', live: false };

const COMMUNITIES = ['local news readers', 'policy wonks', 'student groups', 'small-business owners', 'parents online', 'sports fans', 'tech early-adopters', 'faith communities'];
const ACCOUNTS = ['@CityDesk', '@PolicyPulse', '@TheDailyBrief', '@CampusVoice', '@MainStreetBiz', '@CivicWatch'];

export function collect({ topic, at }) {
  const refreshHours = topic.refreshHours || 4;
  const b = timeBucket(at, refreshHours);
  const slug = topic.slug || topic.id;
  const seed = (suffix) => `${slug}|${b}|${suffix}`;

  // Volume: a stable base per topic, modulated by the time window.
  const base = 400 + Math.floor(rng(`${slug}|base`) * 3600);
  const swing = 0.6 + rng(seed('vol')) * 0.8;                 // 0.6x – 1.4x
  const volume = Math.round(base * swing);

  // Public-signal sentiment for the window.
  const mood = rng(seed('mood'));                              // 0..1
  const labels = [];
  const sampleN = 60 + Math.floor(rng(seed('n')) * 140);
  for (let i = 0; i < sampleN; i++) {
    const s = 0.55 * mood + 0.45 * rng(seed(`s${i}`));
    labels.push(s > 0.6 ? 'pos' : s < 0.4 ? 'neg' : 'neu');
  }
  const sentiment = distribution(labels);

  // Drivers: a couple of communities + an account, ranked by pull.
  const c1 = pick(seed('c1'), COMMUNITIES);
  let c2 = pick(seed('c2'), COMMUNITIES);
  if (c2 === c1) c2 = pick(seed('c2b'), COMMUNITIES);
  const acct = pick(seed('a1'), ACCOUNTS);
  const drivers = [
    { name: c1, kind: 'community', pull: round2(0.5 + rng(seed('p1')) * 0.5) },
    { name: c2, kind: 'community', pull: round2(0.3 + rng(seed('p2')) * 0.4) },
    { name: acct, kind: 'account', pull: round2(0.2 + rng(seed('p3')) * 0.4) },
  ].sort((a, b2) => b2.pull - a.pull);

  return { volume, sentiment, drivers, sampleN };
}
