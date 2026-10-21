// People — the list, the filters, and the phone/text bank.
// Search + filters live in the URL (?q=&tag=&rating=&role=&has=) so any list
// is shareable. ?bank=phone|text turns the table into a calling view where a
// volunteer taps Call/Text, then logs the outcome with one more tap.
// Shared rating/tag widgets are exported from here for Person.jsx.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { RATINGS, ratingByCode, VOLUNTEER_ROLES, SUGGESTED_TAGS } from '@starbase/shared/canvass';
import { logContact } from '../offline.js';
import { apiGet, action } from '../api.js';
import './people.css';

// ─────────────────────────────────────────────────────────────────────────────
// Shared widgets + helpers (also used by Person.jsx)
// ─────────────────────────────────────────────────────────────────────────────

// person.create / person.update / volunteer.* / gift.* are desk-only on the
// server (403 for volunteers); contact.log, person.locate, sign.* are open.
export const DESK_ROLES = ['manager', 'treasurer', 'staff'];
export const canDesk = (me) => DESK_ROLES.includes(me?.role);

// Every query that shows person-derived data on another screen. Prefixes:
// ['person'] is every profile (households list housemates' names + ratings,
// and Money/Map/Signs share the same key), ['persons'] every list, search and
// picker, ['doors'] the map pins + unlocated count, ['signs'] the sign board,
// ['contacts'] the contact feed, ['brief'] Today, ['blasts'] the Outreach
// press audience (media-tagged people with an email), ['shift'] shift detail
// assignee names/phones. Only mounted queries refetch; the rest go stale.
export const PERSON_KEYS = ['person', 'persons', 'doors', 'signs', 'contacts', 'brief', 'blasts', 'shift'];
export const invalidatePersonData = (queryClient) =>
  Promise.all(PERSON_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] })));

// Server: tags = z.array(z.string().trim().min(1).max(40)).max(50)
export const TAG_MAX_LEN = 40;
export const TAG_MAX_COUNT = 50;

export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const smsHref = (phone, body) =>
  `sms:${String(phone || '').replace(/[^\d+]/g, '')}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;

export const fmtWhen = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
export const fmtDay = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' });
};

// Run an action with busy/error state; `onDone` gets the result (invalidate here).
export function useAction(onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (name, input) => {
    setBusy(true);
    setError(null);
    try {
      // Knocks always go through the offline outbox (saved, sent once).
      const res = name === 'contact.log' ? await logContact(input) : await action(name, input);
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

// Filled, band-coloured chip. `code` null → quiet "—" chip.
export function RatingChip({ code, size, title }) {
  const r = ratingByCode(code);
  return (
    <span
      className={`rating-chip${size === 'sm' ? ' sm' : ''}`}
      data-band={r ? r.band : 'none'}
      title={title ?? (r ? r.label : 'Not yet rated')}
      aria-label={r ? r.label : 'Not yet rated'}
    >
      {r ? r.short : '—'}
    </span>
  );
}

// 1 2 3 4 | 4D 4B 4F 4N 4C — real buttons, ≥44px (40px compact).
export function RatingRow({ value, onPick, compact, disabled }) {
  const base = RATINGS.filter((r) => r.code.length === 1);
  const sub = RATINGS.filter((r) => r.code.length > 1);
  const btn = (r) => (
    <button
      key={r.code}
      type="button"
      className="rating-btn"
      data-band={r.band}
      aria-pressed={value === r.code}
      aria-label={r.label}
      title={r.label}
      disabled={disabled}
      onClick={() => onPick(r.code)}
    >
      {r.short}
    </button>
  );
  return (
    <div className={`rating-row${compact ? ' compact' : ''}`} role="group" aria-label="Rating">
      {base.map(btn)}
      <span className="rating-sep" aria-hidden="true" />
      {sub.map(btn)}
    </div>
  );
}

// Tag chips with × remove, a type-to-add input (Enter / comma), and suggested chips.
// One onChange per commit (a pasted "a, b" is one save, not two racing ones),
// enforcing the server's 40-char / 50-tag limits client-side.
export function TagEditor({ tags = [], onChange, suggestions = SUGGESTED_TAGS, autoFocus, disabled, inputId }) {
  const [draft, setDraft] = useState('');
  const [note, setNote] = useState(null);
  const inputRef = useRef(null);
  const refocus = useRef(false);
  // Person.jsx saves on every change and disables the input meanwhile, which
  // drops focus; put it back so you can keep typing tags.
  useEffect(() => {
    if (!disabled && refocus.current) {
      refocus.current = false;
      inputRef.current?.focus();
    }
  }, [disabled]);

  // Returns the pieces that could not be added (kept in the draft to fix).
  const addAll = (pieces) => {
    const next = [...tags];
    const rejected = [];
    let msg = null;
    for (const piece of pieces) {
      const clean = String(piece || '').trim();
      if (!clean || next.includes(clean)) continue;
      if (clean.length > TAG_MAX_LEN) { rejected.push(clean); msg = `Tags are ${TAG_MAX_LEN} characters max.`; continue; }
      if (next.length >= TAG_MAX_COUNT) { rejected.push(clean); msg = `${TAG_MAX_COUNT} tags max.`; continue; }
      next.push(clean);
    }
    setNote(msg);
    if (next.length !== tags.length) onChange(next);
    return rejected;
  };
  const add = (t) => addAll([t]);
  const remove = (t) => { setNote(null); onChange(tags.filter((x) => x !== t)); };
  const commitDraft = (keepFocus) => {
    const rejected = addAll(draft.split(','));
    setDraft(rejected.join(', '));
    if (keepFocus) refocus.current = true;
  };
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commitDraft(true); }
    else if (e.key === 'Backspace' && !draft && tags.length) { refocus.current = true; remove(tags[tags.length - 1]); }
  };
  const left = suggestions.filter((s) => !tags.includes(s));
  return (
    <div className="tag-editor">
      <div className="row">
        <span className="tag-chips">
          {tags.map((t) => (
            <span key={t} className="chip removable">
              {t}
              <button type="button" className="chip-x" aria-label={`Remove tag ${t}`} disabled={disabled} onClick={() => remove(t)}>×</button>
            </span>
          ))}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          className="input"
          placeholder="Add a tag, Enter to save"
          value={draft}
          autoFocus={autoFocus}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => draft.trim() && commitDraft(false)}
          aria-label="Add a tag"
        />
        {note && <span className="hint" role="status">{note}</span>}
      </div>
      {left.length > 0 && (
        <div className="row">
          <span className="eyebrow">Suggested</span>
          {left.map((s) => (
            <button key={s} type="button" className="chip-btn" disabled={disabled} onClick={() => add(s)}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TagChips({ tags }) {
  if (!tags || tags.length === 0) return <span className="muted">—</span>;
  return (
    <span className="tag-chips">
      {tags.map((t) => <span key={t} className="chip">{t}</span>)}
    </span>
  );
}

const addrLine = (p) => [p.address, p.unit ? `#${p.unit}` : null, p.city].filter(Boolean).join(', ');

// ─────────────────────────────────────────────────────────────────────────────
// Add person (inline, ?new=1)
// ─────────────────────────────────────────────────────────────────────────────
const EMPTY = { name: '', kind: 'person', email: '', phone: '', address: '', unit: '', city: 'Surrey', postal: '' };

function AddPersonForm({ onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY);
  const [tags, setTags] = useState([]);
  const act = useAction();
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const opt = (v) => (v && v.trim() ? v.trim() : undefined);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const res = await act.run('person.create', {
      name: form.name.trim(),
      kind: form.kind,
      email: opt(form.email),
      phone: opt(form.phone),
      address: opt(form.address),
      unit: opt(form.unit),
      city: opt(form.city),
      postal: opt(form.postal),
      tags,
    });
    if (!res?.person?.id) return;
    // A new address bumps the map's unlocated count and joins a household; a
    // media tag + email joins the press audience.
    invalidatePersonData(queryClient);
    navigate(`/people/${res.person.id}`);
  };

  return (
    <form className="card inline-form" onSubmit={submit}>
      <span className="eyebrow">Add person</span>
      <div className="form-row">
        <div className="field">
          <label htmlFor="np-name">Name (required)</label>
          <input id="np-name" className="input" required autoFocus maxLength={300} value={form.name} onChange={set('name')} />
        </div>
        <div className="field" style={{ flex: '0 1 160px' }}>
          <label htmlFor="np-kind">Kind</label>
          <select id="np-kind" className="input" value={form.kind} onChange={set('kind')}>
            <option value="person">Person</option>
            <option value="org">Organization</option>
          </select>
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="np-phone">Phone</label>
          <input id="np-phone" className="input mono" type="tel" inputMode="tel" maxLength={40} value={form.phone} onChange={set('phone')} />
        </div>
        <div className="field">
          <label htmlFor="np-email">Email</label>
          <input id="np-email" className="input" type="email" maxLength={320} value={form.email} onChange={set('email')} />
        </div>
      </div>
      <div className="form-row">
        <div className="field" style={{ flex: '2 1 220px' }}>
          <label htmlFor="np-address">Street address</label>
          <input id="np-address" className="input" maxLength={1000} value={form.address} onChange={set('address')} placeholder="13450 104 Ave" />
        </div>
        <div className="field" style={{ flex: '0 1 90px' }}>
          <label htmlFor="np-unit">Unit</label>
          <input id="np-unit" className="input" maxLength={40} value={form.unit} onChange={set('unit')} />
        </div>
        <div className="field">
          <label htmlFor="np-city">City</label>
          <input id="np-city" className="input" maxLength={120} value={form.city} onChange={set('city')} />
        </div>
        <div className="field" style={{ flex: '0 1 120px' }}>
          <label htmlFor="np-postal">Postal</label>
          <input id="np-postal" className="input mono" maxLength={20} value={form.postal} onChange={set('postal')} placeholder="V3T 1V8" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="np-tags">Tags</label>
        <TagEditor inputId="np-tags" tags={tags} onChange={setTags} />
      </div>
      {act.error && <p className="error">{act.error}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={act.busy}>Save person</button>
        <button type="button" className="btn btn-quiet" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Bank view — one card per person: Call/Text, then log it.
// ─────────────────────────────────────────────────────────────────────────────
function BankRow({ p, channel, me }) {
  const queryClient = useQueryClient();
  const [reached, setReached] = useState(false); // tapped Call/Text → prompt to log
  const [logged, setLogged] = useState(null);
  // Not awaited: the next row should be tappable while the list refetches.
  // A rating moves the map pin colour and the housemates' household lists.
  const act = useAction(() => { invalidatePersonData(queryClient); });

  const log = async (outcome, rating) => {
    const res = await act.run('contact.log', {
      person_id: p.id, channel, outcome, rating: rating || undefined,
    });
    if (res) { setLogged({ outcome, rating, queued: !!res.queued }); setReached(false); }
  };

  const first = (p.name || '').split(/\s+/)[0];
  const mine = (me?.user?.name || '').split(/\s+/)[0];
  const body = `Hi ${first}, it's ${mine} with ${me?.workspace?.name || 'the campaign'}.`;
  const noun = channel === 'text' ? 'text' : 'call';
  const current = logged?.rating ?? p.rating;

  return (
    <li className={`bank-row${logged ? ' done' : ''}`}>
      <div className="bank-head">
        <Link className="name" to={`/people/${p.id}`}>{p.name}</Link>
        <span className="tag-chips">
          <RatingChip code={current} />
          {(p.tags || []).slice(0, 3).map((t) => <span key={t} className="chip">{t}</span>)}
        </span>
      </div>
      <div className="bank-contact">
        <span className="mono">{p.phone}</span>
        {addrLine(p) && <span>{addrLine(p)}</span>}
      </div>
      <div className="bank-actions">
        {!p.phone ? (
          <span className="muted">No phone on file</span>
        ) : channel === 'text' ? (
          <a className="btn btn-primary btn-tap" href={smsHref(p.phone, body)} onClick={() => setReached(true)}>Text {first}</a>
        ) : (
          <a className="btn btn-primary btn-tap" href={telHref(p.phone)} onClick={() => setReached(true)}>Call {first}</a>
        )}
        {channel === 'phone' && p.phone && (
          <a className="btn btn-quiet btn-tap" href={smsHref(p.phone, body)} onClick={() => setReached(true)}>Text instead</a>
        )}
        {reached && !logged && <span className="hint now">Now log this {noun} →</span>}
        {logged && (
          <span className="logged">
            {logged.queued ? '✓ saved offline' : '✓ logged'} {logged.rating ? `as ${logged.rating}` : logged.outcome.replace('_', ' ')} via {noun}
          </span>
        )}
      </div>
      <div className="bank-log">
        <RatingRow compact value={current} onPick={(code) => log('contacted', code)} disabled={act.busy} />
        <span className="outcomes">
          <button type="button" className="btn btn-tap" disabled={act.busy} onClick={() => log('no_answer')}>
            {channel === 'text' ? 'No reply' : 'No answer'}
          </button>
          <button type="button" className="btn btn-quiet btn-tap" disabled={act.busy} onClick={() => log('refused')}>Refused</button>
        </span>
        {act.error && <span className="error">{act.error}</span>}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The screen
// ─────────────────────────────────────────────────────────────────────────────
export default function People() {
  const navigate = useNavigate();
  const { me } = useOutletContext() ?? {};
  const [params, setParams] = useSearchParams();
  const desk = canDesk(me); // person.create is desk-only

  const q = params.get('q') || '';
  const tag = params.get('tag') || '';
  const rating = params.get('rating') || '';
  const role = params.get('role') || '';
  // contact.log's channel is an enum — never pass a hand-edited ?bank= through.
  const bankParam = params.get('bank');
  const bank = bankParam === 'phone' || bankParam === 'text' ? bankParam : ''; // '' | phone | text
  // The bank view only works with a phone number, whatever the URL says.
  const has = bank ? 'phone' : (params.get('has') || '');
  const showNew = params.get('new') === '1' && desk;

  // Patch the URL in place; empty values drop the key.
  const update = (patch, { replace = true } = {}) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '' || v === false) next.delete(k);
      else next.set(k, String(v));
    }
    setParams(next, { replace });
  };

  const qs = new URLSearchParams({ q, limit: '300' });
  if (tag) qs.set('tag', tag);
  if (rating) qs.set('rating', rating);
  if (role) qs.set('role', role);
  if (has) qs.set('has', has);

  const persons = useQuery({
    queryKey: ['persons', 'list', qs.toString()],
    queryFn: () => apiGet(`/persons?${qs}`),
    placeholderData: keepPreviousData,
  });
  const rows = persons.data?.persons ?? [];

  // Tag vocabulary: suggested first, then anything seen in the results.
  const seen = new Set(rows.flatMap((p) => p.tags || []));
  if (tag) seen.add(tag);
  const tagOptions = [...SUGGESTED_TAGS, ...[...seen].filter((t) => !SUGGESTED_TAGS.includes(t)).sort()];

  const anyFilter = Boolean(tag || rating || role || has || q);
  const roleLabel = VOLUNTEER_ROLES.find((r) => r.code === role)?.label;

  const startBank = (kind) => update({ bank: kind, has: 'phone', new: null }, { replace: false });
  const exitBank = () => update({ bank: null });

  return (
    <>
      <div className="page-head">
        <h1>People</h1>
        <div className="head-actions">
          {!bank && (
            <>
              <button type="button" className="btn" onClick={() => startBank('phone')}>Phone bank</button>
              <button type="button" className="btn" onClick={() => startBank('text')}>Text bank</button>
            </>
          )}
          {desk && !bank && <Link className="btn" to="/people/import">Import CSV</Link>}
          {desk && !showNew && !bank && (
            <button type="button" className="btn btn-primary" onClick={() => update({ new: '1' }, { replace: false })}>
              Add person
            </button>
          )}
          {bank && <button type="button" className="btn" onClick={exitBank}>Exit {bank} bank</button>}
        </div>
      </div>

      {showNew && !bank && <AddPersonForm onClose={() => update({ new: null })} />}

      {bank && (
        <div className="banner bank-banner" role="status">
          <span>
            <strong>{bank === 'text' ? 'Text bank' : 'Phone bank'}.</strong>{' '}
            Tap {bank === 'text' ? 'Text' : 'Call'} to open your {bank === 'text' ? 'messages' : 'dialer'}, then tap a rating or
            “{bank === 'text' ? 'No reply' : 'No answer'}” to log it. Only people with a phone number are listed.
          </span>
          <span className="hint">{rows.length} to {bank === 'text' ? 'text' : 'call'}</span>
        </div>
      )}

      <div className="field">
        <label htmlFor="people-q">Search</label>
        <input
          id="people-q" className="input" type="search" placeholder="Name, email, phone or address…"
          value={q} onChange={(e) => update({ q: e.target.value })}
        />
      </div>

      <div className="filters" aria-label="Filters">
        <div className={`filter-group${rating ? ' has-pick' : ''}`}>
          <span className="eyebrow">Rating</span>
          {RATINGS.map((r) => (
            <button
              key={r.code}
              type="button"
              className={`rating-chip${rating === r.code ? ' on' : ''}`}
              data-band={r.band}
              title={r.label}
              aria-pressed={rating === r.code}
              onClick={() => update({ rating: rating === r.code ? null : r.code })}
            >
              {r.short}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="eyebrow">Tag</span>
          {tagOptions.map((t) => (
            <button key={t} type="button" className={`chip-btn${tag === t ? ' on' : ''}`} aria-pressed={tag === t}
              onClick={() => update({ tag: tag === t ? null : t })}>
              {t}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="eyebrow">Role</span>
          {VOLUNTEER_ROLES.map((r) => (
            <button key={r.code} type="button" className={`chip-btn${role === r.code ? ' on' : ''}`} aria-pressed={role === r.code}
              onClick={() => update({ role: role === r.code ? null : r.code })}>
              {r.label}
            </button>
          ))}
        </div>
        <div className="filter-group">
          <span className="eyebrow">Has</span>
          <button type="button" className={`chip-btn${has === 'phone' ? ' on' : ''}`} aria-pressed={has === 'phone'}
            disabled={!!bank} title={bank ? 'Bank view always needs a phone' : undefined}
            onClick={() => update({ has: has === 'phone' ? null : 'phone' })}>
            phone
          </button>
          <button type="button" className={`chip-btn${has === 'email' ? ' on' : ''}`} aria-pressed={has === 'email'}
            disabled={!!bank}
            onClick={() => update({ has: has === 'email' ? null : 'email' })}>
            email
          </button>
          <button type="button" className={`chip-btn${has === 'location' ? ' on' : ''}`} aria-pressed={has === 'location'}
            disabled={!!bank}
            onClick={() => update({ has: has === 'location' ? null : 'location' })}>
            map pin
          </button>
        </div>
      </div>

      <div className="count-line">
        <span className="eyebrow">
          {persons.isLoading ? 'Loading…' : `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`}
          {rows.length >= 300 ? ' (first 300 — narrow the search)' : ''}
        </span>
        {rating && <RatingChip code={rating} size="sm" />}
        {tag && <span className="chip">{tag}</span>}
        {roleLabel && <span className="chip">{roleLabel}</span>}
        {anyFilter && (
          <button type="button" className="btn btn-quiet btn-sm"
            onClick={() => update({ q: null, tag: null, rating: null, role: null, has: bank ? 'phone' : null })}>
            Clear filters
          </button>
        )}
      </div>

      {persons.isError && <p className="error">{persons.error.message}</p>}

      {bank ? (
        <ul className="bank-list">
          {rows.map((p) => <BankRow key={p.id} p={p} channel={bank} me={me} />)}
          {rows.length === 0 && !persons.isLoading && (
            <li className="muted">No one with a phone number matches these filters.</li>
          )}
        </ul>
      ) : (
        <table className="table people-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Rating</th>
              <th>Tags</th>
              <th>Phone</th>
              <th className="col-wide">Email</th>
              <th className="col-wide">Address</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="rowlink" onClick={() => navigate(`/people/${p.id}`)}>
                <td className="name">
                  <Link to={`/people/${p.id}`} onClick={(e) => e.stopPropagation()}>{p.name}</Link>
                  {p.kind === 'org' && <> <span className="chip chip-ghost">org</span></>}
                </td>
                <td><RatingChip code={p.rating} /></td>
                <td><TagChips tags={p.tags} /></td>
                <td>
                  {p.phone
                    ? <a className="tel" href={telHref(p.phone)} onClick={(e) => e.stopPropagation()}>{p.phone}</a>
                    : <span className="muted">—</span>}
                </td>
                <td className="col-wide">
                  {p.email
                    ? <a href={`mailto:${p.email}`} onClick={(e) => e.stopPropagation()}>{p.email}</a>
                    : <span className="muted">—</span>}
                </td>
                <td className="col-wide">{addrLine(p) || <span className="muted">—</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && !persons.isLoading && (
              <tr>
                <td colSpan={6} className="muted">
                  {anyFilter ? 'No one matches these filters.' : desk ? 'No people yet — add the first one.' : 'No people yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </>
  );
}
