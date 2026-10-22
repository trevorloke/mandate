// GET /api/blasts/stats — desk only. For each recent send (the same 200 as
// GET /api/blasts), counted per recipient:
//   delivered  rows the email service accepted ('sent')
//   opened     delivered rows that loaded the pixel or clicked a link
//   clicked    delivered rows that clicked a link
//   ab         null, or the test: settings, state, winner, and per group
//              { total, delivered, opened, clicked } for a and b, plus
//              rest { total, sent, failed, held } (held: waiting for the winner)
// Percentages are the screen's job (of delivered). No emails, no tokens.
import { Hono } from 'hono';
import { AB_MIN, AB_PCTS, AB_WAITS, abOf } from './send.js';

export const api = new Hono();

const group = (r, g) => ({
  total: r[`${g}_total`], delivered: r[`${g}_delivered`], opened: r[`${g}_opened`], clicked: r[`${g}_clicked`],
});

const groupCols = (g) => `
  (count(r.id) filter (where r.ab_group = '${g}'))::int as ${g}_total,
  (count(r.id) filter (where r.ab_group = '${g}' and r.status = 'sent'))::int as ${g}_delivered,
  (count(r.id) filter (where r.ab_group = '${g}' and r.status = 'sent' and (r.first_open_at is not null or r.first_click_at is not null)))::int as ${g}_opened,
  (count(r.id) filter (where r.ab_group = '${g}' and r.status = 'sent' and r.first_click_at is not null))::int as ${g}_clicked`;

api.get('/blasts/stats', async (c) => {
  const ctx = c.get('ctx');
  if (ctx.role === 'volunteer') return c.json({ error: 'volunteers cannot view this' }, 403);
  const { rows } = await c.get('db').query(
    `select b.id, b.ab_status, b.ab_subject_b, b.ab_pct, b.ab_wait_hours, b.ab_metric,
            b.ab_decide_at, b.ab_winner, b.ab_decided_at,
            (count(r.id) filter (where r.status = 'sent'))::int as delivered,
            (count(r.id) filter (where r.status = 'sent' and (r.first_open_at is not null or r.first_click_at is not null)))::int as opened,
            (count(r.id) filter (where r.status = 'sent' and r.first_click_at is not null))::int as clicked,
            ${groupCols('a')}, ${groupCols('b')},
            (count(r.id) filter (where r.ab_group = 'rest'))::int as rest_total,
            (count(r.id) filter (where r.ab_group = 'rest' and r.status = 'sent'))::int as rest_sent,
            (count(r.id) filter (where r.ab_group = 'rest' and r.status = 'failed'))::int as rest_failed,
            (count(r.id) filter (where r.ab_group = 'rest' and r.status = 'queued' and b.ab_winner is null))::int as rest_held
     from blasts b
     left join blast_recipients r on r.blast_id = b.id and r.workspace_id = b.workspace_id
     where b.workspace_id = $1
     group by b.id
     order by b.created_at desc limit 200`,
    [ctx.workspaceId],
  );
  const stats = rows.map((r) => {
    const ab = abOf(r);
    return {
      id: r.id,
      delivered: r.delivered,
      opened: r.opened,
      clicked: r.clicked,
      ab: ab && {
        ...ab,
        a: group(r, 'a'),
        b: group(r, 'b'),
        rest: { total: r.rest_total, sent: r.rest_sent, failed: r.rest_failed, held: r.rest_held },
      },
    };
  });
  return c.json({ stats, ab: { min: AB_MIN, pcts: AB_PCTS, waits: AB_WAITS } });
});
