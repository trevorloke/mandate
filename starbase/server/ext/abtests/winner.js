// The A/B winner: when a test's wait ends, compare A and B by the chosen
// measure (opened or clicked, of delivered), pick the better one — a tie
// goes to A — and send its subject to everyone held back. One run per send:
// a decided test is never decided or sent again. Without email connected
// the rest stay saved (released, not held) and go out on Send now.
import { runAction } from '../../lib/events.js';
import { blastCounts, blastStatus, deliver, groupStats } from './send.js';

const rateOf = (g, metric) => (g.delivered ? (metric === 'clicks' ? g.clicked : g.opened) / g.delivered : 0);

export const pickWinner = async (db, job) => {
  const { blast_id: blastId, base = '' } = job.payload || {};
  const workspaceId = job.workspace_id;
  await runAction(db, { workspaceId, actorId: null, action: 'blast.ab_winner' }, async (tx, emit) => {
    const blast = (await tx.query(
      'select * from blasts where id = $1 and workspace_id = $2 for update',
      [blastId, workspaceId],
    )).rows[0];
    if (!blast || blast.ab_status !== 'testing') return;

    const groups = await groupStats(tx, workspaceId, blastId);
    const winner = rateOf(groups.b, blast.ab_metric) > rateOf(groups.a, blast.ab_metric) ? 'b' : 'a';
    const result = { metric: blast.ab_metric, a: groups.a, b: groups.b };
    await tx.query(
      `update blasts set ab_status = 'decided', ab_winner = $3, ab_decided_at = now(), ab_result = $4
       where id = $1 and workspace_id = $2`,
      [blastId, workspaceId, winner, JSON.stringify(result)],
    );

    const ws = (await tx.query('select name from workspaces where id = $1', [workspaceId])).rows[0];
    const ctx = { workspaceId, workspace: { name: ws.name }, publicUrl: base };
    const rest = (await tx.query(
      `select id, email, name, token, ab_group from blast_recipients
       where blast_id = $1 and workspace_id = $2 and ab_group = 'rest' and status in ('queued', 'failed')
       order by created_at, id`,
      [blastId, workspaceId],
    )).rows;
    const out = await deliver(tx, ctx, { ...blast, ab_winner: winner }, rest);

    const counts = await blastCounts(tx, workspaceId, blastId);
    const status = blastStatus(counts);
    const note = counts.total === 0 ? 'everyone on this send has unsubscribed' : out.note;
    await tx.query(
      `update blasts set status = $3, provider_note = $4, audience_count = $5,
         sent_at = case when $3 = 'sent' then now() else sent_at end
       where id = $1 and workspace_id = $2`,
      [blastId, workspaceId, status, note, counts.total],
    );
    emit('blast', blastId, 'update', {
      ab_winner: winner, ...result, rest: rest.length - out.skipped,
      sent: out.sent, failed: out.failed, unsubscribed: out.skipped, status,
    });
  });
};
