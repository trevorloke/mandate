# Mandate v2

The from-scratch rebuild, per the redesign blueprint: **keep the soul, replace
the skeleton.** Lives beside the v1 app so the two can run side by side until
migration; nothing in the repo root is touched.

## Architecture

**Five primitives.** Person (canonical entity, first-class table, real FKs) ·
Record (schema-typed rows from one registry) · View (saved queries — coming) ·
Action (the only write path) · Signal (computed facts — coming).

**One event log underneath.** Every mutation goes through `runAction()`:
the handler's typed table writes, the event append, and the hash-chain
advance commit in ONE transaction or not at all. The `events` table is
simultaneously the sync protocol (`GET /api/events?since=`), the audit trail
(`GET /api/audit/verify` replays the chain), and the public API. Open data is
architectural: `GET /api/export` returns everything, event log included.

**Typed tables, no blobs.** `shared/registry.js` is the single schema source —
it generates SQL DDL, zod validators enforced on every write, and form/column
hints for the client. Money is integer cents. Donors are foreign keys, never
name strings: the cap engine sums `SUM(amount_cents)` per `person_id` per
calendar year against `cap_rules(jurisdiction, year)`, so two donors named
John Smith can never pool a contribution cap.

**Tenancy is a membership.** `memberships(user_id, workspace_id, role)` with
roles manager / treasurer / staff / volunteer. Row-level security lands in
v0.3 per the roadmap; every query is workspace-scoped today.

**Database:** PGlite (embedded, real Postgres) — in-memory for tests,
file-backed via `MANDATE_V2_DATA=./data` for dev. A hosted deployment sets
`DATABASE_URL` and swaps in node-postgres behind the same two-method client
interface (v0.3).

## Run

```sh
cd v2
npm install
npm test              # server suite (in-memory Postgres, no setup)
npm run build         # web client → web/dist
MANDATE_V2_DATA=./data node server/index.js   # serves API + web on :3200
```

## Layout

```
shared/registry.js    the schema registry (DDL + zod + UI hints from one source)
server/db/            client (PGlite/pg) + core DDL + seeds
server/lib/events.js  runAction: the transactional event-log spine + chain verify
server/lib/cap.js     entity-keyed contribution-cap engine
server/actions/       the Action registry — the only write path
server/routes/        auth + workspace API (actions, persons, records, events,
                      brief, audit/verify, export)
server/test/          node:test suite
web/                  Vite + React 19 + react-router + TanStack Query client
```

## Roadmap position

This is **v0.1 week-1 foundation** of the 40-week plan: the spine a treasurer
trusts. Next in v0.1: CSV import with dedupe preview, person merge + review
queue, public intake forms. v0.2: the offline-first field app (SQLite-wasm
client replica syncing through the same event log). v0.3: RLS, billing,
multi-tenant hardening. v1: per-jurisdiction filing exports + VAN/NationBuilder
import escapes.

⚠️ `cap_rules` seed values must be verified against Elections BC's current
indexed amounts before any real filing year relies on them.
