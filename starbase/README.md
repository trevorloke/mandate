# Starbase

The campaign OS built for **Imagine Surrey**. Field-first: a map with every
door on it, a one-tap rating scale at the door, phone, and by text — with
signs, volunteers, shifts, money, compliance, and outreach around it. Lives
beside the legacy app in this repo; nothing in the repo root is touched.

## The seven things a campaign does (the whole sidebar)

| Screen | What it is |
|---|---|
| **Today** | Doors this week, the support bar, money raised, flags, upcoming shifts, filings |
| **Map** | Field mode. Houses as clickable pins; tap a door → rate, log, request a sign, call/text |
| **People** | Everyone, filterable by rating / tag / role; profiles with socials, roles, gifts, history; phone + text banks |
| **Shifts** | Schedule volunteers, assign by role, notify by email + text with instructions and a link |
| **Money** | Gifts (one-time / monthly) with the entity-keyed cap engine; donor tiers; filings |
| **Signs** | Billboards (4×8), large (4×4), lawn — requested → installed → removed |
| **Outreach** | Newsletter + press-release blasts, petitions, and the Imagine Surrey website bridge |

Managers reach **Team** from the header: invite volunteers and staff by email
(or copy the join link and text it), set roles, see pending invites. Invitees
open `/join/:token`, set a password, and land on the map (volunteers) or Today.

### The rating scale (door, phone, text)

`1` strong support · `2` lean support · `3` undecided · `4` opposed (unknown) ·
`4D` McCallum · `4B` Surrey Connect / Locke · `4F` Surrey First / Annis ·
`4N` SurreyNow / van Vliet · `4C` Surrey Conservatives / Randhawa
(`shared/canvass.js` — one vocabulary for server validation and the UI).

### What's tracked

- **Signs**: billboard, large, lawn, with status and location.
- **Donors**: one-time, monthly, **star** ($1K+/yr or $100+/mo), **superstar**
  ($3K+/yr or $250+/mo) — derived from real gifts, never self-declared.
- **Volunteer roles** (14): driver, scrutineer, doorknocking, mainstreeting,
  phoning, data entry, event hosting, zone house captain, food, translation
  (+language), burmashave, community committee (+area), policy, administration.
- **Tags**: free-form, seeded with media, VIP, endorser, host, …
- **Socials**: per-person handles for Facebook, Instagram, X, TikTok, YouTube,
  LinkedIn, Bluesky.

## Coverage vs. the tools it replaces

| | Starbase today | Next |
|---|---|---|
| **Ecanvasser** | map canvass, door cards, household grouping, ratings, no-answer outcomes, signs at the door, place-on-map, phone/text banks | turf cutting & assignment, survey builder, offline replica (v0.2 sync) |
| **Action Builder** | assessments (= the rating scale), tags, roles, relational notes, event-logged every touch | custom assessment ladders per campaign, relationship graph |
| **Action Network** | newsletter list + signup page + unsubscribe, press list + releases, petitions with public pages, volunteer signup page, website JSON bridge | event RSVP pages, donation pages, ladders of engagement, A/B subject lines |

## Website bridge (Imagine Surrey)

Public pages, no login, linkable from the site (workspace slug from signup):

- `/p/:slug/:petition` — petition signature page
- `/n/:slug` — newsletter signup · `/u/:subscriptionId` — one-click unsubscribe
- `/v/:slug` — volunteer signup with the 14 roles

The site can also keep its own forms and post JSON here (CORS-open):

```http
POST /api/public/:slug/signup
{ "kind": "newsletter" | "volunteer" | "petition", "name", "email", "phone",
  "roles": ["doorknocking"], "petition": "<petition-slug>", "subscribe": true }
```

Every public submission lands in the directory as a Person (deduped by email),
tagged by source, and is appended to the event log under a system actor.

## Sending email and text

Set `STARBASE_PUBLIC_URL` (e.g. `https://starbase.imaginesurrey.ca`) so links
in outbound mail — newsletter unsubscribe footers, invite links — point at the
public host. Every newsletter ends with "Sent by <campaign>" and the reader's
own one-click unsubscribe link. Shift messages render in campaign time
(`America/Vancouver` unless `settings.tz` says otherwise).

Provider-pluggable, no SDKs: `RESEND_API_KEY` (+ `MAIL_FROM`) for email,
`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` for SMS. Without
them, blasts and shift notifications are recorded as **queued** per recipient
— nothing is lost; connect the provider and resend. In-app calling/texting
uses `tel:` / `sms:` links (the phone's own dialer and messages) with one-tap
logging.

## Architecture

**Five primitives** — Person (first-class table, real FKs) · Record
(schema-typed rows from one registry) · View · Action (the only write path) ·
Signal. **One event log underneath**: every mutation is one transaction —
typed table writes + event append + hash-chain advance commit together or not
at all. The `events` table is the sync protocol (`GET /api/events?since=`),
the audit trail (`GET /api/audit/verify`), and the public API. `GET /api/export`
returns everything, event log included. Money is integer cents; donors are
foreign keys; the cap engine sums `SUM(amount_cents)` per `person_id` per
calendar year against `cap_rules(jurisdiction, year)` — Imagine Surrey
defaults to `bc-municipal` (LECFA).

Database: PGlite (embedded, real Postgres) — in-memory for tests, file-backed
via `STARBASE_DATA=./data`; hosted Postgres via `DATABASE_URL` in v0.3.
Tenancy is a membership (`user × workspace × role`: manager / treasurer /
staff / volunteer). **Volunteers** can rate doors, log calls and texts, drop
pins, and request signs. The server never shows them money (profiles return no
gifts, totals, or donor tier; Today has no money), and refuses them the gift
ledger, exports, the raw event log, the audit replay, and the subscriber,
signature, and blast lists.

## Run

```sh
cd starbase
npm install
npm test                 # server suite, in-memory Postgres, no setup
node e2e.mjs             # browser journey against a running server (see header)
npm run build            # web → web/dist
STARBASE_DATA=./data node server/index.js   # API + web on :3200
```

```
shared/registry.js     schema registry (DDL + zod + UI hints from one source)
shared/canvass.js      ratings, channels, signs, roles, tags, tiers
server/lib/events.js   runAction: the transactional event-log spine
server/lib/cap.js      entity-keyed contribution-cap engine
server/lib/notify.js   email/SMS adapters (Resend/Twilio via fetch)
server/actions/        the Action registry (index.js core, field.js field+outreach)
server/routes/         auth · api (reads) · public (pages + website bridge)
web/                   Vite + React 19 + react-router + TanStack Query + Leaflet
```

⚠️ `cap_rules` seed values must be verified against Elections BC's current
indexed amounts (LECFA for Surrey) before a filing year relies on them.
