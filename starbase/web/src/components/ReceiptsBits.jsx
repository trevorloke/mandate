// Receipts — small pieces shared by the receipts screens and Money's gift
// line: the status chip (Sent · Not sent · Sending · Void · Sample), dates in
// words, and the receipt itself as the donor reads it (the server sends the
// same fields to the donor's page and the email).
import { fmtMoney, fmtDate } from '../api.js';
import '../pages/receipts.css';

export const fmtBig = (cents) => fmtMoney(cents).replace(/\.00$/, '');

const METHOD_WORD = { card: 'Card', etransfer: 'E-transfer', cheque: 'Cheque', cash: 'Cash', 'in-kind': 'In-kind' };
export const methodWord = (m) => (m ? METHOD_WORD[m] ?? m : 'Not recorded');

// "October 1, 2026"
export const longDate = (value) => {
  const [y, m, d] = fmtDate(value).split('-').map(Number);
  if (!y || !m || !d) return fmtDate(value);
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' });
};
// "Oct 1" this year, "Oct 1, 2025" otherwise
export const shortDate = (value) => {
  const [y, m, d] = fmtDate(value).split('-').map(Number);
  if (!y || !m || !d) return fmtDate(value);
  const opts = { month: 'short', day: 'numeric' };
  if (y !== new Date().getFullYear()) opts.year = 'numeric';
  return new Date(y, m - 1, d).toLocaleDateString('en-CA', opts);
};

const CHIP = {
  sent: 'chip chip-ok',
  void: 'chip ops-chip-muted',
  sample: 'chip ops-chip-muted',
  sending: 'chip',
};
export const StatusChip = ({ status }) => (
  <span className={CHIP[status?.code] || 'chip chip-warn'} title={status?.line || undefined}>{status?.word ?? '…'}</span>
);

const agentLine = (doc) => [doc.agent_name, doc.agent_contact].filter(Boolean).join(' · ') || 'Not set';

export function ReceiptDoc({ doc }) {
  return (
    <article className="rc-doc" aria-label={`Receipt ${doc.number}`}>
      <div className="rc-doc__camp">{doc.campaign}</div>
      <h2 className="rc-doc__title">Contribution receipt</h2>
      {doc.void && <div className="rc-doc__stamp" role="note">VOID</div>}
      {doc.sample && <div className="rc-doc__stamp" role="note">SAMPLE</div>}
      <dl className="rc-doc__facts">
        <dt>Receipt</dt><dd className="mono">{doc.number}</dd>
        <dt>Received from</dt><dd>{doc.contributor}</dd>
        <dt>Home address</dt><dd>{doc.address || <span className="muted">Not on file</span>}</dd>
        <dt>Amount</dt><dd className="mono">{fmtMoney(doc.amount_cents)}</dd>
        <dt>Date received</dt><dd>{longDate(doc.received_on)}</dd>
        <dt>Method</dt><dd>{methodWord(doc.method)}</dd>
      </dl>
      <p>Financial agent: {agentLine(doc)}</p>
      <p className="rc-doc__notice">{doc.notice}</p>
      {doc.footer && <p className="muted">{doc.footer}</p>}
    </article>
  );
}
