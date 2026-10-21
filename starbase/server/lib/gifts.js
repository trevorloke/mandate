// The one way a gift enters the books — desk entry, a confirmed pledge, or a
// Stripe payment. Inserts the gift and runs the entity-keyed cap check inside
// the caller's transaction; the SUM already includes this gift, so the exact
// crossing record is the one flagged.
import { newId } from './events.js';
import { checkCap } from './cap.js';
import { httpError } from '../actions/util.js';

export const logGift = async (tx, workspace, input, emit) => {
  const donor = (await tx.query(
    'select id, name from persons where id = $1 and workspace_id = $2 and deleted_at is null',
    [input.person_id, workspace.id],
  )).rows[0];
  if (!donor) throw httpError(400, 'donor not found in this workspace — create the person first');

  const id = newId();
  await tx.query(
    `insert into gifts (id, workspace_id, person_id, amount_cents, date, method, cadence, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [id, workspace.id, input.person_id, input.amount_cents, input.date,
     input.method || null, input.cadence || 'one-time', input.note || null],
  );

  const cap = await checkCap(tx, {
    workspaceId: workspace.id,
    personId: input.person_id,
    date: input.date,
    jurisdiction: workspace.jurisdiction,
    settings: workspace.settings,
  });
  let flagReason = null;
  if (cap.checked && cap.over) {
    flagReason = `${donor.name} is at $${(cap.totalCents / 100).toFixed(2)} for ${cap.year} — over the $${(cap.capCents / 100).toFixed(2)} limit (${cap.source})`;
    await tx.query(
      'update gifts set flagged = true, flag_reason = $3 where id = $1 and workspace_id = $2',
      [id, workspace.id, flagReason],
    );
  }

  const payload = { id, ...input, flagged: !!flagReason, flag_reason: flagReason };
  emit('gift', id, 'create', payload);
  return { gift: payload, compliance: cap };
};
