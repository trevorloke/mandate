// Tide source registry + the pure aggregation that turns raw signals + the panel
// into one attention reading. Mirrors Beacon's provider-registry shape so adding
// a real source (Google Trends, a licensed news firehose, a social surface) is a
// matter of dropping in an adapter and flipping `live`.
import * as seed from './seed-source.js';
import * as googleTrends from './google-trends.js';
import * as news from './news.js';
import { panelBreakdown } from './panel.js';
import { distribution } from './sentiment.js';
import { summarize } from './why.js';
import { round2 } from './rng.js';

// Layers in order of defensibility (brief): panel > licensed > public > modelled.
// `live` is read dynamically so an env-gated source flips on without a restart.
export const SOURCES = {
  google_trends: { id: googleTrends.id, label: googleTrends.label, layer: googleTrends.layer, adapter: googleTrends, isEnabled: googleTrends.isEnabled },
  news: { id: news.id, label: news.label, layer: news.layer, adapter: news, isEnabled: news.isEnabled },
  seed: { id: seed.meta.id, label: seed.meta.label, layer: seed.meta.layer, adapter: seed, isEnabled: () => true },
  // Extension point behind the same contract:
  // socialFirehose:{ id:'x_firehose', label:'Social firehose', layer:'public', ... },
};

export const getSource = (id) => SOURCES[id] || null;
const isLive = (s) => (s.id === 'seed' ? false : !!s.isEnabled?.());

// Public catalogue for the Sources tab (no adapters). The panel is listed first
// as the ground-truth layer even though it is not a collect() source.
export function sourceCatalog() {
  const panel = { id: 'panel', label: 'Consented panel', layer: 'panel', live: true, note: 'Demographic ground truth — self-reported, consented.' };
  const rest = Object.values(SOURCES).map((s) => ({ id: s.id, label: s.label, layer: s.layer, live: isLive(s) }));
  return [panel, ...rest];
}

// Sources collected for a reading: any live (env-enabled) real sources, else the
// seeded source as an offline floor.
export function enabledSources() {
  const live = Object.values(SOURCES).filter((s) => s.id !== 'seed' && s.isEnabled?.());
  return live.length ? live : [SOURCES.seed];
}

// Combine multiple source signals into one public-signal view.
function mergeSignals(signals) {
  if (signals.length === 0) return { volume: 0, sentiment: { pos: 0, neu: 1, neg: 0 }, drivers: [], sampleN: 0 };
  const volume = Math.round(signals.reduce((s, x) => s + (x.volume || 0), 0) / signals.length);
  const sampleN = signals.reduce((s, x) => s + (x.sampleN || 0), 0);
  // Sample-weighted sentiment.
  const labels = [];
  for (const s of signals) {
    const n = s.sampleN || 0;
    for (const [k, frac] of Object.entries(s.sentiment || {})) {
      for (let i = 0; i < Math.round(frac * n); i++) labels.push(k);
    }
  }
  const sentiment = labels.length ? distribution(labels) : signals[0].sentiment;
  const drivers = signals.flatMap((s) => s.drivers || []).sort((a, b) => b.pull - a.pull).slice(0, 5);
  return { volume, sentiment, drivers, sampleN };
}

// Produce a complete reading object (not yet persisted) for a topic.
//   topic:      { id, name, slug, keywords, refreshHours }
//   panelists:  active panel rows
//   prev:       previous reading (for momentum) or null
//   at:         capture time (ms or Date)
export async function buildReading({ topic, panelists, prev, at, sources = enabledSources() }) {
  // Collect every source concurrently; a source that throws (e.g. a live feed is
  // unreachable) is dropped rather than failing the whole reading.
  const settled = await Promise.allSettled(sources.map((s) => Promise.resolve(s.adapter.collect({ topic, at }))));
  let used = sources.filter((_, i) => settled[i].status === 'fulfilled' && settled[i].value);
  let signals = settled.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
  // If every live source failed, fall back to the seeded floor so a topic still
  // gets a reading instead of a gap.
  if (!signals.length && !sources.includes(SOURCES.seed)) {
    signals = [SOURCES.seed.adapter.collect({ topic, at })];
    used = [SOURCES.seed];
  }
  const merged = mergeSignals(signals);
  const panel = panelBreakdown(panelists, topic, { at });

  // Panel sentiment is ground truth; fall back to public signal if the panel is
  // too thin to read this topic.
  const sentiment = panel.panelN >= 5 ? panel.sentiment : merged.sentiment;

  const prevVol = prev?.volume || 0;
  const momentum = prevVol > 0 ? round2((merged.volume - prevVol) / prevVol) : 0;

  const reading = {
    volume: merged.volume,
    momentum,
    sentiment,
    demographics: { cuts: panel.cuts, top: panel.top },
    drivers: merged.drivers,
    sources: used.map((s) => ({ id: s.id, layer: s.layer })),
    confidence: panel.confidence,
    panelN: panel.panelN,
  };
  reading.why = await summarize(reading, topic);
  return reading;
}
