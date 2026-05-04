// Simple in-memory token bucket rate limiter, keyed by IP.
// For production: use Redis or a CDN-edge limiter.
const buckets = new Map();   // key -> { count, resetAt }

function clientIp(c) {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0].trim() ||
    c.req.header('x-real-ip') ||
    'local'
  );
}

export function rateLimit({ key, max = 10, windowMs = 60_000 }) {
  return async (c, next) => {
    const ip = clientIp(c);
    const k = `${key}:${ip}`;
    const now = Date.now();
    let b = buckets.get(k);
    if (!b || b.resetAt < now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(k, b);
    }
    b.count += 1;
    if (b.count > max) {
      const retry = Math.ceil((b.resetAt - now) / 1000);
      c.header('Retry-After', String(retry));
      return c.json({ error: 'rate limit exceeded — try again shortly', retry }, 429);
    }
    await next();
  };
}

// Periodic cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (v.resetAt < now) buckets.delete(k);
  }
}, 60_000).unref?.();
