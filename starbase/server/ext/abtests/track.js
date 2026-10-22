// Open and click tracking — public, no sign-in, linked from sent email only.
//   GET /o/<token>.gif   the 1×1 open pixel
//   GET /c/<token>/<n>   link n of that send: counts the click, then 302s to
//                        the address stored for that send — never anywhere
//                        else (an unknown token or link number is a 404).
// Writes go through runAction as the system (actor null), on the campaign's
// hash chain. Only a recipient's first open and first click are events
// ('public.open' / 'public.click'); later ones are counted on the row.
// A row that was never sent (saved, held for a winner) records nothing, and
// a repeat within 30 seconds is the same open or click (no write at all), so
// one address hit over and over can't flood the database.
import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { runAction } from '../../lib/events.js';
import { TOKEN_RE } from './send.js';

export const publicRoutes = new Hono();

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
const NO_STORE = 'no-store, no-cache, must-revalidate, private';

const REPEAT_S = 30;
const recent = (ts) => !!ts && Date.now() - new Date(ts).getTime() < REPEAT_S * 1000;

const recipientBy = async (db, token) => (await db.query(
  'select id, workspace_id, blast_id, status, last_open_at, last_click_at from blast_recipients where token = $1',
  [token],
)).rows[0];

const record = (db, r, { action, count, first, last, payload }) =>
  runAction(db, { workspaceId: r.workspace_id, actorId: null, action }, async (tx, emit) => {
    const row = (await tx.query(
      `update blast_recipients set ${count} = ${count} + 1, ${last} = now(), ${first} = coalesce(${first}, now())
       where id = $1 and workspace_id = $2 and status = 'sent'
         and (${last} is null or ${last} < now() - make_interval(secs => ${REPEAT_S}))
       returning ${count} as n`,
      [r.id, r.workspace_id],
    )).rows[0];
    if (row && Number(row.n) === 1) emit('blast_recipient', r.id, 'update', { blast_id: r.blast_id, ...payload });
  });

publicRoutes.get('/o/:file', async (c) => {
  const m = /^([A-Za-z0-9_-]{24})\.gif$/.exec(c.req.param('file') || '');
  if (m) {
    try {
      const db = await getDb();
      const r = await recipientBy(db, m[1]);
      if (r?.status === 'sent' && !recent(r.last_open_at)) {
        await record(db, r, { action: 'public.open', count: 'opens', first: 'first_open_at', last: 'last_open_at', payload: { opened: true } });
      }
    } catch (e) {
      console.error('open pixel:', e.message);
    }
  }
  return c.body(GIF, 200, { 'Content-Type': 'image/gif', 'Cache-Control': NO_STORE, Pragma: 'no-cache' });
});

const notFound = (c) => c.html(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link not found</title>
<style>body{margin:0;background:#f8f6ef;color:#171410;font:18px/1.5 Georgia,serif}main{max-width:520px;margin:0 auto;padding:28px 16px}h1{font-size:26px;margin:0}@media(prefers-color-scheme:dark){body{background:#15120c;color:#ece7da}}</style>
</head><body><main><h1>Link not found.</h1></main></body></html>`, 404, { 'Cache-Control': NO_STORE });

publicRoutes.get('/c/:token/:n', async (c) => {
  const token = c.req.param('token') || '';
  const nRaw = c.req.param('n') || '';
  if (!TOKEN_RE.test(token) || !/^[1-9]\d{0,3}$/.test(nRaw)) return notFound(c);
  const n = Number(nRaw);
  const db = await getDb();
  const row = (await db.query(
    `select r.id, r.workspace_id, r.blast_id, r.status, r.last_click_at, l.url
     from blast_recipients r
     join blast_links l on l.blast_id = r.blast_id and l.workspace_id = r.workspace_id and l.n = $2
     where r.token = $1`,
    [token, n],
  )).rows[0];
  if (!row || !/^https?:\/\//i.test(row.url)) return notFound(c);
  if (row.status === 'sent' && !recent(row.last_click_at)) {
    try {
      await record(db, row, { action: 'public.click', count: 'clicks', first: 'first_click_at', last: 'last_click_at', payload: { clicked: n } });
    } catch (e) {
      console.error('click:', e.message);
    }
  }
  c.header('Cache-Control', NO_STORE);
  // The page they land on never sees the tracking address.
  c.header('Referrer-Policy', 'no-referrer');
  return c.redirect(row.url, 302);
});
