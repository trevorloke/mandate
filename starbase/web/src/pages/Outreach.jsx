// Outreach — the campaign's outward-facing plumbing, in five tabs:
//   newsletter  subscribers, compose + send, share the signup link
//   press       media contacts (tag 'media' + email), press releases
//   petitions   public petition pages, signatures, new petition
//   events      public RSVP pages, RSVP lists, check-in after the event
//   website     the Imagine Surrey bridge: site link, public pages, donations,
//               embed code
// Tabs live in the URL (/outreach/:tab). Everything is react-query driven;
// every write invalidates and toasts.
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useOutletContext, useParams } from 'react-router-dom';
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
const DESK_ROLES = ['manager', 'treasurer', 'staff'];
// Volunteers get 403 on /api/subscriptions, /api/blasts and signature lists,
// so they only see the tabs whose reads they're allowed.
const VOLUNTEER_TABS = new Set(['petitions', 'events', 'website']);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const origin = () => (typeof window !== 'undefined' ? window.location.origin : '');

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
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');

// Lighter normalizer for hand-typed slugs: keeps a trailing dash while typing.
const slugInput = (v) =>
  String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').slice(0, 60);

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

function CopyButton({ text, label = 'Copy', small, onCopied, className = '' }) {
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
      className={`btn ot-copy${small ? ' ot-btn-sm' : ''} ${className}`.trim()}
      data-copied={copied ? 'true' : 'false'}
      aria-live="polite"
      onClick={go}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

function LinkRow({ label, href, onCopied }) {
  return (
    <div className="ot-link-row">
      {label && <span className="eyebrow label">{label}</span>}
      <a className="ot-link" href={href} target="_blank" rel="noreferrer">{href}</a>
      <CopyButton text={href} onCopied={onCopied} />
    </div>
  );
}

function StatusChip({ status }) {
  const cls = status === 'sent' || status === 'subscribed' || status === 'active' ? 'chip chip-ok'
    : status === 'queued' ? 'chip chip-warn'
    : status === 'failed' ? 'chip chip-danger'
    : 'chip ot-chip-ghost';
  return <span className={cls}>{status}</span>;
}

// The one place a blast's outcome is explained. Server rule (blast.send):
// every message sent → 'sent'; every message failed → 'failed'; anything else
// → 'queued'. With no provider every message is queued; WITH a provider,
// 'queued' means a mix of sent + failed, so the copy has to say which.
const noProviderNote = (note) => /no email provider/i.test(note || '');
function BlastResult({ blast, emailConfigured, onDismiss }) {
  if (!blast) return null;
  const n = blast.audience_count ?? 0;
  const who = `${n} ${n === 1 ? 'recipient' : 'recipients'}`;
  const partial = blast.status === 'queued' && emailConfigured === true && !noProviderNote(blast.provider_note);
  return (
    <div className="ot-result" data-status={blast.status} role="status">
      <div className="ot-result-head">
        <span className="ot-status-dot" data-status={blast.status} aria-hidden="true" />
        <strong>
          {blast.status === 'sent' && `Sent to ${who}.`}
          {blast.status === 'queued' && (partial ? `Partly delivered to ${who}.` : `Queued for ${who}.`)}
          {blast.status === 'failed' && `Failed — ${who} not reached.`}
        </strong>
        <span className="chip ot-chip-kind">{blast.kind}</span>
        <span className="spacer" />
        {onDismiss && <button type="button" className="btn btn-quiet ot-btn-sm" onClick={onDismiss}>Dismiss</button>}
      </div>
      <div className="detail"><em>“{blast.subject}”</em></div>
      {blast.status === 'queued' && !partial && (
        <div className="detail">Recipients are saved — connect an email provider to send.</div>
      )}
      {partial && (
        <div className="detail">Some messages went out and the provider refused others. Recipients are saved; the provider’s reason is below.</div>
      )}
      {blast.status === 'failed' && (
        <div className="detail">The provider refused every message. Check the key and sender domain, then send again.</div>
      )}
      {blast.provider_note && <div className="provider">{blast.provider_note}</div>}
    </div>
  );
}

// Compose card shared by newsletter + press. Two-step send (irreversible).
// The server refuses an empty audience (400 with a plain reason); we say so up
// front and hold the send button, but drafting stays open.
function ComposeCard({ kind, audienceCount, audienceNoun, onSent, emptyReason, emailConfigured }) {
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState(null);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['blasts'] });
  });

  const ready = subject.trim().length > 0 && body.trim().length > 0;
  const empty = audienceCount === 0;
  const title = kind === 'press' ? 'Compose press release' : 'Compose newsletter';
  const verb = kind === 'press' ? 'Send release' : 'Send newsletter';

  const send = async () => {
    const res = await act.run('blast.send', { kind, subject: subject.trim(), body: body.trim() });
    setConfirming(false);
    if (!res) return;
    setResult(res.blast);
    onSent?.(res.blast);
    if (res.blast.status !== 'failed') { setSubject(''); setBody(''); }
  };

  return (
    <form className="card ot-compose" onSubmit={(e) => { e.preventDefault(); if (ready && !empty && !confirming) setConfirming(true); }}>
      <span className="eyebrow">{title}</span>
      <div className="field">
        <label htmlFor={`${kind}-subject`}>Subject</label>
        <input id={`${kind}-subject`} className="input" value={subject} maxLength={300}
          onChange={(e) => { setSubject(e.target.value); setConfirming(false); }}
          placeholder={kind === 'press' ? 'Imagine Surrey unveils transit plan' : 'This week on the campaign'} />
      </div>
      <div className="field">
        <label htmlFor={`${kind}-body`}>Body (plain text)</label>
        <textarea id={`${kind}-body`} className="input" value={body} maxLength={50000}
          onChange={(e) => { setBody(e.target.value); setConfirming(false); }}
          placeholder={kind === 'press' ? 'FOR IMMEDIATE RELEASE …' : 'Hello friends,'} />
        {kind === 'newsletter' && (
          <span className="ot-hint">
            Sent as written, with a footer naming the campaign and each reader’s own one-click
            unsubscribe link.
          </span>
        )}
      </div>
      {act.error && <p className="error">{act.error}</p>}
      {empty && emptyReason && <p className="ot-note">{emptyReason}</p>}
      <div className="ot-foot">
        {confirming ? (
          <div className="ot-confirm" role="group" aria-label="Confirm send">
            <span>Send to <strong>{audienceCount}</strong> {audienceCount === 1 ? audienceNoun.one : audienceNoun.many} now? This can’t be undone.</span>
            <button type="button" className="btn btn-primary ot-btn-tap" disabled={act.busy} onClick={send}>
              {act.busy ? 'Sending…' : 'Yes, send'}
            </button>
            <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : (
          <>
            <button type="submit" className="btn btn-primary ot-btn-tap" disabled={!ready || empty || act.busy}>{verb}</button>
            <span className="ot-audience">
              {audienceCount == null ? '…' : `→ ${audienceCount} ${audienceCount === 1 ? audienceNoun.one : audienceNoun.many}`}
            </span>
          </>
        )}
      </div>
      <BlastResult blast={result} emailConfigured={emailConfigured} onDismiss={() => setResult(null)} />
    </form>
  );
}

function BlastsTable({ blasts, loading, kindFilter }) {
  const rows = (blasts || []).filter((b) => !kindFilter || b.kind === kindFilter);
  return (
    <div className="ot-scroll">
      <table className="table ot-table">
        <thead>
          <tr>
            {!kindFilter && <th>Kind</th>}
            <th>Subject</th>
            <th className="num">Audience</th>
            <th>Status</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              {!kindFilter && <td><span className="chip ot-chip-kind">{b.kind}</span></td>}
              <td className="subject">
                {b.subject}
                {b.status !== 'sent' && b.provider_note && <div className="ot-row-note">{b.provider_note}</div>}
              </td>
              <td className="num">{b.audience_count}</td>
              <td><StatusChip status={b.status} /></td>
              <td className="when" title={b.provider_note || undefined}>{fmtWhen(b.sent_at || b.created_at)}</td>
            </tr>
          ))}
          {rows.length === 0 && !loading && (
            <tr><td colSpan={kindFilter ? 4 : 5} className="ot-empty">Nothing sent yet.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NEWSLETTER
// ─────────────────────────────────────────────────────────────────────────────
function NewsletterTab({ me, canWrite, toast }) {
  const queryClient = useQueryClient();
  const slug = me.workspace.slug;
  const subs = useQuery({ queryKey: ['subscriptions'], queryFn: () => apiGet('/subscriptions') });
  const blasts = useQuery({ queryKey: ['blasts'], queryFn: () => apiGet('/blasts') });

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
  const visible = showAll ? list : list.slice(0, 50);

  const add = async (e) => {
    e.preventDefault();
    const res = await act.run('subscription.add', { email: email.trim(), name: name.trim() || undefined });
    if (!res) return;
    toast(`Added ${email.trim()} to the newsletter`);
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
      <div className="ot-row">
        <div className="card ot-stat">
          <span className="eyebrow">Subscribers</span>
          <div className="n">{subscribed == null ? '…' : subscribed}</div>
          <div className="sub">
            {list.length - (subscribed || 0) > 0 ? `${list.length - subscribed} unsubscribed · ` : ''}
            {blasts.data?.emailConfigured ? 'email provider connected' : 'no email provider yet — sends are queued'}
          </div>
        </div>
        <div className="card ot-share">
          <span className="eyebrow">Share the signup page</span>
          <LinkRow href={signupUrl} onCopied={(ok) => toast(ok ? 'Signup link copied' : 'Could not copy — select the link instead')} />
          <p className="ot-note">
            Anyone who signs up here lands on this list. Every newsletter ends with the reader’s own
            one-click unsubscribe link. If someone asks by phone or reply instead, press Remove on their
            row below — they drop out of the next send.
          </p>
        </div>
      </div>

      {canWrite && (
        <ComposeCard
          kind="newsletter"
          audienceCount={subscribed}
          audienceNoun={{ one: 'subscriber', many: 'subscribers' }}
          emptyReason="No subscribed addresses yet — share the signup link or add a subscriber below, then send."
          emailConfigured={blasts.data?.emailConfigured}
          onSent={(b) => toast(b.status === 'sent' ? `Newsletter sent to ${b.audience_count}` : b.status === 'queued' ? `Newsletter queued for ${b.audience_count}` : 'Newsletter failed')}
        />
      )}

      <div className="card">
        <div className="ot-head">
          <span className="eyebrow">Subscriber list</span>
          <span className="ot-note">{subs.isPending ? 'Loading…' : `${list.length} on file`}</span>
        </div>
        {subs.isError && <p className="error">{subs.error.message}</p>}
        <div className="ot-scroll">
          <table className="table ot-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Status</th>
                <th className="col-wide">Source</th>
                <th>Date</th>
                {canWrite && <th className="act" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {visible.map((s) => (
                <tr key={s.id} className={s.status !== 'subscribed' ? 'off' : ''}>
                  <td><span className="email">{s.email}</span></td>
                  <td>{s.name || <span className="muted">—</span>}</td>
                  <td><StatusChip status={s.status} /></td>
                  <td className="col-wide"><span className="muted">{s.source || '—'}</span></td>
                  <td className="when">{fmtDay(s.created_at)}</td>
                  {canWrite && (
                    <td className="act">
                      {s.status === 'subscribed' ? (
                        <button type="button" className="btn btn-quiet ot-btn-sm" disabled={act.busy} onClick={() => remove(s)}>Remove</button>
                      ) : (
                        <button type="button" className="btn btn-quiet ot-btn-sm" disabled={act.busy} onClick={() => resubscribe(s)}>Re-subscribe</button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {list.length === 0 && !subs.isPending && (
                <tr><td colSpan={canWrite ? 6 : 5} className="ot-empty">No subscribers yet — share the signup link or add one below.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {list.length > 50 && !showAll && (
          <div className="ot-actions" style={{ marginTop: 'var(--s-2)' }}>
            <button type="button" className="btn btn-quiet" onClick={() => setShowAll(true)}>Show all {list.length}</button>
          </div>
        )}
        {canWrite && (
          <form className="ot-inline-add" onSubmit={add}>
            <div className="field">
              <label htmlFor="sub-email">Add subscriber — email</label>
              <input id="sub-email" className="input" type="email" required maxLength={320} autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.org" />
            </div>
            <div className="field">
              <label htmlFor="sub-name">Name (optional)</label>
              <input id="sub-name" className="input" maxLength={300} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={act.busy || !email.trim()}>Add subscriber</button>
            {act.error && <span className="error">{act.error}</span>}
          </form>
        )}
      </div>

      <div className="card">
        <div className="ot-head">
          <span className="eyebrow">Past blasts</span>
          <span className="ot-note">Newsletters and press releases, newest first</span>
        </div>
        {blasts.isError && <p className="error">{blasts.error.message}</p>}
        <BlastsTable blasts={blasts.data?.blasts} loading={blasts.isPending} />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PRESS
// ─────────────────────────────────────────────────────────────────────────────
function PressTab({ canWrite, toast }) {
  const blasts = useQuery({ queryKey: ['blasts'], queryFn: () => apiGet('/blasts') });
  const media = blasts.data?.mediaContacts ?? null;

  return (
    <>
      <div className="ot-row">
        <div className="card ot-stat">
          <span className="eyebrow">Media contacts</span>
          <div className="n">{media == null ? '…' : media}</div>
          <div className="sub">
            {blasts.data?.emailConfigured ? 'email provider connected' : 'no email provider yet — sends are queued'}
          </div>
        </div>
        <div className="card">
          <span className="eyebrow">Who gets a release</span>
          <p className="ot-lede">
            Press releases go to everyone tagged <span className="chip">media</span> who has an email address.
            Reporters without an email are skipped.
          </p>
          <div className="ot-actions">
            <Link className="btn" to="/people?tag=media">Manage media list</Link>
            {canWrite && <Link className="btn btn-quiet" to="/people?new=1">Add a contact</Link>}
          </div>
        </div>
      </div>

      {canWrite && (
        <ComposeCard
          kind="press"
          audienceCount={media}
          audienceNoun={{ one: 'media contact', many: 'media contacts' }}
          emptyReason="No one is tagged media with an email address yet — tag reporters in People, then send."
          emailConfigured={blasts.data?.emailConfigured}
          onSent={(b) => toast(b.status === 'sent' ? `Release sent to ${b.audience_count}` : b.status === 'queued' ? `Release queued for ${b.audience_count}` : 'Release failed')}
        />
      )}

      <div className="card">
        <div className="ot-head">
          <span className="eyebrow">Past press releases</span>
        </div>
        {blasts.isError && <p className="error">{blasts.error.message}</p>}
        <BlastsTable blasts={blasts.data?.blasts} loading={blasts.isPending} kindFilter="press" />
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PETITIONS
// ─────────────────────────────────────────────────────────────────────────────
function Signatures({ petitionId }) {
  const q = useQuery({
    queryKey: ['petition-signatures', petitionId],
    queryFn: () => apiGet(`/petitions/${petitionId}/signatures`),
  });
  const rows = q.data?.signatures ?? [];
  if (q.isPending) return <p className="ot-note">Loading signatures…</p>;
  if (q.isError) return <p className="error">{q.error.message}</p>;
  if (rows.length === 0) return <p className="ot-empty">No signatures yet.</p>;
  return (
    <div className="ot-scroll">
      <table className="table ot-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Phone</th><th>Date</th></tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.name}{s.subscribe ? <> <span className="chip ot-chip-ghost" title="Opted into the newsletter">news</span></> : null}</td>
              <td>{s.email ? <a className="email" href={`mailto:${s.email}`}>{s.email}</a> : <span className="muted">—</span>}</td>
              <td>{s.phone ? <a className="email" href={`tel:${String(s.phone).replace(/[^\d+]/g, '')}`}>{s.phone}</a> : <span className="muted">—</span>}</td>
              <td className="when">{fmtWhen(s.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PetitionRow({ p, slug, canWrite, toast }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['petitions'] });
  });
  const url = `${origin()}/p/${slug}/${p.slug}`;
  const toggle = async () => {
    const res = await act.run('petition.update', { id: p.id, active: !p.active });
    if (res) toast(p.active ? `“${p.title}” is now closed to new signatures` : `“${p.title}” is live again`);
  };
  return (
    <li className={`ot-petition${p.active ? '' : ' off'}`}>
      <div className="ot-petition-head">
        <h3 className="title">{p.title}</h3>
        <span className="meta">
          <span className="sigs"><strong>{p.signatures}</strong> {p.signatures === 1 ? 'signature' : 'signatures'}</span>
          <StatusChip status={p.active ? 'active' : 'closed'} />
        </span>
      </div>
      {p.body && <p className="ot-lede ot-body" style={{ marginTop: 'var(--s-1)' }}>{p.body}</p>}
      <LinkRow href={url} onCopied={(ok) => toast(ok ? 'Petition link copied' : 'Could not copy — select the link instead')} />
      <div className="ot-petition-actions">
        {canWrite && (
          <button type="button" className="btn ot-btn-tap" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide signatures' : 'View signatures'}
          </button>
        )}
        {canWrite && (
          <button type="button" className="btn ot-switch ot-btn-tap" aria-pressed={p.active} disabled={act.busy} onClick={toggle}
            title={p.active ? 'Close to new signatures' : 'Reopen for signatures'}>
            {p.active ? 'Active' : 'Closed — reopen'}
          </button>
        )}
        <span className="ot-slug-hint">slug: {p.slug}</span>
        {act.error && <span className="error">{act.error}</span>}
      </div>
      {open && canWrite && <div className="ot-expander"><Signatures petitionId={p.id} /></div>}
    </li>
  );
}

function NewPetitionForm({ onCreated }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [body, setBody] = useState('');
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['petitions'] });
  });
  const onTitle = (v) => { setTitle(v); if (!slugTouched) setSlug(slugify(v)); };
  const slugOk = /^[a-z0-9-]{2,60}$/.test(slug.replace(/^-+|-+$/g, ''));

  const submit = async (e) => {
    e.preventDefault();
    // Enter in the slug field skips onBlur, so trim stray dashes here too.
    const cleanSlug = slug.replace(/^-+|-+$/g, '');
    const res = await act.run('petition.create', { slug: cleanSlug, title: title.trim(), body: body.trim() || undefined });
    if (!res) return;
    onCreated?.(res.petition);
    setTitle(''); setSlug(''); setSlugTouched(false); setBody('');
  };

  return (
    <form className="card" onSubmit={submit}>
      <span className="eyebrow">New petition</span>
      <div className="form-row">
        <div className="field" style={{ flex: '2 1 240px' }}>
          <label htmlFor="pet-title">Title</label>
          <input id="pet-title" className="input" required maxLength={300} value={title} onChange={(e) => onTitle(e.target.value)} placeholder="Bring SkyTrain to Newton" />
        </div>
        <div className="field" style={{ flex: '1 1 200px' }}>
          <label htmlFor="pet-slug">Slug (in the public link)</label>
          <input id="pet-slug" className="input mono" required value={slug} pattern="[a-z0-9\-]{2,60}"
            onChange={(e) => { setSlugTouched(true); setSlug(slugInput(e.target.value)); }}
            onBlur={() => setSlug((v) => v.replace(/^-+|-+$/g, ''))}
            placeholder="skytrain-to-newton" aria-describedby="pet-slug-hint" />
          <span id="pet-slug-hint" className="ot-slug-hint">lowercase letters, digits, dashes · 2–60 chars</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="pet-body">Body (what signers are asking for)</label>
        <textarea id="pet-body" className="input" rows={4} maxLength={8000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Surrey deserves rapid transit south of 72nd." />
      </div>
      {act.error && <p className="error">{act.error}</p>}
      <div className="ot-actions">
        <button type="submit" className="btn btn-primary ot-btn-tap" disabled={act.busy || !title.trim() || !slugOk}>Create petition</button>
      </div>
    </form>
  );
}

function PetitionsTab({ me, canWrite, toast }) {
  const pets = useQuery({ queryKey: ['petitions'], queryFn: () => apiGet('/petitions') });
  const slug = pets.data?.slug || me.workspace.slug;
  const rows = pets.data?.petitions ?? [];
  const totalSigs = rows.reduce((n, p) => n + (p.signatures || 0), 0);

  return (
    <>
      <div className="ot-row">
        <div className="card ot-stat">
          <span className="eyebrow">Signatures</span>
          <div className="n">{pets.isPending ? '…' : totalSigs}</div>
          <div className="sub">{rows.length} {rows.length === 1 ? 'petition' : 'petitions'} · {rows.filter((p) => p.active).length} active</div>
        </div>
        <div className="card">
          <span className="eyebrow">How petitions work</span>
          <p className="ot-lede">
            Each petition gets a public page. Signers are added to People with the tags{' '}
            <span className="chip">petition</span> and <span className="chip">petition:&lt;slug&gt;</span>, and can opt into the newsletter as they sign.
          </p>
          <div className="ot-actions">
            <Link className="btn" to="/people?tag=petition">See signers in People</Link>
          </div>
        </div>
      </div>

      {canWrite && <NewPetitionForm onCreated={(p) => toast(`Petition “${p.title}” is live`)} />}

      <div className="card">
        <div className="ot-head">
          <span className="eyebrow">Petitions</span>
        </div>
        {pets.isError && <p className="error">{pets.error.message}</p>}
        <ul className="ot-petitions">
          {rows.map((p) => <PetitionRow key={p.id} p={p} slug={slug} canWrite={canWrite} toast={toast} />)}
          {rows.length === 0 && !pets.isPending && (
            <li className="ot-empty">No petitions yet{canWrite ? ' — create the first one above.' : '.'}</li>
          )}
        </ul>
      </div>
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

const fmtEventWhen = (starts, ends) => {
  const a = new Date(starts);
  if (Number.isNaN(a.getTime())) return '—';
  const thisYear = a.getFullYear() === new Date().getFullYear();
  const day = (d) => d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', ...(thisYear ? {} : { year: 'numeric' }) });
  const time = (d) => d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
  const b = ends ? new Date(ends) : null;
  if (!b || Number.isNaN(b.getTime())) return `${day(a)} · ${time(a)}`;
  if (a.toDateString() === b.toDateString()) return `${day(a)} · ${time(a)}–${time(b)}`;
  return `${day(a)} ${time(a)} – ${day(b)} ${time(b)}`;
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

function CapacityMeter({ going, capacity, attended, past }) {
  const full = capacity && going >= capacity;
  const pct = capacity ? Math.min(100, Math.round((going / capacity) * 100)) : 0;
  return (
    <div className="ot-meter" data-full={full ? 'true' : 'false'}>
      <div className="ot-meter-n">
        <strong>{going}</strong>
        {capacity ? <span className="of"> / {capacity}</span> : null}
        <span className="lbl"> {past ? 'said yes' : 'going'}</span>
        {full && !past && <span className="chip chip-danger">full</span>}
      </div>
      {capacity ? (
        <div className="ot-meter-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
      ) : (
        <div className="ot-meter-sub">no cap</div>
      )}
      {attended > 0 && <div className="ot-meter-sub">{attended} checked in</div>}
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
    queryClient.setQueryData(key,(d) => d && { ...d, rsvps: d.rsvps.map((x) => (x.id === r.id ? { ...x, status } : x)) });
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

  if (q.isPending) return <p className="ot-note">Loading RSVPs…</p>;
  if (q.isError) return <p className="error">{q.error.message}</p>;
  if (rows.length === 0) return <p className="ot-empty">No RSVPs yet — share the link.</p>;

  const heads = (s) => rows.filter((r) => r.status === s).reduce((n, r) => n + 1 + (r.guests || 0), 0);
  return (
    <>
      <p className="ot-rsvp-sum">
        <span><strong>{rows.length}</strong> {rows.length === 1 ? 'RSVP' : 'RSVPs'}</span>
        <span>{heads('going')} going</span>
        <span>{heads('attended')} attended</span>
        {heads('cancelled') > 0 && <span>{heads('cancelled')} cancelled</span>}
        <span className="muted">counts include guests</span>
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
                {r.email && <a className="email" href={`mailto:${r.email}`}>{r.email}</a>}
                {r.phone && <a className="email" href={`tel:${String(r.phone).replace(/[^\d+]/g, '')}`}>{r.phone}</a>}
                {!r.email && !r.phone && <span className="muted">no contact given</span>}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const idp = editing ? `ev-${ev.id.slice(0, 8)}` : 'ev-new';

  const onTitle = (v) => { setTitle(v); if (!slugTouched) setSlug(slugify(v)); };
  const cleanSlug = slug.replace(/^-+|-+$/g, '');
  const slugOk = /^[a-z0-9-]{2,60}$/.test(cleanSlug);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const startsISO = localInputToISO(starts);
    if (!startsISO) { setError('Pick a start date and time.'); return; }
    const endsISO = ends ? localInputToISO(ends) : null;
    if (endsISO && new Date(endsISO) <= new Date(startsISO)) { setError('The end time has to be after the start.'); return; }
    if (editing && ev.ends_at && !endsISO) { setError('An end time can’t be removed once set — change it instead.'); return; }
    const capText = capacity.trim();
    const cap = capText ? Number(capText) : null;
    if (capText && (!Number.isInteger(cap) || cap < 1)) { setError('Capacity is a whole number of people, like 40 — or leave it blank for no limit.'); return; }
    if (editing && ev.capacity && cap == null) { setError('Capacity can’t be removed once set — enter a larger number instead.'); return; }

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
    <form className={editing ? 'ot-event-form' : 'card ot-event-form'} onSubmit={submit}>
      <span className="eyebrow">{editing ? 'Edit event' : 'New event'}</span>
      <div className="form-row">
        <div className="field" style={{ flex: '2 1 240px' }}>
          <label htmlFor={`${idp}-title`}>Title</label>
          <input id={`${idp}-title`} className="input" required maxLength={300} value={title}
            onChange={(e) => onTitle(e.target.value)} placeholder="Town hall: transit in Newton" />
        </div>
        {!editing && (
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor={`${idp}-slug`}>Link (in the public address)</label>
            <input id={`${idp}-slug`} className="input mono" required value={slug} pattern="[a-z0-9\-]{2,60}"
              autoCapitalize="none" spellCheck={false}
              onChange={(e) => { setSlugTouched(true); setSlug(slugInput(e.target.value)); }}
              onBlur={() => setSlug((v) => v.replace(/^-+|-+$/g, ''))}
              placeholder="newton-town-hall" aria-describedby={`${idp}-slug-hint`} />
            <span id={`${idp}-slug-hint`} className="ot-slug-hint">/e/{wsSlug}/{cleanSlug || '…'}</span>
          </div>
        )}
      </div>
      {editing && (
        <p className="ot-slug-hint" style={{ margin: '0 0 var(--s-3)' }}>Link: /e/{wsSlug}/{ev.slug} · set when the event was created</p>
      )}
      <div className="form-row">
        <div className="field">
          <label htmlFor={`${idp}-starts`}>Starts</label>
          <input id={`${idp}-starts`} className="input mono" type="datetime-local" required value={starts}
            onChange={(e) => setStarts(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor={`${idp}-ends`}>Ends (optional)</label>
          <input id={`${idp}-ends`} className="input mono" type="datetime-local" value={ends} min={starts || undefined}
            onChange={(e) => setEnds(e.target.value)} />
        </div>
      </div>
      <div className="form-row">
        <div className="field" style={{ flex: '2 1 240px' }}>
          <label htmlFor={`${idp}-loc`}>Location</label>
          <input id={`${idp}-loc`} className="input" maxLength={400} value={location}
            onChange={(e) => setLocation(e.target.value)} placeholder="Newton Recreation Centre, 13730 72 Ave" />
        </div>
        <div className="field" style={{ flex: '1 1 120px' }}>
          <label htmlFor={`${idp}-cap`}>Capacity</label>
          <input id={`${idp}-cap`} className="input mono" inputMode="numeric" value={capacity}
            onChange={(e) => setCapacity(e.target.value.replace(/[^\d]/g, ''))} placeholder="no limit" />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-desc`}>Description</label>
        <textarea id={`${idp}-desc`} className="input" rows={3} maxLength={8000} value={description}
          onChange={(e) => setDescription(e.target.value)} placeholder="What it is, who should come, what to bring." />
      </div>
      <label className="ot-check" htmlFor={`${idp}-public`}>
        <input id={`${idp}-public`} type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <span>
          <strong>Public page</strong>
          <span className="ot-hint"> — anyone with the link can RSVP. Untick for a team-only event.</span>
        </span>
      </label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="ot-actions">
        <button type="submit" className="btn btn-primary ot-btn-tap" disabled={busy || !title.trim() || !starts || (!editing && !slugOk)}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create event'}
        </button>
        <button type="button" className="btn btn-quiet ot-btn-tap" disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function EventRow({ ev, wsSlug, canWrite, toast, past }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const act = useAction(() => {
    queryClient.invalidateQueries({ queryKey: ['campaign-events'] });
    queryClient.invalidateQueries({ queryKey: ['brief'] });
  });
  const url = `${origin()}/e/${wsSlug}/${ev.slug}`;
  const soon = past ? null : soonLabel(ev);

  const remove = async () => {
    const res = await act.run('cevent.delete', { id: ev.id });
    if (!res) return;
    queryClient.removeQueries({ queryKey: ['rsvps', ev.id] });
    toast(`Deleted “${ev.title}”`);
  };

  return (
    <li className={`ot-event${past ? ' past' : ''}`}>
      <div className="ot-event-head">
        <div className="ot-event-main">
          <h3 className="title">{ev.title}</h3>
          <div className="when">
            {fmtEventWhen(ev.starts_at, ev.ends_at)}
            {soon && <span className="chip chip-warn">{soon}</span>}
            {!ev.public && <span className="chip ot-chip-ghost">team only</span>}
          </div>
          {ev.location && <div className="where">{ev.location}</div>}
        </div>
        <CapacityMeter going={ev.going || 0} capacity={ev.capacity} attended={ev.attended || 0} past={past} />
      </div>

      {editing ? (
        <EventForm
          ev={ev}
          wsSlug={wsSlug}
          onCancel={() => setEditing(false)}
          onDone={(res, input) => { setEditing(false); toast(`Saved “${input.title}”`); }}
        />
      ) : (
        <>
          {ev.description && <p className="ot-lede ot-body ot-event-desc">{ev.description}</p>}
          {ev.public && !past && (
            <LinkRow label="RSVP page" href={url} onCopied={(ok) => toast(ok ? 'Event link copied' : 'Could not copy — select the link instead')} />
          )}
          {!ev.public && !past && (
            <p className="ot-note">No public page — only the team sees this event.{canWrite ? ' Edit it and tick “Public page” to share an RSVP link.' : ''}</p>
          )}
        </>
      )}

      {!editing && (
        <div className="ot-petition-actions">
          {canWrite && (
            <button type="button" className="btn ot-btn-tap" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide RSVPs' : past ? 'RSVPs & check-in' : 'RSVPs'}
            </button>
          )}
          {canWrite && !confirmDelete && (
            <>
              <button type="button" className="btn btn-quiet ot-btn-tap" onClick={() => { setEditing(true); setConfirmDelete(false); }}>Edit</button>
              <button type="button" className="btn btn-quiet ot-btn-tap" onClick={() => setConfirmDelete(true)}>Delete</button>
            </>
          )}
          {confirmDelete && (
            <div className="ot-confirm ot-confirm-danger" role="group" aria-label="Confirm delete">
              <span>Delete “{ev.title}”?{ev.public && !past ? ' Its RSVP page stops working.' : ''} People who RSVP’d stay in People.</span>
              <button type="button" className="btn ot-btn-tap ot-btn-danger" disabled={act.busy} onClick={remove}>
                {act.busy ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button type="button" className="btn btn-quiet ot-btn-tap" disabled={act.busy} onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          )}
          {act.error && <span className="error">{act.error}</span>}
        </div>
      )}

      {open && canWrite && <div className="ot-expander"><RsvpList eventId={ev.id} canWrite={canWrite} /></div>}
    </li>
  );
}

function EventsTab({ me, canWrite, toast }) {
  const evq = useQuery({ queryKey: ['campaign-events'], queryFn: () => apiGet('/campaign-events') });
  const [creating, setCreating] = useState(false);
  const [showAllPast, setShowAllPast] = useState(false);
  const wsSlug = evq.data?.slug || me.workspace.slug;
  const events = evq.data?.events ?? [];
  const now = Date.now();
  const upcoming = events.filter((e) => isUpcoming(e, now));
  const past = events.filter((e) => !isUpcoming(e, now)).reverse(); // most recent first
  const pastShown = showAllPast ? past : past.slice(0, 5);
  const goingTotal = upcoming.reduce((n, e) => n + (e.going || 0), 0);

  return (
    <>
      <div className="ot-row">
        <div className="card ot-stat">
          <span className="eyebrow">Upcoming events</span>
          <div className="n">{evq.isPending ? '…' : upcoming.length}</div>
          <div className="sub">{goingTotal} going across them · {past.length} past</div>
        </div>
        <div className="card">
          <span className="eyebrow">How events work</span>
          <p className="ot-lede">
            Each public event gets an RSVP page. Everyone who RSVPs lands in People tagged{' '}
            <span className="chip">event</span> and <span className="chip">event:&lt;link&gt;</span>.
            {canWrite ? ' Afterwards, mark who came.' : ''}
          </p>
          <div className="ot-actions">
            <Link className="btn" to="/people?tag=event">See RSVPs in People</Link>
          </div>
        </div>
      </div>

      {canWrite && (creating ? (
        <EventForm
          wsSlug={wsSlug}
          onCancel={() => setCreating(false)}
          onDone={(res) => { setCreating(false); toast(`“${res.event.title}” is on the calendar`); }}
        />
      ) : (
        <div className="ot-actions" style={{ marginBottom: 'var(--s-4)' }}>
          <button type="button" className="btn btn-primary ot-btn-tap" onClick={() => setCreating(true)}>New event</button>
        </div>
      ))}

      {evq.isError && <p className="error">{evq.error.message}</p>}

      <div className="card">
        <div className="ot-head">
          <span className="eyebrow">Upcoming</span>
          <span className="ot-note">{evq.isPending ? 'Loading…' : `${upcoming.length} on the calendar`}</span>
        </div>
        <ul className="ot-events">
          {upcoming.map((e) => <EventRow key={e.id} ev={e} wsSlug={wsSlug} canWrite={canWrite} toast={toast} />)}
          {upcoming.length === 0 && !evq.isPending && (
            <li className="ot-empty">Nothing coming up{canWrite ? ' — press New event to add one.' : '.'}</li>
          )}
        </ul>
      </div>

      {past.length > 0 && (
        <div className="card">
          <div className="ot-head">
            <span className="eyebrow">Past</span>
            {canWrite && <span className="ot-note">Open RSVPs to mark who came</span>}
          </div>
          <ul className="ot-events">
            {pastShown.map((e) => <EventRow key={e.id} ev={e} wsSlug={wsSlug} canWrite={canWrite} toast={toast} past />)}
          </ul>
          {past.length > pastShown.length && (
            <div className="ot-actions" style={{ marginTop: 'var(--s-2)' }}>
              <button type="button" className="btn btn-quiet ot-btn-tap" onClick={() => setShowAllPast(true)}>Show all {past.length}</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSITE — the Imagine Surrey bridge
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
  <textarea name="note" placeholder="Anything we should know? (languages, availability)"></textarea>
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

// Donate page status + the instructions donors see when cards are off.
function DonationsCard({ me, base, canWrite, toast, copied }) {
  const queryClient = useQueryClient();
  const isManager = me.role === 'manager';
  const slug = me.workspace.slug;
  const current = me.workspace.settings?.donateInstructions || '';
  const [text, setText] = useState(current);
  useEffect(() => { setText(current); }, [current]);
  // /api/pledges is desk-only; it also says whether Stripe is connected.
  const pledges = useQuery({ queryKey: ['pledges'], queryFn: () => apiGet('/pledges'), enabled: canWrite });
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
    toast(v ? 'Donation instructions saved' : 'Donation instructions cleared — donors see the standard note');
  };

  return (
    <div className="card">
      <div className="ot-head">
        <span className="eyebrow">Donations</span>
        {canWrite && open.length > 0 && (
          <Link className="ot-note" to="/money">{open.length} open {open.length === 1 ? 'pledge' : 'pledges'} · {fmtMoney(openCents)} — confirm in Money →</Link>
        )}
      </div>
      <LinkRow label="Donate" href={`${base}/d/${slug}`} onCopied={copied} />
      {canWrite && (
        <p className="ot-pay" data-on={stripe ? 'true' : 'false'}>
          <span className="ot-status-dot" data-status={stripe ? 'sent' : pledges.isPending ? undefined : 'queued'} aria-hidden="true" />
          {pledges.isPending ? 'Checking card payments…'
            : pledges.isError ? <span className="error">{pledges.error.message}</span>
            : stripe ? 'Card payments on (Stripe)'
            : 'Pledges only — connect Stripe to take cards'}
        </p>
      )}
      <p className="ot-note">The page checks BC eligibility and the annual contribution limit before it takes a gift.</p>

      {canWrite && pledges.isSuccess && !stripe && (
        <div className="ot-donate-note">
          {isManager ? (
            <form onSubmit={save}>
              <div className="field">
                <label htmlFor="ws-donate-note">Donation instructions</label>
                <textarea id="ws-donate-note" className="input" rows={3} maxLength={2000} value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="E-transfer to donate@imaginesurrey.ca — put your full name and home address in the message." />
                <span className="ot-hint">
                  Shown on the donate page and after someone pledges, while cards are off.
                  {!text.trim() && <> Left empty, donors see: “{DEFAULT_DONATE_NOTE}”</>}
                </span>
              </div>
              <div className="ot-actions">
                <button type="submit" className="btn btn-primary ot-btn-tap" disabled={act.busy || text.trim() === current}>
                  {act.busy ? 'Saving…' : 'Save instructions'}
                </button>
                {act.error && <span className="error">{act.error}</span>}
              </div>
            </form>
          ) : (
            <>
              <span className="eyebrow">Donation instructions</span>
              <p className="ot-lede ot-body" style={{ margin: 'var(--s-1) 0 0' }}>{current || DEFAULT_DONATE_NOTE}</p>
              <p className="ot-note">A manager can change this.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WebsiteTab({ me, canWrite, toast }) {
  const queryClient = useQueryClient();
  const isManager = me.role === 'manager';
  const slug = me.workspace.slug;
  const current = me.workspace.settings?.website || '';
  const [site, setSite] = useState(current);
  const [snippet, setSnippet] = useState('newsletter');
  const [rsvpEvent, setRsvpEvent] = useState('');
  const pets = useQuery({ queryKey: ['petitions'], queryFn: () => apiGet('/petitions') });
  const evq = useQuery({ queryKey: ['campaign-events'], queryFn: () => apiGet('/campaign-events') });
  const act = useAction(() => queryClient.invalidateQueries({ queryKey: ['me'] }));

  useEffect(() => { setSite(current); }, [current]);

  const base = origin();
  const endpoint = `${base}/api/public/${slug}/signup`;
  const petitions = pets.data?.petitions ?? [];
  // Only public events that haven't started take RSVPs.
  const openEvents = (evq.data?.events ?? []).filter((e) => e.public && new Date(e.starts_at).getTime() >= Date.now());
  const rsvpSlug = openEvents.some((e) => e.slug === rsvpEvent) ? rsvpEvent : (openEvents[0]?.slug || '<event-link>');
  const code = snippet === 'volunteer' ? snippetVolunteer(endpoint)
    : snippet === 'rsvp' ? snippetRsvp(endpoint, rsvpSlug)
    : snippetNewsletter(endpoint);

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
    toast(v ? 'Website saved — public pages now link back to it' : 'Website cleared');
  };

  const copied = (ok) => toast(ok ? 'Copied' : 'Could not copy — select the text instead');

  return (
    <>
      <div className="card">
        <span className="eyebrow">Campaign website</span>
        <p className="ot-lede">
          The public petition, newsletter and volunteer pages carry a link back to this site, so a visitor who
          lands on a Starbase page can always find their way home.
        </p>
        <div className="ot-site-current">
          <span className="eyebrow">Current</span>
          {current && /^https?:\/\//i.test(current)
            ? <a href={current} target="_blank" rel="noreferrer">{current}</a>
            : current
            ? <span className="mono">{current}</span>
            : <span className="muted">Not set{isManager ? '' : ' — ask a manager to add it'}</span>}
        </div>
        {isManager && (
          <form className="ot-site-form" onSubmit={save}>
            <div className="field">
              <label htmlFor="ws-site">Website URL</label>
              <input id="ws-site" className="input mono" type="text" inputMode="url" autoComplete="url"
                autoCapitalize="none" spellCheck={false} value={site} maxLength={500}
                onChange={(e) => setSite(e.target.value)} placeholder="https://imaginesurrey.ca" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={act.busy || normalized === current}>
              {act.busy ? 'Saving…' : 'Save'}
            </button>
            {act.error && <span className="error">{act.error}</span>}
          </form>
        )}
      </div>

      <div className="card">
        <div className="ot-head">
          <span className="eyebrow">Public pages to link from the site</span>
          <span className="ot-note">Each is a plain server-rendered page — no login.</span>
        </div>
        <ul className="ot-link-list">
          <li><LinkRow label="Newsletter" href={`${base}/n/${slug}`} onCopied={copied} /></li>
          <li><LinkRow label="Volunteer" href={`${base}/v/${slug}`} onCopied={copied} /></li>
          {petitions.map((p) => (
            <li key={p.id}>
              <div className="ot-link-caption">
                {p.title}
                {!p.active && <span className="muted"> · closed, link returns “not found” until reopened</span>}
              </div>
              <LinkRow label="Petition" href={`${base}/p/${slug}/${p.slug}`} onCopied={copied} />
            </li>
          ))}
          {!pets.isPending && petitions.length === 0 && (
            <li className="ot-note">No petitions yet — <Link to="/outreach/petitions">create one</Link> and its link appears here.</li>
          )}
          {openEvents.map((e) => (
            <li key={e.id}>
              <div className="ot-link-caption">
                {e.title} <span className="muted">· {fmtEventWhen(e.starts_at, e.ends_at)}</span>
              </div>
              <LinkRow label="Event" href={`${base}/e/${slug}/${e.slug}`} onCopied={copied} />
            </li>
          ))}
          {!evq.isPending && openEvents.length === 0 && (
            <li className="ot-note">No public events coming up — <Link to="/outreach/events">add one</Link> and its RSVP link appears here.</li>
          )}
        </ul>
      </div>

      <DonationsCard me={me} base={base} canWrite={canWrite} toast={toast} copied={copied} />

      <div className="card">
        <div className="ot-head">
          <span className="eyebrow">Embed on your website</span>
          <div className="ot-seg" role="group" aria-label="Snippet">
            <button type="button" aria-pressed={snippet === 'newsletter'} onClick={() => setSnippet('newsletter')}>Newsletter</button>
            <button type="button" aria-pressed={snippet === 'volunteer'} onClick={() => setSnippet('volunteer')}>Volunteer</button>
            <button type="button" aria-pressed={snippet === 'rsvp'} onClick={() => setSnippet('rsvp')}>Event RSVP</button>
          </div>
        </div>
        <p className="ot-lede">
          Keep the site’s own design; the form posts JSON to <code className="mono">{endpoint}</code>. CORS is open, so it works
          from any domain. Submissions land in People
          {snippet === 'volunteer' ? ' tagged volunteer-prospect, with the roles picked'
            : snippet === 'rsvp' ? ' tagged event, and count toward the event’s capacity'
            : ' and on the newsletter list'}.
        </p>
        {snippet === 'rsvp' && (
          openEvents.length > 0 ? (
            <div className="field ot-snippet-event">
              <label htmlFor="snip-event">Event</label>
              <select id="snip-event" className="input" value={rsvpSlug} onChange={(e) => setRsvpEvent(e.target.value)}>
                {openEvents.map((e) => <option key={e.id} value={e.slug}>{e.title} — {fmtEventWhen(e.starts_at, e.ends_at)}</option>)}
              </select>
            </div>
          ) : (
            <p className="ot-note" style={{ marginBottom: 'var(--s-2)' }}>
              No public events coming up — <Link to="/outreach/events">create one</Link>, then replace <code>&lt;event-link&gt;</code> with its link.
            </p>
          )
        )}
        <div className="ot-pre-wrap">
          <CopyButton text={code} label="Copy snippet" onCopied={copied} />
          <pre className="ot-pre"><code>{code}</code></pre>
        </div>
        <p className="ot-note" style={{ marginTop: 'var(--s-2)' }}>
          Petitions use the same endpoint: <code>{`{ kind: 'petition', petition: '<slug>', name, email, subscribe: true }`}</code>.
          Event RSVPs: <code>{`{ kind: 'rsvp', event: '<event-slug>', name, email, phone, guests }`}</code>.
        </p>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The screen
// ─────────────────────────────────────────────────────────────────────────────
export default function Outreach() {
  const { me } = useOutletContext();
  const { tab } = useParams();
  const toast = useToast();
  const canWrite = DESK_ROLES.includes(me.role);
  const tabs = canWrite ? TABS : TABS.filter((t) => VOLUNTEER_TABS.has(t.key));
  const home = canWrite ? '/outreach/newsletter' : '/outreach/events';

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

  return (
    <>
      <div className="page-head">
        <h1>Outreach</h1>
        <span className="muted">{me.workspace.name}{me.workspace.candidate ? ` · ${me.workspace.candidate}` : ''}</span>
      </div>

      <nav className="ot-tabs" aria-label="Outreach sections">
        {tabs.map((t) => (
          <Link key={t.key} to={`/outreach/${t.key}`} className={`ot-tab${tab === t.key ? ' active' : ''}`} aria-current={tab === t.key ? 'page' : undefined}>
            {t.label}
            {counts[t.key] != null && <span className="n">{counts[t.key]}</span>}
          </Link>
        ))}
      </nav>

      {!canWrite && (
        <div className="banner" role="status">
          <span>Share event and petition links from here. Newsletters, press, sign-up lists and RSVP lists are run by the campaign desk.</span>
        </div>
      )}

      {tab === 'newsletter' && <NewsletterTab me={me} canWrite={canWrite} toast={toast.show} />}
      {tab === 'press' && <PressTab canWrite={canWrite} toast={toast.show} />}
      {tab === 'petitions' && <PetitionsTab me={me} canWrite={canWrite} toast={toast.show} />}
      {tab === 'events' && <EventsTab me={me} canWrite={canWrite} toast={toast.show} />}
      {tab === 'website' && <WebsiteTab me={me} canWrite={canWrite} toast={toast.show} />}

      {toast.msg && (
        <div className="toast ot-toast" role="status">
          <span>{toast.msg}</span>
          <button type="button" className="btn" onClick={toast.clear}>OK</button>
        </div>
      )}
    </>
  );
}
