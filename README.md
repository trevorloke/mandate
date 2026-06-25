# Mandate 2.0

Campaign management platform — full-stack Vite + React frontend with a Hono + SQLite backend.

## What's inside

**14 modules** for running a political campaign:
Ground · Beacon · Raise · Ledger · Coalition · Civic · Opposition · Site · Events · Command · Academy · **Tide** · **Margin** · **Directory**

- **Tide** — attention intelligence on a consented panel: what the world is paying
  attention to, who drives it, how they feel, and why. Post-stratified (raked)
  toward population targets with honest confidence; pluggable sources (seeded,
  Google Trends, news RSS); gamified opt-in + value-back mirror; momentum alerts;
  CSV export.
- **Margin** — election forecasting + path to victory: ~1,000 reproducible Monte
  Carlo simulations with a shared national swing (correlated, honest intervals),
  tipping-point analysis, opponent stress tests, a tornado sensitivity, a
  cap-bounded optimizer, a scenario lab, and backtesting. **Universal across
  electoral systems** — plurality, two-round runoff, ranked choice, FPTP seats,
  party-list PR (D'Hondt / Sainte-Laguë / largest remainder), MMP, parallel,
  at-large block vote, STV, popular-vote PR, and the **electoral college** — all
  configurable per contest.
- **Directory** — the database that transcends modules: every person, org, and
  place is one canonical entity that all modules link to. A 360° profile shows
  every touchpoint at once (voter in Ground, donor in Raise, host in Events…),
  editing propagates everywhere, and an "also appears in…" cross-reference
  surfaces inside each module's record view.

**Admin & platform:**
- Multi-tenant workspaces with per-module enable/disable
- RBAC: viewer / editor / admin / super_admin · per-record sharing
- Auth: email+password, TOTP 2FA, OAuth/OIDC SSO (Google + generic), WebAuthn passkeys
- Tamper-evident audit log (SHA-256 hash chain, verifiable via `/api/audit/verify`)
- Comments with `@`-mentions on any record → in-app + realtime notifications
- Bulk CSV user invites · public forms with hCaptcha / Turnstile
- Webhooks (HMAC-SHA256 signed) with **distributed retry queue** + delivery log
- API tokens with scopes + rate limiting
- SSE realtime + in-app notification bell
- Workspace export/import + clone
- Soft-delete + trash + restore
- Scheduled CSV reports → email
- Custom dashboard widgets (per-user)
- Mobile-responsive admin · i18n (en / fr / es)
- Plan tiers + quotas + feature gates (Free / Pro / Enterprise)
- ~20 Playwright E2E test files

## Running locally (development)

You'll need [Node.js](https://nodejs.org/) 20+ installed.

```bash
# Install dependencies (one-time, ~2 minutes)
npm install

# Terminal 1 — start the API server
node server/index.js

# Terminal 2 — start the frontend dev server
npm run dev
```

Then open http://localhost:5173 and create your first super-admin account.

## Deployment

Mandate ships as a **single Node process** that serves both the API and the
built frontend. SQLite + a writable volume is all the backing service you
need.

### Environment

Copy `.env.example` to `.env` and review. The most important variables:

- `MANDATE_DB` — path to the SQLite file. Point it at a persistent volume
  (e.g. `/data/mandate.db`).
- `MANDATE_EMAIL_BACKEND` — `console` (logs to stdout, fine for staging),
  `resend` (set `MANDATE_RESEND_KEY`), or `smtp` (set `MANDATE_SMTP_URL`,
  install `nodemailer`).
- `MANDATE_FORCE_SECURE_COOKIES=1` — only needed if your TLS terminator
  doesn't pass `X-Forwarded-Proto: https`. The server auto-detects HTTPS
  from the URL and that header.

### Docker

```bash
# Build
docker build -t mandate .

# Run with a persistent volume for the SQLite database
docker run -d --name mandate \
  -p 3000:3000 \
  -v mandate-data:/data \
  -e MANDATE_EMAIL_BACKEND=console \
  mandate
```

The container exposes `:3000` (both API at `/api/*` and SPA at `/`).
Health check at `/api/health`.

### One-process production from source

```bash
npm install
npm run build                    # builds dist/
NODE_ENV=production \
MANDATE_DB=/var/lib/mandate.db \
MANDATE_EMAIL_BACKEND=resend \
MANDATE_RESEND_KEY=re_xxxx \
node server/index.js
```

When `dist/` exists alongside `server/`, the API automatically serves it
from the same origin with SPA fallback. No nginx needed.

### Render / Railway / Fly.io

All three accept the included Dockerfile directly. After provisioning:

1. Attach a persistent disk and mount it at `/data` (any size > 1 GB is fine
   for early use).
2. Set environment variables per `.env.example`.
3. Health check path: `/api/health`.
4. Start command: defaults to `node server/index.js` from the Dockerfile.

### Multiple worker processes

The webhook retry queue uses atomic SQL claim semantics, so you can run
multiple Node instances against the same SQLite file (or one Node process
per CPU on the same box). Each instance should set a unique
`MANDATE_WORKER_ID` so the admin queue panel can distinguish them.

### Backups

The SQLite database is the only stateful component. Either:

- Snapshot the volume from your hosting provider (simplest), **or**
- Use the in-app workspace export (admin → Workspace → Backup) to download
  a JSON snapshot per workspace. Re-import to restore.

## Layout

```
server/         API (Hono + SQLite + Drizzle ORM)
  routes/      HTTP route modules (one per resource)
  db/          Schema, migrations, SHA-256 chain trigger
  lib/         Webhook worker, retention, reports, plans, realtime, notify, captcha, email
  middleware/  Auth, CSRF, rate limit
src/
  admin/       Admin UI (users, data, audit, webhooks, forms, SSO, plan, dashboards…)
  auth/        Login, signup, password reset, invite accept, passkey panel
  i18n/        en / fr / es dictionaries
  shell/       App chrome (top bar, user menu, notification bell)
  *.jsx        One file per module page
```

## Tech stack

- **Frontend:** Vite, React 19, React Router
- **Backend:** Hono (HTTP), better-sqlite3 (DB), Drizzle ORM
- **Auth:** bcryptjs, otplib (TOTP), `@simplewebauthn/server` + browser
- **Realtime:** Server-Sent Events
- **Tests:** Playwright (browser E2E)
