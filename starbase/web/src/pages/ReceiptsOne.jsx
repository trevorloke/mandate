// One receipt (Money → Receipts → a row → Print, or the line under a gift).
// One job: the receipt, ready to print. The yellow button is Print.
//   Under the title, what happened, in the server's words: "Sent October 22,
//   2026" · "Not sent — email isn't connected" · "No email on file" ·
//   "Sending by email" · "Void — the gift was voided".
//   Send / Send again (quiet) only when it can really go: email connected,
//   an email on file, not void, not a sample.
//   More: the donor's own link (Copy link · Open) and the donor's profile.
//   Printing shows the receipt alone (receipts.css).
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, action } from '../api.js';
import { ReceiptDoc } from '../components/ReceiptsBits.jsx';
import './shifts.css';
import './receipts.css';

function DonorLink({ link }) {
  const [copied, setCopied] = useState(null); // null | 'ok' | 'show'
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied('ok');
    } catch {
      setCopied('show'); // no clipboard (http, old browser): show it to copy by hand
    }
  };
  return (
    <div className="rc-link">
      <div className="ops-actions">
        <span className="ops-donate__label">Donor’s link</span>
        <button type="button" className="btn btn-quiet ops-tap" onClick={copy}>{copied === 'ok' ? 'Copied ✓' : 'Copy link'}</button>
        <a className="btn btn-quiet ops-tap" href={link} target="_blank" rel="noopener noreferrer">Open</a>
      </div>
      {copied === 'show' && (
        <input className="input mono" readOnly value={link} aria-label="Donor’s link"
          onFocus={(e) => e.currentTarget.select()} autoFocus />
      )}
    </div>
  );
}

export default function ReceiptsOne() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);

  const q = useQuery({
    queryKey: ['receipts', 'one', id],
    queryFn: () => apiGet(`/receipts/${id}`),
    // While the email is on its way, look again until it has gone (or not).
    refetchInterval: (query) => (query.state.data?.receipt?.status?.code === 'sending' ? 3000 : false),
  });
  const data = q.data;
  const r = data?.receipt;

  const say = (text) => {
    clearTimeout(timer.current);
    setToast(text);
    timer.current = setTimeout(() => setToast(null), 7000);
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  const send = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await action('receipt.send', { id: r.id });
      say(res.email === 'sent' ? `✓ Sent to ${r.donor_name}` : 'Not sent — the email failed');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    }
  };

  if (q.isPending) return <p className="muted">Loading…</p>;
  if (q.isError) {
    return (
      <div className="ops-page">
        <Link to="/money/receipts" className="ops-back">← Receipts</Link>
        <p className="ops-empty">{q.error.status === 404 ? 'This receipt isn’t here.' : q.error.message}</p>
      </div>
    );
  }

  return (
    <div className="ops-page rc-print">
      <Link to="/money/receipts" className="ops-back rc-noprint">← Receipts</Link>
      <div className="ops-head rc-noprint">
        <h1>Receipt <span className="mono">{r.number}</span></h1>
        <button type="button" className="btn btn-primary ops-tap" onClick={() => window.print()}>Print</button>
      </div>

      <div className="rc-noprint">
        <p className="rc-one-status" data-code={r.status.code}>{r.status.line}</p>
        {data.canSend && (
          <div className="ops-actions rc-send">
            <button type="button" className="btn ops-tap" disabled={busy} onClick={send}>
              {busy ? 'Sending…' : r.sent_count > 0 ? 'Send again' : 'Send'}
            </button>
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </div>

      <ReceiptDoc doc={data.doc} />

      <div className="ops-foot rc-noprint">
        <button type="button" className="ops-more disclose" aria-expanded={more} aria-controls="rc-one-more"
          onClick={() => setMore((v) => !v)}>
          More
        </button>
        {more && (
          <div id="rc-one-more" className="ops-more-body rc-more">
            {data.link && <DonorLink link={data.link} />}
            {r.person_id && <Link className="btn btn-quiet ops-tap" to={`/people/${r.person_id}`}>Donor</Link>}
          </div>
        )}
      </div>

      {toast && <div className="toast ops-toast" role="status"><span>{toast}</span></div>}
    </div>
  );
}
