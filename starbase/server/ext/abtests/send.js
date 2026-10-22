// The newsletter / press send path, tracked — shared by blast.send and
// blast.resend (actions/field.js) and the A/B winner job (winner.js).
//
// Every recipient row carries a random, unguessable token. Each email goes
// out with the plain-text part it always had plus an HTML part: the same
// words, a 1×1 open pixel (/o/<token>.gif) and every link in the message
// rewritten to /c/<token>/<n>, which redirects only to link n as stored for
// that send (blast_links). The unsubscribe link is never rewritten.
//
// A/B: a send with two subject lines splits its list at random into group A
// and group B (10/20/30% each) and the rest. A and B go out now; the rest
// are held — never sent — until the winner job picks a subject.
//
// Every email carries an idempotency key — the send, the recipient row and
// how many times the service refused it (sendKey) — so a repeat after an
// unknown outcome (a crash, a timeout) is dropped by the service, and a try
// after a plain refusal is a new send. A row the service never answered for
// is 'sending' ("not sure it went"): never sent again by itself; Try again
// reaches it once it is 10 minutes old, with the same key.
import { z } from 'zod';
import { randomBytes, randomInt } from 'node:crypto';
import { sendEmail, unsubscribeHeaders } from '../../lib/notify.js';
import { enqueueJob } from '../../lib/jobs.js';

export const AB_MIN = 50;
export const AB_PCTS = [10, 20, 30];
export const AB_WAITS = [1, 2, 4, 12, 24];
export const AB_METRICS = ['opens', 'clicks'];
export const WINNER_JOB = 'abtests.winner';

export const abInput = z.object({
  subject_b: z.string().trim().min(1).max(300),
  pct: z.literal(AB_PCTS),
  wait_hours: z.literal(AB_WAITS),
  metric: z.enum(AB_METRICS),
});

// One rule for a send's status, shared by blast.send, blast.resend and the
// winner job: everyone sent → 'sent'; everyone failed (or no one left on it)
// → 'failed'; anything else — still saved because email wasn't connected,
// held for an A/B winner, a mix of sent and failed, or not sure — → 'queued'.
// The status alone can't say "partly sent", so each also answers exact counts:
//   counts: { total, sent, failed, queued, sending? }
//   (total = sent + failed + queued + sending; sending only when there are any)
export const blastStatus = ({ total, sent, failed }) =>
  (total > 0 && sent === total ? 'sent' : failed === total ? 'failed' : 'queued');

export const blastCounts = async (tx, workspaceId, blastId) => {
  const r = (await tx.query(
    `select count(*)::int as total,
            (count(*) filter (where status = 'sent'))::int as sent,
            (count(*) filter (where status = 'failed'))::int as failed,
            (count(*) filter (where status = 'queued'))::int as queued,
            (count(*) filter (where status = 'sending'))::int as sending
     from blast_recipients where blast_id = $1 and workspace_id = $2`,
    [blastId, workspaceId],
  )).rows[0];
  return { total: r.total, sent: r.sent, failed: r.failed, queued: r.queued, ...(r.sending ? { sending: r.sending } : {}) };
};

// The idempotency key of one email: send, recipient row, refusals so far.
export const sendKey = (blastId, row) => `blast-${blastId}-${row.id}-${Number(row.send_tries) || 0}`;

// What a sendEmail answer means for the row: 'sent'; 'queued' (email isn't
// connected — nothing went); 'failed' (the service said no: the next try is
// a new send); 'sending' (the service never answered — not sure it went).
export const outcomeOf = (res) => {
  if (res.status === 'sent') return { status: 'sent', refused: false };
  if (res.status === 'failed' && res.unknown) return { status: 'sending', refused: false };
  if (res.status === 'failed') return { status: 'failed', refused: true };
  return { status: 'queued', refused: false };
};

// A 'sending' row this old never heard back: Try again may reach it (same key).
export const STALE_SENDING = "interval '10 minutes'";
export const retryable = (alias = '') => {
  const a = alias ? `${alias}.` : '';
  return `(${a}status in ('queued', 'failed') or (${a}status = 'sending' and ${a}sending_at < now() - ${STALE_SENDING}))`;
};

// Store one row's answer. A row someone else already settled is left alone.
export const recordOutcome = (tx, workspaceId, rowId, res, { token = null, from = null } = {}) => {
  const o = outcomeOf(res);
  return tx.query(
    `update blast_recipients set status = $3, token = coalesce($4, token),
       sent_at = case when $3 = 'sent' then now() else sent_at end,
       sending_at = case when $3 = 'sending' then now() else sending_at end,
       send_tries = send_tries + case when $5 then 1 else 0 end
     where id = $1 and workspace_id = $2 and ($6::text is null or status = $6)`,
    [rowId, workspaceId, o.status, token, o.refused, from],
  );
};

// Every newsletter identifies the sender and carries the recipient's own
// one-click unsubscribe link (/u/:subscriptionId); press carries the name.
export const blastText = (ctx, kind, body, subscriptionId) => body + (kind === 'newsletter'
  ? `\n\n—\nSent by ${ctx.workspace.name}.\nUnsubscribe: ${ctx.publicUrl || ''}/u/${subscriptionId}`
  : `\n\n—\n${ctx.workspace.name}`);

// 24 url-safe characters, 144 random bits.
export const newToken = () => randomBytes(18).toString('base64url');
export const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;

// Links are the http(s) addresses typed in the message, in order, once each.
const URL_RE = /https?:\/\/[^\s<>"'`]+/gi;
const MAX_LINKS = 100;
const tidyUrl = (u) => {
  let s = u;
  // A full stop or a closing bracket after an address belongs to the sentence.
  for (;;) {
    const last = s.slice(-1);
    const opens = (ch) => s.split(ch).length - 1;
    if (/[.,;:!?*]/.test(last)) s = s.slice(0, -1);
    else if (last === ')' && opens('(') < opens(')')) s = s.slice(0, -1);
    else if (last === ']' && opens('[') < opens(']')) s = s.slice(0, -1);
    else break;
  }
  return s;
};
const isWebUrl = (s) => {
  try {
    const u = new URL(s);
    return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname;
  } catch {
    return false;
  }
};
export const findLinks = (body) => {
  const out = [];
  for (const m of String(body ?? '').matchAll(URL_RE)) {
    const u = tidyUrl(m[0]);
    if (u.length <= 2000 && isWebUrl(u) && !out.includes(u)) out.push(u);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
};

export const saveLinks = async (tx, workspaceId, blastId, links) => {
  for (const [i, url] of links.entries()) {
    await tx.query(
      `insert into blast_links (workspace_id, blast_id, n, url) values ($1, $2, $3, $4)
       on conflict (blast_id, n) do nothing`,
      [workspaceId, blastId, i + 1, url],
    );
  }
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// The HTML part: the message's own words in paragraphs, its links tracked,
// the footer (unsubscribe untracked), and the open pixel last.
export const blastHtml = (ctx, kind, body, subscriptionId, token, links) => {
  const base = ctx.publicUrl || '';
  const linkify = (line) => {
    let out = '';
    let last = 0;
    for (const m of line.matchAll(URL_RE)) {
      const u = tidyUrl(m[0]);
      const n = links.indexOf(u) + 1;
      out += esc(line.slice(last, m.index));
      out += n > 0
        ? `<a href="${esc(`${base}/c/${token}/${n}`)}" style="color:#171410">${esc(u)}</a>`
        : esc(u);
      last = m.index + u.length;
    }
    return out + esc(line.slice(last));
  };
  const paras = String(body).split(/\n[ \t]*\n/)
    .map((p) => `<p style="margin:0 0 16px">${p.split('\n').map(linkify).join('<br>')}</p>`)
    .join('');
  // This part is the tracked one, so it says so.
  const foot = kind === 'newsletter'
    ? `Sent by ${esc(ctx.workspace.name)}. We count opens and clicks.<br><a href="${esc(`${base}/u/${subscriptionId}`)}" style="color:#5d5749">Unsubscribe</a>`
    : `${esc(ctx.workspace.name)}. We count opens and clicks.`;
  return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f8f6ef">'
    + '<div style="max-width:600px;margin:0 auto;padding:24px 16px;font:17px/1.55 Georgia,\'Times New Roman\',serif;color:#171410">'
    + paras
    + `<p style="margin:24px 0 0;padding-top:12px;border-top:1px solid #d6d0bf;font-size:14px;color:#5d5749">${foot}</p>`
    + `<img src="${esc(`${base}/o/${token}.gif`)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">`
    + '</div></body></html>';
};

export const composeBlast = (ctx, { kind, body, subscriptionId, token, links }) => ({
  text: blastText(ctx, kind, body, subscriptionId),
  html: blastHtml(ctx, kind, body, subscriptionId, token, links),
  // A newsletter's mail-app Unsubscribe button: the same /u link, by POST.
  headers: kind === 'newsletter' && subscriptionId ? unsubscribeHeaders(`${ctx.publicUrl || ''}/u/${subscriptionId}`) : undefined,
});

// Group A gets subject A, group B subject B, the rest the winner's.
export const subjectFor = (blast, group) =>
  (group === 'b' || (group === 'rest' && blast.ab_winner === 'b') ? blast.ab_subject_b : blast.subject);

// n recipients → n groups ('a' | 'b' | 'rest') in random order, pct% each to A and B.
export const abGroups = (n, pct) => {
  const size = Math.floor((n * pct) / 100);
  const g = Array.from({ length: n }, (_, i) => (i < size ? 'a' : i < 2 * size ? 'b' : 'rest'));
  for (let i = n - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [g[i], g[j]] = [g[j], g[i]];
  }
  return g;
};

// Rows still held: the rest of an A/B send, until it has a winner.
export const restReleased = (blast) => !blast.ab_status || !!blast.ab_winner;

export const abOf = (b) => (b?.ab_status ? {
  status: b.ab_status,
  subject_b: b.ab_subject_b,
  pct: b.ab_pct,
  wait_hours: b.ab_wait_hours,
  metric: b.ab_metric,
  decide_at: b.ab_decide_at || null,
  winner: b.ab_winner || null,
  decided_at: b.ab_decided_at || null,
  // What the winner was picked on: { metric, tie, a, b } (each group's
  // delivered / opened / clicked at that moment).
  result: (typeof b.ab_result === 'string' ? JSON.parse(b.ab_result) : b.ab_result) || null,
} : null);

// The winner by the chosen measure (opened or clicked, of delivered). A tie
// — the same whole percent, as the screen shows them, or a group that
// reached no one — sends A, and says it was a tie.
const pctOf = (n, of) => (of > 0 ? Math.round((100 * n) / of) : 0);
export const decide = (groups, metric) => {
  const pick = (g) => (metric === 'clicks' ? g.clicked : g.opened);
  const ra = pctOf(pick(groups.a), groups.a.delivered);
  const rb = pctOf(pick(groups.b), groups.b.delivered);
  if (!groups.a.delivered || !groups.b.delivered || ra === rb) return { winner: 'a', tie: true };
  return { winner: rb > ra ? 'b' : 'a', tie: false };
};

// Send saved rows of one blast (blast.resend). A newsletter subscriber who
// unsubscribed since is taken off the send, never emailed. Each row's result
// is stored on it. Answers { sent, failed, skipped, unsure, note }.
export const deliver = async (tx, ctx, blast, rows) => {
  const links = findLinks(blast.body);
  await saveLinks(tx, ctx.workspaceId, blast.id, links);
  let sent = 0, failed = 0, skipped = 0, unsure = 0, note = null;
  for (const r of rows) {
    let subscriptionId = null;
    if (blast.kind === 'newsletter') {
      const sub = (await tx.query(
        'select id, status from subscriptions where workspace_id = $1 and email = $2',
        [ctx.workspaceId, String(r.email).toLowerCase()],
      )).rows[0];
      if (!sub || sub.status !== 'subscribed') {
        await tx.query('delete from blast_recipients where id = $1 and workspace_id = $2', [r.id, ctx.workspaceId]);
        skipped += 1;
        continue;
      }
      subscriptionId = sub.id;
    }
    const token = r.token || newToken();
    const res = await sendEmail({
      to: r.email,
      subject: subjectFor(blast, r.ab_group),
      ...composeBlast(ctx, { kind: blast.kind, body: blast.body, subscriptionId, token, links }),
      idempotencyKey: sendKey(blast.id, r),
    });
    const { status } = outcomeOf(res);
    if (status === 'sent') sent += 1;
    else if (status === 'failed') failed += 1;
    else if (status === 'sending') unsure += 1;
    if (!note && res.detail) note = res.detail;
    await recordOutcome(tx, ctx.workspaceId, r.id, res, { token });
  }
  return { sent, failed, skipped, unsure, note };
};

// A new A/B send: store its two subjects and settings. Saved while email
// isn't connected (it starts on Send now); otherwise the test starts now.
export const openTest = async (tx, ctx, blastId, ab, live) => {
  const row = (await tx.query(
    `update blasts set ab_subject_b = $3, ab_pct = $4, ab_wait_hours = $5, ab_metric = $6, ab_status = 'saved'
     where id = $1 and workspace_id = $2 returning *`,
    [blastId, ctx.workspaceId, ab.subject_b, ab.pct, ab.wait_hours, ab.metric],
  )).rows[0];
  return live ? startTest(tx, ctx, blastId) : abOf(row);
};

// A and B are out: the winner is picked when the wait ends (one job per send).
export const startTest = async (tx, ctx, blastId) => {
  const row = (await tx.query(
    `update blasts set ab_status = 'testing', ab_started_at = now(),
       ab_decide_at = now() + make_interval(hours => ab_wait_hours)
     where id = $1 and workspace_id = $2 and ab_status = 'saved' returning *`,
    [blastId, ctx.workspaceId],
  )).rows[0];
  if (!row) return null;
  await enqueueJob(tx, {
    workspaceId: ctx.workspaceId,
    kind: WINNER_JOB,
    runAt: new Date(row.ab_decide_at).toISOString(),
    payload: { blast_id: blastId, base: ctx.publicUrl || '' },
    key: `${WINNER_JOB}:${blastId}`,
  });
  return abOf(row);
};

// Delivered / opened / clicked per test group. A click counts as an open
// (no one clicks a link in an email they haven't opened).
export const groupStats = async (tx, workspaceId, blastId) => {
  const zero = () => ({ delivered: 0, opened: 0, clicked: 0 });
  const out = { a: zero(), b: zero() };
  const { rows } = await tx.query(
    `select ab_group,
            (count(*) filter (where status = 'sent'))::int as delivered,
            (count(*) filter (where status = 'sent' and (first_open_at is not null or first_click_at is not null)))::int as opened,
            (count(*) filter (where status = 'sent' and first_click_at is not null))::int as clicked
     from blast_recipients where blast_id = $1 and workspace_id = $2 and ab_group in ('a', 'b')
     group by ab_group`,
    [blastId, workspaceId],
  );
  for (const r of rows) out[r.ab_group] = { delivered: r.delivered, opened: r.opened, clicked: r.clicked };
  return out;
};
