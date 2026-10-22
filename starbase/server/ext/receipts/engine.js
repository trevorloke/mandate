// The receipts engine.
//
// Issuing: the events hook sees every write's events before they are
// chained. Every way a gift enters the books — a desk gift (gift.log), a
// pledge marked paid (pledge.receive), a Stripe payment (stripe.payment), the
// sample campaign (sample.load) — goes through lib/gifts.js logGift, which
// emits ('gift', id, 'create'). The receipt is numbered and written in that
// same transaction, so the gift and its receipt commit together or not at
// all, and no core money code changes. ('gift', id, 'void') voids it,
// ('gift', id, 'restore') un-voids it, and ('person', id, 'update') keeps an
// unsent receipt's name and address current.
//
// Sending: a receipt whose donor has an email, issued while email is
// connected, gets one 'receipt.email' job (keyed by receipt, so once). The
// job sends inside runAction (system actor), so the send is on the hash
// chain; it skips a receipt that is void, already sent, or has lost its
// email. A provider refusal is tried again (three tries in all), then the
// receipt says "Not sent — the email failed" and waits for Send again.
import { runAction } from '../../lib/events.js';
import { emailConfigured } from '../../lib/notify.js';
import {
  loadSettings, issueReceipt, voidReceipt, restoreReceipt, refreshForPerson, deliver, donorEmail,
} from './core.js';

export const SEND_ACTION = 'receipt.autosend';
const EMAIL_TRIES = 3;

export const onEvents = async (tx, meta, events) => {
  let settings = null;
  const ctx = { workspaceId: meta.workspaceId, emit: meta.emit, sample: meta.action === 'sample.load' };
  for (const ev of events) {
    if (ev.entityType === 'gift') {
      if (ev.op === 'create') {
        settings ??= await loadSettings(tx, meta.workspaceId);
        await issueReceipt(tx, { ...ctx, settings }, { id: ev.entityId, ...ev.payload });
      } else if (ev.op === 'void') {
        await voidReceipt(tx, ctx, ev.entityId);
      } else if (ev.op === 'restore') {
        await restoreReceipt(tx, ctx, ev.entityId);
      }
    } else if (ev.entityType === 'person' && ev.op === 'update') {
      await refreshUnderSavepoint(tx, ctx, ev.entityId);
    }
  }
};

// Person updates ride on door knocks and profile edits: a fault in keeping
// an unsent receipt's name current must never cost one. It runs under a
// savepoint, and its events join the chain only if it all went through.
// (Issuing, voiding and restoring stay strict: a gift and its receipt
// commit together or not at all.)
const refreshUnderSavepoint = async (tx, ctx, personId) => {
  const held = [];
  await tx.query('savepoint receipts_refresh');
  try {
    await refreshForPerson(tx, { ...ctx, emit: (...e) => held.push(e) }, personId);
    await tx.query('release savepoint receipts_refresh');
    for (const e of held) ctx.emit(...e);
  } catch (err) {
    await tx.query('rollback to savepoint receipts_refresh');
    await tx.query('release savepoint receipts_refresh');
    console.error('receipts: keeping a receipt’s donor current skipped —', err.message);
  }
};

// The one automatic email for a receipt.
export const runEmailJob = async (db, job) => {
  const receiptId = job.payload?.receipt_id;
  if (!receiptId) return;
  const base = process.env.STARBASE_PUBLIC_URL || null;
  await runAction(db, { workspaceId: job.workspace_id, actorId: null, action: SEND_ACTION }, async (tx, emit) => {
    const meta = { workspaceId: job.workspace_id, emit };
    const r = (await tx.query('select * from receipts where id = $1 and workspace_id = $2 for update',
      [receiptId, job.workspace_id])).rows[0];
    if (!r || r.voided_at || r.sample || r.email_status !== 'queued') return { skipped: true };
    const email = await donorEmail(tx, job.workspace_id, r.person_id);
    if (!email || !emailConfigured()) {
      // Nothing was sent; the receipt says why (No email on file / email
      // isn't connected) and waits for a person to send it.
      await tx.query(`update receipts set email_status = null, updated_at = now() where id = $1`, [r.id]);
      emit('receipt', r.id, 'update', { number: r.number, email_status: null, reason: email ? 'email not connected' : 'no email on file' });
      return { skipped: true };
    }
    const res = await deliver(tx, meta, r, { email, base });
    // A refusal before the last try: throw, so nothing is recorded and the
    // job runner tries again later; the receipt still says Sending.
    if (res.status === 'failed' && job.attempts < EMAIL_TRIES) throw new Error(res.detail || 'email failed');
    return res;
  });
};
