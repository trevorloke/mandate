// Outreach — five tabs, one job each. The header holds the tab's one yellow
// action; under the tabs sits a short list. Everything else is one tap away
// under "More" (or "For your web developer"), and only rendered when open.
//   newsletter  Write newsletter · signup link · More: subscribers, past sends
//   press       Write press release · media count · More: past releases
//   petitions   New petition · rows with Copy · tap a row: signatures, close
//   events      New event · rows with Copy · tap a row: RSVPs, edit, delete
//   website     every public link with Copy · More: site link, donations ·
//               For your web developer: embed code
// Tabs live in the URL (/outreach/:tab); an open compose/new form is ?new=1.
// Everything is react-query driven; every write invalidates and confirms.
import { useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { VOLUNTEER_ROLES } from '@starbase/shared/canvass';
import { apiGet, action, fmtMoney } from '../api.js';
import './outreach.css';

const TABS = [
  { key: 'newsletter', label: 'Newsletter' },
  { key: 'press',      label: 'Press' },
  { key: 'petitions',  label: 'Petitions' },
  { key: 'events',     label: 'Events' },
  { key: 'website',    label: 'Website' },
];
// The one yellow button in the header, per tab.
const PRIMARY = {
  newsletter: 'Write newsletter',
  press: 'Write press release',
  petitions: 'New petition',
  events: 'New event',
};
const DESK_ROLES = ['manager', 'treasurer', 'staff'];
// Volunteers get 403 on /api/subscriptions, /api/blasts and signature lists,
// so they only see the tabs whose reads they're allowed.
const VOLUNTEER_TABS = new Set(['petitions', 'events', 'website']);

// Tab icons (24×24, stroke = currentColor), same hand as the phone tab bar.
const TAB_ICONS = {
  newsletter: <><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" /><path d="m4 7 8 6 8-6" /></>,
  press: <><path d="M4 5.5h12v13H6a2 2 0 0 1-2-2z" /><path d="M16 9h3.5v7.5a2 2 0 0 1-2 2H16" /><path d="M7 9h6M7 12h6M7 15h4" /></>,
  petitions: <><rect x="5" y="4.5" width="14" height="16" rx="1.5" /><path d="M9 3.5h6v3H9z" /><path d="m9 13.5 2 2 4-4.5" /></>,
  events: <><rect x="3.5" y="5" width="17" height="15.5" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  website: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.4-3.6-8.5S9.6 6.1 12 3.5z" /></>,
};
const TabIcon = ({ name }) => (
  <svg className="ot-tab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {TAB_ICONS[name]}
  </svg>
);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');
const plural = (n, one, many) => (n === 1 ? one : many);

const fmtWhen = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const fmtDay = (ts) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

// Lighter normalizer for hand-typed slugs: keeps a trailing dash while typing.
const slugInput = (v) =>
  String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').slice(0, 60);

// Where a subscriber came from, in plain words.
const sourceLabel = (s) => {
  if (!s) return null;
  if (s === 'signup-page') return 'signup page';
  if (s.startsWith('petition')) return 'petition';
  return s.replace(/[-_:]+/g, ' ');
};
const KIND_LABEL = { newsletter: 'Newsletter', press: 'Press release' };

// Run an action with busy/error state; `onDone` gets the result.
function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (name, input) => {
    setBusy(true);
    setError(null);
    try {
      const res = await action(name, input);
      await onDone?.(res, name, input);
      return res;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, error, clearError: () => setError(null) };
}

// One toast at a time, auto-dismisses.
function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const show = (text, ms = 3500) => {
    clearTimeout(timer.current);
    setMsg(text);
    timer.current = setTimeout(() => setMsg(null), ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return { msg, show, clear: () => { clearTimeout(timer.current); setMsg(null); } };
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({ text, label = 'Copy', what, onCopied, className = '' }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const go = async () => {
    const ok = await copyText(text);
    if (!ok) { onCopied?.(false); return; }
    setCopied(true);
    onCopied?.(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };
  return (
    <button
      type="button"
      className={`btn ot-copy ot-btn-tap ${className}`.trim()}
      data-copied={copied ? 'true' : 'false'}
      aria-label={what ? `${label} ${what}` : undefined}
      aria-live="polite"
      onClick={go}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

// "More" — a quiet toggle; what it reveals is only rendered when open.
function More({ label = 'More', children }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="ot-more-wrap">
      <button type="button" className="ot-more" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open && <div id={id} className="ot-more-body">{children}</div>}
    </div>
  );
}

// A big number with a short label: "5 subscribers".
function Big({ n, one, many }) {
  return (
    <p className="ot-big">
      <span className="n">{n == null ? '…' : n}</span>
      <span className="lbl">{plural(n, one, many)}</span>
    </p>
  );
}

// A public page as a row: its name (opens it) and a Copy button.
function LinkItem({ label, sub, href, onCopied }) {
  return (
    <li className="ot-item">
      <div className="ot-line">
        <a className="ot-row" href={href} target="_blank" rel="noreferrer">
          <span className="ot-row__main">
            <span className="ot-row__name">{label}</span>
            {sub && <span className="ot-row__sub">{sub}</span>}
          </span>
        </a>
        <CopyButton text={href} what={`${label} link`} onCopied={onCopied} />
      </div>
    </li>
  );
}

const copiedToast = (toast, what) => (ok) => toast(ok ? `${what} copied` : 'Could not copy — open the link and copy it from there');

function StatusChip({ status }) {
  const cls = status === 'sent' || status === 'subscribed' || status === 'active' ? 'chip chip-ok'
    : status === 'queued' ? 'chip chip-warn'
    : status === 'failed' ? 'chip chip-danger'
    : 'chip ot-chip-ghost';
  return <span className={cls}>{status}</span>;
}

// The one place a send's outcome is said. Server rule (blast.send): every
// message sent → 'sent'; every message failed → 'failed'; anything else →
// 'queued'. With no provider every message is queued; WITH a provider,
// 'queued' means a mix of sent + failed, so the line has to say which.
const noProviderNote = (note) => /no email provider/i.test(note || '');
function BlastResult({ blast, emailConfigured, onDismiss }) {
  if (!blast) return null;
  const n = blast.audience_count ?? 0;
  const who = `${n} ${plural(n, 'recipient', 'recipients')}`;
  const partial = blast.status === 'queued' && emailConfigured === true && !noProviderNote(blast.provider_note);
  const line = blast.status === 'sent' ? `Sent to ${who}.`
    : blast.status === 'failed' ? `Failed — ${who} not reached.`
    : partial ? `Partly sent to ${who}.`
    : `Queued for ${who} — connect an email provider to send.`;
  return (
    <div className="ot-result" data-status={blast.status} role="status">
      <div className="ot-result-head">
        <span className="ot-status-dot" data-status={blast.status} aria-hidden="true" />
        <strong>{line}</strong>
        {onDismiss && <button type="button" className="btn btn-quiet ot-btn-tap" onClick={onDismiss}>OK</button>}
      </div>
      {(partial || blast.status === 'failed') && blast.provider_note && <div className="provider">{blast.provider_note}</div>}
    </div>
  );
}

// Compose shared by newsletter + press: subject, message, Send. Sending asks
// once, in one line ("Send to 5 subscribers? Yes, send · No"). The server
// refuses an empty audience, so Send waits until there is someone to send to.
function ComposeCard({ kind, audienceCount, audienceNoun, emptyReason, emailConfigured, onSent, onCancel }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(null);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['blasts'] });
  });

  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const empty = audienceCount === 0;
  const noun = (n) => plural(n, audienceNoun.one, audienceNoun.many);

  const send = async () => {
    setFailed(null);
    const res = await act.run('blast.send', { kind, subject: subject.trim(), body: body.trim() });
    setConfirming(false);
    if (!res) return;
    // A failed send keeps the draft here; anything else closes the form.
    if (res.blast.status === 'failed') { setFailed(res.blast); return; }
    onSent?.(res.blast);
  };

  return (
    <form className="card ot-compose" onSubmit={(e) => { e.preventDefault(); if (ready && !empty && !confirming) setConfirming(true); }}>
      <div className="field">
        <label htmlFor={`${kind}-subject`}>Subject</label>
        <input id={`${kind}-subject`} className="input" value={subject} maxLength={300} autoFocus
          onChange={(e) => { setSubject(e.target.value); setConfirming(false); }}
          placeholder={kind === 'press' ? 'Imagine Surrey unveils transit plan' : 'This week on the campaign'} />
      </div>
      <div className="field">
        <label htmlFor={`${kind}-body`}>Message</label>
        <textarea id={`${kind}-body`} className="input" value={body} maxLength={50000}
          onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
          placeholder={kind === 'press' ? 'FOR IMMEDIATE RELEASE …' : 'Hello friends,'} />
      </div>
      {act.error && <p className="error">{act.error}</p>}
      {empty && emptyReason && <p className="ot-note">{emptyReason}</p>}
      <div className="ot-foot">
        {confirming ? (
          <div className="ot-confirm" role="group" aria-label="Confirm send">
            <span>Send to <strong>{audienceCount}</strong> {noun(audienceCount)}?</span>
            <button type="button" className="btn btn-primary ot-btn-tap" disabled={act.busy} onClick={send}>
              {act.busy ? 'Sending…' : 'Yes, send'}
            </button>
            <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={() => setConfirming(false)}>No</button>
          </div>
        ) : (
          <>
            <button type="submit" className="btn btn-primary ot-btn-tap" disabled={!ready || empty || act.busy}>Send</button>
            <span className="ot-audience">
              {audienceCount == null ? '…' : `${audienceCount} ${noun(audienceCount)}`}
            </span>
            <span className="spacer" />
            <button type="button" className="btn btn-quiet ot-btn-tap" onClick={onCancel}>Cancel</button>
          </>
        )}
      </div>
      <BlastResult blast={failed} emailConfigured={emailConfigured} onDismiss={() => setFailed(null)} />
    </form>
  );
}

// Past newsletters and press releases, newest first.
function SentList({ blasts, loading, kindFilter }) {
  const rows = (blasts || []).filter((b) => !kindFilter || b.kind === kindFilter);
  if (loading) return <p className="ot-note">Loading…</p>;
  if (rows.length === 0) return <p className="ot-empty">Nothing sent yet.</p>;
  return (
    <ul className="ot-list">
      {rows.map((b) => (
        <li key={b.id} className="ot-item">
          <div className="ot-row ot-row--static">
            <span className="ot-row__main">
              <span className="ot-row__name">{b.subject}</span>
              <span className="ot-row__sub">
                {!kindFilter && <span>{KIND_LABEL[b.kind] || b.kind}</span>}
                <span>{b.audience_count} {plural(b.audience_count, 'recipient', 'recipients')}</span>
                <span>{fmtWhen(b.sent_at || b.created_at)}</span>
              </span>
              {b.status !== 'sent' && b.provider_note && <span className="ot-row-note">{b.provider_note}</span>}
            </span>
            <StatusChip status={b.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

// Provider status, said once (lives under More).
function EmailStatus({ configured }) {
  if (configured == null) return null;
  return (
    <p className="ot-pay">
      <span className="ot-status-dot" data-status={configured ? 'sent' : 'queued'} aria-hidden="true" />
      {configured ? 'Email provider connected' : 'No email provider — sends are queued'}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWSLETTER
// ─────────────────────────────────────────────────────────────────────────────
function NewsletterTab({ me, canWrite, creating, onClose, toast }) {
  const queryClient = useQueryClient();
  const slug = me.workspace.slug;
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: () => apiGet('/subscriptions') });
  const blasts = useQuery({ queryKey: ['blasts'], queryFn: () => apiGet('/blasts') });

  const [result, setResult] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [showAll, setShowAll] = useState(false);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    queryClient.invalidateQueries({ queryKey: ['brief'] });
  });

  const list = subs.data?.subscriptions ?? [];
  const subscribed = subs.data?.subscribed ?? null;
  const signupUrl = `${origin()}/n/${slug}`;
  const composing = canWrite && creating;
  const visible = showAll ? list : list.slice(0, 50);
  const emailConfigured = blasts.data?.emailConfigured;

  const add = async (e) => {
    e.preventDefault();
    const res = await act.run('subscription.add', { email: email.trim(), name: name.trim() || undefined });
    if (!res) return;
    toast(`Added ${email.trim()}`);
    setEmail(''); setName('');
  };
  const remove = async (s) => {
    const res = await act.run('subscription.remove', { id: s.id });
    if (res) toast(`Unsubscribed ${s.email}`);
  };
  const resubscribe = async (s) => {
    const res = await act.run('subscription.add', { email: s.email, name: s.name || undefined });
    if (res) toast(`Re-subscribed ${s.email}`);
  };

  return (
    <>
      {composing && (
        <ComposeCard
          kind="newsletter"
          audienceCount={subscribed}
          audienceNoun={{ one: 'subscriber', many: 'subscribers' }}
          emptyReason="No subscribers yet — share the signup page first."
          emailConfigured={emailConfigured}
          onCancel={onClose}
          onSent={(b) => { setResult(b); onClose(); }}
        />
      )}
      <BlastResult blast={result} emailConfigured={emailConfigured} onDismiss={() => setResult(null)} />

      {/* While writing, the count sits next to Send — say it once. */}
      {!composing && (
        <>
          <Big n={subscribed} one="subscriber" many="subscribers" />
          <ul className="ot-list">
            <LinkItem label="Signup page" href={signupUrl} onCopied={copiedToast(toast, 'Signup link')} />
          </ul>
        </>
      )}

      {!composing && <More>
        <EmailStatus configured={emailConfigured} />

        <section className="ot-sec" aria-label="Subscribers">
          <h2 className="ot-sec-h">Subscribers <span className="ot-count">{subs.isPending ? '…' : list.length}</span></h2>
          {subs.isError && <p className="error">{subs.error.message}</p>}
          {list.length === 0 && !subs.isPending && <p className="ot-empty">No subscribers yet.</p>}
          {list.length > 0 && (
            <ul className="ot-list">
              {visible.map((s) => (
                <li key={s.id} className="ot-item" data-tone={s.status !== 'subscribed' ? 'past' : undefined}>
                  <div className="ot-row ot-row--static">
                    <span className="ot-row__main">
                      <span className="ot-row__name ot-email">{s.email}</span>
                      <span className="ot-row__sub">
                        {s.name && <span>{s.name}</span>}
                        {sourceLabel(s.source) && <span>{sourceLabel(s.source)}</span>}
                        <span>{fmtDay(s.created_at)}</span>
                      </span>
                    </span>
                    {s.status !== 'subscribed' && <StatusChip status={s.status} />}
                    {canWrite && (s.status === 'subscribed' ? (
                      <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={() => remove(s)}>Remove</button>
                    ) : (
                      <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={() => resubscribe(s)}>Re-subscribe</button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {list.length > 50 && !showAll && (
            <button type="button" className="btn btn-quiet ot-btn-tap" onClick={() => setShowAll(true)}>Show all {list.length}</button>
          )}
          {canWrite && (
            <form className="ot-inline-add" onSubmit={add}>
              <div className="field">
                <label htmlFor="sub-email">Add — email</label>
                <input id="sub-email" className="input" type="email" required maxLength={320} autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.org" />
              </div>
              <div className="field">
                <label htmlFor="sub-name">Name</label>
                <input id="sub-name" className="input" maxLength={300} value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
              </div>
              <button type="submit" className="btn ot-solid ot-btn-tap" disabled={act.busy || !email.trim()}>Add</button>
              {act.error && <span className="error">{act.error}</span>}
            </form>
          )}
        </section>

        <section className="ot-sec" aria-label="Past sends">
          <h2 className="ot-sec-h">Sent</h2>
          {blasts.isError && <p className="error">{blasts.error.message}</p>}
          <SentList blasts={blasts.data?.blasts} loading={blasts.isPending} />
        </section>
      </More>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESS — releases go to everyone tagged 'media' who has an email
// ─────────────────────────────────────────────────────────────────────────────
function PressTab({ canWrite, creating, onClose }) {
  const blasts = useQuery({ queryKey: ['blasts'], queryFn: () => apiGet('/blasts') });
  const media = blasts.data?.mediaContacts ?? null;
  const emailConfigured = blasts.data?.emailConfigured;
  const [result, setResult] = useState(null);
  const composing = canWrite && creating;

  return (
    <>
      {composing && (
        <ComposeCard
          kind="press"
          audienceCount={media}
          audienceNoun={{ one: 'media contact', many: 'media contacts' }}
          emptyReason="Tag reporters “media” in People first."
          emailConfigured={emailConfigured}
          onCancel={onClose}
          onSent={(b) => { setResult(b); onClose(); }}
        />
      )}
      <BlastResult blast={result} emailConfigured={emailConfigured} onDismiss={() => setResult(null)} />

      {!composing && (
        <>
          <Big n={media} one="media contact" many="media contacts" />
          <div className="ot-actions">
            <Link className="btn ot-btn-tap" to="/people?tag=media">Media list</Link>
          </div>
        </>
      )}

      {!composing && <More>
        <EmailStatus configured={emailConfigured} />
        {canWrite && (
          <div className="ot-actions">
            <Link className="btn ot-btn-tap" to="/people?new=1">Add a contact</Link>
          </div>
        )}
        <section className="ot-sec" aria-label="Past press releases">
          <h2 className="ot-sec-h">Sent</h2>
          {blasts.isError && <p className="error">{blasts.error.message}</p>}
          <SentList blasts={blasts.data?.blasts} loading={blasts.isPending} kindFilter="press" />
        </section>
      </More>}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PETITIONS
// ─────────────────────────────────────────────────────────────────────────────
const telHref = (p) => `tel:${String(p).replace(/[^\d+]/g, '')}`;

function Signatures({ petitionId }) {
  const q = useQuery({
    queryKey: ['petition-signatures', petitionId],
    queryFn: () => apiGet(`/petitions/${petitionId}/signatures`),
  });
  const rows = q.data?.signatures ?? [];
  if (q.isPending) return <p className="ot-note">Loading…</p>;
  if (q.isError) return <p className="error">{q.error.message}</p>;
  if (rows.length === 0) return <p className="ot-empty">No signatures yet.</p>;
  return (
    <ul className="ot-list ot-list--flat">
      {rows.map((s) => (
        <li key={s.id} className="ot-sig">
          <span className="ot-sig__name">
            {s.name}
            {s.subscribe ? <span className="chip ot-chip-ghost" title="Opted into the newsletter">news</span> : null}
          </span>
          <span className="ot-row__sub">
            {s.email && <a className="ot-email" href={`mailto:${s.email}`}>{s.email}</a>}
            {s.phone && <a className="ot-email" href={telHref(s.phone)}>{s.phone}</a>}
            <span>{fmtDay(s.created_at)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PetitionRow({ p, slug, canWrite, toast }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [sigs, setSigs] = useState(false);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['petitions'] });
  });
  const url = `${origin()}/p/${slug}/${p.slug}`;
  const toggle = async () => {
    const res = await act.run('petition.update', { id: p.id, active: !p.active });
    if (res) toast(p.active ? `“${p.title}” closed` : `“${p.title}” is open again`);
  };
  return (
    <li className="ot-item" data-open={open ? '' : undefined} data-tone={p.active ? undefined : 'past'}>
      <div className="ot-line">
        <button type="button" className="ot-row" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="ot-row__main">
            <span className="ot-row__name">{p.title}</span>
            <span className="ot-row__sub">
              <span><strong className="ot-num">{p.signatures}</strong> {plural(p.signatures, 'signature', 'signatures')}</span>
              {!p.active && <span className="chip ot-chip-ghost">closed</span>}
            </span>
          </span>
        </button>
        {p.active && <CopyButton text={url} what={`link to ${p.title}`} onCopied={copiedToast(toast, 'Petition link')} />}
      </div>
      {open && (
        <div className="ot-body">
          {p.body && <p className="ot-text">{p.body}</p>}
          <a className="ot-url" href={url} target="_blank" rel="noreferrer">{url}</a>
          {canWrite && (
            <div className="ot-actions">
              <button type="button" className="btn ot-btn-tap" aria-expanded={sigs} onClick={() => setSigs((o) => !o)}>
                Signatures
              </button>
              <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={toggle}>
                {p.active ? 'Close petition' : 'Reopen'}
              </button>
            </div>
          )}
          {act.error && <p className="error">{act.error}</p>}
          {sigs && canWrite && <Signatures petitionId={p.id} />}
        </div>
      )}
    </li>
  );
}

function NewPetitionForm({ wsSlug, onCreated, onCancel }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [body, setBody] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['petitions'] });
  });
  const onTitle = (v) => { setTitle(v); if (!slugTouched) setSlug(slugify(v)); };
  const cleanSlug = slug.replace(/^-+|-+$/g, '');
  const slugOk = /^[a-z0-9-]{2,60}$/.test(cleanSlug);
  // The link is made from the title; it only needs a look when it can't be
  // (a one-letter title) or the server refused it (already taken).
  const showLink = linkOpen || (title.trim() && !slugOk) || Boolean(act.error);

  const submit = async (e) => {
    e.preventDefault();
    const res = await act.run('petition.create', { slug: cleanSlug, title: title.trim(), body: body.trim() || undefined });
    if (!res) return;
    onCreated?.(res.petition);
  };

  return (
    <form className="card ot-compose" onSubmit={submit}>
      <div className="field">
        <label htmlFor="pet-title">Title</label>
        <input id="pet-title" className="input" required maxLength={300} value={title} autoFocus
          onChange={(e) => onTitle(e.target.value)} placeholder="Bring SkyTrain to Newton" />
      </div>
      <div className="field">
        <label htmlFor="pet-body">What are you asking for?</label>
        <textarea id="pet-body" className="input" rows={4} maxLength={8000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Surrey deserves rapid transit south of 72nd." />
      </div>
      <button type="button" className="ot-more" aria-expanded={Boolean(showLink)} aria-controls="pet-link" onClick={() => setLinkOpen((o) => !o)}>
        Link
      </button>
      {showLink && (
        <div id="pet-link" className="field">
          <label htmlFor="pet-slug" className="ot-sr">Link</label>
          <input id="pet-slug" className="input mono" required value={slug} pattern="[a-z0-9\-]{2,60}"
            autoCapitalize="none" spellCheck={false}
            onChange={(e) => { setSlugTouched(true); setSlug(slugInput(e.target.value)); }}
            onBlur={() => setSlug((v) => v.replace(/^-+|-+$/g, ''))}
            placeholder="skytrain-to-newton" aria-describedby="pet-slug-hint" />
          <span id="pet-slug-hint" className="ot-hint">/p/{wsSlug}/{cleanSlug || '…'}</span>
        </div>
      )}
      {act.error && <p className="error">{act.error}</p>}
      <div className="ot-actions">
        <button type="submit" className="btn btn-primary ot-btn-tap" disabled={act.busy || !title.trim() || !slugOk}>Create petition</button>
        <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function PetitionsTab({ me, canWrite, creating, onClose, toast }) {
  const pets = useQuery({ queryKey: ['petitions'], queryFn: () => apiGet('/petitions') });
  const slug = pets.data?.slug || me.workspace.slug;
  const rows = pets.data?.petitions ?? [];
  const totalSigs = rows.reduce((n, p) => n + (p.signatures || 0), 0);
  const openCount = rows.filter((p) => p.active).length;

  return (
    <>
      {canWrite && creating && (
        <NewPetitionForm wsSlug={slug} onCancel={onClose} onCreated={(p) => { onClose(); toast(`“${p.title}” is live`); }} />
      )}
      {pets.isError && <p className="error">{pets.error.message}</p>}
      {rows.length > 0 && (
        <ul className="ot-list">
          {rows.map((p) => <PetitionRow key={p.id} p={p} slug={slug} canWrite={canWrite} toast={toast} />)}
        </ul>
      )}
      {rows.length === 0 && !pets.isPending && <p className="ot-empty">No petitions yet.</p>}

      {canWrite && rows.length > 0 && (
        <More>
          <p className="ot-big ot-big--sm">
            <span className="n">{totalSigs}</span>
            <span className="lbl">{plural(totalSigs, 'signature', 'signatures')} · {openCount} open</span>
          </p>
          <div className="ot-actions">
            <Link className="btn ot-btn-tap" to="/people?tag=petition">Signers in People</Link>
          </div>
        </More>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS — public RSVP pages, the door list, check-in afterwards
// ─────────────────────────────────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');

// <input type="datetime-local"> speaks wall-clock time with no zone; the API
// wants ISO. Attach this browser's offset for that date (DST-safe), so
// "6:30 pm" means 6:30 pm here.
const localInputToISO = (v) => {
  if (!v) return null;
  const s = v.length === 16 ? `${v}:00` : v.slice(0, 19);
  const d = new Date(s); // no zone → parsed as local time
  if (Number.isNaN(d.getTime())) return null;
  const off = -d.getTimezoneOffset();
  const a = Math.abs(off);
  return `${s}${off >= 0 ? '+' : '-'}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
};
const isoToLocalInput = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const evDay = (d) => d.toLocaleDateString('en-CA', {
  weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }),
});
const evTime = (d) => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const fmtEventWhen = (starts, ends) => {
  const a = new Date(starts);
  if (Number.isNaN(a.getTime())) return '—';
  const b = ends ? new Date(ends) : null;
  if (!b || Number.isNaN(b.getTime())) return `${evDay(a)} · ${evTime(a)}`;
  if (a.toDateString() === b.toDateString()) return `${evDay(a)} · ${evTime(a)}–${evTime(b)}`;
  return `${evDay(a)} ${evTime(a)} – ${evDay(b)} ${evTime(b)}`;
};
// Row version: day + start time only.
const fmtEventStart = (starts) => {
  const a = new Date(starts);
  return Number.isNaN(a.getTime()) ? '—' : `${evDay(a)} · ${evTime(a)}`;
};

// Upcoming = hasn't started yet, or is still running (ends later). The public
// page closes RSVPs at the start time either way.
const isUpcoming = (e, now = Date.now()) =>
  new Date(e.starts_at).getTime() >= now || (e.ends_at && new Date(e.ends_at).getTime() >= now);

// A small "Today / Tomorrow / In 3 days / On now" marker for upcoming events.
const soonLabel = (e, now = Date.now()) => {
  const start = new Date(e.starts_at);
  if (start.getTime() < now) return 'On now';
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const that = new Date(start); that.setHours(0, 0, 0, 0);
  const days = Math.round((that - today) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days <= 14) return `In ${days} days`;
  return null;
};

const RSVP_STATUSES = [
  { code: 'going', label: 'Going' },
  { code: 'attended', label: 'Attended' },
  { code: 'cancelled', label: 'Cancelled' },
];

// The row says how many are going; opened, the event shows how full it is
// and (afterwards) how many came.
function CapacityMeter({ going, capacity, attended }) {
  if (!capacity && !attended) return null;
  const full = capacity && going >= capacity;
  const pct = capacity ? Math.min(100, Math.round((going / capacity) * 100)) : 0;
  return (
    <div className="ot-meter" data-full={full ? 'true' : 'false'}>
      {capacity ? <div className="ot-meter-bar" role="img" aria-label={`${going} of ${capacity} places taken`}><span style={{ width: `${pct}%` }} /></div> : null}
      {attended > 0 && <div className="ot-meter-n"><strong>{attended}</strong><span className="lbl">came</span></div>}
    </div>
  );
}

function RsvpList({ eventId, canWrite }) {
  const queryClient = useQueryClient();
  const key = ['rsvps', eventId];
  const q = useQuery({ queryKey: key, queryFn: () => apiGet(`/campaign-events/${eventId}/rsvps`) });
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);
  const rows = q.data?.rsvps ?? [];

  const setStatus = async (r, status) => {
    if (status === r.status) return;
    setBusyId(r.id);
    setError(null);
    // A refetch already in flight would land after this and undo the pick.
    await queryClient.cancelQueries({ queryKey: key });
    queryClient.setQueryData(key, (d) => d && { ...d, rsvps: d.rsvps.map((x) => (x.id === r.id ? { ...x, status } : x)) });
    try {
      await action('rsvp.setStatus', { id: r.id, status });
    } catch (e) {
      setError(`${r.name}: ${e.message}`);
    } finally {
      setBusyId(null);
      queryClient.invalidateQueries({ queryKey: key });
      queryClient.invalidateQueries({ queryKey: ['campaign-events'] });
      queryClient.invalidateQueries({ queryKey: ['brief'] });
    }
  };

  if (q.isPending) return <p className="ot-note">Loading…</p>;
  if (q.isError) return <p className="error">{q.error.message}</p>;
  if (rows.length === 0) return <p className="ot-empty">No RSVPs yet.</p>;

  // Head counts include guests.
  const heads = (s) => rows.filter((r) => r.status === s).reduce((n, r) => n + 1 + (r.guests || 0), 0);
  return (
    <>
      <p className="ot-rsvp-sum">
        <span><strong>{rows.length}</strong> {plural(rows.length, 'RSVP', 'RSVPs')}</span>
        <span>{heads('going')} going</span>
        <span>{heads('attended')} came</span>
        {heads('cancelled') > 0 && <span>{heads('cancelled')} cancelled</span>}
      </p>
      <ul className="ot-rsvps">
        {rows.map((r) => (
          <li key={r.id} className="ot-rsvp" data-status={r.status}>
            <div className="who">
              <span className="name">
                {r.person_id ? <Link to={`/people/${r.person_id}`}>{r.name}</Link> : r.name}
                {r.guests > 0 && <span className="guests"> +{r.guests}</span>}
              </span>
              <span className="contact">
                {r.email && <a className="ot-email" href={`mailto:${r.email}`}>{r.email}</a>}
                {r.phone && <a className="ot-email" href={telHref(r.phone)}>{r.phone}</a>}
                <span className="when">{fmtDay(r.created_at)}</span>
              </span>
            </div>
            {canWrite ? (
              <select
                className="input ot-rsvp-status"
                aria-label={`Status for ${r.name}`}
                value={r.status}
                disabled={busyId === r.id}
                onChange={(e) => setStatus(r, e.target.value)}
              >
                {RSVP_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
              </select>
            ) : (
              <StatusChip status={r.status} />
            )}
          </li>
        ))}
      </ul>
      {error && <p className="error">{error}</p>}
    </>
  );
}

// New or edit. Title, when, where up front; end time, how many people,
// description, public page and the link sit under "More details".
function EventForm({ ev, wsSlug, onDone, onCancel }) {
  const queryClient = useQueryClient();
  const editing = !!ev;
  const [title, setTitle] = useState(ev?.title || '');
  const [slug, setSlug] = useState(ev?.slug || '');
  const [slugTouched, setSlugTouched] = useState(editing);
  const [starts, setStarts] = useState(isoToLocalInput(ev?.starts_at));
  const [ends, setEnds] = useState(isoToLocalInput(ev?.ends_at));
  const [location, setLocation] = useState(ev?.location || '');
  const [capacity, setCapacity] = useState(ev?.capacity ? String(ev.capacity) : '');
  const [description, setDescription] = useState(ev?.description || '');
  const [isPublic, setIsPublic] = useState(ev ? !!ev.public : true);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const idp = editing ? `ev-${ev.id.slice(0, 8)}` : 'ev-new';

  const onTitle = (v) => { setTitle(v); if (!slugTouched) setSlug(slugify(v)); };
  const cleanSlug = slug.replace(/^-+|-+$/g, '');
  const slugOk = /^[a-z0-9-]{2,60}$/.test(cleanSlug);
  // Open "More details" by itself when what's wrong is in there.
  const showMore = more || (!editing && title.trim() && !slugOk) || Boolean(error);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const startsISO = localInputToISO(starts);
    if (!startsISO) { setError('Pick a start date and time.'); return; }
    const endsISO = ends ? localInputToISO(ends) : null;
    if (endsISO && new Date(endsISO) <= new Date(startsISO)) { setError('The end has to be after the start.'); return; }
    if (editing && ev.ends_at && !endsISO) { setError('An end time can’t be removed — change it instead.'); return; }
    const capText = capacity.trim();
    const cap = capText ? Number(capText) : null;
    if (capText && (!Number.isInteger(cap) || cap < 1)) { setError('How many people: a whole number, or blank for no limit.'); return; }
    if (editing && ev.capacity && cap == null) { setError('The limit can’t be removed — enter a larger number.'); return; }

    const input = editing
      ? {
          id: ev.id,
          title: title.trim(),
          description: description.trim(),
          location: location.trim(),
          starts_at: startsISO,
          ends_at: endsISO || undefined,
          capacity: cap ?? undefined,
          public: isPublic,
        }
      : {
          slug: cleanSlug,
          title: title.trim(),
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          starts_at: startsISO,
          ends_at: endsISO || undefined,
          capacity: cap ?? undefined,
          public: isPublic,
        };
    setBusy(true);
    try {
      const res = await action(editing ? 'cevent.update' : 'cevent.create', input);
      queryClient.invalidateQueries({ queryKey: ['campaign-events'] });
      queryClient.invalidateQueries({ queryKey: ['brief'] });
      onDone?.(res, input);
    } catch (err) {
      setError(err.status === 409 ? `${err.message} — change the link and try again.` : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={editing ? 'ot-event-form' : 'card ot-compose ot-event-form'} onSubmit={submit}>
      <div className="field">
        <label htmlFor={`${idp}-title`}>Title</label>
        <input id={`${idp}-title`} className="input" required maxLength={300} value={title} autoFocus={!editing}
          onChange={(e) => onTitle(e.target.value)} placeholder="Town hall: transit in Newton" />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-starts`}>Starts</label>
        <input id={`${idp}-starts`} className="input mono" type="datetime-local" required value={starts}
          onChange={(e) => setStarts(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-loc`}>Where</label>
        <input id={`${idp}-loc`} className="input" maxLength={400} value={location}
          onChange={(e) => setLocation(e.target.value)} placeholder="Newton Recreation Centre, 13730 72 Ave" />
      </div>

      <button type="button" className="ot-more" aria-expanded={Boolean(showMore)} aria-controls={`${idp}-more`}
        onClick={() => setMore((v) => !v)}>
        More details
      </button>
      {showMore && (
        <div id={`${idp}-more`} className="ot-more-body">
          <div className="field">
            <label htmlFor={`${idp}-ends`}>Ends</label>
            <input id={`${idp}-ends`} className="input mono" type="datetime-local" value={ends} min={starts || undefined}
              onChange={(e) => setEnds(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor={`${idp}-cap`}>How many people</label>
            <input id={`${idp}-cap`} className="input mono" inputMode="numeric" value={capacity}
              onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))} placeholder="No limit" />
          </div>
          <div className="field">
            <label htmlFor={`${idp}-desc`}>Description</label>
            <textarea id={`${idp}-desc`} className="input" rows={3} maxLength={8000} value={description}
              onChange={(e) => setDescription(e.target.value)} placeholder="What it is, who should come, what to bring." />
          </div>
          <label className="ot-check" htmlFor={`${idp}-public`}>
            <input id={`${idp}-public`} type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
            <span>Public RSVP page</span>
          </label>
          {editing ? (
            <p className="ot-hint">Link: /e/{wsSlug}/{ev.slug}</p>
          ) : (
            <div className="field">
              <label htmlFor={`${idp}-slug`}>Link</label>
              <input id={`${idp}-slug`} className="input mono" required value={slug} pattern="[a-z0-9\-]{2,60}"
                autoCapitalize="none" spellCheck={false}
                onChange={(e) => { setSlugTouched(true); setSlug(slugInput(e.target.value)); }}
                onBlur={() => setSlug((v) => v.replace(/^-+|-+$/g, ''))}
                placeholder="newton-town-hall" aria-describedby={`${idp}-slug-hint`} />
              <span id={`${idp}-slug-hint`} className="ot-hint">/e/{wsSlug}/{cleanSlug || '…'}</span>
            </div>
          )}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="ot-actions">
        <button type="submit" className={`btn ot-btn-tap ${editing ? 'ot-solid' : 'btn-primary'}`} disabled={busy || !title.trim() || !starts || (!editing && !slugOk)}>
          {busy ? 'Saving…' : editing ? 'Save' : 'Create event'}
        </button>
        <button type="button" className="btn btn-quiet ot-btn-tap" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EventRow({ ev, wsSlug, canWrite, toast, past }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rsvps, setRsvps] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['campaign-events'] });
    queryClient.invalidateQueries({ queryKey: ['brief'] });
  });
  const url = `${origin()}/e/${wsSlug}/${ev.slug}`;
  const soon = past ? null : soonLabel(ev);
  const going = ev.going || 0;

  const remove = async () => {
    const res = await act.run('cevent.delete', { id: ev.id });
    if (!res) return;
    queryClient.removeQueries({ queryKey: ['rsvps', ev.id] });
    toast(`Deleted “${ev.title}”`);
  };

  return (
    <li className="ot-item" data-open={open ? '' : undefined} data-tone={past ? 'past' : undefined}>
      <div className="ot-line">
        <button type="button" className="ot-row" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="ot-row__main">
            <span className="ot-row__name">{ev.title}</span>
            <span className="ot-row__sub">
              {soon && <span className="chip ot-chip-soon">{soon}</span>}
              <span>{fmtEventStart(ev.starts_at)}</span>
            </span>
            <span className="ot-row__sub">
              <span><strong className="ot-num">{going}</strong>{ev.capacity ? `/${ev.capacity}` : ''} {past ? 'said yes' : 'going'}</span>
              {!past && ev.capacity && going >= ev.capacity ? <span className="chip chip-danger">full</span> : null}
            </span>
          </span>
        </button>
        {ev.public && !past && <CopyButton text={url} what={`RSVP link for ${ev.title}`} onCopied={copiedToast(toast, 'Event link')} />}
      </div>

      {open && (
        <div className="ot-body">
          {editing ? (
            <EventForm
              ev={ev}
              wsSlug={wsSlug}
              onCancel={() => setEditing(false)}
              onDone={(res, input) => { setEditing(false); toast(`Saved “${input.title}”`); }}
            />
          ) : (
            <>
              <CapacityMeter going={going} capacity={ev.capacity} attended={ev.attended || 0} />
              {ev.ends_at && <p className="ot-row__sub">{fmtEventWhen(ev.starts_at, ev.ends_at)}</p>}
              {ev.location && <p className="ot-where">{ev.location}</p>}
              {ev.description && <p className="ot-text">{ev.description}</p>}
              {ev.public && !past && <a className="ot-url" href={url} target="_blank" rel="noreferrer">{url}</a>}
              {!ev.public && <span><span className="chip ot-chip-ghost">team only</span></span>}
              {canWrite && (confirmDelete ? (
                <div className="ot-confirm ot-confirm-danger" role="group" aria-label="Confirm delete">
                  <span>Delete this event?</span>
                  <button type="button" className="btn ot-btn-tap ot-btn-danger" disabled={act.busy} onClick={remove}>
                    {act.busy ? 'Deleting…' : 'Yes, delete'}
                  </button>
                  <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={() => setConfirmDelete(false)}>No</button>
                </div>
              ) : (
                <div className="ot-actions">
                  <button type="button" className="btn ot-btn-tap" aria-expanded={rsvps} onClick={() => setRsvps((o) => !o)}>
                    {past ? 'Check-in' : 'RSVPs'}
                  </button>
                  <button type="button" className="btn btn-quiet ot-btn-tap" onClick={() => { setEditing(true); setRsvps(false); }}>Edit</button>
                  <button type="button" className="btn btn-quiet ot-btn-tap" onClick={() => setConfirmDelete(true)}>Delete</button>
                </div>
              ))}
              {act.error && <p className="error">{act.error}</p>}
              {rsvps && canWrite && <RsvpList eventId={ev.id} canWrite={canWrite} />}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function EventsTab({ me, canWrite, creating, onClose, toast }) {
  const evq = useQuery({ queryKey: ['campaign-events'], queryFn: () => apiGet('/campaign-events') });
  const [showAllPast, setShowAllPast] = useState(false);
  const wsSlug = evq.data?.slug || me.workspace.slug;
  const events = evq.data?.events ?? [];
  const now = Date.now();
  const upcoming = events.filter((e) => isUpcoming(e, now));
  const past = events.filter((e) => !isUpcoming(e, now)).reverse(); // most recent first
  const pastShown = showAllPast ? past : past.slice(0, 5);

  return (
    <>
      {canWrite && creating && (
        <EventForm
          wsSlug={wsSlug}
          onCancel={onClose}
          onDone={(res) => { onClose(); toast(`“${res.event.title}” is on the calendar`); }}
        />
      )}
      {evq.isError && <p className="error">{evq.error.message}</p>}
      {upcoming.length > 0 && (
        <ul className="ot-list">
          {upcoming.map((e) => <EventRow key={e.id} ev={e} wsSlug={wsSlug} canWrite={canWrite} toast={toast} />)}
        </ul>
      )}
      {upcoming.length === 0 && !evq.isPending && <p className="ot-empty">Nothing coming up.</p>}

      {(past.length > 0 || canWrite) && (
        <More>
          {past.length > 0 && (
            <section className="ot-sec" aria-label="Past events">
              <h2 className="ot-sec-h">Past <span className="ot-count">{past.length}</span></h2>
              <ul className="ot-list">
                {pastShown.map((e) => <EventRow key={e.id} ev={e} wsSlug={wsSlug} canWrite={canWrite} toast={toast} past />)}
              </ul>
              {past.length > pastShown.length && (
                <button type="button" className="btn btn-quiet ot-btn-tap" onClick={() => setShowAllPast(true)}>Show all {past.length}</button>
              )}
            </section>
          )}
          {canWrite && (
            <div className="ot-actions">
              <Link className="btn ot-btn-tap" to="/people?tag=event">RSVPs in People</Link>
            </div>
          )}
        </More>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSITE — every public page, ready to copy; embed code for the developer
// ─────────────────────────────────────────────────────────────────────────────
const snippetNewsletter = (endpoint) => `<!-- Newsletter signup → Starbase -->
<form id="sb-newsletter">
  <input name="name" placeholder="Your name">
  <input name="email" type="email" placeholder="Email" required>
  <button type="submit">Sign up</button>
  <p class="sb-msg"></p>
</form>
<script>
  document.getElementById('sb-newsletter').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    let ok = false;
    try {
      const r = await fetch('${endpoint}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'newsletter', name: f.get('name'), email: f.get('email') }),
      });
      ok = r.ok;
    } catch {}
    form.querySelector('.sb-msg').textContent = ok
      ? 'Thanks — you are on the list.'
      : 'Something went wrong. Please try again.';
    if (ok) form.reset();
  });
</script>`;

const snippetVolunteer = (endpoint) => `<!-- Volunteer signup → Starbase -->
<form id="sb-volunteer">
  <input name="name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" type="tel" placeholder="Phone">
  <select name="roles" multiple size="6">
${VOLUNTEER_ROLES.map((r) => `    <option value="${r.code}">${r.label}</option>`).join('\n')}
  </select>
${VOLUNTEER_ROLES.filter((r) => r.detail).map((r) => `  <input name="detail_${r.code}" placeholder="${r.label}: ${r.detail}">`).join('\n')}
  <textarea name="note" placeholder="Anything else? (when you're free)"></textarea>
  <button type="submit">Count me in</button>
  <p class="sb-msg"></p>
</form>
<script>
  document.getElementById('sb-volunteer').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    let ok = false;
    try {
      const r = await fetch('${endpoint}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'volunteer',
          name: f.get('name'), email: f.get('email'), phone: f.get('phone'),
          roles: f.getAll('roles'), note: f.get('note'),
${VOLUNTEER_ROLES.filter((r) => r.detail).map((r) => `          detail_${r.code}: f.get('detail_${r.code}'),`).join('\n')}
        }),
      });
      ok = r.ok;
    } catch {}
    form.querySelector('.sb-msg').textContent = ok
      ? 'Thank you — we will be in touch.'
      : 'Something went wrong. Please try again.';
    if (ok) form.reset();
  });
</script>`;

const snippetRsvp = (endpoint, eventSlug) => `<!-- Event RSVP → Starbase -->
<form id="sb-rsvp">
  <input name="name" placeholder="Your name" required>
  <input name="email" type="email" placeholder="Email">
  <input name="phone" type="tel" placeholder="Phone">
  <select name="guests">
    <option value="0">Just me</option>
${[1, 2, 3, 4, 5].map((n) => `    <option value="${n}">+${n} ${n === 1 ? 'guest' : 'guests'}</option>`).join('\n')}
  </select>
  <button type="submit">RSVP</button>
  <p class="sb-msg"></p>
</form>
<script>
  document.getElementById('sb-rsvp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target, f = new FormData(form);
    let status = 0;
    try {
      const r = await fetch('${endpoint}', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'rsvp', event: '${eventSlug}',
          name: f.get('name'), email: f.get('email'), phone: f.get('phone'),
          guests: Number(f.get('guests')) || 0,
        }),
      });
      status = r.status;
    } catch {}
    form.querySelector('.sb-msg').textContent = status === 200
      ? 'You are in — see you there.'
      : status === 409 ? 'Sorry — this event is full.'
      : status === 404 ? 'RSVPs for this event are closed.'
      : 'Something went wrong. Please try again.';
    if (status === 200) form.reset();
  });
</script>`;

const DEFAULT_DONATE_NOTE = 'Pledge now and the campaign will contact you to complete your contribution by e-transfer or cheque.';

// Donations settings (under More): card payments on/off, open pledges, and
// the instructions donors see while cards are off. Desk roles only.
function DonationsSettings({ me, toast }) {
  const queryClient = useQueryClient();
  const isManager = me.role === 'manager';
  const current = me.workspace.settings?.donateInstructions || '';
  const [text, setText] = useState(current);
  useEffect(() => { setText(current); }, [current]);
  // /api/pledges is desk-only; it also says whether Stripe is connected.
  const pledges = useQuery({ queryKey: ['pledges'], queryFn: () => apiGet('/pledges') });
  const stripe = pledges.data?.stripe;
  const open = (pledges.data?.pledges ?? []).filter((p) => p.status === 'pledged' || p.status === 'pending');
  const openCents = open.reduce((n, p) => n + (p.amount_cents || 0), 0);
  const act = useAction(() => queryClient.invalidateQueries({ queryKey: ['me'] }));

  const save = async (e) => {
    e.preventDefault();
    const v = text.trim();
    const res = await act.run('workspace.update', { donate_instructions: v });
    if (!res) return;
    setText(v);
    toast(v ? 'Donation instructions saved' : 'Donation instructions cleared');
  };

  return (
    <section className="ot-sec" aria-label="Donations">
      <h2 className="ot-sec-h">Donations</h2>
      <p className="ot-pay" data-on={stripe ? 'true' : 'false'}>
        <span className="ot-status-dot" data-status={stripe ? 'sent' : pledges.isPending ? undefined : 'queued'} aria-hidden="true" />
        {pledges.isPending ? 'Checking card payments…'
          : pledges.isError ? <span className="error">{pledges.error.message}</span>
          : stripe ? 'Card payments on (Stripe)'
          : 'Pledges only — connect Stripe to take cards'}
      </p>
      {open.length > 0 && (
        <div className="ot-actions">
          <Link className="btn ot-btn-tap" to="/money">{open.length} open {plural(open.length, 'pledge', 'pledges')} · {fmtMoney(openCents)}</Link>
        </div>
      )}
      {pledges.isSuccess && !stripe && (isManager ? (
        <form onSubmit={save}>
          <div className="field">
            <label htmlFor="ws-donate-note">How to pay (shown to donors)</label>
            <textarea id="ws-donate-note" className="input" rows={3} maxLength={2000} value={text}
              onChange={(e) => setText(e.target.value)} placeholder={DEFAULT_DONATE_NOTE} />
          </div>
          <div className="ot-actions">
            <button type="submit" className="btn ot-solid ot-btn-tap" disabled={act.busy || text.trim() === current}>
              {act.busy ? 'Saving…' : 'Save'}
            </button>
            {act.error && <span className="error">{act.error}</span>}
          </div>
        </form>
      ) : (
        <p className="ot-text">{current || DEFAULT_DONATE_NOTE}</p>
      ))}
    </section>
  );
}

// The campaign's own site: public pages link back to it. Managers set it.
function SiteSettings({ toast, current }) {
  const queryClient = useQueryClient();
  const [site, setSite] = useState(current);
  const act = useAction(() => queryClient.invalidateQueries({ queryKey: ['me'] }));
  useEffect(() => { setSite(current); }, [current]);
  // Accept a bare domain ("imaginesurrey.ca") and store a real link.
  const normalized = (() => {
    const v = site.trim();
    return v && !/^https?:\/\//i.test(v) ? `https://${v}` : v;
  })();
  const save = async (e) => {
    e.preventDefault();
    const v = normalized;
    const res = await act.run('workspace.update', { website: v });
    if (!res) return;
    setSite(v);
    toast(v ? 'Website saved' : 'Website cleared');
  };
  return (
    <form className="ot-inline-add ot-sec" onSubmit={save}>
      <div className="field">
        <label htmlFor="ws-site">Campaign website</label>
        <input id="ws-site" className="input mono" type="text" inputMode="url" autoComplete="url"
          autoCapitalize="none" spellCheck={false} value={site} maxLength={500}
          onChange={(e) => setSite(e.target.value)} placeholder="https://imaginesurrey.ca" />
      </div>
      <button type="submit" className="btn ot-solid ot-btn-tap" disabled={act.busy || normalized === current}>
        {act.busy ? 'Saving…' : 'Save'}
      </button>
      {act.error && <span className="error">{act.error}</span>}
    </form>
  );
}

// Embed code for the campaign site's own forms. Lives behind one tap.
function DeveloperKit({ base, slug, openEvents, copied }) {
  const [snippet, setSnippet] = useState('newsletter');
  const [rsvpEvent, setRsvpEvent] = useState('');
  const endpoint = `${base}/api/public/${slug}/signup`;
  const rsvpSlug = openEvents.some((e) => e.slug === rsvpEvent) ? rsvpEvent : (openEvents[0]?.slug || '<event-link>');
  const code = snippet === 'volunteer' ? snippetVolunteer(endpoint)
    : snippet === 'rsvp' ? snippetRsvp(endpoint, rsvpSlug)
    : snippetNewsletter(endpoint);
  return (
    <>
      <ul className="ot-dev-links">
        <li><span className="eyebrow">Volunteer</span> <code>{base}/v/{slug}</code></li>
        <li><span className="eyebrow">Newsletter</span> <code>{base}/n/{slug}</code></li>
        <li><span className="eyebrow">Donate</span> <code>{base}/d/{slug}</code></li>
        <li><span className="eyebrow">Form endpoint</span> <code>{endpoint}</code></li>
      </ul>
      <div className="ot-seg" role="group" aria-label="Embed code">
        <button type="button" aria-pressed={snippet === 'newsletter'} onClick={() => setSnippet('newsletter')}>Newsletter</button>
        <button type="button" aria-pressed={snippet === 'volunteer'} onClick={() => setSnippet('volunteer')}>Volunteer</button>
        <button type="button" aria-pressed={snippet === 'rsvp'} onClick={() => setSnippet('rsvp')}>RSVP</button>
      </div>
      <p className="ot-note">Posts JSON from any domain. Keep your site’s design.</p>
      {snippet === 'rsvp' && (
        openEvents.length > 0 ? (
          <div className="field ot-snippet-event">
            <label htmlFor="snip-event">Event</label>
            <select id="snip-event" className="input" value={rsvpSlug} onChange={(e) => setRsvpEvent(e.target.value)}>
              {openEvents.map((e) => <option key={e.id} value={e.slug}>{e.title} — {fmtEventWhen(e.starts_at, e.ends_at)}</option>)}
            </select>
          </div>
        ) : (
          <p className="ot-note">No public events yet — replace <code>&lt;event-link&gt;</code> with one.</p>
        )
      )}
      <div className="ot-pre-wrap">
        <CopyButton text={code} label="Copy code" onCopied={copied} />
        <pre className="ot-pre"><code>{code}</code></pre>
      </div>
      <p className="ot-note">
        Petitions: <code>{`{ kind: 'petition', petition: '<slug>', name, email, subscribe: true }`}</code>.
        RSVPs: <code>{`{ kind: 'rsvp', event: '<event-slug>', name, email, phone, guests }`}</code>.
      </p>
    </>
  );
}

function WebsiteTab({ me, canWrite, toast }) {
  const isManager = me.role === 'manager';
  const slug = me.workspace.slug;
  const site = me.workspace.settings?.website || '';
  const pets = useQuery({ queryKey: ['petitions'], queryFn: () => apiGet('/petitions') });
  const evq = useQuery({ queryKey: ['campaign-events'], queryFn: () => apiGet('/campaign-events') });

  const base = origin();
  const petitions = pets.data?.petitions ?? [];
  // Only public events that haven't started take RSVPs.
  const openEvents = (evq.data?.events ?? []).filter((e) => e.public && new Date(e.starts_at).getTime() >= Date.now());
  const copied = (ok) => toast(ok ? 'Copied' : 'Could not copy — open the link and copy it from there');

  return (
    <>
      <ul className="ot-list">
        {/^https?:\/\//i.test(site) && <LinkItem label="Campaign website" href={site} onCopied={copied} />}
        <LinkItem label="Volunteer signup" href={`${base}/v/${slug}`} onCopied={copied} />
        <LinkItem label="Newsletter signup" href={`${base}/n/${slug}`} onCopied={copied} />
        <LinkItem label="Donate" href={`${base}/d/${slug}`} onCopied={copied} />
        {petitions.map((p) => (
          <LinkItem key={p.id} label={p.title} sub={p.active ? 'Petition' : 'Petition · closed'}
            href={`${base}/p/${slug}/${p.slug}`} onCopied={copied} />
        ))}
        {openEvents.map((e) => (
          <LinkItem key={e.id} label={e.title} sub={`Event · ${fmtEventStart(e.starts_at)}`}
            href={`${base}/e/${slug}/${e.slug}`} onCopied={copied} />
        ))}
      </ul>

      {canWrite && (
        <More>
          {isManager ? (
            <SiteSettings toast={toast} current={site} />
          ) : (
            !site && <p className="ot-note">No campaign website yet — a manager can add it.</p>
          )}
          <DonationsSettings me={me} toast={toast} />
        </More>
      )}
      <More label="For your web developer">
        <DeveloperKit base={base} slug={slug} openEvents={openEvents} copied={copied} />
      </More>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The screen
// ─────────────────────────────────────────────────────────────────────────────
export default function Outreach() {
  const { me } = useOutletContext();
  const { tab } = useParams();
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const canWrite = DESK_ROLES.includes(me.role);
  const tabs = canWrite ? TABS : TABS.filter((t) => VOLUNTEER_TABS.has(t.key));
  const home = canWrite ? '/outreach/newsletter' : '/outreach/events';
  const creating = canWrite && params.get('new') === '1';
  const openNew = () => setParams({ new: '1' });
  const closeNew = () => setParams({}, { replace: true });

  // Counts in the tab strip — cheap, cached, shared with the tabs below.
  // Subscriber and blast lists are desk-only reads (403 for volunteers).
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: () => apiGet('/subscriptions'), enabled: canWrite });
  const blasts = useQuery({ queryKey: ['blasts'], queryFn: () => apiGet('/blasts'), enabled: canWrite });
  const pets = useQuery({ queryKey: ['petitions'], queryFn: () => apiGet('/petitions') });
  const evq = useQuery({ queryKey: ['campaign-events'], queryFn: () => apiGet('/campaign-events') });

  if (!tab) return <Navigate to={home} replace />;
  if (!tabs.some((t) => t.key === tab)) return <Navigate to={home} replace />;

  const counts = {
    newsletter: subs.data?.subscribed,
    press: blasts.data?.mediaContacts,
    petitions: pets.data?.petitions?.length,
    events: evq.data ? evq.data.events.filter((e) => isUpcoming(e)).length : undefined,
  };
  const primary = canWrite && !creating ? PRIMARY[tab] : null;
  const tabProps = { me, canWrite, creating, onClose: closeNew, toast: toast.show };

  return (
    <div className="ot-page">
      <div className="ot-top">
        <h1>Outreach</h1>
        {primary && (
          <button type="button" className="btn btn-primary ot-btn-tap" onClick={openNew}>{primary}</button>
        )}
      </div>

      <nav className="ot-tabs" aria-label="Outreach sections" style={{ '--ot-tabs': tabs.length }}>
        {tabs.map((t) => (
          <Link key={t.key} to={`/outreach/${t.key}`} className={`ot-tab${tab === t.key ? ' active' : ''}`}
            aria-current={tab === t.key ? 'page' : undefined}
            aria-label={counts[t.key] != null ? `${t.label}, ${counts[t.key]}` : undefined}>
            <span className="ot-tab-icon">
              <TabIcon name={t.key} />
              {counts[t.key] != null && <span className="n">{counts[t.key]}</span>}
            </span>
            <span className="ot-tab-label">{t.label}</span>
          </Link>
        ))}
      </nav>

      {tab === 'newsletter' && <NewsletterTab {...tabProps} />}
      {tab === 'press' && <PressTab {...tabProps} />}
      {tab === 'petitions' && <PetitionsTab {...tabProps} />}
      {tab === 'events' && <EventsTab {...tabProps} />}
      {tab === 'website' && <WebsiteTab {...tabProps} />}

      {toast.msg && (
        <div className="toast ot-toast" role="status">
          <span>{toast.msg}</span>
          <button type="button" className="btn ot-btn-tap" onClick={toast.clear}>OK</button>
        </div>
      )}
    </div>
  );
}
