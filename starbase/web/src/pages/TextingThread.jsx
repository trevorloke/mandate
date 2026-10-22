// One conversation: every text in and out, oldest first, and a reply box.
// Send is the screen's one yellow button. The server refuses a reply to an
// opted-out number, in quiet hours, or without Twilio — and the screen says
// so before you try. Opening it marks its replies read (for you only).
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, action, ApiError } from '../api.js';
import { isDesk } from '../Shell.jsx';
import { fmtWhen } from './People.jsx';
import { FOOTER, namesCampaign } from '../components/TextingCard.jsx';
import './people.css';
import '../components/texting-card.css';
import './texting.css';

const OUT_WORD = { sent: 'Sent', delivered: 'Delivered', undelivered: 'Not delivered', failed: 'Not sent' };
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';

function ReplyBox({ data, onSent }) {
  const id = useId();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { conversation: conv, quiet, campaign } = data;
  if (!data.sms) return <p className="tx-line tx-stop">Texting from the app needs Twilio</p>;
  if (conv.opted_out || conv.no_texts) return <p className="tx-line tx-stop">Opted out — no more texts</p>;
  const missing = conv.first && body.trim() && !namesCampaign(body, campaign);
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await action('text.reply', { conversation_id: conv.id, body });
      if (r.sent) setBody('');
      else setError(`Not sent — ${r.message?.error || 'Twilio refused it'}`);
      await onSent();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No signal — not sent');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tx-reply">
      <div className="tx-msg">
        <label className="pp-sr" htmlFor={id}>Reply</label>
        <textarea id={id} className="tx-body" rows={3} maxLength={1000} placeholder="Write a reply"
          value={body} onChange={(e) => { setBody(e.target.value); setError(null); }} />
        {conv.first && <p className="tx-foot">{FOOTER}</p>}
      </div>
      {missing && <p className="tx-line tx-line--warn">Say it’s {campaign} in the first text</p>}
      {quiet?.now && <p className="tx-line">Quiet hours · texts go out {quiet.label}</p>}
      <button type="button" className="btn btn-primary pp-btn tx-send-btn"
        disabled={busy || quiet?.now || missing || !body.trim()} onClick={send}>
        {busy ? 'Sending…' : 'Send'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

export default function TextingThread() {
  const { id } = useParams();
  const { me } = useOutletContext() ?? {};
  const desk = isDesk(me);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['texting', 'thread', id],
    queryFn: () => apiGet(`/texting/conversations/${id}`),
    refetchInterval: 15_000,
  });
  const messages = q.data?.messages ?? [];
  const lastIn = [...messages].reverse().find((m) => m.direction === 'in')?.id || null;
  const readRef = useRef(null);
  const endRef = useRef(null);

  // Read it: only when a reply arrived since the last time (no write otherwise).
  useEffect(() => {
    if (!lastIn || readRef.current === lastIn) return;
    readRef.current = lastIn;
    action('text.read', { conversation_id: id })
      .then((r) => { if (r.read) qc.invalidateQueries({ queryKey: ['texting', 'status'] }); })
      .catch(() => { readRef.current = null; });
  }, [lastIn, id, qc]);
  useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'end' }); }, [messages.length]);

  if (q.isLoading) return <p className="muted">Loading…</p>;
  if (q.isError || !q.data?.conversation) {
    return (
      <div className="pp-empty">
        <p>{q.error?.status === 404 ? 'No conversation here.' : q.error?.message || 'Not found'}</p>
        <Link className="btn pp-btn" to="/inbox">Inbox</Link>
      </div>
    );
  }
  const conv = q.data.conversation;
  const refresh = () => Promise.all([
    qc.invalidateQueries({ queryKey: ['texting', 'thread', id] }),
    qc.invalidateQueries({ queryKey: ['texting', 'inbox'] }),
  ]);

  return (
    <div className="tx-page">
      <Link className="eyebrow pf-back" to="/inbox">← Inbox</Link>
      <h1 className="tx-who">
        {conv.person_id ? <Link to={`/people/${conv.person_id}`}>{conv.person_name || conv.phone}</Link> : conv.phone}
      </h1>
      <p className="tx-sub mono">
        {conv.phone}
        {desk && conv.started_by_name && !conv.mine ? ` · ${first(conv.started_by_name)}` : ''}
      </p>

      <ol className="tx-thread" aria-label="Texts">
        {messages.map((m) => (
          <li key={m.id} className={`tx-bubble tx-bubble--${m.direction}${m.status === 'failed' || m.status === 'undelivered' ? ' is-bad' : ''}`}>
            <p className="tx-bubble__body">{m.body}</p>
            <span className="tx-bubble__meta">
              {fmtWhen(m.created_at)}
              {m.direction === 'out' && ` · ${OUT_WORD[m.status] || m.status}`}
              {m.direction === 'out' && desk && m.sent_by_name ? ` · ${first(m.sent_by_name)}` : ''}
            </span>
            {m.keyword === 'stop' && <span className="chip chip-danger tx-kw">Opted out</span>}
            {m.keyword === 'start' && <span className="chip chip-ok tx-kw">Opted back in</span>}
          </li>
        ))}
      </ol>
      <div ref={endRef} />

      <ReplyBox data={q.data} onSent={refresh} />
    </div>
  );
}
