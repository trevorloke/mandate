// The workspace API. Reads are cursor-paginated and workspace-scoped; writes
// go exclusively through POST /api/actions/:name. GET /api/events is the
// sync protocol AND the public API — the same endpoint the app uses — and
// GET /api/export is the contractual one-click full-fidelity export.
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { getDb } from '../db/client.js';
import { loadContext, SESSION_COOKIE } from '../lib/auth.js';
import { runAction, verifyChain } from '../lib/events.js';
import { ACTIONS, httpError } from '../actions/index.js';
import { RECORD_TYPES } from '@mandate/shared/registry';

const app = new Hono();

// Auth + context middleware.
app.use('*', async (c, next) => {
  const db = await getDb();
  const ctx = await loadContext(db, getCookie(c, SESSION_COOKIE));
  if (!ctx) return c.json({ error: 'not signed in' }, 401);
  c.set('db', db);
  c.set('ctx', ctx);
  await next();
});

// ── Actions: the only write path ──
app.post('/actions/:name', async (c) => {
  const name = c.req.param('name');
  const action = ACTIONS[name];
  if (!action) return c.json({ error: `unknown action '${name}'` }, 404);
  const ctx = c.get('ctx');
  if (!action.roles.includes(ctx.role)) {
    return c.json({ error: `role '${ctx.role}' may not perform ${name}` }, 403);
  }
  const parsed = action.input.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return c.json({ error: `${i.path.join('.') || 'input'}: ${i.message}` }, 400);
  }
  try {
    const { result, lastSeq } = await runAction(
      c.get('db'),
      { workspaceId: ctx.workspaceId, actorId: ctx.user.id, action: name },
      (tx, emit) => action.handler(tx, ctx, parsed.data, emit),
    );
    return c.json({ ...result, seq: lastSeq });
  } catch (e) {
    if (e.status) return c.json({ error: e.message }, e.status);
    throw e;
  }
});

app.get('/actions', (c) => {
  const ctx = c.get('ctx');
  const names = Object.entries(ACTIONS)
    .filter(([, a]) => a.roles.includes(ctx.role))
    .map(([name]) => name);
  return c.json({ actions: names });
});

// ── Persons: search (picker), profile, list ──
app.get('/persons', async (c) => {
  const ctx = c.get('ctx');
  const q = (c.req.query('q') || '').trim();
  const limit = Math.min(Number(c.req.query('limit')) || 25, 100);
  const like = `%${q.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  const { rows } = await c.get('db').query(
    `select id, kind, name, email, phone from persons
     where workspace_id = $1 and deleted_at is null
       and ($2 = '' or name ilike $3 or email ilike $3)
     order by lower(name) limit $4`,
    [ctx.workspaceId, q, like, limit],
  );
  return c.json({ persons: rows });
});

app.get('/persons/:id', async (c) => {
  const ctx = c.get('ctx');
  const db = c.get('db');
  const person = (await db.query(
    'select id, kind, name, email, phone, address, created_at from persons where id = $1 and workspace_id = $2 and deleted_at is null',
    [c.req.param('id'), ctx.workspaceId],
  )).rows[0];
  if (!person) return c.json({ error: 'not found' }, 404);
  const gifts = (await db.query(
    `select id, amount_cents, date, method, note, flagged, flag_reason from gifts
     where workspace_id = $1 and person_id = $2 and deleted_at is null order by date desc limit 200`,
    [ctx.workspaceId, person.id],
  )).rows;
  const totals = (await db.query(
    `select extract(year from date)::int as year, sum(amount_cents)::bigint as total_cents
     from gifts where workspace_id = $1 and person_id = $2 and deleted_at is null
     group by 1 order by 1 desc`,
    [ctx.workspaceId, person.id],
  )).rows;
  return c.json({ person, gifts, totals });
});

// ── Records: generic cursor-paginated reads per registry type ──
app.get('/records/:type', async (c) => {
  const type = c.req.param('type');
  const t = RECORD_TYPES[type];
  if (!t) return c.json({ error: `unknown record type '${type}'` }, 404);
  const ctx = c.get('ctx');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 200);
  const cursor = c.req.query('cursor') || null; // created_at|id tuple cursor
  const params = [ctx.workspaceId, limit];
  let where = 'workspace_id = $1 and deleted_at is null';
  if (cursor) {
    const [ts, id] = cursor.split('~');
    params.push(ts, id);
    where += ` and (created_at, id) < ($3::timestamptz, $4::uuid)`;
  }
  const { rows } = await c.get('db').query(
    `select * from ${t.table} where ${where} order by created_at desc, id desc limit $2`,
    params,
  );
  const next = rows.length === limit
    ? `${new Date(rows[rows.length - 1].created_at).toISOString()}~${rows[rows.length - 1].id}`
    : null;
  return c.json({ records: rows, next });
});

// ── Events: the sync protocol / public API ──
app.get('/events', async (c) => {
  const ctx = c.get('ctx');
  const since = Number(c.req.query('since') || 0);
  const limit = Math.min(Number(c.req.query('limit')) || 200, 1000);
  const { rows } = await c.get('db').query(
    `select seq, action, entity_type, entity_id, op, payload, actor_id, server_ts, hash
     from events where workspace_id = $1 and seq > $2 order by seq limit $3`,
    [ctx.workspaceId, since, limit],
  );
  return c.json({ events: rows, cursor: rows.length ? Number(rows[rows.length - 1].seq) : since });
});

// ── Audit: verify my books ──
app.get('/audit/verify', async (c) => {
  const ctx = c.get('ctx');
  return c.json(await verifyChain(c.get('db'), ctx.workspaceId));
});

// ── Brief: Today, composed server-side ──
app.get('/brief', async (c) => {
  const ctx = c.get('ctx');
  const db = c.get('db');
  const ws = ctx.workspaceId;
  const money = (await db.query(
    `select coalesce(sum(amount_cents), 0)::bigint as total,
            coalesce(sum(amount_cents) filter (where date >= current_date - 7), 0)::bigint as week,
            count(*)::int as gifts
     from gifts where workspace_id = $1 and deleted_at is null`, [ws],
  )).rows[0];
  const flagged = (await db.query(
    `select g.id, g.amount_cents, g.date, g.flag_reason, p.name as donor
     from gifts g join persons p on p.id = g.person_id
     where g.workspace_id = $1 and g.deleted_at is null and g.flagged order by g.date desc limit 10`, [ws],
  )).rows;
  const filings = (await db.query(
    `select id, name, due_date, status, (due_date - current_date)::int as days_left
     from filings where workspace_id = $1 and deleted_at is null and status = 'upcoming'
     order by due_date limit 5`, [ws],
  )).rows;
  const people = (await db.query(
    `select count(*)::int as total from persons where workspace_id = $1 and deleted_at is null`, [ws],
  )).rows[0];
  const activation = {
    steps: [
      { key: 'person', label: 'Add your first person', done: people.total > 0 },
      { key: 'gift', label: 'Log your first gift', done: Number(money.gifts) > 0 },
      { key: 'filing', label: 'Add a filing deadline', done: (await db.query(
        'select count(*)::int as n from filings where workspace_id = $1', [ws],
      )).rows[0].n > 0 },
    ],
  };
  activation.complete = activation.steps.every((s) => s.done);
  return c.json({
    money: { totalCents: Number(money.total), weekCents: Number(money.week), gifts: Number(money.gifts) },
    flagged,
    filings,
    people,
    activation,
    generatedAt: new Date().toISOString(),
  });
});

// ── Export: contractual open data — everything, one click ──
app.get('/export', async (c) => {
  const ctx = c.get('ctx');
  const db = c.get('db');
  const ws = ctx.workspaceId;
  const out = {
    format: 'mandate-v2-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace: ctx.workspace,
    persons: (await db.query('select * from persons where workspace_id = $1', [ws])).rows,
    events: (await db.query('select * from events where workspace_id = $1 order by seq', [ws])).rows,
  };
  for (const t of Object.values(RECORD_TYPES)) {
    out[t.table] = (await db.query(`select * from ${t.table} where workspace_id = $1`, [ws])).rows;
  }
  c.header('Content-Disposition', 'attachment; filename="mandate-export.json"');
  return c.json(out);
});

export default app;
export { httpError };
