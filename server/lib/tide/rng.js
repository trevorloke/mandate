// Deterministic pseudo-randomness for Tide's seeded/mock signals. Real source
// adapters (Google Trends, news, social, panel telemetry) replace these with
// live data; until then everything is a pure function of its seed string so the
// demo is reproducible and tests are stable (no Math.random / wall-clock).

export function hash32(str) {
  let h = 2166136261 >>> 0;            // FNV-1a
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Uniform in [0, 1) from a seed string.
export function rng(seed) {
  return hash32(seed) / 4294967296;
}

// Stable pick from an array.
export function pick(seed, arr) {
  return arr[hash32(seed) % arr.length];
}

// Bucket the day into refresh windows so a topic's signal is stable within a
// window and shifts between windows — gives readings something to move against.
export function timeBucket(at, refreshHours = 4) {
  const ms = refreshHours * 3600 * 1000;
  return Math.floor(new Date(at).getTime() / ms);
}

export const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
export const round2 = (n) => Math.round(n * 100) / 100;
