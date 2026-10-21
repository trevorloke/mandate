// Person profile — contact card, per-year totals, gift history.
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet, fmtMoney, fmtDate } from '../api.js';

export default function Person() {
  const { id } = useParams();
  const profile = useQuery({
    queryKey: ['person', id],
    queryFn: () => apiGet(`/persons/${id}`),
  });

  if (profile.isLoading) return <p className="muted">Loading…</p>;
  if (profile.isError) return <p className="error">{profile.error.message}</p>;
  const { person, gifts, totals } = profile.data;

  return (
    <>
      <span className="eyebrow"><Link to="/people">People</Link> / {person.kind}</span>
      <div className="page-head">
        <h1>{person.name}</h1>
        <Link className="btn btn-primary" to={`/money?new=1&person=${person.id}`}>Log a gift</Link>
      </div>

      <div className="card">
        <span className="eyebrow">Contact</span>
        <p>
          {person.email || <span className="muted">no email</span>}
          {' · '}
          <span className="mono">{person.phone || <span className="muted">no phone</span>}</span>
          {person.address ? <> · {person.address}</> : null}
        </p>
      </div>

      {totals.length > 0 && (
        <div className="card">
          <span className="eyebrow">Giving by year</span>
          <ul className="list-plain">
            {totals.map((t) => (
              <li key={t.year}>
                <span className="mono">{t.year}</span>
                <strong className="mono">{fmtMoney(t.total_cents)}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      <h2>Gift history</h2>
      <table className="table">
        <thead>
          <tr><th>Date</th><th className="num">Amount</th><th>Method</th><th>Note</th><th></th></tr>
        </thead>
        <tbody>
          {gifts.map((g) => (
            <tr key={g.id}>
              <td className="mono">{fmtDate(g.date)}</td>
              <td className="num">{fmtMoney(g.amount_cents)}</td>
              <td>{g.method ? <span className="chip">{g.method}</span> : <span className="muted">—</span>}</td>
              <td className="muted">{g.note || ''}</td>
              <td>{g.flagged && <span className="chip chip-warn" title={g.flag_reason || ''}>flagged</span>}</td>
            </tr>
          ))}
          {gifts.length === 0 && (
            <tr><td colSpan={5} className="muted">No gifts recorded.</td></tr>
          )}
        </tbody>
      </table>
    </>
  );
}
