# Starbase

The campaign OS built for **Imagine Surrey**. Field-first: a map with every
door on it, a one-tap rating scale at the door, phone, and by text — with
signs, volunteers, shifts, money, compliance, and outreach around it. Lives
beside the legacy app in this repo; nothing in the repo root is touched.

## The seven things a campaign does (the whole tab bar)

Every screen is built to [SIMPLE.md](SIMPLE.md): one job per screen, one yellow
button, no paragraphs, everything else one tap away.

| Screen | What it is |
|---|---|
| **Today** | Desk: three big numbers (doors · support · raised) and *Needs you*. Volunteers: one big *Start canvassing* and their next shift |
| **Map** | Field mode. Houses as clickable pins; tap a door → rate, log, request a sign, call/text. Turfs and walk lists |
| **People** | Everyone, filterable by rating / tag / role; profiles with socials, roles, gifts, history; **Calls** works a list one person at a time |
| **Shifts** | Schedule volunteers, assign by role, notify by email + text with instructions and a link; volunteers tap *Count me in* |
| **Money** | Gifts (one-time / monthly) with the entity-keyed cap engine; donor tiers; filings |
| **Signs** | Billboards (4×8), large (4×4), lawn — requested → installed → removed |
| **Outreach** | Newsletter + press-release blasts, petitions, and the Imagine Surrey website bridge |

Volunteers get four tabs — **Today · Map · Calls · Shifts** — plus *Signs to
put up* for sign crews; desk-only addresses send them back to Today.

Managers reach **Team** from the account menu (their initials): invite volunteers and staff by email
(or copy the join link and text it), set roles, see pending invites. Invitees
open `/join/:token`, set a password, and land on the map (volunteers) or Today.

### The rating scale (door, phone, text)

`1` strong support · `2` lean support · `3` undecided · `4` opposed (unknown) ·
`4D` McCallum · `4B` Surrey Connect / Locke · `4F` Surrey First / Annis ·
`4N` SurreyNow / van Vliet · `4C` Surrey Conservatives / Randhawa
(`shared/canvass.js` — one vocabulary for server validation and the UI).
On screen the buttons read *1 Strong yes · 2 Lean yes · 3 Undecided ·
4 Opposed*; tapping 4 asks *Voting for?* with the five surnames or *Not sure*.

### What's tracked

- **Signs**: billboard, large, lawn, with status and location.
- **Donors**: one-time, monthly, **star** ($1K+/yr or $100+/mo), **superstar**
  ($3K+/yr or $250+/mo) — derived from real gifts, never self-declared.
- **Volunteer roles** (15): driver, scrutineer, doorknocking, mainstreeting,
  phoning, data entry, event hosting, zone house captain, hi-rise building
  captain (+building), food, translation
  (+language), burmashave, community committee (+area), policy, administration.
- **Tags**: free-form, seeded with media, VIP, endorser, host, …
- **Socials**: per-person handles for Facebook, Instagram, X, TikTok, YouTube,
  LinkedIn, Bluesky.

## Coverage vs. the tools it replaces

| | Starbase today | Next |
|---|---|---|
| **Ecanvasser** | map canvass, door cards, household grouping, ratings, no-answer outcomes, signs at the door, place-on-map, call/text lists, turf cutting & assignment, walk lists, survey builder (door and calls), offline field mode | full offline replica |
| **Action Builder** | assessments (= the rating scale), tags, roles, relational notes, event-logged every touch | custom assessment ladders per campaign, relationship graph |
| **Action Network** | newsletter list + signup page + unsubscribe, press list + releases, petitions with public pages, volunteer signup page, event RSVP pages, donation pages (Stripe or pledges), website JSON bridge, ladders of engagement, A/B subject lines with open/click tracking | — |

## Website bridge (Imagine Surrey)

Public pages, no login, linkable from the site (workspace slug from signup):

- `/p/:slug/:petition` — petition signature page
- `/n/:slug` — newsletter signup · `/u/:subscriptionId` — one-click unsubscribe
- `/v/:slug` — volunteer signup with the 15 roles (a hi-rise captain is asked
  which building; translators, which language)

The site can also keep its own forms and post JSON here (CORS-open):

```http
POST /api/public/:slug/signup
{ "kind": "newsletter" | "volunteer" | "petition", "name", "email", "phone",
  "roles": ["highrise_captain"], "detail_highrise_captain": "<building>",
  "petition": "<petition-slug>", "subscribe": true, "note": "…" }
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
— nothing is lost; connect the provider and resend. Without Twilio, calling
and texting use `tel:` / `sms:` links (the phone's own dialer and messages)
with one-tap logging; with it, texts and calls go through the campaign's
number (setup and the compliance notes are in TESTING.md).

## Map tiles and offline field mode

The map draws OpenStreetMap tiles unless these say otherwise (read on each
request to the signed-in `GET /api/map/config`, so a restart applies them).
OpenStreetMap's volunteer-run servers are not for heavy use — a large team in
election week should switch to a paid provider.

| Variable | What for | Default |
|---|---|---|
| `STARBASE_TILE_URL` | tile template, `https://…/{z}/{x}/{y}.png` (`{s}` optional; an API key can ride in the query string) | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` |
| `STARBASE_TILE_ATTRIBUTION` | the provider's credit line (text and links) | the OpenStreetMap credit (none for another provider unless set) |
| `STARBASE_TILE_MAX_ZOOM` | deepest zoom the provider serves, 1–22 | `19` |

A bad value falls back to the default (and logs once). The service worker
keeps the tiles a phone has already looked at (about 1,500, oldest out), so a
turf viewed with signal still draws offline; it never fetches tiles ahead.

With no signal, field work saves on the phone and sends once, in order, when
the signal is back: knocks, new people and doors (staff), dropped pins, sign
requests and their Undo, and *Count me in* / *Can't make it*. The map's doors,
the Calls list, shifts and walk lists keep their last loaded copy on the
phone for a day ("Offline copy"); sign-out forgets them. Anything the server
refuses on the way is kept and listed under the strip's "saved on this phone"
chip with the reason — *Try again* or *Dismiss*. Gifts, imports and outreach
need signal.

## Architecture

**Five primitives** — Person (first-class table, real FKs) · Record
(schema-typed rows from one registry) · View · Action (the only write path) ·
Signal. **One event log underneath**: every mutation is one transaction —
typed table writes + event append + hash-chain advance commit together or not
at all. The `events` table is the sync protocol (`GET /api/events?since=`),
the audit trail (`GET /api/audit/verify`), and the public API. `GET /api/export`
returns every campaign table (each feature's too), event log included — never
sign-ins or a link's secret token. Money is integer cents; donors are
foreign keys; the cap engine sums `SUM(amount_cents)` per `person_id` per
calendar year against `cap_rules(jurisdiction, year)` — Imagine Surrey
defaults to `bc-municipal` (LECFA).

Database: PGlite (embedded, real Postgres) — in-memory for tests, file-backed
via `STARBASE_DATA=./data`; hosted Postgres via `DATABASE_URL` in v0.3.
Tenancy is a membership (`user × workspace × role`: manager / treasurer /
staff / volunteer). **Volunteers** can rate doors, log calls and texts, drop
pins, request signs, and add a new housemate (name and phone) at a door in
their turf. The server never shows them money (profiles return no
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
