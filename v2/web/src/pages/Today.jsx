// Today — the brief. Hero money stat, activation checklist, flagged gifts,
// upcoming filings, and the open-data footer (verify + export).
import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, fmtMoney, fmtDate } from '../api.js';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const STEP_ROUTES = { person: '/people?new=1', gift: '/money?new=1', filing: '/filings?new=1' };

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

  if (brief.isLoading) return <p className="muted">Loading the brief…</p>;
  if (brief.isError) return <p className="error">{brief.error.message}</p>;
  const b = brief.data;

  return (
    <>
      <span className="eyebrow">{greeting()}</span>
      <h1>{me.workspace.name}</h1>

      <div className="stat-hero">
        <span className="eyebrow">Total raised</span>
        <div className="amount">{fmtMoney(b.money.totalCents)}</div>
        <div className="sub">
          {fmtMoney(b.money.weekCents)} this week · {b.money.gifts} gift{b.money.gifts === 1 ? '' : 's'} · {b.people.total} people
        </div>
      </div>

      {!b.activation.complete && (
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

      <div className="footer-row">
        <button type="button" className="btn" onClick={onVerify} disabled={verify?.busy}>Verify my books</button>
        {verify?.ok && <span className="mono ok-text">✓ {verify.checked} events verified</span>}
        {verify?.ok === false && <span className="error">audit chain check failed</span>}
        {verify?.error && <span className="error">{verify.error}</span>}
        <span className="spacer" />
        <a className="btn" href="/api/export">Export all data</a>
      </div>
    </>
  );
}
