# Mandate 2.0

Campaign management platform — full-stack Vite + React frontend with a Hono + SQLite backend.

## What's inside

**11 modules** for running a political campaign:
Ground · Beacon · Raise · Ledger · Coalition · Civic · Opposition · Site · Events · Command · Academy

**Admin & platform:**
- Multi-tenant workspaces with per-module enable/disable
- RBAC: viewer / editor / admin / super_admin
- Auth: email+password, TOTP 2FA, OAuth/OIDC SSO (Google + generic)
- Tamper-evident audit log (SHA-256 hash chain, verifiable via `/api/audit/verify`)
- Comments with `@`-mentions on any record → in-app + realtime notifications
- Bulk CSV user invites
- Public forms with hCaptcha / Turnstile
- Webhooks (HMAC-SHA256 signed) with retry queue + delivery log
- API tokens with scopes + rate limiting
- SSE realtime + in-app notification bell
- Workspace export/import + clone
- Soft-delete + trash + restore
- 14 Playwright E2E test files

## Running locally

You'll need [Node.js](https://nodejs.org/) 20+ installed.

```bash
# Install dependencies (one-time, ~2 minutes)
npm install

# Terminal 1 — start the API server
node server/index.js

# Terminal 2 — start the frontend
npm run dev
```

Then open http://localhost:5173 and create your first super-admin account.

## Layout

```
server/         API (Hono + SQLite + Drizzle ORM)
  routes/      HTTP route modules (one per resource)
  db/          Schema, migrations, SHA-256 chain trigger
  lib/         Webhook worker, retention, realtime, notify, captcha
  middleware/  Auth, CSRF, rate limit
src/
  admin/       Admin UI (users, data, audit, webhooks, forms, SSO)
  auth/        Login, signup, password reset, invite accept
  shell/       App chrome (top bar, user menu, notification bell)
  *.jsx        One file per module page
```

## Tech stack

- **Frontend:** Vite, React 19, React Router
- **Backend:** Hono (HTTP), better-sqlite3 (DB), Drizzle ORM
- **Auth:** bcryptjs, otplib (TOTP)
- **Realtime:** Server-Sent Events
- **Tests:** Playwright (browser E2E)
