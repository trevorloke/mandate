// Home — workspace summary that reads from the user's real records.
// No more dummy data. Shows greeting + per-module record counts + quick links.
import { useEffect, useState } from 'react';
import './home.css';
import { useNav2, modByKey } from './shell';
import { useAuth } from './auth/AuthContext';
import { api } from './auth/api';

// Module → buckets to count for that module (from MODULE_KINDS in admin/AdminData)
const MOD_KINDS = {
  ground:    ['voter', 'canvasser', 'shift', 'pd', 'script'],
  beacon:    ['account', 'post', 'mention', 'press_outlet'],
  raise:     ['donor', 'prospect', 'pledge', 'gift'],
  ledger:    ['journal', 'account', 'bill', 'filing', 'asset'],
  coalition: ['org', 'endorsement', 'ask', 'comm'],
  civic:     ['bill', 'case', 'promise', 'speech'],
  opposition:['target', 'claim', 'evidence', 'lead'],
  site:      ['page', 'experiment', 'form'],
  events:    ['event', 'venue', 'host'],
  academy:   ['course', 'article', 'faculty'],
  command:   ['channel', 'message'],
};
const MOD_LABELS = {
  ground:'Ground', beacon:'Beacon', raise:'Raise', ledger:'Ledger',
  coalition:'Coalition', civic:'Civic', opposition:'Opposition',
  site:'Site', events:'Events', academy:'Academy', command:'Command',
  tide:'Tide', margin:'Margin', directory:'Directory',
};

function timeOfDay() {
  const h = new Date().getHours();
  if (h < 5)  return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fmtDate() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function briefDate() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtClock(t) {
  const d = new Date(t);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const Home2 = () => {
  const { go } = useNav2();
  const { user, workspace } = useAuth();
  const enabledModules = workspace?.settings?.modules || {};
  const isEnabled = (k) => enabledModules[k] !== false;

  // Fetch record counts per module bucket — one request per bucket, parallelized
  const [counts, setCounts] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  // The Brief — server-composed daily digest. 'loading' | 'ok' | 'error'.
  // Error (endpoint not landed yet, 404, etc.) falls back to the counts grid.
  const [brief, setBrief] = useState(null);
  const [briefStatus, setBriefStatus] = useState('loading');

  useEffect(() => {
    let cancelled = false;

    api.brief()
      .then(r => {
        if (cancelled) return;
        if (r && Array.isArray(r.sections) && r.sections.length > 0) {
          setBrief(r);
          setBriefStatus('ok');
        } else {
          setBriefStatus('error');
        }
      })
      .catch(() => { if (!cancelled) setBriefStatus('error'); });

    (async () => {
      const next = {};
      const tasks = [];
      for (const [mod, kinds] of Object.entries(MOD_KINDS)) {
        if (!isEnabled(mod)) continue;
        next[mod] = 0;
        for (const k of kinds) {
          tasks.push(
            api.listData(mod, k)
              .then(r => { next[mod] += (r.records?.length || 0); })
              .catch(() => {})
          );
        }
      }
      await Promise.all(tasks);
      if (!cancelled) setCounts(next);

      // Recent activity from audit log (last 10)
      try {
        const r = await api.audit(10);
        if (!cancelled) setActivity(r.log || []);
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
    // re-fetch on workspace change
  }, [workspace?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalRecords = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const populatedModules = counts ? Object.entries(counts).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]) : [];
  const emptyModules     = counts ? Object.entries(counts).filter(([, n]) => n === 0) : [];

  return (
    <main className="home2" data-screen-label="Home">
      <header className="home2__masthead">
        <div className="home2__masthead-row">
          <div>
            <div className="home2__plate">{fmtDate().toUpperCase()} · {workspace?.name || 'Workspace'}</div>
            <h1 className="home2__greeting">
              {timeOfDay()}, <em>{user?.name?.split(' ')[0] || 'there'}.</em>
            </h1>
            <p className="home2__dek">
              {workspace?.candidate ? <>Campaign for <b>{workspace.candidate}</b>{workspace?.party && <> · {workspace.party}</>}.</> : 'Your workspace.'}
              {' '}{workspace?.daysToVote != null && <>T-<b>{workspace.daysToVote}</b>d to vote · phase: <b>{workspace.phase || 'Pre-launch'}</b>.</>}
            </p>
          </div>
          <aside className="home2__total">
            <div className="home2__total-num">{loading ? '—' : totalRecords.toLocaleString()}</div>
            <div className="home2__total-lbl">records in workspace</div>
          </aside>
        </div>
      </header>

      {counts === null || briefStatus === 'loading' ? (
        <section className="home2__sect" aria-hidden="true">
          <div className="home2__brief-skel"><span /><span /><span /></div>
        </section>
      ) : populatedModules.length === 0 ? (
        <section className="home2__sect">
          <h2 className="home2__sect-h">Modules</h2>
          <div className="home2__empty">
            <p>Your workspace has no records yet.</p>
            <p className="home2__hint">
              Pick a module from the top nav, or open <b>Admin → Module data</b> to add records (donors, voters, posts, etc.).
              You can also load realistic sample data for any bucket from there.
            </p>
            <button className="home2__cta" onClick={() => { try { localStorage.setItem('mandate2:route', 'admin'); } catch {} window.location.reload(); }}>
              Open Admin →
            </button>
          </div>
        </section>
      ) : briefStatus === 'ok' ? (
        <section className="home2__sect home2__brief">
          <div className="home2__brief-head">
            <h2 className="home2__sect-h home2__brief-h">The Brief — {briefDate()}</h2>
            {brief?.generatedAt && fmtClock(brief.generatedAt) && (
              <span className="home2__brief-gen">as of {fmtClock(brief.generatedAt)}</span>
            )}
          </div>
          <div className="home2__brief-grid">
            {brief.sections.map((s) => (
              <button
                key={s.key || s.module}
                className={'brief-card' + (s.attention ? ' brief-card--attn' : '')}
                style={{ '--bc': modByKey(s.module)?.ac || 'var(--ink)' }}
                onClick={() => go(s.route || s.module)}
              >
                <div className="brief-card__ey">
                  <span className="brief-card__dot" aria-hidden="true" />
                  <span className="brief-card__lbl">{s.label}</span>
                  {s.attention && <span className="brief-card__attn">● needs attention</span>}
                </div>
                <div className="brief-card__headline">{s.headline}</div>
                {s.detail && <div className="brief-card__detail">{s.detail}</div>}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="home2__sect">
          <h2 className="home2__sect-h">Modules</h2>
          <div className="home2__grid">
            {populatedModules.map(([mod, count]) => (
              <button key={mod} className="home2__card home2__card--has" onClick={() => go(mod)}>
                <div className="home2__card-mod">{mod}</div>
                <div className="home2__card-num">{count.toLocaleString()}</div>
                <div className="home2__card-lbl">records · open {MOD_LABELS[mod]} →</div>
              </button>
            ))}
            {emptyModules.map(([mod]) => (
              <button key={mod} className="home2__card home2__card--empty" onClick={() => go(mod)}>
                <div className="home2__card-mod">{mod}</div>
                <div className="home2__card-num home2__card-num--zero">—</div>
                <div className="home2__card-lbl">empty · {MOD_LABELS[mod]}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <section className="home2__sect">
          <h2 className="home2__sect-h">Recent activity</h2>
          <ul className="home2__activity">
            {activity.slice(0, 8).map(a => (
              <li key={a.id}>
                <span className="home2__act-when">{relTime(a.createdAt)}</span>
                <code>{a.action}</code>
                {a.userName && <span className="home2__act-who"> · {a.userName}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
};

function relTime(t) {
  if (!t) return '';
  const ms = Date.now() - new Date(t).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export { Home2 };
