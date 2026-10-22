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
  that partly fails says *Sent to 1 of 2 — 1 failed* with *Try again*. If
  the server stops mid-send, the send is still listed — *Sent to 7 of 20 —
  10 not sent · 3 not sure* — and *Try again* sends with the same keys
  (Resend drops a repeat).
- **Two subject lines** (50+ subscribers) — Write newsletter → *Try two
  subject lines*: A and B each go to a small group; after the wait the better
  one (by opens, or by clicks when the message has a link) goes to everyone
  else by itself, and *Last sent* shows *Opened · Clicked*. A tie sends A and
  says *Tie — sent A*. Opens run high (Apple Mail opens by itself); clicks
  from mail scanners aren't counted.
- **Outreach → Ladders** (automatic emails & follow-ups) — email steps go
  only to people who said yes to email (the newsletter, or *Email me updates*
  on a petition); everyone else shows *Email skipped — didn't ask for email*.
  *+ First name* / *+ Campaign* fill in. The email's unsubscribe link asks
  first; once someone unsubscribes, **Newsletter → More → Subscribers** can't
  add them back — only they can, from the signup page.
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
- **More** on a door: note, Call / Text (the phone's own dialer; with Twilio
  connected, the person's card on Calls), request a lawn / large sign or
  billboard (with Undo), add a person at the door.
- **Calls** — one person at a time: Call or Text, then rate; *No answer*,
  *Refused*, *Skip*.
- **Texts** (Twilio connected) — Calls → Text: the message is filled in; edit
  it, *Send*, then *Next →*. Whoever you texted leaves the list until they
  reply; then they come back first, with their reply on the card and a blank
  reply box. Someone another volunteer (or the desk) is texting says
  *Already texting with the campaign*. New replies show as *New replies · N*
  (a count on the Calls tab, a row on Today) → **Inbox**; answer from there.
  A reply like "No thanks, stop" is flagged with *Opt out this number*.
  With no signal Send stays off (*Texts send with signal*). A profile's Call
  and Text open the same card. **Call** rings your own phone first (enter it
  once): answer, press 1, and you're connected — they see the campaign's
  number.
- **Shifts** — *Count me in* on an open shift; *Can't make it* to drop out.
- **Signs** (from Today when there are signs to put up) — *Put up ✓*.
- **Offline**: turn on airplane mode, rate three doors (they say *Saved
  offline*), *Count me in* on a shift (*Take back* undoes it before it
  sends), turn it off — they send once, never twice, and the strip says
  *4 sent*. The strip's *saved on this phone* chip lists what's waiting.
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
  once by itself a minute after the gift (the toast says *receipt emails in a
  minute*; Undo before then and nothing is sent); *Send again* resends;
  **Send all not sent** sends the rest. A donor with no street address: Log
  a gift asks for it under *More details*; left blank, the receipt says
  **Needs address**, shows under **Money → Needs you** (type it right there)
  and its email waits until the address is saved. Voiding a gift marks its
  receipt **VOID** (the number is kept); if the receipt was already emailed,
  Money asks *Receipt already emailed — send a void notice?* Set the
  financial agent, the minimum gift and the footer under **More →
  Settings** (the campaign's dates under *More details*); **More →
  Disclosure** picks a period (this campaign, or a calendar year) and
  downloads contributors over $100 for a spreadsheet, with an *Over limit*
  column. Sample gifts are never in it.
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
  receipts go to donors or the disclosure is filed. The same goes for the
  disclosure's **period**: unset, *This campaign* is the current calendar
  year — confirm the election period with Elections BC and set it under
  Receipts → Settings → More details.
- Card gifts are dated by the campaign's day (Pacific). Card receipts issued
  before this fix used the UTC day, so a card gift paid after 4–5 pm
  Pacific may show the next day: compare card receipts with the Stripe
  dashboard before filing.

### Texting and calls — confirm with counsel

Built conservatively; the campaign should confirm these rules with counsel
(CRTC rules, the Voter Contact Registry) before texting or calling voters:

- Every text is one person tapping *Send* for one person — no bulk or
  scheduled sends, no auto-dialer.
- The first text to someone names the campaign and ends "Reply STOP to opt
  out".
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END or QUIT (punctuation and emoji
  ignored — "STOP 🙏"; clear requests such as "Please stop texting me" too)
  opts that number out at once and for good (tagged *do-not-text*); START or
  UNSTOP opts it back in, and takes off only the tag its STOP put on — a
  *do-not-text* the desk set by hand stays. A reply that only has a stop
  word in it ("No thanks, stop") is flagged in the thread; *Opt out this
  number* (any role in the thread) is the same opt-out.
- One campaign conversation per number: while someone's conversation with a
  number had a text in the last 7 days, nobody else sends another
  introduction, and replies stay in the conversation the voter last replied
  in.
- Quiet hours: texts and calls go out only 9 am–9 pm Monday to Friday and
  10 am–6 pm on weekends (the CRTC's telemarketing hours), Surrey time, by
  default — **confirm both with counsel**; managers change them under
  **Inbox → More → Texting settings**. The server refuses anything outside
  them, shift notices included (*Text not sent — quiet hours*). Shift
  notices are never texted to an opted-out or do-not-text number.
- Calls show the campaign's number, never the caller's own.
