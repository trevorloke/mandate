# Beacon engine tests

Fast, deterministic, dependency-free tests (`node:test`) for the social
publishing engine. Each file runs in its own process against a throwaway temp
SQLite DB; the network is mocked, so nothing here touches a real platform.

Run:

```
npm test
```

Coverage:

| File | What it locks in |
|------|------------------|
| `crypto.test.js`   | AES-GCM round-trip, versioned prefix, legacy-plaintext passthrough, tamper/﻿wrong-key → null |
| `slots.test.js`    | DST-aware queue-slot math (PT spring-forward), slot validation, queue stacking |
| `feeds.test.js`    | RSS + Atom parsing, CDATA/entity decode, HTML strip, guid fallback |
| `listening.test.js`| sentiment scoring (whole-word), Bluesky/Mastodon search normalization, dedupe |
| `ratelimit.test.js`| token-bucket math (capacity/refill/retry window), publisher defers when budget spent then publishes |
| `retry.test.js`    | transient → exponential backoff → reclaim → heal; permanent errors never retry |
| `metrics.test.js`  | change-only metrics history, one audience snapshot per account per day |
| `inbox.test.js`    | mention ingest + dedupe, threaded reply marks item replied |
| `routes.test.js`   | in-process router via app.request + forged session: publish-now, schedule, draft→submit→approve→published, reject, bulk, role gate (403), bad session (401) |
| `integration.test.js` | boots the real server; auth gate, signup/session, CSRF, keywords, queue slots, short-link redirect + click tracking, clean connect failure |

What these tests do **not** cover (needs real credentials / a browser):
live platform API calls, the OAuth redirect dance, and end-to-end UI flows.
Those remain manual verification steps.
