// Data routes (desk roles): bulk import with dedupe, batch geocoding, and the
// Imagine Surrey sample dataset. Mounted under /api/data, after auth.
import { Hono } from 'hono';
import { z } from 'zod';
import { RATING_CODES } from '@starbase/shared/canvass';
import { runAction, newId } from '../lib/events.js';
import { geocodeAddress } from '../lib/geocode.js';
import { buildSample } from '../lib/sample.js';
import { logGift } from '../lib/gifts.js';

const app = new Hono();
const DESK = ['manager', 'treasurer', 'staff'];

app.use('*', async (c, next) => {
  if (!DESK.includes(c.get('ctx').role)) return c.json({ error: 'volunteers cannot do this' }, 403);
  await next();
});

const parseJson = (v, d) => (typeof v === 'string' ? JSON.parse(v) : (v ?? d));
const norm = (s) => String(s ?? '').trim();
const lower = (s) => norm(s).toLowerCase();
const digits = (s) => norm(s).replace(/\D+/g, '');

// ── Import ──
// The client parses the CSV and maps columns; the server validates, dedupes,
// and writes in one transaction per call (≤ 2000 rows).
const rowSchema = z.object({
  name: z.string().max(300).nullish(),
  first: z.string().max(150).nullish(),
  last: z.string().max(150).nullish(),
  email: z.string().max(320).nullish(),
  phone: z.string().max(40).nullish(),
  address: z.string().max(1000).nullish(),
  unit: z.string().max(40).nullish(),
  city: z.string().max(120).nullish(),
  postal: z.string().max(20).nullish(),
  tags: z.union([z.string().max(2000), z.array(z.string().max(40)).max(50)]).nullish(),
  rating: z.string().max(4).nullish(),
});
const importInput = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(2000),
  tag: z.string().trim().max(40).nullish(),   // applied to every imported row
  dryRun: z.boolean().default(false),
});

const cleanRow = (raw, i) => {
  const r = rowSchema.safeParse(raw);
  if (!r.success) return { error: `row ${i + 1}: ${r.error.issues[0].path.join('.')} ${r.error.issues[0].message}` };
  const v = r.data;
  const name = norm(v.name) || [norm(v.first), norm(v.last)].filter(Boolean).join(' ');
  if (!name) return { error: `row ${i + 1}: no name` };
  const email = lower(v.email) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: `row ${i + 1}: invalid email “${v.email}”` };
  const rating = norm(v.rating).toUpperCase() || null;
  if (rating && !RATING_CODES.includes(rating)) return { error: `row ${i + 1}: rating “${v.rating}” is not on the scale` };
  const tags = Array.isArray(v.tags) ? v.tags : norm(v.tags).split(/[;,|]/);
  return {
    row: {
      name, email, rating,
      phone: norm(v.phone) || null,
      address: norm(v.address) || null,
      unit: norm(v.unit) || null,
      city: norm(v.city) || null,
      postal: norm(v.postal).toUpperCase() || null,
      tags: [...new Set(tags.map((t) => norm(t)).filter((t) => t && t.length <= 40))].slice(0, 50),
    },
  };
};

app.post('/import', async (c) => {
  const ctx = c.get('ctx');
  const parsed = importInput.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0].message }, 400);
  const { rows, tag, dryRun } = parsed.data;

  const errors = [];
  const clean = [];
  rows.forEach((raw, i) => {
    const r = cleanRow(raw, i);
    if (r.error) errors.push(r.error);
    else clean.push({ ...r.row, tags: tag ? [...new Set([...r.row.tags, tag])] : r.row.tags, index: i });
  });

  // write=false is the dry run: identical decisions, no writes.
  const run = async (tx, emit, write = true) => {
    const existing = (await tx.query(
      `select id, name, email, phone, address, unit, city, postal, tags, rating from persons
       where workspace_id = $1 and deleted_at is null`, [ctx.workspaceId],
    )).rows.map((p) => ({ ...p, tags: parseJson(p.tags, []) }));
    const byEmail = new Map(); const byNamePhone = new Map(); const byNameAddr = new Map();
    const index = (p) => {
      if (p.email) byEmail.set(lower(p.email), p);
      if (p.phone) byNamePhone.set(`${lower(p.name)}|${digits(p.phone)}`, p);
      if (p.address) byNameAddr.set(`${lower(p.name)}|${lower(p.address)}|${lower(p.unit)}`, p);
    };
    existing.forEach(index);

    let created = 0; let merged = 0; let unchanged = 0;
    const decisions = [];
    for (const r of clean) {
      const match = (r.email && byEmail.get(r.email))
        || (r.phone && byNamePhone.get(`${lower(r.name)}|${digits(r.phone)}`))
        || (r.address && byNameAddr.get(`${lower(r.name)}|${lower(r.address)}|${lower(r.unit)}`));
      if (match) {
        // Merge: fill blanks, union tags — never overwrite what's on file.
        const patch = {};
        for (const k of ['email', 'phone', 'address', 'unit', 'city', 'postal']) {
          if (!match[k] && r[k]) patch[k] = r[k];
        }
        const tags = [...new Set([...(match.tags || []), ...r.tags])].slice(0, 50);
        if (tags.length !== (match.tags || []).length) patch.tags = tags;
        if (!match.rating && r.rating) patch.rating = r.rating;
        if (Object.keys(patch).length === 0) { unchanged += 1; decisions.push({ row: r.index + 1, name: r.name, action: 'unchanged', id: match.id }); continue; }
        merged += 1;
        decisions.push({ row: r.index + 1, name: r.name, action: 'merged', id: match.id, fields: Object.keys(patch) });
        if (write) {
          const next = { ...match, ...patch };
          await tx.query(
            `update persons set email = $3, phone = $4, address = $5, unit = $6, city = $7, postal = $8, tags = $9,
               rating = $10, updated_at = now() where id = $1 and workspace_id = $2`,
            [match.id, ctx.workspaceId, next.email, next.phone, next.address, next.unit, next.city, next.postal,
             JSON.stringify(next.tags || []), next.rating || null],
          );
          emit('person', match.id, 'update', { ...patch, source: 'import' });
          Object.assign(match, patch);
          index(match);
        }
      } else {
        created += 1;
        const id = newId();
        decisions.push({ row: r.index + 1, name: r.name, action: 'created', id });
        const p = { id, name: r.name, email: r.email, phone: r.phone, address: r.address, unit: r.unit,
          city: r.city, postal: r.postal, tags: r.tags, rating: r.rating };
        if (write) {
          await tx.query(
            `insert into persons (id, workspace_id, name, email, phone, address, unit, city, postal, tags, rating)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [id, ctx.workspaceId, p.name, p.email, p.phone, p.address, p.unit, p.city, p.postal,
             JSON.stringify(p.tags), p.rating],
          );
          emit('person', id, 'create', { ...p, source: 'import' });
        }
        index(p); // later rows in the same file dedupe against this one
      }
    }
    return { created, merged, unchanged, decisions };
  };

  if (dryRun) {
    const db = c.get('db');
    const result = await run({ query: (...a) => db.query(...a) }, () => {}, false);
    return c.json({ dryRun: true, ...result, invalid: errors, decisions: result.decisions.slice(0, 50) });
  }
  const { result } = await runAction(c.get('db'), { workspaceId: ctx.workspaceId, actorId: ctx.user.id, action: 'import.persons' }, run);
  return c.json({ ...result, invalid: errors, decisions: result.decisions.slice(0, 50) });
});

// ── Geocoding: place unlocated people on the map, a batch at a time ──
app.post('/geocode', async (c) => {
  const ctx = c.get('ctx');
  const db = c.get('db');
  const { limit: rawLimit } = await c.req.json().catch(() => ({}));
  const limit = Math.min(Math.max(Number(rawLimit) || 20, 1), 50);
  const todo = (await db.query(
    `select id, address, unit, city, postal from persons
     where workspace_id = $1 and deleted_at is null and address is not null and lat is null
       and coalesce(attrs->'geocode'->>'status', '') not in ('nomatch', 'weak')
     order by created_at limit $2`,
    [ctx.workspaceId, limit],
  )).rows;
  let located = 0; let missed = 0; let errored = 0; let lastError = null;
  for (const p of todo) {
    const g = await geocodeAddress(p);
    if (g?.error) { errored += 1; lastError = g.error; continue; } // transient: retry next batch
    const status = g && !g.weak ? 'ok' : g?.weak ? 'weak' : 'nomatch';
    await runAction(db, { workspaceId: ctx.workspaceId, actorId: ctx.user.id, action: 'person.geocode' }, async (tx, emit) => {
      if (status === 'ok') {
        await tx.query(
          `update persons set lat = $3, lng = $4, attrs = jsonb_set(attrs, '{geocode}', $5::jsonb), updated_at = now()
           where id = $1 and workspace_id = $2 and lat is null`,
          [p.id, ctx.workspaceId, g.lat, g.lng, JSON.stringify({ status, at: new Date().toISOString(), matched: g.matched, score: g.score })],
        );
        emit('person', p.id, 'update', { lat: g.lat, lng: g.lng, geocoded: g.matched });
      } else {
        await tx.query(
          `update persons set attrs = jsonb_set(attrs, '{geocode}', $3::jsonb) where id = $1 and workspace_id = $2`,
          [p.id, ctx.workspaceId, JSON.stringify({ status, at: new Date().toISOString(), matched: g?.matched || null })],
        );
      }
    });
    if (status === 'ok') located += 1; else missed += 1;
    if (errored > 3) break;
  }
  const remaining = (await db.query(
    `select count(*)::int as n from persons where workspace_id = $1 and deleted_at is null and address is not null
       and lat is null and coalesce(attrs->'geocode'->>'status', '') not in ('nomatch', 'weak')`,
    [ctx.workspaceId],
  )).rows[0].n;
  const unmatched = (await db.query(
    `select count(*)::int as n from persons where workspace_id = $1 and deleted_at is null and lat is null
       and attrs->'geocode'->>'status' in ('nomatch', 'weak')`,
    [ctx.workspaceId],
  )).rows[0].n;
  return c.json({ processed: todo.length, located, missed, errored, lastError, remaining, unmatched });
});

// ── Sample data ──
const SAMPLE_TAG = 'sample';

app.post('/sample', async (c) => {
  const ctx = c.get('ctx');
  if (ctx.role !== 'manager') return c.json({ error: 'managers only' }, 403);
  const db = c.get('db');
  const already = (await db.query(
    `select count(*)::int as n from persons where workspace_id = $1 and deleted_at is null and tags @> $2::jsonb`,
    [ctx.workspaceId, JSON.stringify([SAMPLE_TAG])],
  )).rows[0].n;
  if (already > 0) return c.json({ error: 'sample data is already loaded — clear it first' }, 409);

  const S = buildSample();
  const year = new Date().getUTCFullYear();
  const { result } = await runAction(db, { workspaceId: ctx.workspaceId, actorId: ctx.user.id, action: 'sample.load' }, async (tx, emit) => {
    const id = {};
    for (const p of [...S.people, ...S.media.map((m) => ({ ...m, key: m.name }))]) {
      const pid = newId();
      id[p.key] = pid;
      const tags = [SAMPLE_TAG, ...(S.tags[p.key] || []), ...(p.tags || [])];
      // Spread the knocks across the past week so Today has a realistic
      // picture. A rated person was rated by that knock, so rated_at is the
      // contact's own time (now() is fixed for the transaction: the two match).
      const hoursAgo = String((Object.keys(id).length * 7) % 150);
      await tx.query(
        `insert into persons (id, workspace_id, name, email, phone, address, city, lat, lng, tags, socials, rating, rated_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                 case when $12::text is null then null else now() - ($13 || ' hours')::interval end)`,
        [pid, ctx.workspaceId, p.name, p.email || null, p.phone || null, p.address || null, p.city || null,
         p.lat ?? null, p.lng ?? null, JSON.stringify(tags), JSON.stringify(p.socials || {}), p.rating || null, hoursAgo],
      );
      emit('person', pid, 'create', { name: p.name, sample: true });
      if (p.rating) {
        const cid = newId();
        await tx.query(
          `insert into contacts (id, workspace_id, person_id, channel, outcome, rating, created_by, created_at)
           values ($1, $2, $3, $4, 'contacted', $5, $6, now() - ($7 || ' hours')::interval)`,
          [cid, ctx.workspaceId, pid, p.channel || 'door', p.rating, ctx.user.id, hoursAgo],
        );
        emit('contact', cid, 'create', { person_id: pid, rating: p.rating, sample: true });
      }
    }
    for (const [who, role, detail] of S.roles) {
      const rid = newId();
      await tx.query('insert into volunteer_roles (id, workspace_id, person_id, role, detail) values ($1, $2, $3, $4, $5)',
        [rid, ctx.workspaceId, id[who], role, detail || null]);
      emit('volunteer_role', rid, 'create', { person_id: id[who], role, sample: true });
    }
    // Dates relative to today: monthly gifts are current (last week), one-time
    // gifts spread back through the year — never in the future, never before Jan 1.
    const jan1 = Date.UTC(year, 0, 1);
    for (const [i, [who, cents, cadence, method]] of S.gifts.entries()) {
      const daysBack = cadence === 'monthly' ? 3 + i : 14 + i * 11;
      const when = new Date(Math.max(jan1, Date.now() - daysBack * 86400e3)).toISOString().slice(0, 10);
      await logGift(tx, ctx.workspace, {
        person_id: id[who], amount_cents: cents, date: when, method, cadence, note: 'sample',
      }, emit);
    }
    const signIds = [];
    for (const [who, kind, status, address, lat, lng] of S.signs) {
      const sid = newId();
      const p = who ? S.people.find((x) => x.key === who) : null;
      await tx.query(
        `insert into signs (id, workspace_id, person_id, address, lat, lng, kind, status, note) values ($1, $2, $3, $4, $5, $6, $7, $8, 'sample')`,
        [sid, ctx.workspaceId, who ? id[who] : null, p?.address || address, p?.lat ?? lat, p?.lng ?? lng, kind, status],
      );
      signIds.push(sid);
      emit('sign', sid, 'create', { kind, status, sample: true });
    }
    // An upcoming Saturday shift, a petition, an event, the Newton turf.
    const sat = new Date(); sat.setUTCDate(sat.getUTCDate() + ((6 - sat.getUTCDay() + 7) % 7 || 7)); sat.setUTCHours(17, 0, 0, 0);
    const shiftId = newId();
    await tx.query(
      `insert into shifts (id, workspace_id, title, role, location, starts_at, ends_at, instructions, link, capacity, created_by)
       values ($1, $2, 'Saturday canvass — Newton (sample)', 'doorknocking', 'Newton Rec Centre, 13730 72 Ave', $3, $4,
               'Meet at the north entrance. Bring water and comfortable shoes.', null, 8, $5)`,
      [shiftId, ctx.workspaceId, sat.toISOString(), new Date(sat.getTime() + 3 * 3600e3).toISOString(), ctx.user.id],
    );
    for (const who of ['Sam Ortiz', 'Gurpreet Sandhu', 'Priya Nair']) {
      await tx.query('insert into shift_assignments (id, workspace_id, shift_id, person_id) values ($1, $2, $3, $4)',
        [newId(), ctx.workspaceId, shiftId, id[who]]);
    }
    emit('shift', shiftId, 'create', { sample: true });
    const petitionId = newId();
    await tx.query(
      `insert into petitions (id, workspace_id, slug, title, body) values ($1, $2, 'sample-skytrain-to-newton',
        'Bring rapid transit down King George to Newton (sample)', 'Surrey deserves fast, frequent transit south of 72 Avenue. Add your name.')`,
      [petitionId, ctx.workspaceId],
    );
    emit('petition', petitionId, 'create', { sample: true });
    const eventId = newId();
    const th = new Date(Date.now() + 10 * 86400e3); th.setUTCHours(2, 0, 0, 0); // 7pm Pacific, ~10 days out
    await tx.query(
      `insert into campaign_events (id, workspace_id, slug, title, description, location, starts_at, ends_at, capacity)
       values ($1, $2, 'sample-town-hall-newton', 'Town hall: Imagine Newton (sample)',
               'Bring your questions about transit, housing, and safety in Newton.', 'Newton Cultural Centre, 13530 72 Ave',
               $3, $4, 120)`,
      [eventId, ctx.workspaceId, th.toISOString(), new Date(th.getTime() + 2 * 3600e3).toISOString()],
    );
    emit('campaign_event', eventId, 'create', { sample: true });
    for (const email of S.subscribers) {
      await tx.query(
        `insert into subscriptions (id, workspace_id, email, status, source) values ($1, $2, $3, 'subscribed', 'sample')
         on conflict (workspace_id, email) do nothing`,
        [newId(), ctx.workspaceId, email],
      );
    }
    const turfId = newId();
    await tx.query('insert into turfs (id, workspace_id, name, polygon, color) values ($1, $2, $3, $4, $5)',
      [turfId, ctx.workspaceId, S.turf.name, JSON.stringify(S.turf.polygon), '#2b6cb0']);
    await tx.query('insert into turf_members (workspace_id, turf_id, user_id) values ($1, $2, $3)', [ctx.workspaceId, turfId, ctx.user.id]);
    emit('turf', turfId, 'create', { sample: true });

    await tx.query(
      `update workspaces set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{sample}', $2::jsonb) where id = $1`,
      [ctx.workspaceId, JSON.stringify({ shiftIds: [shiftId], petitionIds: [petitionId], eventIds: [eventId], turfIds: [turfId], signIds, loadedAt: new Date().toISOString() })],
    );
    return { people: Object.keys(id).length, signs: signIds.length, gifts: S.gifts.length };
  });
  return c.json({ loaded: true, ...result });
});

app.delete('/sample', async (c) => {
  const ctx = c.get('ctx');
  if (ctx.role !== 'manager') return c.json({ error: 'managers only' }, 403);
  const db = c.get('db');
  const { result } = await runAction(db, { workspaceId: ctx.workspaceId, actorId: ctx.user.id, action: 'sample.clear' }, async (tx, emit) => {
    const ws = (await tx.query('select settings from workspaces where id = $1', [ctx.workspaceId])).rows[0];
    const marks = parseJson(ws.settings, {}).sample || {};
    const ids = (await tx.query(
      `select id from persons where workspace_id = $1 and tags @> $2::jsonb`, [ctx.workspaceId, JSON.stringify([SAMPLE_TAG])],
    )).rows.map((r) => r.id);
    const W = ctx.workspaceId;
    if (ids.length) {
      await tx.query('delete from gifts where workspace_id = $1 and person_id = any($2::uuid[])', [W, ids]);
      await tx.query('delete from signs where workspace_id = $1 and person_id = any($2::uuid[])', [W, ids]);
      await tx.query('delete from pledges where workspace_id = $1 and person_id = any($2::uuid[])', [W, ids]);
      await tx.query('delete from persons where workspace_id = $1 and id = any($2::uuid[])', [W, ids]);
    }
    const del = async (table, list) => { if (list?.length) await tx.query(`delete from ${table} where workspace_id = $1 and id = any($2::uuid[])`, [W, list]); };
    await del('signs', marks.signIds);
    await del('shifts', marks.shiftIds);
    await del('petitions', marks.petitionIds);
    await del('campaign_events', marks.eventIds);
    await del('turfs', marks.turfIds);
    await tx.query(`delete from subscriptions where workspace_id = $1 and source = 'sample'`, [W]);
    await tx.query(`update workspaces set settings = settings - 'sample' where id = $1`, [W]);
    emit('workspace', W, 'update', { sampleCleared: ids.length });
    return { cleared: ids.length };
  });
  return c.json(result);
});

export default app;
