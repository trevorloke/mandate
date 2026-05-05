import React from 'react';
import './raise.css';
import { RAISE_KPIS, RAISE_TODAY, RAISE_PULSE, RAISE_GIFTMIX, RAISE_PROSPECT_DETAIL, RAISE_DONORS, RAISE_STAGES, RAISE_PROSPECTS, RAISE_STORIES, RAISE_FEED, RAISE_COMPLIANCE } from './raise-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { RaiseGifts, RaiseLists, RaiseReports } from './raise-glr';
import { LogGiftModal, AddDonorModal, RaiseToast } from './raise-modals';
import { api } from './auth/api';

// Mandate 2.0 — Raise (fundraising / moves management) v2

const { useState: rUS } = React;

/* ── Sparkline (KPI mini chart) ── */
const Spark = ({ pts, color = '#0d4f3c', fill = false }) => {
  const w = 56, h = 22, pad = 1;
  const max = Math.max(...pts), min = Math.min(...pts);
  const r = max - min || 1;
  const dx = (w - pad * 2) / (pts.length - 1);
  const xy = pts.map((p, i) => [pad + i * dx, h - pad - ((p - min) / r) * (h - pad * 2)]);
  const d = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const fillD = d + ` L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="raise__kpi-spark">
      {fill && <path d={fillD} fill={color} fillOpacity="0.1" />}
      <path d={d} stroke={color} strokeWidth="1.2" fill="none" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="1.6" fill={color} />
    </svg>
  );
};

const KPI_SPARKS = {
  ytd:         [4, 6, 5, 7, 8, 7, 9, 11, 10, 13, 14, 16],
  pipeline:    [12, 11, 14, 13, 16, 15, 14, 16, 17, 16, 18, 17],
  averagegift: [180, 175, 190, 188, 195, 200, 205, 210, 208, 213, 211, 214],
  retention:   [60, 61, 60, 62, 63, 62, 63, 64, 65, 66, 66, 67],
  burn:        [800, 770, 740, 710, 700, 680, 670, 660, 640, 630, 620, 614],
  pledgesdue:  [50, 60, 65, 70, 72, 75, 80, 78, 80, 82, 84, 84],
};

const RaiseKpiStrip = () => (
  <div className="raise__kpis">
    {Object.entries(RAISE_KPIS).map(([k, v]) => (
      <div className="raise__kpi" key={k}>
        <div className="raise__kpi-lbl">{v.label}</div>
        <div className="raise__kpi-val">{v.value}</div>
        <Spark pts={KPI_SPARKS[k]} fill color={v.tone === 'warn' ? '#b94a3a' : v.tone === 'flat' ? '#6b6855' : '#0d4f3c'} />
        <div className={`raise__kpi-delta ${v.tone}`}>
          <b>{v.delta}</b>
          <span>{v.sub}</span>
        </div>
      </div>
    ))}
  </div>
);

/* ── Today's moves block ── */
const RaiseToday = ({ onPick }) => (
  <div className="r-today">
    <div className="r-moves">
      {RAISE_TODAY.map(m => (
        <div className="r-move" key={m.id} onClick={() => onPick && onPick(m.name)}>
          <div className="r-move__when">
            <b>{m.date.includes(':') ? m.date : m.date.split(' ')[1]}</b>
            {m.day}
          </div>
          <div className="r-move__body">
            <div className="r-move__action">
              <span className={`r-move__verb ${m.verbCls}`}>{m.verb}</span>
              {m.name}
            </div>
            <div className="r-move__hint">{m.hint}</div>
          </div>
          <div className="r-move__cap">
            cap {m.cap}<br/>
            <b>{m.ask}</b>
          </div>
          <div className="r-move__by">{m.officer}</div>
        </div>
      ))}
    </div>
    <div className="r-pulse-card">
      <div className="r-pulse-card__h">
        <span>Pulse</span>
        <em>what donors are saying</em>
      </div>
      <div className="r-pulse">
        {RAISE_PULSE.map(p => (
          <div className={`r-pulse-item ${p.tone}`} key={p.id}>
            <div className="r-pulse-hd">
              <b>{p.who}</b>
              <span>{p.via} · {p.t}</span>
            </div>
            <div className="r-pulse-msg">"{p.msg}"</div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

/* ── Pipeline value bar ── */
const PipeValueBar = () => {
  // Stage values; bars sized proportionally with min width
  const data = [
    { id: 'identify',  name: 'Identify',  val: 0,    color: '#a9c4b4' },
    { id: 'qualify',   name: 'Qualify',   val: 72,   color: '#6b9d82' },
    { id: 'cultivate', name: 'Cultivate', val: 184,  color: '#3d7a5e' },
    { id: 'solicit',   name: 'Solicit',   val: 160,  color: '#0d4f3c' },
    { id: 'steward',   name: 'Steward',   val: 70,   color: '#0a3d2e' },
  ];
  const total = data.reduce((s, d) => s + Math.max(d.val, 12), 0);
  return (
    <div className="r-pipe-bar">
      {data.map(d => {
        const v = Math.max(d.val, 12);
        return (
          <div key={d.id} className="r-pipe-bar__seg" style={{ flexBasis: `${(v / total) * 100}%`, background: d.color }}>
            <span>{d.name}</span>
            <b>{d.val ? '$' + d.val + 'K' : '—'}</b>
          </div>
        );
      })}
    </div>
  );
};

/* ── Pipeline stage column ── */
const StageColumn = ({ stage, prospects, onPick }) => {
  const items = prospects.filter(p => p.stage === stage.id);
  return (
    <div className="r-stage">
      <div className="r-stage__hd">
        <div className="r-stage__name">{stage.name}</div>
        <div className="r-stage__cnt">{stage.count}</div>
        <div className="r-stage__val">{stage.value}</div>
        <div className="r-stage__hint">{stage.hint}</div>
      </div>
      <div className="r-stage__list">
        {items.map(p => (
          <div className="r-card" key={p.id} onClick={() => onPick(p)}>
            <div className="r-card__name">
              <span className={`r-card__warmth ${p.warmth}`}></span>
              <span className="txt">{p.name}</span>
            </div>
            <div className="r-card__row">
              <div className="r-card__cap">
                <span className="r-card__cap-lbl">capacity</span>
                <span className="r-card__cap-val">{p.capacity}</span>
              </div>
              <div className="r-card__ask">
                <span className="r-card__cap-lbl">ask</span>
                <div className="r-card__ask-val">{p.ask}</div>
              </div>
            </div>
            <div className="r-card__next">{p.next}</div>
            <div className="r-card__officer">{p.officer === '—' ? 'unassigned' : p.officer.split(' ').map(s => s[0]).join('')} · {p.tags.slice(0,2).join(' · ')}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Story art (proper SVG, not text gradients) ── */
const StoryArt = ({ id }) => {
  if (id === 's-housing') {
    return (
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky-h" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#d4a574" />
            <stop offset="1" stopColor="#8a6440" />
          </linearGradient>
        </defs>
        <rect width="320" height="200" fill="url(#sky-h)" />
        {/* Building silhouettes */}
        <rect x="20" y="60" width="60" height="140" fill="#3a2d20" />
        <rect x="85" y="30" width="80" height="170" fill="#2a1f15" />
        <rect x="170" y="50" width="70" height="150" fill="#3a2d20" />
        <rect x="245" y="80" width="55" height="120" fill="#2a1f15" />
        {/* Windows */}
        {[0,1,2,3,4,5].map(r => [0,1,2].map(c => (
          <rect key={`a${r}${c}`} x={28 + c * 18} y={70 + r * 22} width="10" height="14" fill={Math.random() > 0.5 ? '#f4d088' : '#3a2d20'} fillOpacity={Math.random() > 0.5 ? 0.85 : 0} />
        )))}
        {[0,1,2,3,4,5,6,7].map(r => [0,1,2,3].map(c => (
          <rect key={`b${r}${c}`} x={92 + c * 18} y={40 + r * 20} width="10" height="12" fill="#f4d088" fillOpacity={(r * 4 + c) % 3 === 0 ? 0.9 : 0} />
        )))}
        {[0,1,2,3,4,5].map(r => [0,1,2].map(c => (
          <rect key={`c${r}${c}`} x={178 + c * 20} y={60 + r * 22} width="11" height="14" fill="#f4d088" fillOpacity={(r + c) % 2 === 0 ? 0.7 : 0} />
        )))}
        {/* Foreground chain-link suggestion */}
        <g stroke="#1a1108" strokeWidth="0.5" opacity="0.4">
          {[...Array(20)].map((_, i) => <line key={i} x1={i * 16} y1="0" x2={i * 16 + 8} y2="200" />)}
          {[...Array(20)].map((_, i) => <line key={`b${i}`} x1={i * 16} y1="200" x2={i * 16 + 8} y2="0" />)}
        </g>
      </svg>
    );
  }
  if (id === 's-transit') {
    return (
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky-t" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3d4d5c" />
            <stop offset="1" stopColor="#1a242e" />
          </linearGradient>
        </defs>
        <rect width="320" height="200" fill="url(#sky-t)" />
        {/* Rain streaks */}
        <g stroke="#6b8294" strokeWidth="0.6" opacity="0.5">
          {[...Array(60)].map((_, i) => <line key={i} x1={(i*7)%320} y1={(i*13)%200} x2={(i*7)%320 - 4} y2={(i*13)%200 + 12} />)}
        </g>
        {/* Bus shelter */}
        <rect x="60" y="100" width="120" height="80" fill="#0a141c" stroke="#3d4d5c" strokeWidth="1" />
        <rect x="64" y="104" width="112" height="50" fill="#1a2a38" opacity="0.6" />
        {/* Figure */}
        <ellipse cx="120" cy="155" rx="14" ry="6" fill="#0a141c" />
        <rect x="113" y="120" width="14" height="38" fill="#0a141c" />
        <circle cx="120" cy="115" r="7" fill="#1a2a38" />
        {/* Lamppost glow */}
        <circle cx="240" cy="50" r="22" fill="#f4d088" opacity="0.18" />
        <circle cx="240" cy="50" r="8" fill="#f4d088" opacity="0.5" />
        <line x1="240" y1="60" x2="240" y2="200" stroke="#0a141c" strokeWidth="2" />
        {/* Wet pavement */}
        <rect x="0" y="180" width="320" height="20" fill="#0a141c" />
        <rect x="0" y="178" width="320" height="3" fill="#6b8294" opacity="0.3" />
      </svg>
    );
  }
  if (id === 's-academy') {
    return (
      <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sky-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#5c4a3a" />
            <stop offset="1" stopColor="#2a1f15" />
          </linearGradient>
        </defs>
        <rect width="320" height="200" fill="url(#sky-a)" />
        {/* School building */}
        <rect x="40" y="80" width="240" height="100" fill="#1a1208" />
        <polygon points="40,80 160,40 280,80" fill="#0a0904" />
        {/* Classroom windows — mostly dark, one lit */}
        {[0,1,2,3,4,5].map(c => (
          <rect key={c} x={56 + c * 38} y={100} width="24" height="30"
            fill={c === 2 ? '#f4d088' : '#0a0904'}
            fillOpacity={c === 2 ? 0.95 : 0.6} />
        ))}
        {[0,1,2,3,4,5].map(c => (
          <rect key={`b${c}`} x={56 + c * 38} y={140} width="24" height="30" fill="#0a0904" fillOpacity="0.6" />
        ))}
        {/* Lit window grid */}
        <g stroke="#1a1208" strokeWidth="1.5">
          <line x1="68" y1="100" x2="68" y2="130" />
          <line x1="56" y1="115" x2="80" y2="115" />
        </g>
        {/* Goalpost suggestion */}
        <line x1="20" y1="180" x2="20" y2="140" stroke="#3a2d20" strokeWidth="2" />
        <line x1="20" y1="140" x2="40" y2="140" stroke="#3a2d20" strokeWidth="2" />
      </svg>
    );
  }
  return null;
};

const StoryCard = ({ s }) => (
  <article className="r-story">
    <div className="r-story__art">
      <StoryArt id={s.id} />
      <div className="r-story__caption">{s.img}</div>
    </div>
    <div className="r-story__body">
      <div className="r-story__tag">{s.issue}</div>
      <h3 className="r-story__title">{s.title}</h3>
      <p className="r-story__excerpt">{s.excerpt}</p>
      <div className="r-story__foot">
        <span className="r-story__foot-money">{s.raised} <em>· {s.donors} donors</em></span>
        <span>Updated {s.updated}</span>
      </div>
    </div>
  </article>
);

const DonorTable = ({ donors }) => (
  <table className="r-table">
    <thead>
      <tr>
        <th>Donor</th>
        <th className="num">Last gift</th>
        <th>Cadence</th>
        <th className="num">LTV</th>
        <th>Source list</th>
        <th className="num">Last seen</th>
      </tr>
    </thead>
    <tbody>
      {donors.map(d => (
        <tr key={d.id}>
          <td className="name">{d.name}</td>
          <td className="num gift">${d.gift.toLocaleString()}</td>
          <td className="freq">{d.freq}</td>
          <td className="num gift">${d.ltv.toLocaleString()}</td>
          <td className="list">{d.list}</td>
          <td className="num freq">{d.last}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const GiftMix = () => (
  <div className="r-mix">
    <div className="r-mix__h">Gift mix · YTD</div>
    <div className="r-mix__big">$1.42M<em>raised</em></div>
    <div className="r-mix__bar">
      {RAISE_GIFTMIX.map(g => (
        <div key={g.id} style={{ flexBasis: `${g.pct}%`, background: g.color }}></div>
      ))}
    </div>
    <div className="r-mix__legend">
      {RAISE_GIFTMIX.map(g => (
        <div className="r-mix__legend-row" key={g.id}>
          <div className="dot" style={{ background: g.color }}></div>
          <span className="lbl">{g.lbl}</span>
          <span className="pct">{g.pct}%</span>
          <span className="amt">{g.amt}</span>
        </div>
      ))}
    </div>
  </div>
);

/* ── Drawer ── */
const ProspectDrawer = ({ prospect, onClose, onLogGift }) => {
  if (!prospect) return null;
  const detail = RAISE_PROSPECT_DETAIL[prospect.id] || {
    wealthScore: 'B · est. capacity ' + prospect.capacity,
    affil: prospect.tags.join(' · '),
    history: [
      { d: prospect.last.split(' ').slice(-2).join(' '), a: prospect.last, n: '—' },
    ],
    given: '—',
    asks: 1,
    closed: 0,
  };
  return (
    <>
      <div className={`r-drawer-mask ${prospect ? 'open' : ''}`} onClick={onClose}></div>
      <aside className={`r-drawer ${prospect ? 'open' : ''}`}>
        <div className="r-drawer__hd">
          <div className="r-drawer__eyebrow">
            <span className="w" style={{ background: prospect.warmth === 'hot' ? '#b94a3a' : prospect.warmth === 'warm' ? '#d68a4f' : '#6b7c8a' }}></span>
            {prospect.stage} · {prospect.warmth}
          </div>
          <div className="r-drawer__name">{prospect.name}</div>
          <button className="r-drawer__close" onClick={onClose}>×</button>
        </div>
        <div className="r-drawer__body">
          <div className="r-drawer__sec">
            <div className="r-drawer__sec-h">Capacity & ask</div>
            <div className="r-drawer__stats">
              <div className="r-drawer__stat">
                <div className="r-drawer__stat-lbl">Capacity</div>
                <div className="r-drawer__stat-val money">{prospect.capacity}</div>
              </div>
              <div className="r-drawer__stat">
                <div className="r-drawer__stat-lbl">Current ask</div>
                <div className="r-drawer__stat-val">{prospect.ask}</div>
              </div>
              <div className="r-drawer__stat">
                <div className="r-drawer__stat-lbl">Score</div>
                <div className="r-drawer__stat-val">{prospect.score}</div>
              </div>
            </div>
          </div>
          <div className="r-drawer__sec">
            <div className="r-drawer__sec-h">Wealth & affiliations</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, marginBottom: 6, fontWeight: 500 }}>{detail.wealthScore}</div>
            <div style={{ fontSize: 12, color: '#6b6855' }}>{detail.affil}</div>
          </div>
          <div className="r-drawer__sec">
            <div className="r-drawer__sec-h">Officer notes · last move</div>
            <p className="r-drawer__notes">"{prospect.notes}"</p>
            <div style={{ marginTop: 10, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: '#8a8472' }}>
              — {prospect.officer === '—' ? 'unassigned' : prospect.officer} · {prospect.last}
            </div>
          </div>
          <div className="r-drawer__sec">
            <div className="r-drawer__sec-h">Giving history</div>
            <div className="r-drawer__hist">
              {detail.history.map((h, i) => (
                <div className="r-drawer__hist-row" key={i}>
                  <div className="d">{h.d}</div>
                  <div className="a">{h.a}</div>
                  <div className="n">{h.n}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: 'flex', gap: 16, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: '#8a8472' }}>
              <span>Total given <b style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#0d4f3c' }}>{detail.given}</b></span>
              <span>Asks <b style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#14110a' }}>{detail.asks}</b></span>
              <span>Closed <b style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: '#14110a' }}>{detail.closed}</b></span>
            </div>
          </div>
          <div className="r-drawer__sec">
            <div className="r-drawer__sec-h">Tags</div>
            {prospect.tags.map(t => <span className="r-drawer__tag" key={t}>{t}</span>)}
          </div>
        </div>
        <div className="r-drawer__actions">
          <button className="r-drawer__btn" onClick={() => onLogGift && onLogGift(prospect)}>Log gift</button>
          <button className="r-drawer__btn ghost">Schedule ask</button>
          <button className="r-drawer__btn ghost">Send brief</button>
        </div>
      </aside>
    </>
  );
};

/* ── Page ── */
const Raise2 = () => {
  const { records: liveProspects } = useLiveRecords('raise', 'prospect', RAISE_PROSPECTS);
  const { records: liveDonors, isEmpty: noDonors } = useLiveRecords('raise', 'donor', RAISE_DONORS);
  const [tab, setTab] = rUS('moves');
  const [drawer, setDrawer] = rUS(null);
  const [giftOpen, setGiftOpen] = rUS(false);
  const [giftPrefill, setGiftPrefill] = rUS(null);
  const [donorOpen, setDonorOpen] = rUS(false);
  const [donorPrefill, setDonorPrefill] = rUS('');
  const [extraDonors, setExtraDonors] = rUS([]);
  const [toast, setToast] = rUS(null);
  // Empty-state: check AFTER all hooks (React rule: hook order must be stable).
  if (noDonors && (!liveProspects || liveProspects.length === 0)) {
    return <EmptyModule module="RAISE" label="Raise" accent="var(--m-raise)" />;
  }

  const openGift = (prefill = null) => { setGiftPrefill(prefill); setGiftOpen(true); };
  const openDonor = (prefill = '') => { setDonorPrefill(prefill); setDonorOpen(true); };

  const flashToast = (msg, undoFn) => {
    setToast({ msg, undo: undoFn });
    setTimeout(() => setToast(null), 4200);
  };

  const handleLogged = (gift) => {
    // Persist to DB; ignore network failures (gift still appears via toast)
    api.createData('raise', 'gift', gift).catch(() => {});
    flashToast(<><b>${gift.amount.toLocaleString()}</b> from {gift.donor} posted · {gift.fund}</>);
  };
  const handleAdded = (donor) => {
    setExtraDonors(p => [donor, ...p]);
    api.createData('raise', 'donor', donor).catch(() => {});
    flashToast(<><b>{donor.name}</b> added to donor file · 4,214 records</>);
  };

  const drawerToGift = (p) => {
    const prospectAsDonor = {
      id: p.id, name: p.name, gift: 0, ltv: 0, list: 'Prospect',
      isProspect: true, capacity: p.capacity,
    };
    setDrawer(null);
    setTimeout(() => openGift(prospectAsDonor), 220);
  };

  const allDonors = [...extraDonors, ...liveDonors];

  return (
    <div className="raise">
      <RaiseKpiStrip />

      <div className="raise__tabs">
        <button className={`raise__tab ${tab==='moves' ? 'is-active' : ''}`} onClick={() => setTab('moves')}>
          Moves <span className="raise__tab-count">52</span>
        </button>
        <button className={`raise__tab ${tab==='stories' ? 'is-active' : ''}`} onClick={() => setTab('stories')}>
          Stories <span className="raise__tab-count">3</span>
        </button>
        <button className={`raise__tab ${tab==='donors' ? 'is-active' : ''}`} onClick={() => setTab('donors')}>
          Donors <span className="raise__tab-count">4,213</span>
        </button>
        <button className={`raise__tab ${tab==='gifts' ? 'is-active' : ''}`} onClick={() => setTab('gifts')}>Gifts</button>
        <button className={`raise__tab ${tab==='lists' ? 'is-active' : ''}`} onClick={() => setTab('lists')}>Lists</button>
        <button className={`raise__tab ${tab==='reports' ? 'is-active' : ''}`} onClick={() => setTab('reports')}>Reports</button>
        <div className="raise__tabs-spacer"></div>
        <div className="raise__compliance">
          <span>Cycle cap <b>$1,400</b></span>
          <span className="flag">2 flagged</span>
          <span>Q2 in <b>64d</b></span>
        </div>
        <button className="raise__compose" onClick={() => openGift(null)}>+ Log gift</button>
      </div>

      <div className="raise__body">
        {tab === 'moves' && (
          <>
            <div className="r-sec">
              <span className="r-sec__num">01</span>
              <span className="r-sec__h">Today's moves</span>
              <span className="r-sec__sub">— five next actions, ranked by closeability</span>
              <button className="r-sec__action">Plan week →</button>
            </div>
            <RaiseToday />

            <div className="r-sec">
              <span className="r-sec__num">02</span>
              <span className="r-sec__h">Pipeline</span>
              <span className="r-sec__sub">— 52 prospects, $486K open across five stages</span>
              <button className="r-sec__action">Open board →</button>
            </div>
            <div className="r-pipe-wrap">
              <PipeValueBar />
              <div className="r-pipe">
                {RAISE_STAGES.map(s => (
                  <StageColumn key={s.id} stage={s} prospects={liveProspects} onPick={setDrawer} />
                ))}
              </div>
            </div>

            <div className="r-sec">
              <span className="r-sec__num">03</span>
              <span className="r-sec__h">Stories driving asks</span>
              <span className="r-sec__sub">— donors give to people, not budgets</span>
              <button className="r-sec__action">All stories →</button>
            </div>
            <div className="r-stories-wrap">
              <div className="r-stories">
                {RAISE_STORIES.map(s => <StoryCard s={s} key={s.id} />)}
              </div>
            </div>

            <div className="r-sec">
              <span className="r-sec__num">04</span>
              <span className="r-sec__h">Donor file</span>
              <span className="r-sec__sub">— recent activity, top 10 of 4,213</span>
              <button className="r-sec__action">All donors →</button>
            </div>
            <div className="r-donors-wrap">
              <div className="r-donor-grid">
                <DonorTable donors={allDonors} />
                <GiftMix />
              </div>
            </div>
          </>
        )}

        {tab === 'stories' && (
          <>
            <div className="r-sec">
              <span className="r-sec__num">—</span>
              <span className="r-sec__h">Story library</span>
              <span className="r-sec__sub">— the narrative engine</span>
            </div>
            <div className="r-stories-wrap">
              <div className="r-stories">
                {RAISE_STORIES.map(s => <StoryCard s={s} key={s.id} />)}
              </div>
            </div>
          </>
        )}

        {tab === 'donors' && (
          <>
            <div className="r-sec">
              <span className="r-sec__num">—</span>
              <span className="r-sec__h">Donor file</span>
              <span className="r-sec__sub">— {(4213 + extraDonors.length).toLocaleString()} records · recurring + lapsed + major</span>
              <button className="r-add-btn ghost" style={{ marginRight: 8 }} onClick={() => openGift(null)}>+ Log gift</button>
              <button className="r-add-btn" onClick={() => openDonor('')}>+ Add donor</button>
            </div>
            <div className="r-donors-wrap">
              <div className="r-donor-toolbar">
                <input className="r-donor-toolbar__search" placeholder="Search 4,214 donors by name, email, list…" />
                <button className="r-donor-toolbar__chip is-active">All</button>
                <button className="r-donor-toolbar__chip">Recurring</button>
                <button className="r-donor-toolbar__chip">Major ($1K+)</button>
                <button className="r-donor-toolbar__chip">Lapsed</button>
                <button className="r-donor-toolbar__chip">First-time</button>
                <div className="r-donor-toolbar__spacer"></div>
                <span className="r-donor-toolbar__count">Showing <b>{allDonors.length}</b> of {(4213 + extraDonors.length).toLocaleString()}</span>
              </div>
              <div className="r-donor-grid">
                <DonorTable donors={allDonors} />
                <GiftMix />
              </div>
            </div>
          </>
        )}

        {tab === 'gifts'   && <RaiseGifts />}
        {tab === 'lists'   && <RaiseLists />}
        {tab === 'reports' && <RaiseReports />}
      </div>

      <ProspectDrawer prospect={drawer} onClose={() => setDrawer(null)} onLogGift={drawerToGift} />

      <LogGiftModal
        open={giftOpen}
        prefillDonor={giftPrefill}
        onClose={() => setGiftOpen(false)}
        onLogged={handleLogged}
        onSwitchToAdd={(name) => { setGiftOpen(false); setTimeout(() => openDonor(name), 220); }}
      />
      <AddDonorModal
        open={donorOpen}
        prefillName={donorPrefill}
        onClose={() => setDonorOpen(false)}
        onAdded={handleAdded}
        onSwitchToGift={(d) => openGift(d)}
      />
      <RaiseToast open={!!toast} msg={toast?.msg} onUndo={toast?.undo} />
    </div>
  );
};

export { Raise2 };