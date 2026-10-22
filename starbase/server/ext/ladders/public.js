// GET /lu/:runId — the one-click unsubscribe at the foot of every ladder
// email. It uses the newsletter's own list: the reader's address is marked
// unsubscribed there (added as unsubscribed if it was never on the list), so
// newsletters and every ladder email stop alike, and a later signup is the
// only way back on. A system action, on the hash chain like /u.
import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { runAction, newId } from '../../lib/events.js';

export const publicRoutes = new Hono();

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// The public pages' look (routes/public.js): the campaign name big, one line.
const page = (campaign, title, inner) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}${campaign ? ` · ${esc(campaign)}` : ''}</title>
<style>
  :root{--paper:#f8f6ef;--card:#fffdf7;--ink:#171410;--ink2:#5d5749;--rule:#d6d0bf;--mark:#f2c40f}
  @media(prefers-color-scheme:dark){:root{--paper:#15120c;--card:#1d1a13;--ink:#ece7da;--ink2:#a59e8c;--rule:#3a362a;--mark:#d9b60e}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font:18px/1.5 Georgia,'Times New Roman',serif}
  main{max-width:520px;margin:0 auto;padding:28px 16px 56px}
  .camp{font-size:30px;font-weight:700;line-height:1.1;margin:0 0 24px;padding-bottom:12px;border-bottom:4px solid var(--mark);overflow-wrap:anywhere}
  h1{font-size:26px;line-height:1.2;margin:0 0 12px}
  .done{border:1px solid var(--rule);border-left:4px solid var(--mark);background:var(--card);padding:18px;margin-top:16px}
  footer{margin-top:40px;border-top:1px solid var(--rule);padding-top:12px;font:13px/1.6 ui-monospace,Menlo,monospace;color:var(--ink2)}
</style></head><body><main>
${campaign ? `<div class="camp">${esc(campaign)}</div>` : ''}
${inner}
<footer>Powered by Starbase</footer>
</main></body></html>`;

const bad = (c) => c.html(page(null, 'Unsubscribe',
  "<h1>This unsubscribe link isn't valid — reply to the email to be removed.</h1>"), 404);

publicRoutes.get('/lu/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID.test(id)) return bad(c);
  const db = await getDb();
  const row = (await db.query(
    `select r.workspace_id, p.email, w.name from ladder_runs r
     join persons p on p.id = r.person_id join workspaces w on w.id = r.workspace_id
     where r.id = $1`,
    [id],
  )).rows[0];
  const email = String(row?.email || '').trim().toLowerCase();
  if (!row || !email) return bad(c);
  await runAction(db, { workspaceId: row.workspace_id, actorId: null, action: 'public.unsubscribe' }, async (tx, emit) => {
    const sub = (await tx.query(
      'select id, status from subscriptions where workspace_id = $1 and email = $2', [row.workspace_id, email],
    )).rows[0];
    if (sub) {
      // A second click finds them already off the list: nothing to write.
      if (sub.status === 'unsubscribed') return;
      await tx.query("update subscriptions set status = 'unsubscribed' where id = $1 and workspace_id = $2", [sub.id, row.workspace_id]);
      emit('subscription', sub.id, 'update', { status: 'unsubscribed', source: 'ladder-unsubscribe' });
      return;
    }
    const sid = newId();
    await tx.query(
      `insert into subscriptions (id, workspace_id, email, status, source) values ($1, $2, $3, 'unsubscribed', 'ladder-unsubscribe')`,
      [sid, row.workspace_id, email],
    );
    emit('subscription', sid, 'create', { email, status: 'unsubscribed', source: 'ladder-unsubscribe' });
  });
  return c.html(page(row.name, 'Unsubscribed',
    `<h1>Unsubscribed.</h1><div class="done">You won't receive further newsletters or automatic emails from ${esc(row.name)}.</div>`));
});
