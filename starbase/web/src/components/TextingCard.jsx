// Texting and calling on the Calls card, through the campaign's Twilio number.
//
//   <TextingCallButton person me channel>{the phone's own sms:/tel: link}</…>
//       Text mode, Twilio connected: the message (the campaign's template with
//       their first name, editable) and Send — sent by the server, one tap,
//       one person. The first text in a conversation shows the line the server
//       adds ("Reply STOP to opt out") and must name the campaign.
//       Phone mode, calls connected: "Call <name>" rings your own phone first
//       (you enter it once) and connects you from the campaign's number.
//       Otherwise the children — today's sms: / tel: link — plus, in Text
//       mode, one plain line: "Texting from the app needs Twilio".
//   <TextingRepliesLink />   Calls' quiet "Replies · N" (your unread replies)
//   <TextingPersonLink personId />   a profile's "Texts" row (desk)
//   noTexts(person)          true when they must not be texted
//
// Nothing here says Sent unless the server says Twilio took it.
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, action, ApiError } from '../api.js';
import './texting-card.css';

export const NO_TEXT_TAGS = ['do-not-text', 'do-not-contact'];
export const noTexts = (p) => Array.isArray(p?.tags) && p.tags.some((t) => NO_TEXT_TAGS.includes(t));
export const FOOTER = 'Reply STOP to opt out';
const first = (name) => String(name || '').trim().split(/\s+/)[0] || '';
export const namesCampaign = (body, campaign) => String(body || '').toLowerCase().includes(String(campaign || '').trim().toLowerCase());
const endsWithFooter = (body) => /reply stop to opt out\.?\s*$/i.test(String(body || ''));
export const fillTemplate = (template, { person, me, campaign }) => String(template || '')
  .replaceAll('{{first_name}}', first(person?.name))
  .replaceAll('{{my_name}}', first(me?.user?.name))
  .replaceAll('{{campaign}}', campaign || me?.workspace?.name || '');
export const clock = (ts) => {
  const d = new Date(ts || Date.now());
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
};
const minutes = (s) => (s == null ? '' : s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`);
const errorText = (e) => (e instanceof ApiError ? e.message : 'No signal — not sent');

export function useTextingStatus() {
  return useQuery({
    queryKey: ['texting', 'status'],
    queryFn: () => apiGet('/texting/status'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

function TxIcon({ name }) {
  return (
    <svg className="pp-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {name === 'phone'
        ? <path d="M6.5 3.5h3l1.6 4.3-2.1 1.4a10.5 10.5 0 0 0 5.8 5.8l1.4-2.1 4.3 1.6v3a2 2 0 0 1-2.1 2A15.5 15.5 0 0 1 4.5 5.6a2 2 0 0 1 2-2.1z" />
        : <path d="M4 5h16v11H10l-5 4v-4H4z" />}
    </svg>
  );
}

// ── Text mode: write, then Send ──
function SendBox({ person, me, status }) {
  const qc = useQueryClient();
  const id = useId();
  const fn = first(person.name);
  const card = useQuery({
    queryKey: ['texting', 'person', person.id],
    queryFn: () => apiGet(`/texting/people/${person.id}`),
    staleTime: 10_000,
  });
  const [body, setBody] = useState(() => fillTemplate(status.template, { person, me, campaign: status.campaign }));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);   // the text the server sent
  const [error, setError] = useState(null);
  const info = card.data;
  if (info?.opted_out || info?.no_contact || noTexts(person)) {
    return <p className="tx-line tx-line--block" role="note">{fn} opted out of texts</p>;
  }
  const isFirst = info ? info.first : true;
  const missing = isFirst && !namesCampaign(body, status.campaign);
  const quiet = Boolean(status.quiet?.now);
  const thread = done?.conversation_id || info?.conversation?.id;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await action('text.send', { person_id: person.id, body });
      if (r.sent) setDone({ at: r.message.created_at, conversation_id: r.conversation_id });
      else setError(`Not sent — ${r.message?.error || 'Twilio refused it'}`);
      qc.invalidateQueries({ queryKey: ['texting'] });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="tx-done" role="status">
        <span>✓ Sent to {fn} · {clock(done.at)}</span>
        <Link className="tx-quiet" to={`/inbox/${done.conversation_id}`}>Open</Link>
      </div>
    );
  }
  return (
    <div className="tx-send">
      <div className="tx-msg">
        <label className="pp-sr" htmlFor={id}>Message to {fn}</label>
        <textarea id={id} className="tx-body" rows={4} maxLength={1000} value={body}
          onChange={(e) => { setBody(e.target.value); setError(null); }} />
        {isFirst && !endsWithFooter(body) && <p className="tx-foot" title="Added to every first text">{FOOTER}</p>}
      </div>
      {missing && <p className="tx-line tx-line--warn">Say it’s {status.campaign} in the first text</p>}
      {quiet && <p className="tx-line">Quiet hours · texts go out {status.quiet.label}</p>}
      <button type="button" className="btn cl-call tx-go" disabled={busy || quiet || missing || !body.trim()} onClick={send}>
        <TxIcon name="text" /> {busy ? 'Sending…' : `Send to ${fn}`}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {thread && !error && <Link className="tx-quiet tx-quiet--block" to={`/inbox/${thread}`}>Earlier texts</Link>}
    </div>
  );
}

// ── Phone mode: ring my phone, then connect ──
const LIVE = new Set(['calling_you', 'connecting']);
const callWords = (call, fn) => {
  switch (call?.status) {
    case 'calling_you': return 'Calling your phone… answer and press 1 to connect';
    case 'connecting': return `Connecting you to ${fn}…`;
    case 'talked': return `Call ended · ${minutes(call.talk_s)}`;
    case 'no_answer': return `${fn} didn’t pick up`;
    case 'missed': return 'Not connected · try again';
    case 'ended': return 'Call ended';
    case 'failed': return 'Call didn’t go through';
    default: return '';
  }
};

function CampaignCall({ person, status }) {
  const qc = useQueryClient();
  const id = useId();
  const fn = first(person.name);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState('');
  const [callId, setCallId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const call = useQuery({
    queryKey: ['texting', 'call', callId],
    queryFn: () => apiGet(`/texting/calls/${callId}`),
    enabled: Boolean(callId),
    refetchInterval: (q) => (LIVE.has(q.state.data?.call?.status ?? 'calling_you') ? 2000 : false),
  });
  const now = call.data?.call || (callId ? { status: 'calling_you' } : null);
  const live = LIVE.has(now?.status);
  const needPhone = !status.myPhone || editing;
  const quiet = Boolean(status.quiet?.now);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await action('call.start', { person_id: person.id, my_phone: needPhone ? phone : undefined });
      if (needPhone) { setEditing(false); qc.invalidateQueries({ queryKey: ['texting', 'status'] }); }
      if (r.call.status === 'failed') setError(`Call didn’t go through${r.call.error ? ` — ${r.call.error}` : ''}`);
      else setCallId(r.call.id);
    } catch (e) {
      setError(errorText(e).replace('not sent', 'no call'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tx-call">
      {needPhone && !live && (
        <div className="tx-myphone">
          <label className="tx-label" htmlFor={id}>Your phone</label>
          <input id={id} className="input tx-input" type="tel" inputMode="tel" autoComplete="tel" maxLength={40}
            value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="604-555-0100" />
          <p className="tx-line">We ring you, then connect you. They see the campaign’s number.</p>
        </div>
      )}
      {quiet && <p className="tx-line">Quiet hours · calls go out {status.quiet.label}</p>}
      {live ? (
        <p className="tx-live" role="status" aria-live="polite">{callWords(now, fn)}</p>
      ) : (
        <button type="button" className="btn cl-call" disabled={busy || quiet || (needPhone && !phone.trim())} onClick={start}>
          <TxIcon name="phone" /> {busy ? 'Calling…' : now ? `Call ${fn} again` : `Call ${fn}`}
        </button>
      )}
      {now && !live && <p className="tx-line tx-line--block" role="status">{callWords(now, fn)}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {status.myPhone && !needPhone && !live && (
        <button type="button" className="tx-quiet tx-quiet--block" onClick={() => { setEditing(true); setPhone(''); }}>
          Change my number
        </button>
      )}
    </div>
  );
}

export function TextingCallButton({ person, me, channel, children }) {
  const status = useTextingStatus();
  const s = status.data;
  if (channel === 'text') {
    if (s?.sms) return <SendBox person={person} me={me} status={s} />;
    return (
      <>
        {children}
        {s && !s.sms && <p className="tx-line tx-line--under">Texting from the app needs Twilio</p>}
      </>
    );
  }
  if (s?.voice) return <CampaignCall person={person} status={s} />;
  return children;
}

export function TextingRepliesLink() {
  const status = useTextingStatus();
  const s = status.data;
  if (!s?.conversations) return null;
  return (
    <Link className={`tx-replies${s.unread ? ' is-new' : ''}`} to="/inbox">
      Replies · <span className="mono">{s.unread}</span>
    </Link>
  );
}

export function TextingPersonLink({ personId }) {
  const q = useQuery({
    queryKey: ['texting', 'personConversations', personId],
    queryFn: () => apiGet(`/texting/people/${personId}/conversations`),
  });
  const list = q.data?.conversations || [];
  if (!list.length) return null;
  const to = list.length === 1 ? `/inbox/${list[0].id}` : `/inbox?person=${personId}`;
  const count = list.reduce((n, c) => n + (c.messages || 0), 0);
  return (
    <section className="pf-sec">
      <Link className="tx-pflink" to={to}>
        <span className="pf-sec__title">Texts</span>
        <span className="pf-sec__count">{count}</span>
      </Link>
    </section>
  );
}
