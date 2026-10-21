// Today — the brief. Field strip (doors this week + the support picture),
// hero money stat, activation checklist, flagged gifts, upcoming shifts and
// signs, upcoming filings, and the open-data footer (verify + export).
import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { RATINGS } from '@starbase/shared/canvass';
import { apiGet, fmtMoney, fmtDate } from '../api.js';
import { FillBar } from './Shifts.jsx';
import './shifts.css';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const STEP_ROUTES = { person: '/people?new=1', gift: '/money?new=1', filing: '/filings?new=1' };

const plural = (n, word) => `${word}${n === 1 ? '' : 's'}`;
const fmtShiftWhen = (iso) => new Date(iso).toLocaleString('en-CA', {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

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
                <span className="when">{fmtShiftWhen(s.starts_at)}{s.location ? ` · ${s.location}` : ''}</span>
              </span>
              <FillBar filled={s.filled} capacity={s.capacity} />
            </li>
          ))}
        </ul>
      )}
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

  if (brief.isError) return <p className="error">{brief.error.message}</p>;
  // isPending, not isLoading: a query paused offline is pending but not
  // fetching, and brief.data would be undefined below.
  if (brief.isPending) return <p className="muted">Loading the brief…</p>;
  const b = brief.data;
  const canDesk = me?.role !== 'volunteer'; // shift.create is desk-only

  return (
    <>
      <span className="eyebrow">{greeting()}</span>
      <h1>{me.workspace.name}</h1>

      <FieldStrip field={b.field} ratings={b.ratings} />

      {b.money && (
        <div className="stat-hero">
          <span className="eyebrow">Total raised</span>
          <div className="amount">{fmtMoney(b.money.totalCents)}</div>
          <div className="sub">
            {fmtMoney(b.money.weekCents)} this week · {b.money.gifts} gift{b.money.gifts === 1 ? '' : 's'} · {b.people.total} people
          </div>
        </div>
      )}

      {canDesk && !b.activation.complete && (
        <section className="card">
          <span className="eyebrow">Getting started</span>
          <ul className="list-plain">
            {b.activation.steps.map((s) => (
              <li key={s.key}>
                <span className={s.done ? 'done' : ''}>
                  <span className="check mono">{s.done ? '☑' : '☐'}</span> {s.label}
                </span>
                {!s.done && (
                  <button type="button" className="btn" onClick={() => navigate(STEP_ROUTES[s.key])}>Do it</button>
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

      <Link to="/signs" className="ops-signs-line">
        <span className="eyebrow">Signs</span>
        <span>
          <span className="mono">{b.signs?.requested ?? 0}</span> requested ·{' '}
          <span className="mono">{b.signs?.installed ?? 0}</span> installed
        </span>
        <span aria-hidden="true">→</span>
      </Link>

      {b.providers && (!b.providers.email || !b.providers.text) && (
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
        <button type="button" className="btn" onClick={onVerify} disabled={verify?.busy}>Verify my books</button>
        {verify?.ok && <span className="mono ok-text">✓ {verify.checked} events verified</span>}
        {verify?.ok === false && <span className="error">audit chain check failed</span>}
        {verify?.error && <span className="error">{verify.error}</span>}
        <span className="spacer" />
        <a className="btn" href="/api/export">Export all data</a>
      </div>}
    </>
  );
}
