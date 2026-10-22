// Receipts — the pieces every other file shares: settings, numbering, the
// receipt itself (one shape for the desk, the donor's page and the email),
// what its status says, and sending it.
//
// Wording: the tax line and the footer are settings, not code — the
// financial agent confirms receipt contents and thresholds with Elections BC
// (TESTING.md).
import { randomBytes } from 'node:crypto';
import { newId } from '../../lib/events.js';
import { enqueueJob, cancelJobs } from '../../lib/jobs.js';
import { emailConfigured, sendEmail } from '../../lib/notify.js';

export const JOB = 'receipt.email';
export const SAMPLE_SERIES = 'sample';
// Who may change the settings and download the filing exports.
export const AGENT_ROLES = ['manager', 'treasurer'];
// Who may see receipts and send them (the gift ledger's roles).
export const MONEY_ROLES = ['manager', 'treasurer', 'staff'];

export const DEFAULT_NOTICE = 'Contributions to BC municipal election campaigns are not tax-deductible.';
export const DEFAULTS = {
  threshold_cents: 0,           // every contribution gets a receipt
  disclosure_cents: 10000,      // disclosure lists contributors over $100
  agent_name: null,
  agent_contact: null,
  notice: DEFAULT_NOTICE,
  footer: 'Thank you for your contribution.',
};

export const isoDay = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d ?? '').slice(0, 10));
const trimmed = (s) => (typeof s === 'string' && s.trim() ? s.trim() : null);

export const loadSettings = async (q, workspaceId) => {
  const r = (await q.query('select * from receipt_settings where workspace_id = $1', [workspaceId])).rows[0];
  if (!r) return { ...DEFAULTS, saved: false };
  return {
    threshold_cents: Number(r.threshold_cents),
    disclosure_cents: Number(r.disclosure_cents),
    agent_name: trimmed(r.agent_name),
    agent_contact: trimmed(r.agent_contact),
    // The tax line can be reworded, never left off.
    notice: trimmed(r.notice) || DEFAULT_NOTICE,
    footer: trimmed(r.footer),
    saved: true,
  };
};

// "Unit 4, 13245 72 Ave, Surrey, V3W 1A1" — whatever of it is on file.
export const addressOf = (p) => {
  if (!p) return null;
  const street = trimmed(p.address);
  const unit = trimmed(p.unit);
  const parts = [street ? (unit ? `Unit ${unit}, ${street}` : street) : null, trimmed(p.city), trimmed(p.postal)].filter(Boolean);
  return parts.length ? parts.join(', ') : null;
};

const pad = (n) => String(n).padStart(4, '0');
export const numberFor = (series, seq) => (series === SAMPLE_SERIES ? `SAMPLE-${pad(seq)}` : `${series}-${pad(seq)}`);

// The next number in a series. Runs inside the caller's transaction (and
// under runAction's workspace lock), so it commits — or rolls back — with
// the gift.
const nextSeq = async (tx, workspaceId, series) => Number((await tx.query(
  `insert into receipt_counters (workspace_id, series, last) values ($1, $2, 1)
   on conflict (workspace_id, series) do update set last = receipt_counters.last + 1
   returning last`,
  [workspaceId, series],
)).rows[0].last);

const personOf = async (tx, workspaceId, personId) => (personId ? (await tx.query(
  'select id, name, email, address, unit, city, postal from persons where id = $1 and workspace_id = $2',
  [personId, workspaceId],
)).rows[0] : null) || null;

// Issue the receipt for a gift that was just created (the events hook).
// Under the threshold → none. The sample campaign's gifts get receipts in
// their own SAMPLE series, never emailed, so a real campaign's numbers start
// at 0001. Email goes out by a job after the gift commits — once.
export const issueReceipt = async (tx, { workspaceId, emit, sample, settings }, gift) => {
  const amount = Number(gift.amount_cents);
  if (!gift.id || !gift.person_id || !Number.isFinite(amount) || !gift.date) return null;
  if (amount < settings.threshold_cents) return null;
  const had = (await tx.query('select 1 from receipts where workspace_id = $1 and gift_id = $2', [workspaceId, gift.id])).rows[0];
  if (had) return null;

  const person = await personOf(tx, workspaceId, gift.person_id);
  let address = addressOf(person);
  if (!address && gift.pledge_id) {
    // A donate-page pledge always carries the home address the donor typed.
    const pl = (await tx.query('select address from pledges where id = $1 and workspace_id = $2', [gift.pledge_id, workspaceId])).rows[0];
    address = trimmed(pl?.address);
  }
  const date = isoDay(gift.date);
  const series = sample ? SAMPLE_SERIES : date.slice(0, 4);
  const seq = await nextSeq(tx, workspaceId, series);
  const number = numberFor(series, seq);
  const id = newId();
  const willSend = !sample && !!trimmed(person?.email) && emailConfigured();
  await tx.query(
    `insert into receipts (id, workspace_id, gift_id, person_id, series, seq, number, token, donor_name, donor_address,
                           amount_cents, received_on, method, sample, email_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [id, workspaceId, gift.id, gift.person_id, series, seq, number, randomBytes(24).toString('hex'),
     person?.name || 'Unknown donor', address, amount, date, gift.method || null, !!sample, willSend ? 'queued' : null],
  );
  if (willSend) {
    await enqueueJob(tx, { workspaceId, kind: JOB, payload: { receipt_id: id }, key: `${JOB}:${id}` });
  }
  // The donor link's token never enters the log.
  emit('receipt', id, 'create', {
    gift_id: gift.id, person_id: gift.person_id, number, amount_cents: amount, received_on: date,
    ...(sample ? { sample: true } : {}), email: willSend ? 'queued' : null,
  });
  return id;
};

// A voided gift voids its receipt: the number stays, marked VOID. An email
// still waiting to go is called off.
export const voidReceipt = async (tx, { workspaceId, emit }, giftId) => {
  const r = (await tx.query(
    `update receipts set voided_at = now(), updated_at = now(),
       email_status = case when email_status = 'queued' then null else email_status end
     where workspace_id = $1 and gift_id = $2 and voided_at is null returning id, number`,
    [workspaceId, giftId],
  )).rows[0];
  if (!r) return;
  await cancelJobs(tx, { workspaceId, kind: JOB, where: { receipt_id: r.id } });
  emit('receipt', r.id, 'void', { gift_id: giftId, number: r.number });
};

export const restoreReceipt = async (tx, { workspaceId, emit }, giftId) => {
  const r = (await tx.query(
    `update receipts set voided_at = null, updated_at = now()
     where workspace_id = $1 and gift_id = $2 and voided_at is not null returning id, number`,
    [workspaceId, giftId],
  )).rows[0];
  if (r) emit('receipt', r.id, 'restore', { gift_id: giftId, number: r.number });
};

// Copy the donor's current name and address onto a receipt (logged when it
// changes). Used before every send, and when the donor's record changes
// while the receipt has never been sent.
export const refreshDonor = async (tx, { workspaceId, emit }, receipt) => {
  const person = await personOf(tx, workspaceId, receipt.person_id);
  if (!person) return receipt;
  const name = person.name || receipt.donor_name;
  const address = addressOf(person) || receipt.donor_address || null;
  if (name === receipt.donor_name && address === (receipt.donor_address || null)) return receipt;
  await tx.query(
    'update receipts set donor_name = $3, donor_address = $4, updated_at = now() where id = $1 and workspace_id = $2',
    [receipt.id, workspaceId, name, address],
  );
  emit('receipt', receipt.id, 'update', { donor_name: name, donor_address: address });
  return { ...receipt, donor_name: name, donor_address: address };
};

export const refreshForPerson = async (tx, meta, personId) => {
  const rows = (await tx.query(
    `select * from receipts where workspace_id = $1 and person_id = $2
       and voided_at is null and sent_at is null and not sample`,
    [meta.workspaceId, personId],
  )).rows;
  for (const r of rows) await refreshDonor(tx, meta, r);
};

// ── What a receipt says ──
const METHOD_WORD = { card: 'Card', etransfer: 'E-transfer', cheque: 'Cheque', cash: 'Cash', 'in-kind': 'In-kind' };
export const methodWord = (m) => (m ? METHOD_WORD[m] || m : 'Not recorded');
export const money = (cents) => `$${(Number(cents || 0) / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const longDate = (d) => {
  const day = isoDay(d);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-CA', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
};

// One receipt, as the donor reads it.
export const docOf = (r, settings, campaign) => ({
  campaign,
  number: r.number,
  void: !!r.voided_at,
  sample: !!r.sample,
  contributor: r.donor_name,
  address: r.donor_address || null,
  amount_cents: Number(r.amount_cents),
  received_on: isoDay(r.received_on),
  method: r.method || null,
  agent_name: settings.agent_name,
  agent_contact: settings.agent_contact,
  notice: settings.notice,
  footer: settings.footer,
});

export const agentLine = (doc) => [doc.agent_name, doc.agent_contact].filter(Boolean).join(' · ') || 'Not set';

export const receiptText = (doc, link) => [
  `Thank you for your contribution to ${doc.campaign}.`,
  '',
  `Receipt ${doc.number}${doc.void ? ' — VOID' : ''}`,
  `Contributor: ${doc.contributor}`,
  `Home address: ${doc.address || 'Not on file'}`,
  `Amount: ${money(doc.amount_cents)}`,
  `Date received: ${longDate(doc.received_on)}`,
  `Method: ${methodWord(doc.method)}`,
  '',
  `Financial agent: ${agentLine(doc)}`,
  doc.notice,
  ...(doc.footer ? ['', doc.footer] : []),
  ...(link ? ['', `View or print: ${link}`] : []),
  '',
  `— ${doc.campaign}`,
].join('\n');

// ── What its status says (computed when read, so it is true right now) ──
const sentDay = (ts, timeZone) => {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : ` ${d.toLocaleDateString('en-CA', { timeZone, month: 'long', day: 'numeric', year: 'numeric' })}`;
};
export const statusOf = (r, { emailOn, hasEmail, timeZone = 'America/Vancouver' }) => {
  if (r.voided_at) return { code: 'void', word: 'Void', line: 'Void — the gift was voided' };
  if (r.sample) return { code: 'sample', word: 'Sample', line: 'Sample — never sent' };
  if (r.email_status === 'sent') return { code: 'sent', word: 'Sent', line: `Sent${sentDay(r.sent_at, timeZone)}` };
  if (r.email_status === 'queued') return { code: 'sending', word: 'Sending', line: 'Sending by email' };
  if (!hasEmail) return { code: 'no_email', word: 'Not sent', line: 'No email on file' };
  if (!emailOn) return { code: 'not_connected', word: 'Not sent', line: 'Not sent — email isn’t connected' };
  if (r.email_status === 'failed') return { code: 'failed', word: 'Not sent', line: 'Not sent — the email failed' };
  return { code: 'unsent', word: 'Not sent', line: 'Not sent' };
};

export const campaignName = async (q, workspaceId) =>
  (await q.query('select name from workspaces where id = $1', [workspaceId])).rows[0]?.name || 'The campaign';

export const linkFor = (base, token) => (base ? `${String(base).replace(/\/$/, '')}/r/${token}` : null);

// Send one receipt by email, inside the caller's transaction (which holds
// the workspace lock, so two sends of one receipt can't cross). The caller
// has already checked it may be sent. Records what the provider said.
export const deliver = async (tx, meta, receipt, { email, base }) => {
  const r = await refreshDonor(tx, meta, receipt);
  const settings = await loadSettings(tx, meta.workspaceId);
  const doc = docOf(r, settings, await campaignName(tx, meta.workspaceId));
  const res = await sendEmail({
    to: email,
    subject: `Your receipt ${doc.number} from ${doc.campaign}`,
    text: receiptText(doc, linkFor(base, r.token)),
  });
  const status = res.status === 'sent' ? 'sent' : res.status === 'failed' ? 'failed' : null;
  await tx.query(
    `update receipts set email_status = $3, email_note = $4,
       sent_at = case when $3 = 'sent' then now() else sent_at end,
       sent_count = sent_count + case when $3 = 'sent' then 1 else 0 end, updated_at = now()
     where id = $1 and workspace_id = $2`,
    [r.id, meta.workspaceId, status, res.detail || null],
  );
  await cancelJobs(tx, { workspaceId: meta.workspaceId, kind: JOB, where: { receipt_id: r.id } });
  meta.emit('receipt', r.id, 'update', { number: r.number, emailed: true, email_status: status ?? res.status, again: Number(r.sent_count) > 0 });
  return { status: res.status, detail: res.detail || null };
};

export const donorEmail = async (q, workspaceId, personId) => trimmed((personId ? (await q.query(
  'select email from persons where id = $1 and workspace_id = $2', [personId, workspaceId],
)).rows[0] : null)?.email);
