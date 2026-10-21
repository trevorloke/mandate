// Public pages + the website bridge. No auth. Each campaign workspace gets:
//   GET/POST /p/:ws/:petition   petition signature page
//   GET/POST /n/:ws             newsletter signup page
//   GET/POST /v/:ws             volunteer signup page
//   GET      /u/:subscriptionId one-click unsubscribe
//   POST     /api/public/:ws/signup   CORS-open JSON for the campaign website's
//                                     own forms (kind: newsletter | volunteer | petition)
// Server-rendered HTML keeps these dead simple to link from the website;
// the JSON endpoint lets the website keep its own design and post here.
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { runAction, newId } from '../lib/events.js';
import { VOLUNTEER_ROLES, VOLUNTEER_ROLE_CODES } from '@starbase/shared/canvass';

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

const loadWs = async (db, slug) => (await db.query(
  'select id, name, slug, settings from workspaces where slug = $1', [slug],
)).rows[0];

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
  return c.json({ error: "kind must be 'newsletter', 'volunteer', or 'petition'" }, 400);
});

export default app;
