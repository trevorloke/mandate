// Today — the brief. Field strip (doors this week + the support picture),
// hero money stat + open pledges, activation checklist, flagged gifts, your
// turf (walk lists), upcoming shifts, events and signs, upcoming filings, and
// the open-data footer (verify + export). A nearly empty campaign gets a
// one-click sample dataset (managers), cleared again from the same screen.
// Volunteers see their turf first — it's their job for the day — and never
// see money.
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RATINGS } from '@starbase/shared/canvass';
import { ApiError, apiGet, apiPost, fmtMoney, fmtDate } from '../api.js';
// Styles only: importing Shifts.jsx itself would pull the whole Shifts page
// into the first-load bundle (Today is not lazy), so FillBar is copied below.
import './shifts.css';
import './today.css';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const STEP_ROUTES = { person: '/people?new=1', gift: '/money?new=1', filing: '/filings?new=1' };
// Who may do each getting-started step (server/actions/index.js: person.create
// and gift.log are desk roles, filing.create is manager + treasurer only).
const STEP_ROLES = {
  person: ['manager', 'treasurer', 'staff'],
  gift: ['manager', 'treasurer', 'staff'],
  filing: ['manager', 'treasurer'],
};

// Same markup as Shifts.jsx's FillBar (ops-fill styles live in shifts.css).
function FillBar({ filled = 0, capacity }) {
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

const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`;
const fmtWhen = (iso) => new Date(iso).toLocaleString('en-CA', {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

// api.js has no DELETE helper; same error contract as apiGet/apiPost.
const apiDelete = async (path) => {
  const res = await fetch(`/api${path}`, { method: 'DELETE', credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, body.error || `request failed (${res.status})`);
  return body;
};

function useToast() {
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (text) => {
    clearTimeout(timer.current);
    setMsg(text);
    timer.current = setTimeout(() => setMsg(null), 6000);
  };
  const clear = () => { clearTimeout(timer.current); setMsg(null); };
  return { msg, show, clear };
}

// ── Sample data (managers) ──
function SampleCard({ onToast }) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [already, setAlready] = useState(false);

  const load = async () => {
    setBusy(true);
    setError(null);
    setAlready(false);
    try {
      const r = await apiPost('/data/sample');
      await queryClient.invalidateQueries();
      onToast(`Sample data loaded — ${r.people ?? 52} people, ${r.signs ?? 0} signs, ${r.gifts ?? 0} gifts`);
    } catch (e) {
      if (e.status === 409) {
        // The server found sample-tagged people. Refresh; if the brief still
        // doesn't say "loaded", offer the clear right here.
        await queryClient.invalidateQueries();
        setAlready(true);
      } else {
        setError(`Couldn’t load sample data — ${e.message}. Try again.`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card today-sample" aria-labelledby="today-sample-h">
      <span className="eyebrow">New campaign</span>
      <h2 id="today-sample-h">Try Starbase with sample data</h2>
      <p className="today-sample-lede">
        52 Surrey voters across six neighbourhoods, with ratings, signs, donors, a shift, an event, and a turf.
        Clear it any time — your own records stay.
      </p>
      <div className="today-actions">
        <button type="button" className="btn btn-primary today-tap" onClick={load} disabled={busy}>
          {busy ? 'Loading sample data…' : 'Load sample data'}
        </button>
        <Link to="/people/import" className="btn btn-quiet today-tap">Or import your own list</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {already && (
        <>
          <p className="error" role="alert">Sample people are already in this campaign. Clear them first, then load again.</p>
          <SampleLoadedLine canClear onToast={onToast} onCleared={() => setAlready(false)} />
        </>
      )}
    </section>
  );
}

function SampleLoadedLine({ canClear, onToast, onCleared }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // Keep focus where the hand is: on "Keep it" when the question opens, back
  // on the link when it closes.
  const keepRef = useRef(null);
  const openRef = useRef(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
    else if (wasConfirming.current) openRef.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await apiDelete('/data/sample');
      await queryClient.invalidateQueries();
      setConfirming(false);
      onCleared?.();
      onToast(`Sample data cleared${r.cleared ? ` — ${r.cleared} people removed` : ''}`);
    } catch (e) {
      setError(`Couldn’t clear sample data — ${e.message}. Try again.`);
    } finally {
      setBusy(false);
    }
  };

  if (!canClear) {
    return <p className="today-sample-line">Sample data is loaded — these voters are made up.</p>;
  }
  if (!confirming) {
    return (
      <p className="today-sample-line">
        Sample data is loaded<span className="today-dot" aria-hidden="true">·</span>
        <button type="button" ref={openRef} className="today-linkbtn" onClick={() => setConfirming(true)}>Clear sample data</button>
      </p>
    );
  }
  return (
    <div className="today-confirm" role="group" aria-label="Clear sample data"
      onKeyDown={(e) => { if (e.key === 'Escape' && !busy) setConfirming(false); }}>
      <p>Remove every sample person, gift, sign, the shift, the event and the turf? Your own records stay.</p>
      <div className="today-actions">
        <button type="button" className="btn today-tap today-danger" onClick={clear} disabled={busy}>
          {busy ? 'Clearing…' : 'Clear sample data'}
        </button>
        <button type="button" ref={keepRef} className="btn btn-quiet today-tap" onClick={() => setConfirming(false)} disabled={busy}>
          Keep it
        </button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}

// ── Field strip: doors this week + one stacked support bar ──
const BANDS = [
  { band: 'support', label: 'Support' },
  { band: 'undecided', label: 'Undecided' },
  { band: 'opposed', label: 'Opposed' },
];

function SupportBar({ ratings }) {
  const counts = { support: 0, undecided: 0, opposed: 0 };
  const variants = [];
  for (const r of RATINGS) {
    const n = Number(ratings?.[r.code]) || 0;
    counts[r.band] += n;
    if (r.band === 'opposed' && n > 0) variants.push(`${r.short} ${n}`);
  }
  const total = counts.support + counts.undecided + counts.opposed;
  const pct = (n) => (total ? Math.round((n / total) * 100) : 0);
  const summary = BANDS.map((b) => `${b.label} ${counts[b.band]} (${pct(counts[b.band])}%)`).join(', ');
  const showVariants = variants.some((v) => !v.startsWith('4 '));

  return (
    <div className="ops-support">
      <div className="ops-support-head">
        <span className="eyebrow">Support · <span className="mono">{total.toLocaleString('en-CA')}</span> rated</span>
        <Link to="/map" className="ops-maplink">Open the map →</Link>
      </div>
      {total === 0 ? (
        <p className="ops-empty">No ratings yet — every door you knock fills this in.</p>
      ) : (
        <>
          <div className="ops-bar" role="img" aria-label={summary}>
            {BANDS.filter((b) => counts[b.band] > 0).map((b) => (
              <span key={b.band} data-band={b.band} style={{ flex: `${counts[b.band]} 1 0` }}
                title={`${b.label}: ${counts[b.band]} (${pct(counts[b.band])}%)`} />
            ))}
          </div>
          <ul className="ops-legend">
            {BANDS.map((b) => (
              <li key={b.band}>
                <span className="sw" data-band={b.band} aria-hidden="true" />
                {b.label} <span className="mono">{counts[b.band].toLocaleString('en-CA')}</span>
                <span className="mono pct">{pct(counts[b.band])}%</span>
              </li>
            ))}
          </ul>
          {showVariants && <div className="ops-variants" title="Opposed, by who they back">opposed · {variants.join(' · ')}</div>}
        </>
      )}
    </div>
  );
}

function FieldStrip({ field, ratings }) {
  const f = field ?? {};
  const doors = Number(f.doors) || 0;
  const calls = Number(f.calls) || 0;
  const texts = Number(f.texts) || 0;
  return (
    <section className="ops-field" aria-label="Field this week">
      <div className="ops-doors">
        <span className="eyebrow">Doors this week</span>
        <span className="n">{doors.toLocaleString('en-CA')}</span>
        <span className="sub">
          <span className="mono">{calls.toLocaleString('en-CA')}</span> {plural(calls, 'call')} ·{' '}
          <span className="mono">{texts.toLocaleString('en-CA')}</span> {plural(texts, 'text')}
        </span>
      </div>
      <SupportBar ratings={ratings} />
    </section>
  );
}

// ── Your turf: walk lists assigned to me ──
function TurfProgress({ stats }) {
  if (!stats) return null;
  const doors = Number(stats.doors) || 0;
  const done = Math.min(doors, Number(stats.doorsDone) || 0);
  if (doors === 0) return <span className="today-turf-meta mono">No doors in this turf yet</span>;
  const left = doors - done;
  const pct = Math.round((done / doors) * 100);
  return (
    <>
      <span className="today-turf-meta mono">
        {left === 0 ? 'All doors done' : `${left} ${plural(left, 'door')} left`} · {done}/{doors} knocked
      </span>
      <span className="today-progress" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
    </>
  );
}

function YourTurf({ turfs, lead }) {
  // Doors left comes from the turfs list (shared cache with /turfs and the map).
  const turfsQ = useQuery({ queryKey: ['turfs'], queryFn: () => apiGet('/turfs') });
  const statsById = Object.fromEntries((turfsQ.data?.turfs ?? []).map((t) => [t.id, t]));
  return (
    <section className={`card today-turf${lead ? ' is-lead' : ''}`} aria-labelledby="today-turf-h">
      <span className="eyebrow" id="today-turf-h">{turfs.length === 1 ? 'Your turf' : 'Your turfs'}</span>
      <ul className="today-turf-list">
        {turfs.map((t) => (
          <li key={t.id}>
            <span className="today-turf-info">
              <span className="today-turf-name">{t.name}</span>
              <TurfProgress stats={statsById[t.id]} />
            </span>
            <Link to={`/turfs/${t.id}`} className={`btn today-tap${lead ? ' btn-primary' : ''}`}>
              Open walk list
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NoTurfYet() {
  return (
    <section className="card today-turf is-lead">
      <span className="eyebrow">Your turf</span>
      <p className="today-turf-none">No walk list yet — ask your organizer to assign you a turf. Meanwhile, knock the doors near you.</p>
      <Link to="/map" className="btn btn-primary today-tap">Open the map</Link>
    </section>
  );
}

function UpcomingShifts({ shifts, canPlan }) {
  return (
    <section className="card ops-today-shifts">
      <span className="eyebrow">Upcoming shifts</span>
      {shifts.length === 0 ? (
        <p className="ops-empty">
          Nothing scheduled.{' '}
          {canPlan ? <Link to="/shifts?new=1">Plan a shift →</Link> : <Link to="/shifts">See all shifts →</Link>}
        </p>
      ) : (
        <ul className="list-plain">
          {shifts.map((s) => (
            <li key={s.id}>
              <span>
                <Link to={`/shifts/${s.id}`}>{s.title}</Link>
                <span className="when">{fmtWhen(s.starts_at)}{s.location ? ` · ${s.location}` : ''}</span>
              </span>
              <FillBar filled={s.filled} capacity={s.capacity} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Upcoming events ──
function Going({ going, capacity }) {
  const n = Number(going) || 0;
  if (!capacity) return <span className="today-going mono">{n} going</span>;
  const full = n >= capacity;
  const pct = Math.min(100, Math.round((n / capacity) * 100));
  return (
    <span className="today-going" data-full={full ? '' : undefined} aria-label={`${n} going of ${capacity} spots`}>
      <span className="today-going-track" aria-hidden="true"><span style={{ width: `${pct}%` }} /></span>
      <span className="mono">{n}/{capacity} going{full ? ' · full' : ''}</span>
    </span>
  );
}

function UpcomingEvents({ events, desk, wsSlug }) {
  // The brief doesn't say which events are public, and /e/:ws/:slug is 404
  // for a private one. GET /api/campaign-events (shared with Outreach) does.
  const needsPublic = events.some((e) => e.public === undefined);
  const list = useQuery({
    queryKey: ['campaign-events'],
    queryFn: () => apiGet('/campaign-events'),
    enabled: needsPublic,
  });
  const publicById = Object.fromEntries((list.data?.events ?? []).map((e) => [e.id, !!e.public]));
  const isPublic = (e) => (e.public !== undefined ? !!e.public : publicById[e.id] === true);
  return (
    <section className="card today-events" aria-labelledby="today-events-h">
      <div className="today-card-head">
        <span className="eyebrow" id="today-events-h">Upcoming events</span>
        {desk && <Link to="/outreach/events" className="today-more">All events →</Link>}
      </div>
      <ul className="list-plain">
        {events.map((e) => (
          <li key={e.id}>
            <span className="today-event-info">
              {desk
                ? <Link to="/outreach/events" className="today-event-title">{e.title}</Link>
                : <span className="today-event-title">{e.title}</span>}
              <span className="when">{fmtWhen(e.starts_at)}{e.location ? ` · ${e.location}` : ''}</span>
              {wsSlug && e.slug && isPublic(e) && (
                <a className="today-rsvp" href={`/e/${encodeURIComponent(wsSlug)}/${encodeURIComponent(e.slug)}`}
                  target="_blank" rel="noopener noreferrer">
                  RSVP page <span aria-hidden="true">↗</span>
                  <span className="ops-sr"> for {e.title} (opens in a new tab)</span>
                </a>
              )}
            </span>
            <Going going={e.going} capacity={e.capacity} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DaysLeft({ n }) {
  if (n < 0) return <span className="chip chip-danger">{-n}d overdue</span>;
  if (n === 0) return <span className="chip chip-warn">due today</span>;
  return <span className="chip">{n}d left</span>;
}

export default function Today() {
  const { me } = useOutletContext();
  const navigate = useNavigate();
  const toast = useToast();
  const [verify, setVerify] = useState(null);
  const brief = useQuery({ queryKey: ['brief'], queryFn: () => apiGet('/brief') });

  const onVerify = async () => {
    setVerify({ busy: true });
    try {
      setVerify(await apiGet('/audit/verify'));
    } catch (e) {
      setVerify({ error: e.message });
    }
  };

  // No signal: the query is paused (react-query knew it was offline) or the
  // fetch itself failed (a TypeError, not an ApiError). Either way it refetches
  // by itself once the phone is back online (main.jsx + react-query).
  const noSignal = !brief.data && (
    (brief.isPending && brief.fetchStatus === 'paused')
    || (brief.isError && !(brief.error instanceof ApiError))
  );
  if (noSignal) {
    return (
      <div className="today">
        <span className="eyebrow">{greeting()}</span>
        <h1>{me.workspace.name}</h1>
        <p className="today-offline" role="status">No signal — today’s numbers load by themselves when you’re back online.</p>
      </div>
    );
  }
  if (brief.isError && !brief.data) {
    return (
      <p className="error" role="alert">
        Couldn’t load today’s brief — {brief.error.message}.{' '}
        <button type="button" className="btn today-tap" onClick={() => brief.refetch()}>Try again</button>
      </p>
    );
  }
  // isPending, not isLoading: a query paused offline is pending but not
  // fetching, and brief.data would be undefined below.
  if (brief.isPending) return <p className="muted">Loading the brief…</p>;
  const b = brief.data;
  const canDesk = me?.role !== 'volunteer'; // shift.create is desk-only
  const isManager = me?.role === 'manager';
  const myTurfs = b.myTurfs ?? [];
  const events = b.events ?? [];
  const peopleTotal = Number(b.people?.total) || 0;
  const offerSample = isManager && !b.sampleLoaded && peopleTotal < 5;
  const openPledges = Number(b.pledges?.n) || 0;

  const turfCard = myTurfs.length > 0
    ? <YourTurf turfs={myTurfs} lead={!canDesk} />
    : (!canDesk && <NoTurfYet />);

  return (
    <div className="today">
      <span className="eyebrow">{greeting()}</span>
      <h1>{me.workspace.name}</h1>

      {offerSample && <SampleCard onToast={toast.show} />}
      {b.sampleLoaded && <SampleLoadedLine canClear={isManager} onToast={toast.show} />}

      {/* Volunteers: the walk list is the job for the day, so it leads. */}
      {!canDesk && turfCard}

      <FieldStrip field={b.field} ratings={b.ratings} />

      {b.money && (
        <div className="stat-hero">
          <span className="eyebrow">Total raised</span>
          <div className="amount">{fmtMoney(b.money.totalCents)}</div>
          <div className="sub">
            {fmtMoney(b.money.weekCents)} this week · {b.money.gifts} gift{b.money.gifts === 1 ? '' : 's'} · {peopleTotal} people
          </div>
          {canDesk && openPledges > 0 && (
            <Link to="/money" className="today-pledges">
              <span className="mono">{openPledges}</span> open {plural(openPledges, 'pledge')} ·{' '}
              <span className="mono">{fmtMoney(b.pledges.cents)}</span>
              <span aria-hidden="true"> →</span>
            </Link>
          )}
        </div>
      )}

      {canDesk && turfCard}

      {canDesk && !b.activation.complete && (
        <section className="card">
          <span className="eyebrow">Getting started</span>
          <ul className="list-plain">
            {b.activation.steps.map((s) => (
              <li key={s.key}>
                <span className={s.done ? 'done' : ''}>
                  <span className="check mono">{s.done ? '☑' : '☐'}</span> {s.label}
                </span>
                {!s.done && (STEP_ROLES[s.key] ?? []).includes(me?.role) && (
                  <button type="button" className="btn today-tap" onClick={() => navigate(STEP_ROUTES[s.key])}>Do it</button>
                )}
                {!s.done && STEP_ROUTES[s.key] && !(STEP_ROLES[s.key] ?? []).includes(me?.role) && (
                  <span className="muted today-step-who">A manager or treasurer adds these</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {b.flagged.length > 0 && (
        <section className="card">
          <span className="eyebrow">Needs attention</span>
          <ul className="list-plain">
            {b.flagged.map((g) => (
              <li key={g.id}>
                <span>
                  <Link to="/money"><strong className="mono">{fmtMoney(g.amount_cents)}</strong> — {g.donor}</Link>
                  <br />
                  <span className="muted">{g.flag_reason}</span>
                </span>
                <span className="chip chip-warn">flagged</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <UpcomingShifts shifts={b.shifts ?? []} canPlan={canDesk} />

      {events.length > 0 && <UpcomingEvents events={events} desk={canDesk} wsSlug={me.workspace.slug} />}

      <Link to="/signs" className="ops-signs-line">
        <span className="eyebrow">Signs</span>
        <span>
          <span className="mono">{b.signs?.requested ?? 0}</span> requested ·{' '}
          <span className="mono">{b.signs?.installed ?? 0}</span> installed
        </span>
        <span aria-hidden="true">→</span>
      </Link>

      {canDesk && b.providers && (!b.providers.email || !b.providers.text) && (
        <p className="ops-providers">
          <Link to="/outreach/website">Connect email/SMS providers to send notifications →</Link>
        </p>
      )}

      {b.filings.length > 0 && (
        <section className="card">
          <span className="eyebrow">Upcoming filings</span>
          <ul className="list-plain">
            {b.filings.map((f) => (
              <li key={f.id}>
                <span>
                  <Link to="/filings">{f.name}</Link>{' '}
                  <span className="muted mono">{fmtDate(f.due_date)}</span>
                </span>
                <DaysLeft n={f.days_left} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {canDesk && <div className="footer-row">
        <button type="button" className="btn today-tap" onClick={onVerify} disabled={verify?.busy}>Verify my books</button>
        {verify?.ok && <span className="mono ok-text">✓ {verify.checked} events verified</span>}
        {verify?.ok === false && <span className="error">audit chain check failed</span>}
        {verify?.error && <span className="error">{verify.error}</span>}
        <span className="spacer" />
        <a className="btn today-tap" href="/api/export">Export all data</a>
      </div>}

      {toast.msg && (
        <div className="toast today-toast" role="status">
          <span>{toast.msg}</span>
          <button type="button" className="btn" onClick={toast.clear}>OK</button>
        </div>
      )}
    </div>
  );
}
