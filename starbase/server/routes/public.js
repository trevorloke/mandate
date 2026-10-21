// Public pages + the website bridge. No auth. Each campaign workspace gets:
//   GET/POST /p/:ws/:petition   petition signature page
//   GET/POST /n/:ws             newsletter signup page
//   GET/POST /v/:ws             volunteer signup page
//   GET      /u/:subscriptionId one-click unsubscribe
//   GET/POST /e/:ws/:event      event page + RSVP
//   GET/POST /d/:ws             donate (BC eligibility attestations; Stripe
//                               Checkout when configured, else a pledge)
//   POST     /api/public/stripe/webhook   payment confirmations → gifts
//   POST     /api/public/:ws/signup   CORS-open JSON for the campaign website's
//                                     own forms (kind: newsletter | volunteer | petition | rsvp)
// Server-rendered HTML keeps these dead simple to link from the website;
// the JSON endpoint lets the website keep its own design and post here.
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { runAction, newId } from '../lib/events.js';
import { VOLUNTEER_ROLES, VOLUNTEER_ROLE_CODES } from '@starbase/shared/canvass';
import { capFor, donorYearTotal } from '../lib/cap.js';
import { logGift } from '../lib/gifts.js';
import { stripeConfigured, createCheckoutSession, verifyStripeSignature } from '../lib/stripe.js';

const app = new Hono();

// Per-IP rate limit: 30 public writes per 10 minutes.
const hits = new Map();
const limited = (ip) => {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 600000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 30;
};
const ipOf = (c) => c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || 'local';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const settingsOf = (ws) => (typeof ws.settings === 'string' ? JSON.parse(ws.settings) : (ws.settings || {}));

const page = (ws, title, inner) => {
  const site = settingsOf(ws).website;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ${esc(ws.name)}</title>
<style>
  :root{--paper:#f8f6ef;--ink:#171410;--ink2:#5d5749;--rule:#e2ddd0;--mark:#f2c40f}
  @media(prefers-color-scheme:dark){:root{--paper:#15120c;--ink:#ece7da;--ink2:#a59e8c;--rule:#2d2a20;--mark:#d9b60e}}
  body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.5 Georgia,'Times New Roman',serif}
  main{max-width:560px;margin:0 auto;padding:40px 20px 64px}
  .eyebrow{font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.18em;text-transform:uppercase;color:var(--ink2)}
  h1{font-size:34px;line-height:1.1;margin:10px 0 14px}
  p{color:var(--ink2)}
  label{display:block;font:500 11px/1 ui-monospace,Menlo,monospace;letter-spacing:.14em;text-transform:uppercase;color:var(--ink2);margin:16px 0 6px}
  input,textarea,select{width:100%;box-sizing:border-box;font:inherit;padding:10px 12px;border:1px solid var(--rule);background:transparent;color:var(--ink);border-radius:2px}
  button{margin-top:20px;font:600 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;text-transform:uppercase;background:var(--mark);color:#171410;border:0;padding:14px 22px;border-radius:2px;cursor:pointer}
  .done{border:1px solid var(--rule);padding:18px;margin-top:20px}
  .roles{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px;margin-top:6px}
  .roles label{display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font:15px Georgia,serif;margin:0}
  .roles input{width:auto}
  footer{margin-top:40px;border-top:1px solid var(--rule);padding-top:12px;font:11px/1.6 ui-monospace,Menlo,monospace;letter-spacing:.08em;color:var(--ink2)}
  a{color:inherit}
</style></head><body><main>
<div class="eyebrow">${esc(ws.name)}</div>
${inner}
<footer>${site ? `<a href="${esc(site)}">← ${esc(site.replace(/^https?:\/\//, ''))}</a> · ` : ''}Powered by Starbase</footer>
</main></body></html>`;
};

const loadWs = async (db, slug) => {
  const ws = (await db.query(
    'select id, name, slug, jurisdiction, settings from workspaces where slug = $1', [slug],
  )).rows[0];
  if (ws) ws.settings = settingsOf(ws);
  return ws;
};

// Create or reuse a person from a public submission (matched by email, else by
// name+phone), tag them, and record the source. Runs as a system action.
const upsertPersonFromPublic = async (db, ws, { name, email, phone, address }, tags) => {
  const em = email ? email.toLowerCase() : null;
  const { result } = await runAction(db, { workspaceId: ws.id, actorId: null, action: 'public.signup' }, async (tx, emit) => {
    let person = em
      ? (await tx.query('select id, tags from persons where workspace_id = $1 and lower(email) = $2 and deleted_at is null limit 1', [ws.id, em])).rows[0]
      : null;
    if (!person && phone) {
      person = (await tx.query('select id, tags from persons where workspace_id = $1 and phone = $2 and lower(name) = lower($3) and deleted_at is null limit 1', [ws.id, phone, name])).rows[0];
    }
    if (person) {
      const existing = typeof person.tags === 'string' ? JSON.parse(person.tags) : (person.tags || []);
      const merged = Array.from(new Set([...existing, ...tags]));
      await tx.query('update persons set tags = $3, updated_at = now() where id = $1 and workspace_id = $2', [person.id, ws.id, JSON.stringify(merged)]);
      emit('person', person.id, 'update', { tags: merged, source: 'public' });
      return { id: person.id, created: false };
    }
    const id = newId();
    await tx.query(
      `insert into persons (id, workspace_id, name, email, phone, address, tags) values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, ws.id, name, em, phone || null, address || null, JSON.stringify(tags)],
    );
    emit('person', id, 'create', { name, email: em, phone, address, tags, source: 'public' });
    return { id, created: true };
  });
  return result;
};

const subscribe = async (db, ws, email, name, source) => {
  const em = email.toLowerCase();
  await db.query(
    `insert into subscriptions (id, workspace_id, email, name, status, source) values ($1, $2, $3, $4, 'subscribed', $5)
     on conflict (workspace_id, email) do update set status = 'subscribed', name = coalesce(excluded.name, subscriptions.name)`,
    [newId(), ws.id, em, name || null, source],
  );
};

const str = (v, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// Accept either form-encoded or JSON bodies.
const readBody = async (c) => {
  const ct = c.req.header('content-type') || '';
  if (ct.includes('application/json')) return c.req.json().catch(() => ({}));
  const form = await c.req.parseBody().catch(() => ({}));
  return form;
};

// ── Petition ──
app.get('/p/:ws/:slug', async (c) => {
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const pet = (await db.query('select * from petitions where workspace_id = $1 and slug = $2 and active', [ws.id, c.req.param('slug')])).rows[0];
  if (!pet) return c.text('petition not found', 404);
  const n = (await db.query('select count(*)::int as n from petition_signatures where petition_id = $1', [pet.id])).rows[0].n;
  return c.html(page(ws, pet.title, `
<h1>${esc(pet.title)}</h1>
${pet.body ? `<p>${esc(pet.body).replace(/\n/g, '<br>')}</p>` : ''}
<p class="eyebrow">${n} ${n === 1 ? 'signature' : 'signatures'}</p>
<form method="post">
  <label for="name">Your name</label><input id="name" name="name" required>
  <label for="email">Email</label><input id="email" name="email" type="email">
  <label for="phone">Phone</label><input id="phone" name="phone">
  <label for="address">Address</label><input id="address" name="address">
  <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font:15px Georgia,serif"><input type="checkbox" name="subscribe" value="1" style="width:auto"> Keep me updated by email</label>
  <button type="submit">Sign the petition</button>
</form>`));
});

app.post('/p/:ws/:slug', async (c) => {
  if (limited(ipOf(c))) return c.text('too many requests', 429);
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const pet = (await db.query('select * from petitions where workspace_id = $1 and slug = $2 and active', [ws.id, c.req.param('slug')])).rows[0];
  if (!pet) return c.text('petition not found', 404);
  const b = await readBody(c);
  const name = str(b.name); const email = str(b.email, 320); const phone = str(b.phone, 40); const address = str(b.address, 400);
  if (!name) return c.text('name required', 400);
  if (email && !emailOk(email)) return c.text('invalid email', 400);
  const wantsNews = b.subscribe === '1' || b.subscribe === true || b.subscribe === 'true';
  await db.query(
    `insert into petition_signatures (id, workspace_id, petition_id, name, email, phone, address, subscribe) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newId(), ws.id, pet.id, name, email || null, phone || null, address || null, wantsNews],
  );
  await upsertPersonFromPublic(db, ws, { name, email, phone, address }, ['petition', `petition:${pet.slug}`]);
  if (wantsNews && email) await subscribe(db, ws, email, name, `petition:${pet.slug}`);
  const wantsJson = (c.req.header('accept') || '').includes('application/json');
  if (wantsJson) return c.json({ ok: true });
  return c.html(page(ws, pet.title, `<h1>Thank you, ${esc(name.split(' ')[0])}.</h1><div class="done">Your signature on <b>${esc(pet.title)}</b> is recorded.</div>`));
});

// ── Newsletter ──
app.get('/n/:ws', async (c) => {
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  return c.html(page(ws, 'Stay in the loop', `
<h1>Stay in the loop.</h1><p>News from ${esc(ws.name)}, straight to your inbox.</p>
<form method="post">
  <label for="name">Your name</label><input id="name" name="name">
  <label for="email">Email</label><input id="email" name="email" type="email" required>
  <button type="submit">Subscribe</button>
</form>`));
});

app.post('/n/:ws', async (c) => {
  if (limited(ipOf(c))) return c.text('too many requests', 429);
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const b = await readBody(c);
  const email = str(b.email, 320); const name = str(b.name);
  if (!emailOk(email)) return c.text('valid email required', 400);
  await subscribe(db, ws, email, name, 'signup-page');
  if (name) await upsertPersonFromPublic(db, ws, { name, email }, ['newsletter']);
  if ((c.req.header('accept') || '').includes('application/json')) return c.json({ ok: true });
  return c.html(page(ws, 'Subscribed', `<h1>You're in.</h1><div class="done">We'll write to <b>${esc(email)}</b>.</div>`));
});

app.get('/u/:id', async (c) => {
  const db = await getDb();
  const row = (await db.query('select s.id, w.name, w.slug, w.settings from subscriptions s join workspaces w on w.id = s.workspace_id where s.id = $1', [c.req.param('id')])).rows[0];
  if (!row) return c.text('not found', 404);
  await db.query(`update subscriptions set status = 'unsubscribed' where id = $1`, [row.id]);
  return c.html(page(row, 'Unsubscribed', `<h1>Unsubscribed.</h1><div class="done">You won't receive further newsletters from ${esc(row.name)}.</div>`));
});

// ── Volunteer signup ──
const roleBoxes = () => VOLUNTEER_ROLES.map((r) =>
  `<label><input type="checkbox" name="roles" value="${r.code}"> ${esc(r.label)}</label>`).join('');

app.get('/v/:ws', async (c) => {
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  return c.html(page(ws, 'Volunteer', `
<h1>Volunteer with ${esc(ws.name)}.</h1><p>Tell us how you'd like to help and we'll be in touch.</p>
<form method="post">
  <label for="name">Your name</label><input id="name" name="name" required>
  <label for="email">Email</label><input id="email" name="email" type="email">
  <label for="phone">Phone</label><input id="phone" name="phone">
  <label for="address">Address</label><input id="address" name="address">
  <label>How can you help?</label><div class="roles">${roleBoxes()}</div>
  <label for="note">Anything else (languages, availability)</label><textarea id="note" name="note" rows="3"></textarea>
  <button type="submit">Sign me up</button>
</form>`));
});

const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []).map(String).filter((r) => VOLUNTEER_ROLE_CODES.includes(r));

app.post('/v/:ws', async (c) => {
  if (limited(ipOf(c))) return c.text('too many requests', 429);
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const b = await readBody(c);
  const name = str(b.name); const email = str(b.email, 320); const phone = str(b.phone, 40); const address = str(b.address, 400);
  if (!name) return c.text('name required', 400);
  if (email && !emailOk(email)) return c.text('invalid email', 400);
  const roles = asList(b.roles);
  const { id } = await upsertPersonFromPublic(db, ws, { name, email, phone, address }, ['volunteer-prospect']);
  for (const role of roles) {
    await db.query(
      'insert into volunteer_roles (id, workspace_id, person_id, role, detail) values ($1, $2, $3, $4, $5)',
      [newId(), ws.id, id, role, str(b.note, 200) || null],
    );
  }
  if ((c.req.header('accept') || '').includes('application/json')) return c.json({ ok: true });
  return c.html(page(ws, 'Thank you', `<h1>Thank you, ${esc(name.split(' ')[0])}.</h1><div class="done">We'll be in touch about ${roles.length ? roles.length + ' way' + (roles.length > 1 ? 's' : '') + ' to help' : 'volunteering'}.</div>`));
});

// ── Events + RSVP ──
const fmtWhen = (d, tz = 'America/Vancouver') => new Date(d).toLocaleString('en-CA', {
  weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz,
});
const loadEvent = async (db, ws, slug) => (await db.query(
  `select e.*, coalesce((select sum(1 + r.guests) from event_rsvps r where r.event_id = e.id and r.status <> 'cancelled'), 0)::int as going
   from campaign_events e where e.workspace_id = $1 and e.slug = $2 and e.deleted_at is null and e.public`,
  [ws.id, slug],
)).rows[0];

const rsvp = async (db, ws, ev, { name, email, phone, guests }) => {
  const g = Math.min(Math.max(Number(guests) || 0, 0), 10);
  if (ev.capacity && ev.going + 1 + g > ev.capacity) return { full: true };
  const { id: personId } = await upsertPersonFromPublic(db, ws, { name, email, phone }, ['event', `event:${ev.slug}`]);
  await db.query(
    `insert into event_rsvps (id, workspace_id, event_id, person_id, name, email, phone, guests) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [newId(), ws.id, ev.id, personId, name, email || null, phone || null, g],
  );
  return { ok: true };
};

app.get('/e/:ws/:slug', async (c) => {
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const ev = await loadEvent(db, ws, c.req.param('slug'));
  if (!ev) return c.text('event not found', 404);
  const tz = ws.settings.tz || 'America/Vancouver';
  const full = ev.capacity && ev.going >= ev.capacity;
  const past = new Date(ev.starts_at) < new Date();
  return c.html(page(ws, ev.title, `
<h1>${esc(ev.title)}</h1>
<p class="eyebrow">${esc(fmtWhen(ev.starts_at, tz))}${ev.location ? ` · ${esc(ev.location)}` : ''}</p>
${ev.description ? `<p>${esc(ev.description).replace(/\n/g, '<br>')}</p>` : ''}
${past ? '<div class="done">This event has already happened.</div>'
  : full ? '<div class="done">This event is full.</div>'
  : `<form method="post">
  <label for="name">Your name</label><input id="name" name="name" required>
  <label for="email">Email</label><input id="email" name="email" type="email">
  <label for="phone">Phone</label><input id="phone" name="phone">
  <label for="guests">Bringing guests?</label>
  <select id="guests" name="guests">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n === 0 ? 'Just me' : `+${n}`}</option>`).join('')}</select>
  <button type="submit">RSVP</button>
</form>`}`));
});

app.post('/e/:ws/:slug', async (c) => {
  if (limited(ipOf(c))) return c.text('too many requests', 429);
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const ev = await loadEvent(db, ws, c.req.param('slug'));
  if (!ev || new Date(ev.starts_at) < new Date()) return c.text('event not found', 404);
  const b = await readBody(c);
  const name = str(b.name); const email = str(b.email, 320); const phone = str(b.phone, 40);
  if (!name) return c.text('name required', 400);
  if (email && !emailOk(email)) return c.text('invalid email', 400);
  const r = await rsvp(db, ws, ev, { name, email, phone, guests: b.guests });
  const json = (c.req.header('accept') || '').includes('application/json');
  if (r.full) return json ? c.json({ error: 'this event is full' }, 409) : c.html(page(ws, ev.title, '<h1>Sorry — this event is full.</h1>'), 409);
  if (json) return c.json({ ok: true });
  return c.html(page(ws, ev.title, `<h1>You're in, ${esc(name.split(' ')[0])}.</h1><div class="done"><b>${esc(ev.title)}</b><br>${esc(fmtWhen(ev.starts_at, ws.settings.tz))}${ev.location ? `<br>${esc(ev.location)}` : ''}</div>`));
});

// ── Donations ──
// BC rules (verify with Elections BC for the current cycle): contributions only
// from eligible individuals — BC residents who are Canadian citizens or
// permanent residents — from their own funds; name and address recorded.
const ATTESTATIONS = [
  ['individual', 'I am an individual (not a business, union, or organization).'],
  ['resident', 'I live in British Columbia and am a Canadian citizen or permanent resident.'],
  ['own_funds', 'This contribution is from my own funds and I will not be reimbursed.'],
];
const PRESETS = [2500, 5000, 10000, 25000, 50000, 100000];
const dollars = (c2) => `$${(c2 / 100).toLocaleString('en-CA', { minimumFractionDigits: c2 % 100 ? 2 : 0 })}`;
const publicBase = (c) => (process.env.STARBASE_PUBLIC_URL || new URL(c.req.url).origin).replace(/\/$/, '');

const donateForm = (ws, cap, err = '', v = {}) => {
  const card = stripeConfigured();
  return `
<h1>Contribute to ${esc(ws.name)}.</h1>
<p>${card ? 'Secure card payment by Stripe.' : esc(ws.settings.donateInstructions || 'Pledge now and the campaign will contact you to complete your contribution by e-transfer or cheque.')}</p>
${err ? `<div class="done" role="alert" style="border-color:#a83a2c">${esc(err)}</div>` : ''}
<form method="post">
  <label>Amount</label>
  <div class="roles">${PRESETS.map((a) => `<label><input type="radio" name="amount" value="${a / 100}" ${String(v.amount) === String(a / 100) ? 'checked' : ''}> ${dollars(a)}</label>`).join('')}</div>
  <label for="other">Other amount ($)</label><input id="other" name="other" inputmode="decimal" value="${esc(v.other || '')}">
  <label style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font:15px Georgia,serif"><input type="checkbox" name="monthly" value="1" style="width:auto" ${v.monthly ? 'checked' : ''}> Make it monthly</label>
  <label for="name">Full name</label><input id="name" name="name" required value="${esc(v.name || '')}">
  <label for="email">Email</label><input id="email" name="email" type="email" required value="${esc(v.email || '')}">
  <label for="phone">Phone</label><input id="phone" name="phone" value="${esc(v.phone || '')}">
  <label for="address">Home address</label><input id="address" name="address" required value="${esc(v.address || '')}">
  <label>Eligibility</label>
  ${ATTESTATIONS.map(([k, t]) => `<label style="display:flex;gap:8px;align-items:flex-start;text-transform:none;letter-spacing:0;font:15px Georgia,serif;margin:8px 0"><input type="checkbox" name="attest_${k}" value="1" style="width:auto;margin-top:4px" required> ${esc(t)}</label>`).join('')}
  ${cap ? `<p class="eyebrow" style="margin-top:14px">The annual limit is ${dollars(cap)} per contributor, including monthly gifts.</p>` : ''}
  <button type="submit">${card ? 'Continue to payment' : 'Pledge my contribution'}</button>
</form>`;
};

app.get('/d/:ws', async (c) => {
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const rule = await capFor(db, ws.jurisdiction, new Date().getUTCFullYear(), ws.settings);
  return c.html(page(ws, 'Contribute', donateForm(ws, rule?.capCents)));
});

app.post('/d/:ws', async (c) => {
  if (limited(ipOf(c))) return c.text('too many requests', 429);
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  const b = await readBody(c);
  const v = { amount: str(b.amount, 12), other: str(b.other, 12), monthly: b.monthly === '1' || b.monthly === true,
    name: str(b.name), email: str(b.email, 320), phone: str(b.phone, 40), address: str(b.address, 400) };
  const year = new Date().getUTCFullYear();
  const rule = await capFor(db, ws.jurisdiction, year, ws.settings);
  const fail = (msg) => c.html(page(ws, 'Contribute', donateForm(ws, rule?.capCents, msg, v)), 400);

  const raw = v.other || v.amount;
  const cents = Math.round(Number.parseFloat(String(raw).replace(/[$,\s]/g, '')) * 100);
  if (!Number.isFinite(cents) || cents < 100) return fail('Choose an amount of at least $1.');
  if (!v.name || !v.address) return fail('Your full name and home address are required by election law.');
  if (!emailOk(v.email)) return fail('A valid email is required for your receipt.');
  const missing = ATTESTATIONS.filter(([k]) => !(b[`attest_${k}`] === '1' || b[`attest_${k}`] === true));
  if (missing.length) return fail('Please confirm each eligibility statement — only eligible individuals may contribute.');

  // Cap pre-check against this person's gifts so far this year (by email).
  if (rule) {
    if (cents > rule.capCents) return fail(`The most one person can give this year is ${dollars(rule.capCents)}.`);
    const known = (await db.query(
      'select id from persons where workspace_id = $1 and lower(email) = $2 and deleted_at is null limit 1',
      [ws.id, v.email.toLowerCase()],
    )).rows[0];
    if (known) {
      const so = await donorYearTotal(db, ws.id, known.id, year);
      if (so + cents > rule.capCents) {
        const left = Math.max(rule.capCents - so, 0);
        return fail(left > 0
          ? `Thank you — you can contribute up to ${dollars(left)} more this year under the annual limit.`
          : `Thank you — you've reached this year's ${dollars(rule.capCents)} limit.`);
      }
    }
  }

  const { id: personId } = await upsertPersonFromPublic(db, ws,
    { name: v.name, email: v.email, phone: v.phone, address: v.address }, ['donor']);
  const pledgeId = newId();
  const attest = Object.fromEntries(ATTESTATIONS.map(([k]) => [k, true]));
  await db.query(
    `insert into pledges (id, workspace_id, person_id, name, email, phone, address, amount_cents, cadence, status, attest)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [pledgeId, ws.id, personId, v.name, v.email.toLowerCase(), v.phone || null, v.address, cents,
     v.monthly ? 'monthly' : 'one-time', stripeConfigured() ? 'pending' : 'pledged', JSON.stringify({ ...attest, at: new Date().toISOString(), ip: ipOf(c) })],
  );

  if (stripeConfigured()) {
    try {
      const base = publicBase(c);
      const session = await createCheckoutSession({
        pledge: { id: pledgeId, amount_cents: cents, cadence: v.monthly ? 'monthly' : 'one-time', email: v.email },
        workspace: ws,
        successUrl: `${base}/d/${ws.slug}/thanks`,
        cancelUrl: `${base}/d/${ws.slug}`,
      });
      await db.query('update pledges set stripe_session_id = $2 where id = $1', [pledgeId, session.id]);
      return c.redirect(session.url, 303);
    } catch (e) {
      return fail(`Card payment isn't available right now (${String(e.message).slice(0, 120)}). Please try again shortly.`);
    }
  }
  return c.html(page(ws, 'Thank you', `<h1>Thank you, ${esc(v.name.split(' ')[0])}.</h1>
<div class="done">Your ${v.monthly ? 'monthly ' : ''}pledge of <b>${dollars(cents)}</b> is recorded.
${esc(ws.settings.donateInstructions || 'The campaign will be in touch to complete it by e-transfer or cheque.')}</div>`));
});

app.get('/d/:ws/thanks', async (c) => {
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.text('not found', 404);
  return c.html(page(ws, 'Thank you', `<h1>Thank you.</h1><div class="done">Your contribution to ${esc(ws.name)} is being processed. A receipt is on its way to your email.</div>`));
});

// Stripe → gifts. One-time: checkout.session.completed (paid). Monthly: every
// invoice.paid. Each delivery applies once (stripe_events), and every payment
// enters the books through logGift, so the cap check always runs.
app.post('/api/public/stripe/webhook', async (c) => {
  const raw = await c.req.text();
  if (!verifyStripeSignature(raw, c.req.header('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return c.json({ error: 'bad signature' }, 400);
  }
  const evt = JSON.parse(raw);
  const obj = evt.data?.object || {};
  const meta = obj.metadata?.pledge_id ? obj.metadata
    : obj.subscription_details?.metadata?.pledge_id ? obj.subscription_details.metadata
    : obj.parent?.subscription_details?.metadata?.pledge_id ? obj.parent.subscription_details.metadata
    : obj.lines?.data?.[0]?.metadata?.pledge_id ? obj.lines.data[0].metadata
    : null;
  if (!meta) return c.json({ ok: true, ignored: 'no pledge metadata' });
  const db = await getDb();
  const ws = (await db.query('select id, name, slug, jurisdiction, settings from workspaces where id = $1', [meta.workspace_id])).rows[0];
  if (!ws) return c.json({ ok: true, ignored: 'unknown workspace' });
  ws.settings = settingsOf(ws);

  const paidOneTime = evt.type === 'checkout.session.completed' && obj.mode === 'payment' && obj.payment_status === 'paid';
  const paidMonthly = evt.type === 'invoice.paid';
  const subStarted = evt.type === 'checkout.session.completed' && obj.mode === 'subscription';
  if (!paidOneTime && !paidMonthly && !subStarted) return c.json({ ok: true, ignored: evt.type });

  const { result } = await runAction(db, { workspaceId: ws.id, actorId: null, action: 'stripe.payment' }, async (tx, emit) => {
    const fresh = await tx.query('insert into stripe_events (id, workspace_id, type) values ($1, $2, $3) on conflict do nothing',
      [evt.id, ws.id, evt.type]);
    if (fresh.affectedRows === 0) return { duplicate: true };
    const pledge = (await tx.query('select * from pledges where id = $1 and workspace_id = $2 for update', [meta.pledge_id, ws.id])).rows[0];
    if (!pledge) return { ignored: 'unknown pledge' };
    if (subStarted) {
      await tx.query(`update pledges set status = 'paid', updated_at = now() where id = $1`, [pledge.id]);
      emit('pledge', pledge.id, 'update', { status: 'paid', subscription: obj.subscription || null });
      return { subscription: true };
    }
    const cents = paidOneTime ? Number(obj.amount_total) : Number(obj.amount_paid);
    const paidAt = new Date(((paidMonthly ? obj.status_transitions?.paid_at : obj.created) || evt.created) * 1000);
    const { gift, compliance } = await logGift(tx, ws, {
      person_id: pledge.person_id, amount_cents: cents, date: paidAt.toISOString().slice(0, 10),
      method: 'card', cadence: pledge.cadence, note: `Stripe ${paidOneTime ? obj.payment_intent || obj.id : obj.id}`,
    }, emit);
    await tx.query(`update pledges set status = 'paid', gift_id = coalesce(gift_id, $2), updated_at = now() where id = $1`, [pledge.id, gift.id]);
    emit('pledge', pledge.id, 'update', { status: 'paid', gift_id: gift.id });
    return { gift_id: gift.id, flagged: gift.flagged, compliance };
  });
  return c.json({ ok: true, ...result });
});

// ── Website bridge: JSON endpoint for the campaign site's own forms ──
app.options('/api/public/:ws/signup', (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  return c.body(null, 204);
});

app.post('/api/public/:ws/signup', async (c) => {
  c.header('Access-Control-Allow-Origin', '*');
  if (limited(ipOf(c))) return c.json({ error: 'too many requests' }, 429);
  const db = await getDb();
  const ws = await loadWs(db, c.req.param('ws'));
  if (!ws) return c.json({ error: 'unknown workspace' }, 404);
  const b = await c.req.json().catch(() => ({}));
  const kind = str(b.kind, 20);
  const name = str(b.name); const email = str(b.email, 320); const phone = str(b.phone, 40); const address = str(b.address, 400);
  if (email && !emailOk(email)) return c.json({ error: 'invalid email' }, 400);

  if (kind === 'newsletter') {
    if (!emailOk(email)) return c.json({ error: 'email required' }, 400);
    await subscribe(db, ws, email, name, 'website');
    if (name) await upsertPersonFromPublic(db, ws, { name, email }, ['newsletter']);
    return c.json({ ok: true, kind });
  }
  if (kind === 'volunteer') {
    if (!name) return c.json({ error: 'name required' }, 400);
    const { id } = await upsertPersonFromPublic(db, ws, { name, email, phone, address }, ['volunteer-prospect']);
    for (const role of asList(b.roles)) {
      await db.query('insert into volunteer_roles (id, workspace_id, person_id, role, detail) values ($1, $2, $3, $4, $5)',
        [newId(), ws.id, id, role, str(b.note, 200) || null]);
    }
    return c.json({ ok: true, kind });
  }
  if (kind === 'petition') {
    const pet = (await db.query('select id, slug from petitions where workspace_id = $1 and slug = $2 and active', [ws.id, str(b.petition, 60)])).rows[0];
    if (!pet) return c.json({ error: 'unknown petition' }, 404);
    if (!name) return c.json({ error: 'name required' }, 400);
    await db.query(
      `insert into petition_signatures (id, workspace_id, petition_id, name, email, phone, address, subscribe) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [newId(), ws.id, pet.id, name, email || null, phone || null, address || null, !!b.subscribe],
    );
    await upsertPersonFromPublic(db, ws, { name, email, phone, address }, ['petition', `petition:${pet.slug}`]);
    if (b.subscribe && email) await subscribe(db, ws, email, name, `petition:${pet.slug}`);
    return c.json({ ok: true, kind });
  }
  if (kind === 'rsvp') {
    const ev = await loadEvent(db, ws, str(b.event, 60));
    if (!ev || new Date(ev.starts_at) < new Date()) return c.json({ error: 'unknown event' }, 404);
    if (!name) return c.json({ error: 'name required' }, 400);
    const r = await rsvp(db, ws, ev, { name, email, phone, guests: b.guests });
    if (r.full) return c.json({ error: 'this event is full' }, 409);
    return c.json({ ok: true, kind });
  }
  return c.json({ error: "kind must be 'newsletter', 'volunteer', 'petition', or 'rsvp'" }, 400);
});

export default app;
