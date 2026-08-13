// Home — the Daily Brief as a visual KPI dashboard.
// Numbers, bars, sparks, rows — near-zero prose. Falls back to the counts grid on error.
import { useEffect, useState } from 'react';
import './home.css';
import { useNav2, modByKey, Spark2 } from './shell';
import { TODAY_ACTIONS } from './simple-map';
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

const PERSONAS = [
  ['manager', 'Manager'],
  ['staff', 'Staff'],
  ['candidate', 'Candidate'],
  ['volunteer', 'Volunteer'],
];

const SEV = {
  ok:     { icon: '✓', lbl: 'OK' },
  warn:   { icon: '!', lbl: 'WATCH' },
  danger: { icon: '‼', lbl: 'ALERT' },
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

function fmtVal(v) {
  if (v == null || v === '') return '—';
  return typeof v === 'number' ? v.toLocaleString() : String(v);
}

// ── Hero selection per persona: exactly one large figure per view.
// manager/staff → money stat; candidate → days-to-vote; volunteer → shifts meter.
function pickHero(sections, persona, daysToVote) {
  if (persona === 'candidate' && daysToVote != null) {
    return {
      synthetic: {
        key: 'margin', route: 'margin', label: 'Days to vote', kind: 'stat',
        value: daysToVote, sub: 'to election day',
      },
    };
  }
  if (persona === 'volunteer') {
    const m = sections.find(s => s.kind === 'meter');
    if (m) return { section: m };
  }
  const money = sections.find(s =>
    s.kind === 'stat' &&
    (/\$/.test(String(s.value ?? '')) || /ledger|cash|raise|fund|money|burn/i.test(`${s.key ?? ''} ${s.label ?? ''}`)));
  if (money) return { section: money };
  const stat = sections.find(s => s.kind === 'stat' || !s.kind);
  return { section: stat || sections[0] };
}

// ── Tile bodies ──────────────────────────────────────────────────────────
const StatBody = ({ s }) => {
  const d = s.delta;
  const arrow = d ? (d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '→') : '';
  const tone = d ? (d.dir === 'flat' ? 'flat' : d.good ? 'good' : 'bad') : '';
  return (
    <>
      <div className="kpi__val-row">
        <span className="kpi__val">{fmtVal(s.value)}</span>
        {d && d.text && <span className={`kpi__delta kpi__delta--${tone}`}>{arrow} {d.text}</span>}
      </div>
      {Array.isArray(s.spark) && s.spark.length > 1 && (
        <div className="kpi__spark" aria-hidden="true">
          <Spark2 data={s.spark} w={120} h={28} color="var(--ink-6)" />
        </div>
      )}
      {s.sub && <div className="kpi__sub">{s.sub}</div>}
    </>
  );
};

const MeterBody = ({ s }) => {
  const num = Number(s.num), den = Number(s.den);
  let pct = null;
  if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
    pct = Math.max(0, Math.min(100, (num / den) * 100));
  } else {
    const m = /([\d.]+)\s*%/.exec(String(s.value ?? ''));
    if (m) pct = Math.max(0, Math.min(100, parseFloat(m[1])));
  }
  const sev = SEV[s.severity] ? s.severity : 'ok';
  const label = s.value != null ? fmtVal(s.value)
    : Number.isFinite(num) && Number.isFinite(den) ? `${num.toLocaleString()}/${den.toLocaleString()}`
    : pct != null ? `${Math.round(pct)}%` : '—';
  return (
    <>
      <div className="kpi__val-row">
        <span className="kpi__val">{label}</span>
        <span className={`kpi__sev kpi__sev--${sev}`}>{SEV[sev].icon} {SEV[sev].lbl}</span>
      </div>
      {pct != null && (
        <div className={`kpi__meter kpi__meter--${sev}`} role="img" aria-label={`${Math.round(pct)}%`}>
          <span className="kpi__meter-fill" style={{ width: `${pct}%` }} />
        </div>
      )}
      {s.sub && <div className="kpi__sub">{s.sub}</div>}
    </>
  );
};

const ListBody = ({ s }) => {
  const items = Array.isArray(s.items) ? s.items.slice(0, 4) : [];
  if (items.length === 0) {
    return (
      <div className="kpi__list-empty">
        <span className="kpi__list-empty-mark">○</span>
        Nothing scheduled
      </div>
    );
  }
  return (
    <div className="kpi__list">
      {items.map((it, i) => (
        <div key={i} className="kpi__row">
          <span className="kpi__when">{it.when || '·'}</span>
          <span className="kpi__row-lbl">{it.label}</span>
          {it.sub && <span className="kpi__row-sub">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
};

const KpiTile = ({ s, hero, go }) => {
  const mod = modByKey(s.key) || modByKey(s.route) || modByKey(s.module);
  const ac = mod?.ac || 'var(--ink)';
  const cls = 'kpi'
    + (hero ? ' kpi--hero' : '')
    + (s.kind === 'list' ? ' kpi--list' : '')
    + (s.attention ? ' kpi--attn' : '');
  return (
    <button className={cls} style={{ '--bc': ac }} onClick={() => go(s.route || s.key)}>
      <div className="kpi__ey">
        <span className="kpi__dot" aria-hidden="true" />
        <span className="kpi__lbl">{s.label}</span>
        {s.attention && (
          <span className="kpi__attn">
            <span className="kpi__attn-dot" aria-hidden="true" />ATTENTION
          </span>
        )}
      </div>
      {s.kind === 'meter' ? <MeterBody s={s} /> : s.kind === 'list' ? <ListBody s={s} /> : <StatBody s={s} />}
    </button>
  );
};

// ── Home ─────────────────────────────────────────────────────────────────
const Home2 = () => {
  const { go } = useNav2();
  const { user, workspace } = useAuth();
  const enabledModules = workspace?.settings?.modules || {};
  const isEnabled = (k) => enabledModules[k] !== false;
  const canPreview = user?.role === 'admin' || user?.role === 'super_admin';

  // Fetch record counts per module bucket — one request per bucket, parallelized
  const [counts, setCounts] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  // The Brief — server-composed daily digest. 'loading' | 'ok' | 'error'.
  // Error (endpoint not landed yet, 404, etc.) falls back to the counts grid.
  const [brief, setBrief] = useState(null);
  const [briefStatus, setBriefStatus] = useState('loading');
  const [viewAs, setViewAs] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.brief(viewAs || undefined)
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
    return () => { cancelled = true; };
  }, [workspace?.id, viewAs]);

  useEffect(() => {
    let cancelled = false;
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

  // Current persona — the brief payload carries it; default while loading.
  const persona = brief?.persona || viewAs || 'manager';

  // Verb-first actions for this persona (bucket entries only for enabled modules).
  const todayActions = TODAY_ACTIONS.filter(a =>
    a.personas.includes(persona) && (!a.bucket || isEnabled(a.bucket.split('.')[0])));

  // Compose the tile order: one hero first, then the rest in API order.
  let tiles = [];
  if (briefStatus === 'ok' && brief) {
    const sections = brief.sections;
    const hero = pickHero(sections, persona, workspace?.daysToVote);
    if (hero.synthetic) {
      tiles = [{ s: hero.synthetic, hero: true }, ...sections.map(s => ({ s, hero: false }))];
    } else {
      tiles = [
        { s: hero.section, hero: true },
        ...sections.filter(s => s !== hero.section).map(s => ({ s, hero: false })),
      ];
    }
  }

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

      {todayActions.length > 0 && (
        <section className="home2__sect home2__do" aria-label="Quick actions">
          <span className="home2__do-ey" aria-hidden="true">DO</span>
          <div className="home2__do-row">
            {todayActions.map((a, i) => (
              <button
                key={a.label}
                className={'do-pill' + (i === 0 ? ' do-pill--primary' : '')}
                onClick={() => window.dispatchEvent(a.palette
                  ? new CustomEvent('mandate:palette')
                  : new CustomEvent('mandate:quickadd', { detail: { bucket: a.bucket } }))}
              >
                {a.label}
                {a.palette && <kbd className="do-pill__kbd" aria-hidden="true">⌘K</kbd>}
              </button>
            ))}
          </div>
        </section>
      )}

      {counts === null || briefStatus === 'loading' ? (
        <section className="home2__sect" aria-hidden="true">
          <div className="home2__brief-skel"><span /><span /><span /><span /></div>
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
            <h2 className="home2__sect-h home2__brief-h">
              {viewAs
                ? `PREVIEWING AS ${(brief?.persona || viewAs).toUpperCase()}`
                : `The Brief — ${briefDate()}`}
            </h2>
            <div className="home2__brief-tools">
              {canPreview && (
                <div className="kpi-viewas" role="group" aria-label="View as">
                  {PERSONAS.map(([k, lbl]) => (
                    <button
                      key={k}
                      className={'kpi-viewas__btn' + (viewAs === k ? ' is-on' : '')}
                      aria-pressed={viewAs === k}
                      onClick={() => setViewAs(v => (v === k ? null : k))}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
              {brief?.generatedAt && fmtClock(brief.generatedAt) && (
                <span className="home2__brief-gen">as of {fmtClock(brief.generatedAt)}</span>
              )}
            </div>
          </div>
          <div className="kpi-grid">
            {tiles.map(({ s, hero }) => (
              <KpiTile key={(s.key || s.route || s.label) + (hero ? '@hero' : '')} s={s} hero={hero} go={go} />
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
