// Inbox — texts through the campaign's number, newest first. The desk sees
// every conversation (?person= narrows it to one person); a volunteer sees
// only the conversations they started (the server sends them nothing else).
// A dot marks new replies. Tap one to read and reply.
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api.js';
import { isDesk } from '../Shell.jsx';
import { MoreMenu, fmtShort, noSignal } from './People.jsx';
import './people.css';
import '../components/texting-card.css';
import './texting.css';

export default function TextingInbox() {
  const { me } = useOutletContext() ?? {};
  const desk = isDesk(me);
  const [params] = useSearchParams();
  const person = desk ? params.get('person') : null;
  const path = desk ? `/texting/all${person ? `?person=${encodeURIComponent(person)}` : ''}` : '/texting/mine';
  const q = useQuery({ queryKey: ['texting', 'inbox', path], queryFn: () => apiGet(path), refetchInterval: 20_000 });
  const rows = q.data?.conversations ?? [];
  const offline = noSignal(q);

  return (
    <div className="tx-page">
      <Link className="eyebrow pf-back" to={desk ? '/people' : '/calls?channel=text'}>← {desk ? 'People' : 'Calls'}</Link>
      <div className="page-head pp-head">
        <h1>Inbox</h1>
        {desk && (
          <div className="head-actions">
            <MoreMenu items={[{ to: '/inbox/settings', label: 'Texting settings', icon: 'text' }]} />
          </div>
        )}
      </div>

      {q.data && !q.data.sms && <p className="tx-line">Texting from the app needs Twilio</p>}
      {person && (
        <p className="tx-filter">
          <span className="chip">One person</span>
          <Link className="tx-quiet" to="/inbox">Show all</Link>
        </p>
      )}
      {q.isError && !offline && <p className="error">{q.error.message}</p>}

      {offline ? (
        <p className="pp-offline" role="status">No signal — your texts load when you’re back online.</p>
      ) : q.isLoading ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="pp-empty">
          <p>No texts yet.</p>
          <Link className="btn pp-btn" to="/calls?channel=text">Text list</Link>
        </div>
      ) : (
        <ul className="pp-list tx-list">
          {rows.map((c) => (
            <li key={c.id}>
              <Link className={`pp-row tx-row${c.unread ? ' is-new' : ''}`} to={`/inbox/${c.id}`}>
                <span className="pp-row__main">
                  <span className="pp-row__name">
                    {c.unread && <span className="tx-dot" aria-label="New reply" />}
                    {c.person_name || c.phone}
                  </span>
                  <span className="pp-row__fact">{c.last ? c.last.body : c.phone}</span>
                </span>
                {c.opted_out
                  ? <span className="chip chip-danger">Opted out</span>
                  : <span className="tx-when mono">{fmtShort(c.last_at)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
