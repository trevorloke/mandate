// Shifts — volunteer scheduling. /shifts lists upcoming shifts grouped by day
// (past ones folded away); ?new=1 opens the create form. /shifts/:id is the
// roster: assignees with status, notification receipts, a type-ahead to add
// volunteers (people already holding the shift's role float to the top), and
// one big button to notify everyone by email + text.
//
// Also exports two small building blocks reused by Signs and Today:
//   <PersonPicker onPick={(person) => …} />   type-ahead over /api/persons?q=
//   <FillBar filled={n} capacity={m} />       filled / capacity meter
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { VOLUNTEER_ROLES, SHIFT_STATUSES } from '@starbase/shared/canvass';
import { apiGet, action } from '../api.js';
import './shifts.css';

const roleLabel = (code) => VOLUNTEER_ROLES.find((r) => r.code === code)?.label ?? code;
const statusLabel = (s) => String(s || '').replace(/_/g, ' ');

// ── Time helpers (everything on screen is local time) ──
const pad = (n) => String(n).padStart(2, '0');

// datetime-local value ("2026-10-21T18:00") → ISO with this device's offset
// ("2026-10-21T18:00:00-07:00"), so the server stores the moment the organizer meant.
const localToISO = (value) => {
  if (!value) return null;
  const d = new Date(value); // no offset in the string → parsed as local time
  if (Number.isNaN(d.getTime())) return null;
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`
    + `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

const dayKey = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmtTime = (iso) => new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const fmtShortDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
const fmtLongDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

const dayLabel = (iso) => {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Today';
  if (dayKey(iso) === dayKey(tomorrow.toISOString())) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' });
};

const fmtRange = (starts, ends) => {
  if (!ends) return fmtTime(starts);
  if (dayKey(starts) === dayKey(ends)) return `${fmtTime(starts)} – ${fmtTime(ends)}`;
  return `${fmtTime(starts)} – ${fmtShortDay(ends)} ${fmtTime(ends)}`;
};
const fmtWhen = (starts, ends) => `${fmtShortDay(starts)} · ${fmtRange(starts, ends)}`;
const fmtStamp = (iso) => (iso
  ? new Date(iso).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : '');

// Only http(s) links become clickable; bare domains get https:// in front.
const BARE_DOMAIN = /^[\w-]+(\.[\w-]+)+([/?#]|$)/;
const safeHref = (link) => {
  const v = String(link || '').trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (BARE_DOMAIN.test(v)) return `https://${v}`;
  return null;
};
// What gets saved: a pasted "bit.ly/turf" is stored as https://bit.ly/turf so
// the link in the email/text is tappable too. Anything else is kept as typed.
const normalizeLink = (link) => {
  const v = String(link || '').trim();
  if (!v) return undefined;
  if (!/^[a-z][a-z\d+.-]*:/i.test(v) && BARE_DOMAIN.test(v)) return `https://${v}`;
  return v;
};

// The server 500s on a malformed uuid in the path, so a hand-typed or
// truncated link is treated as "not found" before it ever hits the API.
const isUuid = (v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v || ''));

const ASSIGN_TONE = { assigned: '', confirmed: 'ok', completed: 'ok', declined: 'danger', no_show: 'danger' };
const NOTIFY_CHIP = { sent: 'chip-ok', queued: 'chip-warn', failed: 'chip-danger', skipped: '' };
const NOTIFY_TITLE = {
  sent: 'delivered to the provider',
  queued: 'saved — no provider connected yet',
  failed: 'the provider rejected it',
  skipped: 'nothing on file for this channel',
};

function NotifyChip({ channel, status }) {
  if (!status) return null;
  return (
    <span className={`chip ${NOTIFY_CHIP[status] ?? ''}`.trim()} title={`${channel}: ${NOTIFY_TITLE[status] ?? status}`}>
      {channel} {status}
    </span>
  );
}

// ── Fill bar: filled / capacity ──
export function FillBar({ filled = 0, capacity }) {
  const n = Number(filled) || 0;
  if (!capacity) {
    return (
      <span className="ops-fill" aria-label={`${n} signed up, no cap`}>
        <span className="ops-fill-num mono">{n} signed up</span>
      </span>
    );
  }
  const pct = Math.min(100, Math.round((n / capacity) * 100));
  const full = n >= capacity;
  return (
    <span className="ops-fill" data-full={full ? '' : undefined} aria-label={`${n} of ${capacity} spots filled`}>
      <span className="ops-fill-track" aria-hidden="true">
        <span className="ops-fill-bar" style={{ width: `${pct}%` }} />
      </span>
      <span className="ops-fill-num mono">{n}/{capacity}{full ? ' full' : ''}</span>
    </span>
  );
}

// ── Person picker: type-ahead over /api/persons?q=, arrow keys, inline create ──
// roleHint: a VOLUNTEER_ROLES code; people holding it are listed first with a
// 'matching role' chip. excludeIds: shown but not pickable (already on it).
export function PersonPicker({
  id,
  onPick,
  roleHint = null,
  excludeIds = [],
  excludeLabel = 'already added',
  allowCreate = true,
  placeholder = 'Start typing a name…',
  meta = (p) => p.email || p.phone || p.address,
  disabled = false,
}) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const boxRef = useRef(null);
  const listId = `${id}-options`;
  const enc = encodeURIComponent;

  const general = useQuery({
    queryKey: ['persons', 'search', q],
    queryFn: () => apiGet(`/persons?q=${enc(q)}&limit=8`),
    enabled: open,
    placeholderData: keepPreviousData,
  });
  const matching = useQuery({
    queryKey: ['persons', 'search', q, 'role', roleHint],
    queryFn: () => apiGet(`/persons?q=${enc(q)}&role=${enc(roleHint)}&limit=8`),
    enabled: open && !!roleHint,
    placeholderData: keepPreviousData,
  });

  const excludeKey = excludeIds.join(',');
  const items = useMemo(() => {
    const taken = new Set(excludeKey ? excludeKey.split(',') : []);
    const seen = new Set();
    const out = [];
    const add = (p, match) => {
      if (seen.has(p.id)) return;
      seen.add(p.id);
      out.push({ ...p, _match: match, _taken: taken.has(p.id) });
    };
    for (const p of (roleHint ? matching.data?.persons : null) ?? []) add(p, true);
    for (const p of general.data?.persons ?? []) add(p, false);
    const trimmed = q.trim();
    if (allowCreate && trimmed && !out.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) {
      out.push({ id: '__create__', name: trimmed });
    }
    return out;
  }, [general.data, matching.data, roleHint, excludeKey, q, allowCreate]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const choose = async (item) => {
    if (!item || item._taken || busy) return;
    setError(null);
    setBusy(true);
    try {
      let person = item;
      if (item.id === '__create__') {
        const res = await action('person.create', { name: item.name });
        queryClient.invalidateQueries({ queryKey: ['persons'] });
        queryClient.invalidateQueries({ queryKey: ['brief'] });
        person = res.person;
      }
      setQ('');
      setOpen(false);
      await onPick?.(person);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { if (open && items.length) { e.preventDefault(); choose(items[active]); } }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div className="picker ops-picker" ref={boxRef}>
      <input
        id={id}
        className="input"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && items[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={placeholder}
        value={q}
        disabled={disabled || busy}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && items.length > 0 && (
        <ul className="picker-list" id={listId} role="listbox">
          {items.map((item, i) => (
            <li
              key={item.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              aria-disabled={item._taken || undefined}
              className={(i === active ? 'active ' : '') + (item.id === '__create__' ? 'create' : '')}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => { e.preventDefault(); choose(item); }}
            >
              {item.id === '__create__' ? (
                <>+ Add new person “{item.name}”</>
              ) : (
                <>
                  <span>{item.name}</span>
                  {item._match && <span className="chip chip-ok">matching role</span>}
                  {item._taken && <span className="chip">{excludeLabel}</span>}
                  {meta(item) && <span className="meta">{meta(item)}</span>}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {open && items.length === 0 && q.trim() && general.isSuccess && !general.isPlaceholderData && (
        <div className="ops-picker-hint" role="status">No one matches “{q.trim()}”.</div>
      )}
      {roleHint && (
        <div className="ops-picker-hint">
          <span className="chip chip-ok">matching role</span> people with the {roleLabel(roleHint)} role are listed first
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ── New shift form ──
function ShiftForm({ onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [f, setF] = useState({
    title: '', role: '', location: '', starts: '', ends: '', capacity: '', link: '', instructions: '',
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    const starts_at = localToISO(f.starts);
    const ends_at = localToISO(f.ends);
    if (!f.title.trim()) { setError('give the shift a title'); return; }
    if (!starts_at) { setError('pick when the shift starts'); return; }
    if (ends_at && new Date(ends_at) <= new Date(starts_at)) { setError('the end has to be after the start'); return; }
    let capacity;
    if (f.capacity.trim()) {
      capacity = Number(f.capacity);
      if (!Number.isInteger(capacity) || capacity < 1) { setError('capacity is a whole number of people, 1 or more'); return; }
    }
    setBusy(true);
    try {
      const res = await action('shift.create', {
        title: f.title.trim(),
        role: f.role || undefined,
        location: f.location.trim() || undefined,
        starts_at,
        ends_at: ends_at || undefined,
        instructions: f.instructions.trim() || undefined,
        link: normalizeLink(f.link),
        capacity,
      });
      queryClient.invalidateQueries({ queryKey: ['shifts'] });
      queryClient.invalidateQueries({ queryKey: ['brief'] });
      navigate(`/shifts/${res.shift.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <span className="eyebrow">New shift</span>
      <div className="field">
        <label htmlFor="shift-title">Title</label>
        <input id="shift-title" className="input" required autoFocus placeholder="Saturday doorknock — Fleetwood"
          value={f.title} onChange={set('title')} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="shift-role">Role</label>
          <select id="shift-role" className="input" value={f.role} onChange={set('role')}>
            <option value="">Any role</option>
            {VOLUNTEER_ROLES.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="shift-capacity">Capacity</label>
          <input id="shift-capacity" className="input mono" type="number" min="1" step="1" inputMode="numeric"
            placeholder="no cap" value={f.capacity} onChange={set('capacity')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="shift-location">Location</label>
        <input id="shift-location" className="input" placeholder="Meet at the campaign office"
          value={f.location} onChange={set('location')} />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="shift-starts">Starts</label>
          <input id="shift-starts" className="input mono" type="datetime-local" required
            value={f.starts} onChange={set('starts')} />
        </div>
        <div className="field">
          <label htmlFor="shift-ends">Ends</label>
          <input id="shift-ends" className="input mono" type="datetime-local" min={f.starts || undefined}
            value={f.ends} onChange={set('ends')} />
        </div>
      </div>
      <div className="field">
        <label htmlFor="shift-link">Link</label>
        {/* type=text + inputMode=url: native type=url would refuse a bare "bit.ly/turf". */}
        <input id="shift-link" className="input" type="text" inputMode="url" autoCapitalize="none"
          autoCorrect="off" spellCheck={false} placeholder="https://… (turf map, sign-up doc, call script)"
          value={f.link} onChange={set('link')} />
      </div>
      <div className="field">
        <label htmlFor="shift-instructions">Instructions</label>
        <textarea id="shift-instructions" className="input" rows={4}
          placeholder="What to bring, who to ask for, parking…"
          value={f.instructions} onChange={set('instructions')} />
      </div>
      {error && <p className="error">{error}</p>}
      <div className="ops-actions">
        <button type="submit" className="btn btn-primary ops-tap" disabled={busy}>{busy ? 'Saving…' : 'Create shift'}</button>
        <button type="button" className="btn btn-quiet ops-tap" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

// ── List ──
function ShiftRow({ s, now }) {
  const live = new Date(s.starts_at) <= now && now < new Date(s.ends_at || s.starts_at);
  return (
    <li>
      <Link to={`/shifts/${s.id}`} className="ops-shift">
        <span className="t">
          {s.title}
          {s.role && <span className="chip">{roleLabel(s.role)}</span>}
          {live && <span className="chip chip-warn">on now</span>}
        </span>
        <span className="when">
          {fmtWhen(s.starts_at, s.ends_at)}
          {s.location && <span className="where"> · {s.location}</span>}
        </span>
        <span className="right"><FillBar filled={s.filled} capacity={s.capacity} /></span>
      </Link>
    </li>
  );
}

function ShiftList({ canDesk }) {
  const [params, setParams] = useSearchParams();
  const showNew = params.get('new') === '1';
  const shifts = useQuery({ queryKey: ['shifts'], queryFn: () => apiGet('/shifts') });

  const now = new Date();
  const all = shifts.data?.shifts ?? [];
  const isPast = (s) => new Date(s.ends_at || s.starts_at) < now;
  const upcoming = all.filter((s) => !isPast(s));
  const past = all.filter(isPast).reverse(); // most recent first

  const groups = [];
  for (const s of upcoming) {
    const key = dayKey(s.starts_at);
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) {
      g = { key, label: dayLabel(s.starts_at), items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">Volunteers</span>
          <h1>Shifts</h1>
        </div>
        {canDesk && !showNew && (
          <button type="button" className="btn btn-primary ops-tap" onClick={() => setParams({ new: '1' })}>
            New shift
          </button>
        )}
      </div>

      {showNew && canDesk && <ShiftForm onClose={() => setParams({})} />}

      {shifts.isPending && <p className="muted">Loading shifts…</p>}
      {shifts.isError && <p className="error">{shifts.error.message}</p>}

      {shifts.isSuccess && upcoming.length === 0 && (
        <p className="ops-empty">
          No upcoming shifts.{' '}
          {canDesk && !showNew && <Link to="/shifts?new=1">Plan the next doorknock →</Link>}
        </p>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-label={g.label}>
          <span className="eyebrow ops-day">{g.label}</span>
          <ul className="ops-shift-list">
            {g.items.map((s) => <ShiftRow key={s.id} s={s} now={now} />)}
          </ul>
        </section>
      ))}

      {past.length > 0 && (
        <details className="ops-past">
          <summary><span className="eyebrow">Past shifts · {past.length}</span></summary>
          <ul className="ops-shift-list">
            {past.map((s) => <ShiftRow key={s.id} s={s} now={now} />)}
          </ul>
        </details>
      )}
    </>
  );
}

// ── Detail ──
function ShiftDetail({ id, canDesk }) {
  const queryClient = useQueryClient();
  const validId = isUuid(id);
  const shiftQ = useQuery({ queryKey: ['shift', id], queryFn: () => apiGet(`/shifts/${id}`), enabled: validId });
  // Providers are read once; the brief is shared with Today so it is usually cached.
  const brief = useQuery({ queryKey: ['brief'], queryFn: () => apiGet('/brief'), staleTime: Infinity });

  const [rowBusy, setRowBusy] = useState(null);
  const [error, setError] = useState(null);
  const [added, setAdded] = useState(null);
  const [addError, setAddError] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState(null);
  const [notifyError, setNotifyError] = useState(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['shift', id] });
    queryClient.invalidateQueries({ queryKey: ['shifts'] });
    queryClient.invalidateQueries({ queryKey: ['brief'] });
    queryClient.invalidateQueries({ queryKey: ['person'] });
  };

  if (!validId || shiftQ.isError) {
    return (
      <>
        <Link to="/shifts" className="ops-back">← All shifts</Link>
        <p className="error">
          {!validId || shiftQ.error.status === 404 ? 'That shift does not exist (or was removed).' : shiftQ.error.message}
        </p>
      </>
    );
  }
  // isPending, not isLoading: a query paused offline is pending but not
  // fetching, and reading shiftQ.data below would throw.
  if (shiftQ.isPending) return <p className="muted">Loading the shift…</p>;

  const { shift, assignees } = shiftQ.data;
  const active = assignees.filter((a) => a.status === 'assigned' || a.status === 'confirmed');
  const full = shift.capacity && active.length >= shift.capacity;
  const href = safeHref(shift.link);
  const providers = brief.data?.providers;
  const missingEmail = providers && !providers.email;
  const missingText = providers && !providers.text;
  let providerNote = null;
  if (missingEmail && missingText) providerNote = 'Email/SMS providers not connected — notifications are saved as queued';
  else if (missingEmail) providerNote = 'Email provider not connected — emails are saved as queued';
  else if (missingText) providerNote = 'SMS provider not connected — texts are saved as queued';

  const setStatus = async (a, status) => {
    setError(null);
    setRowBusy(a.assignment_id);
    queryClient.setQueryData(['shift', id], (cur) => cur && ({
      ...cur,
      assignees: cur.assignees.map((x) => (x.assignment_id === a.assignment_id ? { ...x, status } : x)),
    }));
    try {
      await action('shift.setStatus', { id: a.assignment_id, status });
    } catch (e) {
      setError(`${a.name}: ${e.message}`);
    } finally {
      setRowBusy(null);
      refresh();
    }
  };

  const unassign = async (a) => {
    setError(null);
    setRowBusy(a.assignment_id);
    try {
      await action('shift.unassign', { id: a.assignment_id });
      setAdded(null);
    } catch (e) {
      setError(`${a.name}: ${e.message}`);
    } finally {
      setRowBusy(null);
      refresh();
    }
  };

  const assign = async (person) => {
    setAddError(null);
    setAdded(null);
    try {
      await action('shift.assign', { shift_id: shift.id, person_id: person.id });
      setAdded(person.name);
      refresh();
    } catch (e) {
      setAddError(e.status === 409 ? `${person.name}: ${e.message}` : e.message);
    }
  };

  const notify = async () => {
    setNotifyError(null);
    setSending(true);
    try {
      const res = await action('shift.notify', { shift_id: shift.id });
      setResults(res.notified ?? []);
      setConfirming(false);
      refresh();
    } catch (e) {
      setNotifyError(e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Link to="/shifts" className="ops-back">← All shifts</Link>
      <span className="eyebrow" style={{ display: 'block' }}>
        Shift{shift.role ? ` · ${roleLabel(shift.role)}` : ''}
      </span>
      <h1>{shift.title}</h1>

      <div className="ops-facts">
        <div>
          <span className="eyebrow">When</span>
          <span className="v">{fmtLongDay(shift.starts_at)}</span>
          <span className="v mono">{fmtRange(shift.starts_at, shift.ends_at)}</span>
        </div>
        <div>
          <span className="eyebrow">Where</span>
          <span className="v">{shift.location || <span className="muted">—</span>}</span>
        </div>
        <div>
          <span className="eyebrow">Spots</span>
          <span className="v"><FillBar filled={active.length} capacity={shift.capacity} /></span>
        </div>
        {shift.link && (
          <div>
            <span className="eyebrow">Link</span>
            <span className="v">
              {href
                ? <a href={href} target="_blank" rel="noopener noreferrer">{shift.link.replace(/^https?:\/\//i, '')}</a>
                : shift.link}
            </span>
          </div>
        )}
      </div>

      {shift.instructions && (
        <section className="card">
          <span className="eyebrow">Instructions</span>
          <p className="ops-instructions">{shift.instructions}</p>
        </section>
      )}

      {canDesk && (
        <section className="ops-notify" aria-label="Notify volunteers">
          {!confirming ? (
            <button
              type="button"
              className="btn btn-primary ops-notify-btn"
              disabled={active.length === 0}
              onClick={() => { setConfirming(true); setResults(null); setNotifyError(null); }}
            >
              Notify everyone (email + text)
            </button>
          ) : (
            <div className="ops-actions">
              <button type="button" className="btn btn-primary ops-tap" onClick={notify} disabled={sending}>
                {sending ? 'Sending…' : `Send to ${active.length} ${active.length === 1 ? 'person' : 'people'}`}
              </button>
              <button type="button" className="btn btn-quiet ops-tap" onClick={() => setConfirming(false)} disabled={sending}>
                Cancel
              </button>
            </div>
          )}
          <div className="sub">
            {active.length === 0
              ? 'Add volunteers first — assigned and confirmed people get the message.'
              : 'Time, place, instructions and link go to everyone assigned or confirmed.'}
          </div>
          {providerNote && (
            <div className="ops-quiet-note">
              <span>{providerNote}</span>
              <Link to="/outreach/website">Connect →</Link>
            </div>
          )}
          {notifyError && <p className="error">{notifyError}</p>}
          {results && (
            results.length === 0 ? (
              <p className="ops-empty">Nobody was assigned or confirmed, so nothing was sent.</p>
            ) : (
              <ul className="ops-results" aria-label="Notification results">
                {results.map((r) => (
                  <li key={r.person_id}>
                    <span>{r.name}</span>
                    <span className="chips">
                      <NotifyChip channel="email" status={r.email} />
                      <NotifyChip channel="text" status={r.text} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          )}
        </section>
      )}

      <section className="card">
        <span className="eyebrow">Volunteers · {assignees.length}</span>
        {error && <p className="error">{error}</p>}
        {assignees.length === 0 ? (
          <p className="ops-empty">Nobody on this shift yet.</p>
        ) : (
          <table className="table ops-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th>Notified</th>
                {canDesk && <th><span className="ops-sr">Remove</span></th>}
              </tr>
            </thead>
            <tbody>
              {assignees.map((a) => (
                <tr key={a.assignment_id}>
                  <td className="name"><Link to={`/people/${a.id}`}>{a.name}</Link></td>
                  <td data-label="Phone">
                    {a.phone ? <a className="ops-tel" href={`tel:${a.phone}`}>{a.phone}</a> : <span className="muted">—</span>}
                  </td>
                  <td data-label="Email" className="wrap-any">
                    {a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : <span className="muted">—</span>}
                  </td>
                  <td data-label="Status">
                    {canDesk ? (
                      <select
                        className="ops-status"
                        data-tone={ASSIGN_TONE[a.status] || undefined}
                        aria-label={`Status for ${a.name}`}
                        value={a.status}
                        disabled={rowBusy === a.assignment_id}
                        onChange={(e) => setStatus(a, e.target.value)}
                      >
                        {SHIFT_STATUSES.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}
                      </select>
                    ) : (
                      <span className={`chip ${ASSIGN_TONE[a.status] ? `chip-${ASSIGN_TONE[a.status]}` : ''}`.trim()}>
                        {statusLabel(a.status)}
                      </span>
                    )}
                  </td>
                  <td data-label="Notified">
                    {a.notified_at ? (
                      <span className="chips">
                        <span className="mono ops-meta">{fmtStamp(a.notified_at)}</span>
                        <NotifyChip channel="email" status={a.notify_email} />
                        <NotifyChip channel="text" status={a.notify_text} />
                      </span>
                    ) : <span className="muted">not yet</span>}
                  </td>
                  {canDesk && (
                    <td>
                      <button
                        type="button"
                        className="btn btn-quiet ops-tap"
                        aria-label={`Remove ${a.name} from this shift`}
                        disabled={rowBusy === a.assignment_id}
                        onClick={() => unassign(a)}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canDesk && (
        <section className="card">
          <span className="eyebrow">Add volunteer</span>
          <div className="field">
            <label htmlFor="shift-add-person">Person</label>
            <PersonPicker
              id="shift-add-person"
              roleHint={shift.role || null}
              excludeIds={assignees.map((a) => a.id)}
              excludeLabel="on this shift"
              placeholder="Type a name, email or phone…"
              onPick={assign}
            />
          </div>
          {full && <p className="ops-meta">This shift is full — mark someone declined to open a spot.</p>}
          {addError && <p className="error">{addError}</p>}
          {added && <p className="ok-text mono" role="status">✓ {added} added</p>}
        </section>
      )}
    </>
  );
}

export default function Shifts() {
  const { id } = useParams();
  const { me } = useOutletContext();
  // Shift writes are desk work (manager / treasurer / staff); volunteers can read.
  const canDesk = me?.role !== 'volunteer';
  return id
    ? <ShiftDetail key={id} id={id} canDesk={canDesk} />
    : <ShiftList canDesk={canDesk} />;
}
