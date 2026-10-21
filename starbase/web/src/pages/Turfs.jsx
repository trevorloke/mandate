// Turfs + walk lists — the canvassing core.
//   /turfs      every turf (volunteers: only the ones assigned to them) with
//               doors left and progress; tap one for its walk list.
//   /turfs/:id  THE WALK LIST: doors in the server's walk order (street by
//               street, odd side up, even side back — never re-sorted here),
//               each person one tap from the rating row. Every knock goes
//               through the offline outbox, so a dead zone mid-block loses
//               nothing; the list shows what this phone logged right away.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ratingByCode } from '@starbase/shared/canvass';
import { apiGet } from '../api.js';
import { logContact, useOutbox } from '../offline.js';
import RatingButtons, { RatingChip } from '../components/RatingButtons.jsx';
import './turfs.css';

const DESK_ROLES = ['manager', 'treasurer', 'staff'];
const TURF_COLORS = ['#2b6cb0', '#7b3fa0', '#b5651d', '#1f7a6d', '#a0306a', '#4c5a8a'];
const OUTCOME_BUTTONS = [
  { code: 'no_answer', label: 'No answer' },
  { code: 'refused', label: 'Refused' },
  { code: 'moved', label: 'Moved' },
  { code: 'inaccessible', label: 'Inaccessible' },
];
const OUTCOME_LABEL = {
  contacted: 'Talked', no_answer: 'No answer', refused: 'Refused', moved: 'Moved', inaccessible: 'Inaccessible',
};
const QUEUED_TEXT = 'Saved — will send when you’re back online';
// Everything a knock changes: this walk list, turf progress, map pins,
// profiles and lists (ratings), the contact feed, Today.
const KNOCK_KEYS = ['turfs', 'doors', 'person', 'persons', 'contacts', 'brief'];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const norm = (s) => String(s || '').trim().toLowerCase();
const hashIndex = (s, n) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % n; };
const isColor = (c) => typeof c === 'string' && c.length <= 20 && typeof CSS !== 'undefined' && CSS.supports?.('color', c);
// Same fallback as the map, so a turf is the same color on both screens.
const turfColor = (t) => (isColor(t?.color) ? t.color : TURF_COLORS[hashIndex(t?.id || t?.name || '', TURF_COLORS.length)]);
const doorLabel = (d) => (d.address ? (d.unit ? `${d.unit} – ${d.address}` : d.address) : 'Door with no address');
const isDnc = (p) => Array.isArray(p.tags) && p.tags.includes('do-not-contact');
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// "3:41 p.m." today, "Oct 18" before that — the canvasser's local clock.
const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
};

function ProgressBar({ done, total, label = 'Doors done' }) {
  const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <span
      className="walk-bar" role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(done, total)}
    >
      <span className="walk-bar__fill" style={{ width: `${pct}%` }} />
    </span>
  );
}

// Keep the sticky "Next door" bar above the phone tab bar.
function useTabbarHeight(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const h = Math.ceil(document.querySelector('.tabbar')?.getBoundingClientRect().height || 0);
      el.style.setProperty('--tabbar-h', `${h}px`);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ref]);
}

export default function Turfs() {
  const { id } = useParams();
  return id ? <WalkList key={id} id={id} /> : <TurfList />;
}

// ─────────────────────────────────────────────────────────────────────────────
// /turfs
// ─────────────────────────────────────────────────────────────────────────────

function TurfList() {
  const { me } = useOutletContext();
  const desk = DESK_ROLES.includes(me?.role);
  // Always refetch on open: knocks logged from the map's door card don't
  // touch this cache, and progress is the point of the page.
  const q = useQuery({ queryKey: ['turfs'], queryFn: () => apiGet('/turfs'), refetchOnMount: 'always' });
  const turfs = q.data?.turfs ?? [];

  return (
    <div className="turfs-page">
      <header className="page-head">
        <div>
          <span className="eyebrow">Canvass</span>
          <h1>{desk ? 'Turfs' : 'My turfs'}</h1>
        </div>
        {desk && turfs.length > 0 && <Link className="btn turfs-draw" to="/map?draw=1">Draw a turf</Link>}
      </header>

      {/* Offline with nothing cached, react-query pauses the fetch: isLoading
          stays false, so test isPending and say why nothing is showing. */}
      {q.isPending && (
        <p className="muted" role="status">
          {q.fetchStatus === 'paused' ? 'You’re offline — your turfs load as soon as you have signal.' : 'Loading turfs…'}
        </p>
      )}
      {q.isError && !q.data && (
        <p className="error" role="alert">Couldn’t load turfs — {q.error.message}. Check your signal and reload.</p>
      )}

      {q.data && turfs.length === 0 && (
        <div className="card turfs-empty">
          {desk ? (
            <>
              <span className="eyebrow">No turfs yet</span>
              <p>Outline a few blocks on the map, then assign canvassers. Each turf gets its own walk list.</p>
              <Link className="btn btn-primary turfs-act" to="/map?draw=1">Draw your first turf on the map</Link>
            </>
          ) : (
            <>
              <span className="eyebrow">Nothing assigned</span>
              <p>No turf assigned yet — ask your organizer.</p>
            </>
          )}
        </div>
      )}

      {turfs.length > 0 && (
        <ul className="turfs-list">
          {turfs.map((t) => {
            const left = Math.max(0, t.doors - t.doorsDone);
            const names = t.members.map((m) => (m.id === me?.user?.id ? `${m.name} (you)` : m.name));
            return (
              <li key={t.id} className="turfs-item" style={{ '--turf': turfColor(t) }}>
                <Link to={`/turfs/${t.id}`} className="turfs-row">
                  <span className="turfs-row__top">
                    <span className="turfs-row__name">{t.name}</span>
                    <span className="turfs-row__left mono">
                      {t.doors === 0 ? 'No doors yet' : left === 0 ? 'All done' : `${plural(left, 'door', 'doors')} left`}
                    </span>
                  </span>
                  <ProgressBar done={t.doorsDone} total={t.doors} label={`${t.name}: doors done`} />
                  <span className="turfs-row__meta mono">
                    {t.doorsDone}/{t.doors} doors · {plural(t.people, 'person', 'people')} · {t.rated} rated
                  </span>
                  {names.length > 0 ? (
                    <span className="turfs-row__who">
                      <span className="turfs-row__label">Canvassers</span> {names.join(', ')}
                    </span>
                  ) : desk && (
                    <span className="turfs-row__who turfs-row__who--none">No one assigned yet — assign on the map</span>
                  )}
                </Link>
                <Link className="btn btn-quiet turfs-map" to={`/map?turf=${t.id}`} aria-label={`Map of ${t.name}`}>
                  Map
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /turfs/:id — the walk list
// ─────────────────────────────────────────────────────────────────────────────

function WalkList({ id }) {
  const { me } = useOutletContext();
  const desk = DESK_ROLES.includes(me?.role);
  const queryClient = useQueryClient();
  const outbox = useOutbox();
  const rootRef = useRef(null);
  useTabbarHeight(rootRef);

  const q = useQuery({
    queryKey: ['turf', id],
    queryFn: () => apiGet(`/turfs/${id}/walk`),
    // 403 (not your turf) and 404 won't change on a retry.
    retry: (n, err) => !(err?.status >= 400 && err.status < 500) && n < 1,
    // Losing signal mid-block shouldn't drop the list from memory.
    gcTime: 12 * 3600 * 1000,
    // Knocks from the map's door card or another phone: show them on open.
    refetchOnMount: 'always',
  });

  // What this phone logged since the list loaded, by person id:
  // { rating, outcome, at, queued }. Laid over the server's data so the list
  // reacts at once — and keeps showing knocks still waiting in the outbox.
  const [local, setLocal] = useState({});
  const [status, setStatus] = useState({});    // person id → { text, tone }
  const [doorMsg, setDoorMsg] = useState({});  // door key → { text, tone }
  const [notes, setNotes] = useState({});      // person id → unsent note
  const [busy, setBusy] = useState({});        // person id | door key → true
  const [openId, setOpenId] = useState(null);
  const [scrollTo, setScrollTo] = useState(null);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['turf', id] });
    for (const key of KNOCK_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  };

  // The outbox drained (here or from the app shell): refetch, and stop
  // calling anything "not sent".
  const prevPending = useRef(outbox.pending);
  useEffect(() => {
    if (outbox.pending < prevPending.current) {
      refresh();
      if (outbox.pending === 0) {
        setLocal((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, { ...v, queued: false }])));
        setStatus((s) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, v?.tone === 'queued' ? { text: 'Sent', tone: 'ok' } : v])));
      }
    }
    prevPending.current = outbox.pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outbox.pending]);

  const doors = useMemo(() => (q.data?.doors ?? []).map((d) => {
    const persons = d.persons.map((p) => {
      const mine = local[p.id];
      return mine
        ? { ...p, rating: mine.rating ?? p.rating, last_outcome: mine.outcome, last_contact_at: mine.at, queued: mine.queued }
        : p;
    });
    return {
      ...d,
      key: `${norm(d.address)}|${norm(d.unit)}|${d.address ? '' : d.persons[0]?.id}`,
      persons,
      done: d.done || persons.some((p) => local[p.id]),
    };
  }), [q.data, local]);

  const total = doors.length;
  const doneCount = doors.filter((d) => d.done).length;
  const people = doors.reduce((n, d) => n + d.persons.length, 0);
  const rated = doors.reduce((n, d) => n + d.persons.filter((p) => p.rating).length, 0);
  const nextIdx = doors.findIndex((d) => !d.done);
  const next = nextIdx >= 0 ? doors[nextIdx] : null;

  // Scroll after the render that opened the next door's first person.
  useEffect(() => {
    if (scrollTo == null) return;
    const el = document.getElementById(`walk-door-${scrollTo}`);
    if (el) {
      el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
      el.focus({ preventScroll: true });
    }
    setScrollTo(null);
  }, [scrollTo]);

  const goNext = () => {
    if (!next) return;
    setOpenId(next.persons[0]?.id ?? null);
    setScrollTo(nextIdx);
  };

  const setBusyKey = (key, on) => setBusy((b) => {
    const n = { ...b };
    if (on) n[key] = true; else delete n[key];
    return n;
  });

  // One knock for one person, through the outbox. Returns { ok, queued }.
  const log = async (person, outcome, rating = null, { quiet = false, batch = false } = {}) => {
    const note = (notes[person.id] || '').trim();
    const input = { person_id: person.id, channel: 'door', outcome };
    if (rating) input.rating = rating;
    if (note) input.note = note;
    setBusyKey(person.id, true);
    if (!quiet) setStatus((s) => ({ ...s, [person.id]: null }));
    try {
      const r = await logContact(input);
      setLocal((l) => ({
        ...l,
        [person.id]: {
          rating: rating || l[person.id]?.rating || null,
          outcome,
          at: new Date().toISOString(),
          queued: r.queued,
        },
      }));
      if (note) setNotes((n) => ({ ...n, [person.id]: '' }));
      if (!quiet) {
        const what = rating
          ? `${rating} · ${ratingByCode(rating)?.label || ''}`
          : outcome === 'contacted' ? 'your note' : OUTCOME_LABEL[outcome].toLowerCase();
        setStatus((s) => ({
          ...s,
          [person.id]: r.queued ? { text: QUEUED_TEXT, tone: 'queued' } : { text: `Logged ${what} for ${person.name}`, tone: 'ok' },
        }));
      }
      if (!r.queued && !batch) refresh();
      return { ok: true, queued: r.queued };
    } catch (err) {
      setStatus((s) => ({ ...s, [person.id]: { text: `Not saved — ${err.message}`, tone: 'error' } }));
      return { ok: false };
    } finally {
      setBusyKey(person.id, false);
    }
  };

  // "No one home": a no-answer for everyone at the door, one tap.
  const nobodyHome = async (door) => {
    setBusyKey(door.key, true);
    setDoorMsg((m) => ({ ...m, [door.key]: null }));
    let queued = false;
    let failed = 0;
    let sent = 0;
    for (const p of door.persons) {
      const r = await log(p, 'no_answer', null, { quiet: true, batch: true });
      if (!r.ok) failed += 1;
      else if (r.queued) queued = true;
      else sent += 1;
    }
    if (sent) refresh(); // once for the door, not once per person
    setBusyKey(door.key, false);
    const n = door.persons.length;
    setDoorMsg((m) => ({
      ...m,
      [door.key]: failed
        ? { text: `${plural(failed, 'knock', 'knocks')} didn’t save — open the person and try again`, tone: 'error' }
        : queued ? { text: QUEUED_TEXT, tone: 'queued' }
          : { text: n === 1 ? 'Logged no answer' : `Logged no answer for all ${n}`, tone: 'ok' },
    }));
    if (openId && door.persons.some((p) => p.id === openId)) setOpenId(null);
  };

  const sendNow = async () => {
    await outbox.flush();
    refresh();
  };

  // A paused fetch (offline, nothing cached) is pending but not loading.
  const paused = q.isPending && q.fetchStatus === 'paused';
  if (q.isPending && !paused) {
    return <div className="walk" ref={rootRef}><p className="muted">Loading walk list…</p></div>;
  }
  // Not yours any more / deleted: say so even over a list cached earlier.
  const gone = q.error?.status === 403 || q.error?.status === 404;
  if (!q.data || gone) {
    const err = q.error;
    return (
      <div className="walk" ref={rootRef}>
        <Link className="btn btn-quiet walk-back" to="/turfs">← Turfs</Link>
        <div className="card walk-gone" role="alert">
          <span className="eyebrow">Walk list</span>
          <p>
            {err?.status === 403
              ? 'This turf isn’t assigned to you — ask your organizer to add you.'
              : err?.status === 404
                ? 'This turf was deleted, or the link is wrong.'
                : paused
                  ? 'You’re offline and this walk list isn’t on this phone yet. It loads as soon as you have signal — open it before you head out next time.'
                  : `Couldn’t load the walk list — ${err?.message || 'no connection'}. Check your signal and try again.`}
          </p>
          {!gone && !paused && (
            <button type="button" className="btn walk-act" onClick={() => q.refetch()}>Try again</button>
          )}
        </div>
      </div>
    );
  }

  const { turf } = q.data;
  const left = total - doneCount;

  return (
    <div className="walk" ref={rootRef} style={{ '--turf': turfColor(turf) }}>
      <Link className="btn btn-quiet walk-back" to="/turfs">← Turfs</Link>

      <header className="walk-head">
        <div className="walk-head__top">
          <div className="walk-head__title">
            <span className="eyebrow">Walk list</span>
            <h1 className="walk-title">{turf.name}</h1>
          </div>
          <Link className="btn walk-act walk-map" to={`/map?turf=${turf.id}`} aria-label="Map of this turf">Map</Link>
        </div>
        <div className="walk-progress">
          <span className="walk-progress__text mono"><strong>{doneCount}</strong> of {plural(total, 'door', 'doors')} done</span>
          <ProgressBar done={doneCount} total={total} />
          <span className="walk-progress__sub mono">
            {plural(left, 'door', 'doors')} left · {plural(people, 'person', 'people')} · {rated} rated
          </span>
        </div>
        {turf.notes && <p className="walk-notes">{turf.notes}</p>}
      </header>

      {outbox.pending > 0 && (
        <div className="banner walk-outbox" role="status">
          <span>
            {plural(outbox.pending, 'knock is', 'knocks are')} saved on this phone — they’ll send when you’re back online.
            {outbox.lastError && <span className="walk-outbox__err"> {outbox.lastError}</span>}
          </span>
          <button type="button" className="btn walk-act" onClick={sendNow} disabled={outbox.flushing}>
            {outbox.flushing ? 'Sending…' : 'Send now'}
          </button>
        </div>
      )}
      {outbox.pending === 0 && outbox.lastError && <p className="error" role="alert">{outbox.lastError}</p>}
      {q.isError && <p className="muted walk-stale">Showing the list from when you last had signal.</p>}

      {total === 0 ? (
        <div className="card walk-empty">
          <span className="eyebrow">No doors inside this turf yet</span>
          <p>
            {desk
              ? 'People show up here once they have a pin on the map inside the outline.'
              : 'Ask your organizer to check the turf outline.'}
          </p>
          {desk && <Link className="btn walk-act" to={`/map?turf=${turf.id}`}>Check it on the map</Link>}
        </div>
      ) : (
        <ol className="walk-doors">
          {doors.map((d, i) => (
            <Door
              key={d.key}
              door={d}
              index={i}
              isNext={i === nextIdx}
              openId={openId}
              onToggle={(pid) => setOpenId((cur) => (cur === pid ? null : pid))}
              busy={busy}
              status={status}
              notes={notes}
              setNote={(pid, v) => setNotes((n) => ({ ...n, [pid]: v }))}
              doorMsg={doorMsg[d.key]}
              onLog={log}
              onNobodyHome={() => nobodyHome(d)}
            />
          ))}
        </ol>
      )}

      {total > 0 && (
        <div className="walk-next">
          {next ? (
            <button type="button" className="btn btn-primary walk-next__btn" onClick={goNext}>
              <span className="walk-next__label">Next door</span>
              <span className="walk-next__addr">{doorLabel(next)}</span>
              <span className="walk-next__left mono">{left} left</span>
            </button>
          ) : (
            <p className="walk-next__done" role="status">
              All {plural(total, 'door', 'doors')} done — nice work. <Link to="/turfs">Back to turfs</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Door({ door, index, isNext, openId, onToggle, busy, status, notes, setNote, doorMsg, onLog, onNobodyHome }) {
  const headId = `walk-door-${index}-addr`;
  const doorBusy = Boolean(busy[door.key]) || door.persons.some((p) => busy[p.id]);
  return (
    <li
      id={`walk-door-${index}`}
      tabIndex={-1}
      aria-labelledby={headId}
      className={`walk-door${door.done ? ' is-done' : ''}${isNext ? ' is-next' : ''}`}
    >
      <div className="walk-door__head">
        <span className="walk-check" data-done={door.done ? '' : undefined} aria-hidden="true">✓</span>
        <h2 className="walk-door__addr" id={headId}>
          <span className="walk-door__num mono">Door {index + 1}{isNext ? ' · next' : ''}</span>
          {doorLabel(door)}
          <span className="walk-sr">{door.done ? ' — done' : ' — not knocked yet'}</span>
        </h2>
        <button type="button" className="btn walk-act walk-nobody" disabled={doorBusy} onClick={onNobodyHome}>
          No one home
        </button>
      </div>
      {doorMsg && <p className={`walk-msg walk-msg--${doorMsg.tone} walk-msg--door`} role="status">{doorMsg.text}</p>}
      <ul className="walk-people">
        {door.persons.map((p) => (
          <Person
            key={p.id}
            person={p}
            open={openId === p.id}
            onToggle={() => onToggle(p.id)}
            busy={Boolean(busy[p.id] || busy[door.key])}
            status={status[p.id]}
            note={notes[p.id] || ''}
            setNote={(v) => setNote(p.id, v)}
            onLog={onLog}
          />
        ))}
      </ul>
    </li>
  );
}

function Person({ person: p, open, onToggle, busy, status, note, setNote, onLog }) {
  const panelId = `walk-panel-${p.id}`;
  const dnc = isDnc(p);
  const last = p.last_contact_at
    ? `${OUTCOME_LABEL[p.last_outcome] || 'Knocked'} · ${fmtWhen(p.last_contact_at)}`
    : 'Not knocked yet';
  return (
    <li className={`walk-person${open ? ' is-open' : ''}`}>
      <button type="button" className="walk-person__btn" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
        <span className="walk-person__who">
          <span className="walk-person__name">{p.name}</span>
          <span className="walk-person__last mono">
            {last}
            {p.queued && <span className="walk-person__queued"> · not sent yet</span>}
          </span>
        </span>
        <span className="walk-person__chips">
          {dnc && <span className="chip chip-danger">Do not contact</span>}
          <RatingChip code={p.rating} />
          <span className="walk-caret" aria-hidden="true">{open ? '−' : '+'}</span>
        </span>
      </button>

      {open && (
        <div className="walk-panel" id={panelId}>
          {dnc && <p className="walk-dnc">Marked do not contact — skip this person.</p>}
          <span className="eyebrow walk-panel__label">Rating · at the door</span>
          <RatingButtons value={p.rating} disabled={busy} onPick={(code) => onLog(p, 'contacted', code)} />
          <div className="walk-outcomes" role="group" aria-label="No conversation">
            {OUTCOME_BUTTONS.map((o) => (
              <button key={o.code} type="button" className="btn walk-act" disabled={busy} onClick={() => onLog(p, o.code)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="field walk-note">
            <label htmlFor={`walk-note-${p.id}`}>Note — sent with your next tap</label>
            <textarea
              id={`walk-note-${p.id}`} className="input" rows={2} maxLength={2000}
              value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Issue raised, best time to come back, sign spot…"
            />
          </div>
          <div className="walk-panel__links">
            {note.trim() && (
              <button type="button" className="btn walk-act" disabled={busy} onClick={() => onLog(p, 'contacted')}>
                Save note only
              </button>
            )}
            {p.phone && <a className="btn btn-quiet walk-act" href={`tel:${String(p.phone).replace(/\s*(?:ext\.?|x|#).*$/i, '').replace(/[^\d+]/g, '')}`}>Call</a>}
            <Link className="btn btn-quiet walk-act" to={`/people/${p.id}`}>Profile</Link>
          </div>
          {status && <p className={`walk-msg walk-msg--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</p>}
        </div>
      )}
    </li>
  );
}
