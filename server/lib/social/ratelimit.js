// Per-(workspace, platform) token-bucket rate limiting for outbound publishes,
// so a burst never trips a platform's API limits (which can get an app throttled
// or an account flagged). When the budget is spent the publisher DEFERS the post
// (re-queues it slightly later) instead of failing it.
//
// In-memory by design: the publish worker is single-process here. A multi-node
// deployment would back this with Redis, but the interface stays the same.

const buckets = new Map(); // key -> { tokens, last }

// Conservative defaults (capacity = burst, refillPerMin = sustained rate).
// Tunable at runtime via setPlatformLimit (e.g. an admin settings screen).
export const PLATFORM_LIMITS = {
  bluesky:   { capacity: 30, refillPerMin: 30 },
  mastodon:  { capacity: 30, refillPerMin: 30 },
  x:         { capacity: 10, refillPerMin: 5 },
  meta:      { capacity: 15, refillPerMin: 10 },
  instagram: { capacity: 8,  refillPerMin: 5 },
  linkedin:  { capacity: 15, refillPerMin: 10 },
};

export function setPlatformLimit(platform, cfg) { PLATFORM_LIMITS[platform] = { ...PLATFORM_LIMITS[platform], ...cfg }; }
export function limitFor(platform) { return PLATFORM_LIMITS[platform] || null; }
export function resetBuckets() { buckets.clear(); }

// Try to consume one token. Returns { ok } or { ok:false, retryAfterMs }.
// `now` is injectable for deterministic tests.
export function take(key, { capacity = 30, refillPerMin = 30 } = {}, now = Date.now()) {
  let b = buckets.get(key);
  if (!b) { b = { tokens: capacity, last: now }; buckets.set(key, b); }
  // Refill based on elapsed time, capped at capacity.
  const elapsedMin = Math.max(0, (now - b.last) / 60_000);
  b.tokens = Math.min(capacity, b.tokens + elapsedMin * refillPerMin);
  b.last = now;
  if (b.tokens >= 1) { b.tokens -= 1; return { ok: true }; }
  const needed = 1 - b.tokens;
  const retryAfterMs = refillPerMin > 0 ? Math.ceil((needed / refillPerMin) * 60_000) : 60_000;
  return { ok: false, retryAfterMs };
}
