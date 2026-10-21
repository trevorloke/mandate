// Turfs + walk lists — the canvassing core.
//   /turfs      every turf (volunteers: only the ones assigned to them): a
//               row each, name + doors left; tap one for its walk list.
//   /turfs/:id  THE WALK LIST: turf name, "4 of 7 doors", one yellow "Next
//               door". Doors in the server's walk order (street by street,
//               odd side up, even side back — never re-sorted here), one row
//               each; tap a door for the same rating buttons as the map, the
//               outcomes, and "More" (note, call, profile). Every knock goes
//               through the offline outbox, so a dead zone mid-block loses
//               nothing; the list shows what this phone logged right away.
//               While a door is open and not knocked, the button reads
//               "Skip → <the door after>" (quiet), never the door you're at.
//               Both lists are kept on the phone for a day, so a reload with
//               no signal still opens them ("Offline copy").
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet } from '../api.js';
import { logContact, useOutbox } from '../offline.js';
import RatingButtons, {
  More, OutcomeButtons, OUTCOMES, OUTCOME_LABEL, PersonTabs, RatingChip, focusRating, ratingSay, reveal,
} from '../components/RatingButtons.jsx';
import './turfs.css';

const DESK_ROLES = ['manager', 'treasurer', 'staff'];
const TURF_COLORS = ['#2b6cb0', '#7b3fa0', '#b5651d', '#1f7a6d', '#a0306a', '#4c5a8a'];
// The door's outcome row: "No answer" (logged for everyone at the door —
// same name as everywhere else) first, then the selected person's refused /
// moved / no access. One person's own "No answer" sits under More when
// several people share the door.
const NOBODY = 'nobody_home';
const DOOR_OUTCOMES = [{ code: NOBODY, label: OUTCOME_LABEL.no_answer }, ...OUTCOMES.filter((o) => o.code !== 'no_answer')];
const QUEUED_TEXT = 'Saved offline';
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
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';
const dialable = (phone) => String(phone || '').replace(/\s*(?:ext\.?|x|#).*$/i, '').replace(/[^\d+]/g, '');
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ── Offline copy ──
// The walk list and the turf list are kept on this phone, so a reload or a
// restart with no signal still opens them. Keyed by workspace + user (a
// different sign-in on a shared phone never reads them), kept one day, and
// wiped when the app signs out (the ['me'] query is removed by
// queryClient.clear()). forgetFieldCache() is exported for the shell too.
const CACHE_PREFIX = 'starbase:field:v1:';
const CACHE_TTL = 24 * 3600 * 1000;
// offline.js's outbox, read only: knocks still waiting show as done after a reload.
const OUTBOX_KEY = 'starbase:outbox:v1';
const cacheKey = (me, name) => (me?.user?.id && me?.workspace?.id ? `${CACHE_PREFIX}${me.workspace.id}:${me.user.id}:${name}` : null);
function readCache(key) {
  if (!key) return undefined;
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    if (!v || !v.data || !(Date.now() - v.at < CACHE_TTL)) {
      if (v) localStorage.removeItem(key);
      return undefined;
    }
    return v;
  } catch { return undefined; }
}
function writeCache(key, data, at) {
  try { localStorage.setItem(key, JSON.stringify({ at, data })); } catch { /* storage full or blocked */ }
}
function dropCache(key) {
  try { if (key) localStorage.removeItem(key); } catch { /* storage blocked */ }
}
export function forgetFieldCache() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch { /* storage blocked */ }
}
const watched = new WeakSet();
// Keep a query's data on the phone; forget everything on sign-out.
function usePhoneCopy(queryClient, q, key) {
  useEffect(() => {
    if (watched.has(queryClient)) return;
    watched.add(queryClient);
    queryClient.getQueryCache().subscribe((e) => {
      const k = e.query.queryKey;
      if (e.type === 'removed' && k.length === 1 && k[0] === 'me') forgetFieldCache();
    });
  }, [queryClient]);
  useEffect(() => {
    if (key && q.status === 'success' && q.data && q.dataUpdatedAt) writeCache(key, q.data, q.dataUpdatedAt);
  }, [key, q.status, q.data, q.dataUpdatedAt]);
  const status = q.error?.status;
  useEffect(() => { if (status === 403 || status === 404) dropCache(key); }, [key, status]);
}
// Knocks still in the outbox (e.g. after a reload with no signal), as the
// walk list's per-person overlay.
function queuedKnocks() {
  try {
    const items = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
    const out = {};
    for (const it of Array.isArray(items) ? items : []) {
      if (!it?.person_id || it.channel !== 'door') continue;
      out[it.person_id] = { rating: it.rating || out[it.person_id]?.rating || null, outcome: it.outcome, at: it.queued_at, queued: true };
    }
    return out;
  } catch { return {}; }
}

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

// Keep the docked "Next door" bar and the toast above the phone tab bar.
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
  const queryClient = useQueryClient();
  const ck = cacheKey(me, 'turfs');
  const cached = useMemo(() => readCache(ck), [ck]);
  // Always refetch on open: knocks logged from the map's door card don't
  // touch this cache, and progress is the point of the page.
  const q = useQuery({
    queryKey: ['turfs'],
    queryFn: () => apiGet('/turfs'),
    refetchOnMount: 'always',
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.at,
  });
  usePhoneCopy(queryClient, q, ck);
  const turfs = q.data?.turfs ?? [];
  const offlineCopy = Boolean(q.data) && (q.fetchStatus === 'paused' || q.isError);

  return (
    <div className="turfs-page">
      <header className="page-head turfs-head">
        <h1>{desk ? 'Turfs' : 'My turfs'}</h1>
        {desk && turfs.length > 0 && <Link className="btn turfs-draw" to="/map?draw=1">+ Draw turf</Link>}
      </header>
      {offlineCopy && <p className="walk-stale"><span className="chip">Offline copy</span></p>}

      {/* Offline with nothing cached, react-query pauses the fetch: isLoading
          stays false, so test isPending and say why nothing is showing. */}
      {q.isPending && (
        <p className="muted" role="status">{q.fetchStatus === 'paused' ? 'Offline — loads with signal' : 'Loading…'}</p>
      )}
      {q.isError && !q.data && (
        <p className="error" role="alert">Couldn’t load turfs — check your signal</p>
      )}

      {q.data && turfs.length === 0 && (
        <div className="turfs-empty">
          {desk ? (
            <>
              <p>No turfs yet</p>
              <Link className="btn btn-primary turfs-act" to="/map?draw=1">Draw a turf</Link>
            </>
          ) : (
            <p>No turf yet — ask your organizer</p>
          )}
        </div>
      )}

      {turfs.length > 0 && (
        <ul className="turfs-list">
          {turfs.map((t) => {
            const left = Math.max(0, t.doors - t.doorsDone);
            return (
              <li key={t.id} className="turfs-item" style={{ '--turf': turfColor(t) }}>
                <Link to={`/turfs/${t.id}`} className="turfs-row">
                  <span className="turfs-row__top">
                    <span className="turfs-row__name">{t.name}</span>
                    <span className={`turfs-row__left mono${left === 0 && t.doors ? ' is-done' : ''}`}>
                      {t.doors === 0 ? 'No doors' : left === 0 ? 'All done' : `${plural(left, 'door', 'doors')} left`}
                    </span>
                  </span>
                  <ProgressBar done={t.doorsDone} total={t.doors} label={`${t.name}: doors done`} />
                  {desk && t.members.length === 0 && <span className="chip chip-warn turfs-row__flag">No canvassers</span>}
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
  const nextRef = useRef(null);
  useTabbarHeight(rootRef);
  const ck = cacheKey(me, `walk:${id}`);
  const cached = useMemo(() => readCache(ck), [ck]);

  const q = useQuery({
    queryKey: ['turf', id],
    queryFn: () => apiGet(`/turfs/${id}/walk`),
    // 403 (not your turf) and 404 won't change on a retry.
    retry: (n, err) => !(err?.status >= 400 && err.status < 500) && n < 1,
    // Losing signal mid-block shouldn't drop the list from memory.
    gcTime: 12 * 3600 * 1000,
    // Knocks from the map's door card or another phone: show them on open.
    refetchOnMount: 'always',
    // The copy kept on the phone: opens with no signal, even after a reload.
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.at,
  });
  usePhoneCopy(queryClient, q, ck);

  // What this phone logged since the list loaded, by person id:
  // { rating, outcome, at, queued }. Laid over the server's data so the list
  // reacts at once — and keeps showing knocks still waiting in the outbox.
  const [local, setLocal] = useState(queuedKnocks);
  const [notes, setNotes] = useState({});      // person id → unsent note
  const [busy, setBusy] = useState({});        // person id | door key → true
  const [openKey, setOpenKey] = useState(null); // the expanded door
  const [picked, setPicked] = useState({});    // door key → selected person id
  const [scrollTo, setScrollTo] = useState(null);
  const [focusPanel, setFocusPanel] = useState(null); // reopened by a toast's "Change"
  const [docked, setDocked] = useState(false); // header's Next door scrolled away
  const [infoOpen, setInfoOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState(null); // { text, tone, act }
  const toastTimer = useRef(null);

  const toast = (text, { tone = 'ok', act = null } = {}) => {
    setToastMsg({ text, tone, act });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), act || tone === 'error' ? 5000 : 3000);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['turf', id] });
    for (const key of KNOCK_KEYS) queryClient.invalidateQueries({ queryKey: [key] });
  };

  // The outbox drained (here or from the app shell): refetch, and stop
  // calling anything "saved offline".
  const prevPending = useRef(outbox.pending);
  useEffect(() => {
    if (outbox.pending < prevPending.current) {
      refresh();
      if (outbox.pending === 0) {
        // This render's `local` is the latest: the effect runs right after it.
        if (Object.values(local).some((v) => v.queued)) {
          toast('Sent');
          setLocal((l) => Object.fromEntries(Object.entries(l).map(([k, v]) => [k, { ...v, queued: false }])));
        }
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
  // Where the button goes: with no door open, the first one not knocked;
  // with one open, the first not-knocked door after it (wrapping round). At
  // an open door nobody has answered yet it says "Skip →" and goes quiet —
  // the rating buttons are the thing to tap there.
  const openIdx = openKey ? doors.findIndex((d) => d.key === openKey) : -1;
  let targetIdx = nextIdx;
  if (openIdx >= 0) {
    targetIdx = -1;
    for (let k = 1; k < total; k += 1) {
      const i = (openIdx + k) % total;
      if (!doors[i].done) { targetIdx = i; break; }
    }
  }
  const target = targetIdx >= 0 ? doors[targetIdx] : null;
  const skipping = Boolean(target) && openIdx >= 0 && !doors[openIdx].done;

  // Dock the button at the bottom (thumb reach) once the header's copy
  // has scrolled off the top — only one of the two shows at a time.
  const hasNext = Boolean(target);
  useEffect(() => {
    const el = nextRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([e]) => setDocked(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [hasNext, q.data]);

  // Scroll after the render that opened the next door.
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
    if (!target) return;
    setOpenKey(target.key);
    setScrollTo(targetIdx);
  };

  // A toast's "Change" after the door closed: reopen it, focus its rating.
  useEffect(() => {
    if (focusPanel == null) return;
    focusRating(document.getElementById(`walk-panel-${focusPanel}`));
    setFocusPanel(null);
  }, [focusPanel]);

  const setBusyKey = (key, on) => setBusy((b) => {
    const n = { ...b };
    if (on) n[key] = true; else delete n[key];
    return n;
  });

  // One knock for one person, through the outbox. Returns { ok, queued }.
  // rootId: the door panel, so the toast's "Change rating" can focus it.
  const log = async (person, outcome, rating = null, { quiet = false, batch = false, rootId = null, multi = false } = {}) => {
    const note = (notes[person.id] || '').trim();
    const input = { person_id: person.id, channel: 'door', outcome };
    if (rating) input.rating = rating;
    if (note) input.note = note;
    setBusyKey(person.id, true);
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
        // Append-only: "Change" brings the rating row back; the next tap logs the fix.
        const act = rootId ? { label: 'Change', onClick: () => focusRating(document.getElementById(rootId)) } : null;
        const who = multi ? `${firstName(person.name)} · ` : '';
        const what = rating
          ? `Rated ${rating} · ${ratingSay(rating)}`
          : outcome === 'contacted' ? 'Note saved' : OUTCOME_LABEL[outcome];
        toast(r.queued ? QUEUED_TEXT : `${who}${what}`, { tone: r.queued ? 'queued' : 'ok', act });
      }
      if (!r.queued && !batch) refresh();
      return { ok: true, queued: r.queued };
    } catch (err) {
      toast(`Not saved — ${err.message}`, { tone: 'error' });
      return { ok: false };
    } finally {
      setBusyKey(person.id, false);
    }
  };

  // "No answer" at the door: a no-answer for everyone there, one tap.
  const nobodyHome = async (door, index) => {
    setBusyKey(door.key, true);
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
    const change = { label: 'Change', onClick: () => { setOpenKey(door.key); setFocusPanel(index); } };
    if (failed) toast(`${plural(failed, 'knock', 'knocks')} not saved — try again`, { tone: 'error' });
    else toast(queued ? QUEUED_TEXT : OUTCOME_LABEL.no_answer, { tone: queued ? 'queued' : 'ok', act: change });
    if (!failed) setOpenKey((k) => (k === door.key ? null : k));
  };

  const sendNow = async () => {
    await outbox.flush();
    refresh();
  };

  // A paused fetch (offline, nothing cached) is pending but not loading.
  const paused = q.isPending && q.fetchStatus === 'paused';
  if (q.isPending && !paused) {
    return <div className="walk" ref={rootRef}><p className="muted">Loading…</p></div>;
  }
  // Not yours any more / deleted: say so even over a list cached earlier.
  const gone = q.error?.status === 403 || q.error?.status === 404;
  if (!q.data || gone) {
    const err = q.error;
    return (
      <div className="walk" ref={rootRef}>
        <Link className="btn btn-quiet walk-back" to="/turfs">← Turfs</Link>
        <div className="walk-gone" role="alert">
          <p>
            {err?.status === 403
              ? 'Not your turf — ask your organizer'
              : err?.status === 404
                ? 'Turf not found'
                : paused
                  ? 'Offline — open this list once with signal'
                  : 'Couldn’t load — check your signal'}
          </p>
          {!gone && !paused && (
            <button type="button" className="btn walk-act" onClick={() => q.refetch()}>Try again</button>
          )}
        </div>
      </div>
    );
  }

  const { turf } = q.data;
  const offlineCopy = q.isError || q.fetchStatus === 'paused';
  const nextLabel = target && (skipping ? (
    <>
      <span className="walk-next__label">Skip</span>
      <span className="walk-next__addr">→ {doorLabel(target)}</span>
    </>
  ) : (
    <>
      <span className="walk-next__label">Next door</span>
      <span className="walk-next__addr">{doorLabel(target)}</span>
    </>
  ));
  const nextCls = `btn walk-next__btn ${skipping ? 'walk-next__btn--skip' : 'btn-primary'}`;
  const nextAria = target ? `${skipping ? 'Skip to' : 'Next door:'} ${doorLabel(target)}` : undefined;

  return (
    <div className={`walk${target ? ' has-next' : ''}`} ref={rootRef} style={{ '--turf': turfColor(turf) }}>
      <div className="walk-nav">
        <Link className="btn btn-quiet walk-back" to="/turfs">← Turfs</Link>
        <Link className="btn btn-quiet walk-act walk-map" to={`/map?turf=${turf.id}`} aria-label="Map of this turf">Map</Link>
      </div>

      <header className="walk-head">
        <h1 className="walk-title">{turf.name}</h1>
        <div className="walk-progress">
          <span className="walk-progress__text mono"><strong>{doneCount}</strong> of {plural(total, 'door', 'doors')}</span>
          <ProgressBar done={doneCount} total={total} />
        </div>
        {target ? (
          <button type="button" ref={nextRef} className={nextCls} aria-label={nextAria} onClick={goNext}>{nextLabel}</button>
        ) : total > 0 && doneCount === total ? (
          <p className="walk-next__done" role="status">All done — nice work</p>
        ) : null}
        {total > 0 && (
          <More id="walk-info" label={turf.notes ? 'Notes' : 'More'} open={infoOpen} onToggle={() => setInfoOpen((o) => !o)}>
            {turf.notes && <p className="walk-notes">{turf.notes}</p>}
            <dl className="walk-stats">
              <div><dt>Left</dt><dd>{total - doneCount}</dd></div>
              <div><dt>People</dt><dd>{people}</dd></div>
              <div><dt>Rated</dt><dd>{rated}</dd></div>
            </dl>
          </More>
        )}
      </header>

      {outbox.pending > 0 && (
        <div className="walk-outbox" role="status">
          <span className="chip chip-warn">{outbox.pending} saved offline</span>
          {outbox.lastError && <span className="walk-outbox__err">{outbox.lastError}</span>}
          <button type="button" className="btn walk-act" onClick={sendNow} disabled={outbox.flushing}>
            {outbox.flushing ? 'Sending…' : 'Send now'}
          </button>
        </div>
      )}
      {outbox.pending === 0 && outbox.lastError && <p className="error" role="alert">{outbox.lastError}</p>}
      {offlineCopy && <p className="walk-stale"><span className="chip">Offline copy</span></p>}

      {total === 0 ? (
        <div className="walk-empty">
          <p>No doors in this turf yet</p>
          {desk ? <Link className="btn walk-act" to={`/map?turf=${turf.id}`}>Check the map</Link> : <p className="muted">Ask your organizer</p>}
        </div>
      ) : (
        <ol className="walk-doors">
          {doors.map((d, i) => (
            <Door
              key={d.key}
              door={d}
              index={i}
              isNext={openIdx < 0 && i === nextIdx}
              open={openKey === d.key}
              onToggle={() => setOpenKey((k) => (k === d.key ? null : d.key))}
              selectedId={picked[d.key]}
              onPick={(pid) => setPicked((m) => ({ ...m, [d.key]: pid }))}
              busy={busy}
              notes={notes}
              setNote={(pid, v) => setNotes((n) => ({ ...n, [pid]: v }))}
              onLog={log}
              onNobodyHome={() => nobodyHome(d, i)}
            />
          ))}
        </ol>
      )}

      {target && docked && (
        <div className="walk-dock">
          <button type="button" className={nextCls} aria-label={nextAria} onClick={goNext}>{nextLabel}</button>
        </div>
      )}

      {toastMsg && (
        <div className={`toast walk-toast walk-toast--${toastMsg.tone}${docked && target ? ' is-raised' : ''}`} role={toastMsg.tone === 'error' ? 'alert' : 'status'}>
          <span>{toastMsg.text}</span>
          {toastMsg.act && (
            <button
              type="button"
              className="btn walk-toast__btn"
              onClick={() => { const { onClick } = toastMsg.act; setToastMsg(null); clearTimeout(toastTimer.current); onClick(); }}
            >
              {toastMsg.act.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Door({ door, index, isNext, open, onToggle, selectedId, onPick, busy, notes, setNote, onLog, onNobodyHome }) {
  const [more, setMore] = useState(false);
  const headId = `walk-door-${index}-addr`;
  const panelId = `walk-panel-${index}`;
  const multi = door.persons.length > 1;
  const sel = door.persons.find((p) => p.id === selectedId) || door.persons[0];
  const doorBusy = Boolean(busy[door.key]) || door.persons.some((p) => busy[p.id]);
  const queued = door.persons.some((p) => p.queued);
  const rated = door.persons.filter((p) => p.rating);
  const note = notes[sel?.id] || '';
  const dnc = sel && isDnc(sel);
  const last = sel?.last_contact_at
    ? `${OUTCOME_LABEL[sel.last_outcome] || 'Knocked'} · ${fmtWhen(sel.last_contact_at)}`
    : 'Not knocked yet';
  const opts = { rootId: panelId, multi };
  // Opening a door from its row: bring the whole door (buttons included)
  // into view — clear of the docked Next door bar and the tab bar.
  const toggle = () => {
    const opening = !open;
    onToggle();
    if (!opening) return;
    requestAnimationFrame(() => reveal(document.getElementById(`walk-door-${index}`)));
  };

  return (
    <li
      id={`walk-door-${index}`}
      tabIndex={-1}
      aria-labelledby={headId}
      className={`walk-door${door.done ? ' is-done' : ''}${isNext ? ' is-next' : ''}${open ? ' is-open' : ''}`}
    >
      <h2 className="walk-door__h">
        <button type="button" className="walk-door__head" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          <span className="walk-check" data-done={door.done ? '' : undefined} aria-hidden="true">✓</span>
          <span className="walk-door__main">
            <span className="walk-door__addr" id={headId}>{doorLabel(door)}</span>
            <span className="walk-door__names">{door.persons.map((p) => p.name).join(' · ')}</span>
          </span>
          <span className="walk-door__chips">
            {queued && <span className="chip chip-warn">Offline</span>}
            {rated.map((p) => <RatingChip key={p.id} code={p.rating} who />)}
          </span>
          <span className="walk-sr">{door.done ? ' — done' : ' — not knocked yet'}{isNext ? ', next door' : ''}</span>
        </button>
      </h2>

      {open && sel && (
        <div className="walk-panel" id={panelId}>
          <PersonTabs persons={door.persons} value={sel.id} onPick={onPick} />
          {dnc && <p className="walk-dnc"><span className="chip chip-danger">Do not contact</span> Skip {firstName(sel.name)}</p>}
          <RatingButtons key={sel.id} value={sel.rating} disabled={Boolean(busy[sel.id] || busy[door.key])} onPick={(code) => onLog(sel, 'contacted', code, opts)} />
          <OutcomeButtons
            items={DOOR_OUTCOMES}
            disabled={doorBusy}
            onPick={(code) => (code === NOBODY ? onNobodyHome() : onLog(sel, code, null, opts))}
          />
          <More id={`walk-more-${index}`} open={more} onToggle={() => setMore((m) => !m)}>
            <p className="walk-last mono">
              {multi && <strong>{firstName(sel.name)} · </strong>}{last}
              {sel.queued && <span className="chip chip-warn"> Saved offline</span>}
            </p>
            <div className="field walk-note">
              <label htmlFor={`walk-note-${sel.id}`}>Note</label>
              <textarea
                id={`walk-note-${sel.id}`} className="input" rows={2} maxLength={2000}
                value={note} onChange={(e) => setNote(sel.id, e.target.value)}
                placeholder="Note — saved with your rating"
              />
            </div>
            <div className="walk-panel__links">
              {note.trim() && (
                <button type="button" className="btn walk-act" disabled={Boolean(busy[sel.id])} onClick={() => onLog(sel, 'contacted', null, opts)}>
                  Save note only
                </button>
              )}
              {multi && (
                <button type="button" className="btn walk-act" disabled={Boolean(busy[sel.id])} onClick={() => onLog(sel, 'no_answer', null, opts)}>
                  No answer · {firstName(sel.name)} only
                </button>
              )}
              {sel.phone && <a className="btn walk-act" href={`tel:${dialable(sel.phone)}`}>Call</a>}
              <Link className="btn btn-quiet walk-act" to={`/people/${sel.id}`}>Profile</Link>
            </div>
          </More>
        </div>
      )}
    </li>
  );
}
