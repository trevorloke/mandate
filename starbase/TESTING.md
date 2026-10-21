# Testing Starbase

Everything below works from a fresh install. Start with **Run it on your
computer** — five minutes, no accounts needed — then deploy when you want your
team on it.

---

## 1 · Run it on your computer

Needs [Node.js 22](https://nodejs.org).

```sh
git clone https://github.com/trevorloke/mandate.git
cd mandate/starbase
npm install
npm run build
npm start                 # → http://localhost:3200
```

1. Open **http://localhost:3200/signup**, create the *Imagine Surrey*
   workspace (jurisdiction defaults to **BC — Municipal**).
2. On **Today**, press **Load sample data**: 52 Surrey voters across Newton,
   Whalley, Guildford, Fleetwood, Cloverdale, and South Surrey — with ratings,
   signs, donors, a shift, an event, a petition, and a Newton turf.
   **Clear sample data** removes it all later (your own records stay).

Your data lives in `starbase/data/`. Stop with Ctrl-C; it's still there next
time. Delete the folder to start over.

> Testing on your phone on the same Wi-Fi: open `http://<your-computer's-IP>:3200`.
> Location ("Locate me") and "Add to Home Screen" need **https** — use the
> deployed version for those.

---

## 2 · Deploy for the team (Render)

The repo's `render.yaml` includes a **starbase** service with a managed
Postgres database (backups included).

1. Render → **New → Blueprint** → pick this repo → it creates `starbase` +
   `starbase-db` (both on paid plans — check Render’s current pricing).
2. In the `starbase` service → **Environment**, set:

| Variable | What for | Needed to test? |
|---|---|---|
| `STARBASE_PUBLIC_URL` | your address, e.g. `https://starbase.imaginesurrey.ca` — used in invite, unsubscribe, and payment links | **yes** |
| `RESEND_API_KEY`, `MAIL_FROM` | real email (invites, newsletters, press, shift alerts) | optional — without it, sends are saved as *queued* and invite links are shown to copy |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | real SMS shift alerts | optional |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | card donations | optional — without it the donate page takes **pledges** |

For Stripe, add a webhook in the Stripe dashboard pointing at
`https://<your address>/api/public/stripe/webhook` with events
`checkout.session.completed` and `invoice.paid`. Use **test mode** keys
(`sk_test_…`) and card `4242 4242 4242 4242` while testing.

Any Docker host works too: `docker build -t starbase starbase/` then run with
either `DATABASE_URL=postgres://…` or a volume at `/data`.

---

## 3 · What to test, by role

Invite real people from **Team** (top right, managers only). Each invite is a
one-time link — emailed if email is connected, otherwise copy and text it.

### Manager (you)
- **Today** — doors this week, support bar, money raised, flagged gifts,
  upcoming shift and event, your turf.
- **Outreach → Website** — set the Imagine Surrey website address; copy the
  public volunteer page (`/v/imagine-surrey`), newsletter page
  (`/n/imagine-surrey`), petition, event, and donate (`/d/imagine-surrey`)
  links; try the embed snippets on a test page of the site.
- **Team** — invite a volunteer and a staff member; change a role.

### Volunteer (on a phone)
- Open the invite link → set a password → lands on the **Map**.
- Tap a door → rate **1 · 2 · 3 · 4 · 4D · 4B · 4F · 4N · 4C**, or *No answer*;
  request a lawn sign; **Call** / **Text** open the phone's dialer and log in
  one tap.
- **Today → Your turf → Walk list** — doors in walking order (odd side up,
  even side back); rate as you go.
- **Offline**: turn on airplane mode, rate three doors (they say *saved
  offline*), turn it off — they send once, never twice.
- Confirm a volunteer **never sees money**: no Money tab, no totals, no gifts
  on profiles.

### Staff
- **People** — filter by rating, tag (media, VIP…), or volunteer role; open a
  profile; add tags, roles, social handles; **Phone bank** / **Text bank**.
- **Shifts** — create a shift with instructions and a link, assign
  volunteers, **Notify everyone** (email + text).
- **Signs** — place billboard / large / lawn signs; move requested → installed.
- **Map → Turfs → Draw turf** — tap the corners of an area, name it, assign a
  volunteer.

### Treasurer
- **Money** — log a gift; log enough to one donor to cross the annual limit
  (sample: *Arjun Mehta* is already flagged). Donor tiers on profiles:
  star ($1K+/yr or $100+/mo), superstar ($3K+/yr or $250+/mo).
- **Donate page** (`/d/imagine-surrey`, in a private window): try without the
  eligibility boxes (refused), more than the annual limit (refused), then a
  real pledge → it appears in **Money → Pledges** → *Mark received* turns it
  into a gift (cap-checked).
- **Today → Verify my books** — replays the tamper-evident log.
  **Export all data** downloads everything.

### Import your own lists
**People → Import CSV.** Try `starbase/samples/surrey-import-test.csv` first —
fictional people at *public building* addresses (City Hall, rec centres). The
check step should report **8 new, 1 merged** (Jordan Lee appears twice with
the same email), and **2 refused** (one row has no name, one has rating "7").
Then **Place everyone on the map** looks the addresses up with the BC Address
Geocoder (needs internet).

For your real voters list: map its columns on the second step; re-importing
the same file never creates duplicates.

---

## 4 · Known limits in this build

- Map tiles come from OpenStreetMap; very large teams should switch to a paid
  tile provider before election week.
- Offline mode covers **door knocks** (ratings, outcomes, notes). Adding new
  people, signs, and gifts needs signal.
- The BC municipal contribution limit is seeded at the 2022 figure
  ($1,250) — **confirm the current indexed amount with Elections BC** and set
  it before relying on cap checks.
- Phone and text banks use the phone's own dialer and messages (no
  auto-dialer).
