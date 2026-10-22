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
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | SMS shift alerts; texting and calling from the app through the campaign's number | optional — without it, Calls opens the phone's own Messages and dialer |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | card donations | optional — without it the donate page takes **pledges** |

For Stripe, add a webhook in the Stripe dashboard pointing at
`https://<your address>/api/public/stripe/webhook` with events
`checkout.session.completed` and `invoice.paid`. Use **test mode** keys
(`sk_test_…`) and card `4242 4242 4242 4242` while testing.

For Twilio, set the number's incoming messages webhook to
`https://<your address>/api/public/twilio/sms` (HTTP POST). Calls through the
campaign also need `STARBASE_PUBLIC_URL`; `TWILIO_VOICE=off` keeps texting
and turns calling off.

Any Docker host works too: `docker build -t starbase starbase/` then run with
either `DATABASE_URL=postgres://…` or a volume at `/data`.

---

## 3 · What to test, by role

Invite real people from **Team** (tap your initials, top right — managers
only). Each invite is a one-time link — emailed if email is connected,
otherwise copy and text it.

Every screen has one yellow button: that's the main job. Everything else is
one tap away under **More**.

### Manager (you)
- **Today** — three big numbers (doors this week · support · raised); tap
  *Support* for the breakdown by candidate. **Needs you** lists what's waiting:
  gifts over the limit, open pledges, filings due, shifts short of people,
  signs to put up.
- **Outreach → Newsletter** — without email connected, a newsletter is
  *Saved — not sent*; connect email (Resend) and tap *Send now*. A send
  that partly fails says *Sent to 1 of 2 — 1 failed* with *Try again*.
- **Outreach → Website** — set the Imagine Surrey website address; copy the
  public volunteer page (`/v/imagine-surrey`), newsletter page
  (`/n/imagine-surrey`), petition, event, and donate (`/d/imagine-surrey`)
  links; *For your web developer* has the embed code for the site.
- **Team** — invite a volunteer and a staff member; change a role.

### Volunteer (on a phone)
- Open the invite link → set a password → lands on the **Map**. Tabs:
  **Today · Map · Calls · Shifts**.
- **Today → Start canvassing** opens your walk list (doors in walking order:
  odd side up, even side back). Tap a door → **1 · 2 · 3 · 4** (each says what
  it means). **4** asks *Voting for?* — McCallum · Locke · Annis · van Vliet ·
  Randhawa · Not sure. A toast confirms; *Change* fixes a mis-tap.
- **More** on a door: note, Call / Text (the phone's own dialer), request a
  lawn / large sign or billboard (with Undo), add a person at the door.
- **Calls** — one person at a time: Call or Text, then rate; *No answer*,
  *Refused*, *Skip*.
- **Texts** (Twilio connected) — Calls → Text: the message is filled in; edit
  it, *Send*. Replies show as *Replies · N* → **Inbox**; answer from there.
  **Call** rings your own phone first (enter it once): answer, press 1, and
  you're connected — they see the campaign's number.
- **Shifts** — *Count me in* on an open shift; *Can't make it* to drop out.
- **Signs** (from Today when there are signs to put up) — *Put up ✓*.
- **Offline**: turn on airplane mode, rate three doors (they say *Saved
  offline*), *Count me in* on a shift, turn it off — they send once, never
  twice. The strip's *saved on this phone* chip lists what's waiting.
- Confirm a volunteer **never sees money or the supporter list**: no Money,
  People or Outreach; typing those addresses lands back on Today. (The
  server enforces this too: their browser never receives other people's
  emails or donor tags.)

### Staff
- **People** — search; **Filter** by rating, tag (media, VIP…), or volunteer
  role (incl. *Hi-rise building captain*); open a profile; add tags, roles,
  social handles. **More → Call list / Text list** opens Calls with the same
  filter; **More → Inbox** has every text conversation.
- **Shifts** — **New shift** (what, when, where, how many; role,
  instructions and link under *More details*), **Add volunteer**, then
  **Notify everyone** (email + text). Without email/text connected the
  button says *Save — nothing sends*; once connected, *Notify again* reaches
  them. Nothing on any screen claims to be sent unless it was.
- **Signs** — tap *To put up* / *Up* / *Taken down* to filter; **Add a sign**
  (it needs an address); a request that never went up can be *Cancelled*.
- **Map → filter button → Draw turf** — tap the corners, name it, assign a
  canvasser.

### Treasurer
- **Money** — **Log a gift**; log enough to one donor to cross the annual
  limit (sample: *Arjun Mehta* is already over). Donor tiers on profiles:
  star ($1K+/yr or $100+/mo), superstar ($3K+/yr or $250+/mo).
- **Donate page** (`/d/imagine-surrey`, in a private window): try without the
  eligibility boxes (refused), more than the annual limit (refused), then a
  real pledge → it appears under **Money → Needs you** → *Mark paid* turns it
  into a gift (cap-checked). Voiding that gift reopens the pledge; a monthly
  pledge stays open and is marked paid month by month.
- **Money → More → Receipts** — every gift gets a numbered receipt
  (`2026-0001`, no gaps) the moment it's logged, marked paid, or paid by card;
  open a gift on Money to see *Receipt 2026-0007 · Sent*. Without email
  connected each one says *Not sent — email isn't connected* (or *No email on
  file*) — tap it, then **Print**. With email connected it goes to the donor
  once by itself; *Send again* resends; **Send all not sent** sends the rest.
  Voiding a gift marks its receipt **VOID** (the number is kept). Set the
  financial agent, the minimum gift and the footer under **More → Settings**;
  **More → Disclosure** downloads contributors over $100.
- **Today → More → Verify my books** replays the tamper-evident log;
  **Export all data** downloads everything.

### Public volunteer page
- `/v/imagine-surrey` in a private window: tick *Hi-rise building captain* —
  it asks which building; *Translation* asks the language. Each ticked role is
  saved with its own detail, and the note lands once on the person's profile.

### Import your own lists
**People → More → Import.** Try `starbase/samples/surrey-import-test.csv` first —
fictional people at *public building* addresses (City Hall, rec centres). The
check step should report **8 new, 1 merged** (Jordan Lee appears twice with
the same email), and **2 refused** (one row has no name, one has rating "7").
Then **Place on map** looks the addresses up with the BC Address
Geocoder (needs internet).

For your real voters list: map its columns on the second step; re-importing
the same file never creates duplicates.

---

## 4 · Known limits in this build

- Map tiles come from OpenStreetMap; very large teams should switch to a paid
  tile provider before election week (`STARBASE_TILE_URL`, see the README).
- Offline mode covers **field work** (knocks, new people and doors, pins,
  sign requests, shift sign-ups). Gifts, imports and outreach need signal.
- The BC municipal contribution limit is seeded at the 2022 figure
  ($1,250) — **confirm the current indexed amount with Elections BC** and set
  it before relying on cap checks.
- Without Twilio, calls and texts use the phone's own dialer and messages
  (no auto-dialer).
- Contribution receipts: the wording (including the *not tax-deductible*
  line), what a receipt must show, the minimum gift that gets one and the
  $100 disclosure amount are all settings — **the financial agent must
  confirm receipt contents and thresholds with Elections BC** before
  receipts go to donors or the disclosure is filed.

### Texting and calls — confirm with counsel

Built conservatively; the campaign should confirm these rules with counsel
(CRTC rules, the Voter Contact Registry) before texting or calling voters:

- Every text is one person tapping *Send* for one person — no bulk or
  scheduled sends, no auto-dialer.
- The first text to someone names the campaign and ends "Reply STOP to opt
  out".
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END or QUIT opts that number out at
  once and for good (tagged *do-not-text*); START or UNSTOP opts it back in.
- Quiet hours: texts and calls go out only 9 am–9 pm Surrey time by
  default; managers change them under **Inbox → More → Texting settings**.
  The server refuses anything outside them.
- Calls show the campaign's number, never the caller's own.
