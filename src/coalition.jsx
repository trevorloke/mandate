import React from 'react';
import './coalition.css';
import './coalition-ledger.css';
import { COA_KPIS, COA_LEDGER as COA_LEDGER_FB } from './coalition-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { Shell } from './shell';
import { CoaGraph } from './coalition-graph';
import { CoaDirectory } from './coalition-directory';
import { CoaAsks, CoaOps, CoaComms, CoaEvents } from './coalition-tabs';

// Mandate 2.0 — Coalition (diplomatic registry)
// Shell + KPI strip + tabs + LEDGER tab

const { useState: cUS, useMemo: cUM, useEffect: cUE } = React;

/* ── Sparkline ─────────────────────────────────────── */
const CSpark = ({ pts, color = '#2a4d35' }) => {
  const w = 56, h = 22, pad = 1;
  const max = Math.max(...pts), min = Math.min(...pts);
  const r = max - min || 1;
  const dx = (w - pad * 2) / (pts.length - 1);
  const xy = pts.map((p, i) => [pad + i * dx, h - pad - ((p - min) / r) * (h - pad * 2)]);
  const d = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="coa__kpi-spark">
      <path d={d + ` L ${w-pad} ${h-pad} L ${pad} ${h-pad} Z`} fill={color} fillOpacity="0.1" />
      <path d={d} stroke={color} strokeWidth="1.2" fill="none" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="1.6" fill={color} />
    </svg>
  );
};

const COA_KPI_SPARKS = {
  committed: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 14],
  public:    [0, 0, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9],
  reach:     [120, 180, 240, 320, 410, 490, 560, 620, 700, 760, 820, 847],
  asks:      [4, 6, 8, 10, 12, 14, 15, 16, 17, 18, 18, 18],
  ops:       [1, 2, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7],
  events:    [2, 3, 4, 5, 6, 7, 8, 9, 9, 10, 11, 11],
};

const CoaKpiStrip = () => (
  <div className="coa__kpis">
    {Object.entries(COA_KPIS).map(([k, v]) => (
      <div className="coa__kpi" key={k}>
        <div className="coa__kpi-lbl">{v.label}</div>
        <div className={`coa__kpi-val ${v.tone}`}>{v.value}</div>
        <CSpark pts={COA_KPI_SPARKS[k]} color={v.tone === 'good' ? '#2a4d35' : v.tone === 'warn' ? '#b94a3a' : '#56655a'} />
        <div className={`coa__kpi-delta ${v.tone}`}>
          <b>{v.delta}</b>
          <span>{v.sub}</span>
        </div>
      </div>
    ))}
  </div>
);

/* ── Tabs ─────────────────────────────────────────── */
const COA_TABS = [
  { k:'ledger',    label:'LEDGER',    count:'14/22', hint:'endorsements' },
  { k:'graph',     label:'GRAPH',     count:'',      hint:'relationships' },
  { k:'directory', label:'DIRECTORY', count:22,      hint:'org files' },
  { k:'asks',      label:'ASKS',      count:18,      hint:'pipeline' },
  { k:'ops',       label:'OPS',       count:7,       hint:'joint operations' },
  { k:'comms',     label:'COMMS',     count:18,      hint:'log · 7 days' },
  { k:'events',    label:'EVENTS',    count:11,      hint:'co-hosting' },
];

const CoaTabs = ({ tab, setTab }) => (
  <div className="coa__tabs">
    {COA_TABS.map(t => (
      <button
        key={t.k}
        className={`coa__tab ${tab === t.k ? 'on' : ''}`}
        onClick={() => setTab(t.k)}
      >
        <span className="coa__tab-lbl">{t.label}</span>
        {t.count !== '' && <span className="coa__tab-cnt">{t.count}</span>}
        <em className="coa__tab-hint">{t.hint}</em>
      </button>
    ))}
    <div className="coa__tabs-spacer" />
    <div className="coa__period">
      <span>Cycle</span>
      <b>2026 General</b>
      <em>Meridian West</em>
    </div>
    <button className="coa__compose">+ NEW ASK</button>
  </div>
);

/* ── Crumbs ───────────────────────────────────────── */
const CoaCrumbs = ({ tab }) => {
  const t = COA_TABS.find(x => x.k === tab);
  return (
    <div className="coa__crumbs">
      <span>Coalition</span>
      <span>·</span>
      <span>{t?.label}</span>
      <em style={{ marginLeft: 'auto' }}>14 of 22 committed · 9 public · 5 holding</em>
    </div>
  );
};

/* ── LEDGER tab — endorsement registry table ───────── */
const STATUS_ORDER = ['public', 'committed', 'warm', 'prospect', 'hostile'];
const STATUS_LABEL = {
  public:    'PUBLIC',
  committed: 'COMMITTED',
  warm:      'WARM',
  prospect:  'PROSPECT',
  hostile:   'HOSTILE',
};

const CoaLedger = () => {
  const [filter, setFilter] = cUS('all');
  const [q, setQ] = cUS('');
  const [openId, setOpenId] = cUS('EN-001');
  const { records: COA_LEDGER } = useLiveRecords('coalition', 'endorsement', COA_LEDGER_FB);

  const rows = COA_LEDGER.filter(r => {
    if (filter !== 'all' && r.status !== filter) return false;
    if (q && !(r.org + ' ' + r.sector + ' ' + r.champion).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const groups = STATUS_ORDER.map(s => ({
    status: s,
    label: STATUS_LABEL[s],
    items: rows.filter(r => r.status === s),
  })).filter(g => g.items.length > 0);

  const counts = STATUS_ORDER.reduce((a, s) => {
    a[s] = COA_LEDGER.filter(r => r.status === s).length;
    return a;
  }, {});

  const totalReach = rows.reduce((a, r) => a + (r.reach || 0), 0);
  const totalMembers = rows.reduce((a, r) => a + (r.members || 0), 0);
  const totalMoney = rows.reduce((a, r) => a + (r.money || 0), 0);

  const fmtK = (n) => {
    if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n/1000).toFixed(0) + 'k';
    return n.toLocaleString();
  };

  const open = COA_LEDGER.find(r => r.id === openId);

  return (
    <div className="cl">
      <div className="cl__head">
        <div className="cl__title">
          <div className="cl__eyebrow">Coalition · endorsement registry</div>
          <h2>Endorsements <em>— ledger of trust</em></h2>
        </div>
        <div className="cl__totals">
          <div className="cl__total"><span>MEMBERS</span><b>{fmtK(totalMembers)}</b></div>
          <div className="cl__total"><span>REACH</span><b>{fmtK(totalReach)}</b></div>
          <div className="cl__total"><span>$ COMMIT</span><b>${(totalMoney/1000).toFixed(1)}k</b></div>
        </div>
      </div>

      <div className="cl__bar">
        <div className="cl__filters">
          <button className={`cl__filter ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            All <em>{COA_LEDGER.length}</em>
          </button>
          {STATUS_ORDER.map(s => (
            <button key={s} className={`cl__filter cl__filter--${s} ${filter === s ? 'on' : ''}`} onClick={() => setFilter(s)}>
              <i className="dot"></i>
              {STATUS_LABEL[s]} <em>{counts[s]}</em>
            </button>
          ))}
        </div>
        <div className="cl__search">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search org, sector, champion…" />
          <span className="cl__shortcut">⌘ K</span>
        </div>
      </div>

      <div className="cl__layout">
        <div className="cl__table">
          {groups.map(g => (
            <React.Fragment key={g.status}>
              <div className={`cl__group cl__group--${g.status}`}>
                <span className="cl__group-lbl">{g.label}</span>
                <span className="cl__group-cnt">{g.items.length}</span>
                <span className="cl__group-rule"></span>
                <span className="cl__group-meta">
                  reach <b>{fmtK(g.items.reduce((a, r) => a + (r.reach||0), 0))}</b>
                  &nbsp;·&nbsp;
                  members <b>{fmtK(g.items.reduce((a, r) => a + (r.members||0), 0))}</b>
                </span>
              </div>
              <div className="cl__thead">
                <span>ID</span>
                <span>ORGANIZATION</span>
                <span>SECTOR</span>
                <span className="r">MEMBERS</span>
                <span className="r">REACH</span>
                <span>RELEASE</span>
                <span>CHAMPION</span>
                <span>STATUS</span>
              </div>
              {g.items.map(r => {
                const isOpen = openId === r.id;
                return (
                  <div
                    key={r.id}
                    className={`cl__row cl__row--${r.status} ${isOpen ? 'on' : ''}`}
                    onClick={() => setOpenId(r.id)}
                  >
                    <span className="cl__id">{r.id}</span>
                    <span className="cl__org">
                      <b>{r.org}</b>
                      {r.note && <em>{r.note.slice(0, 64)}{r.note.length > 64 ? '…' : ''}</em>}
                      {r.risks && r.risks.length > 0 && (
                        <em className="cl__risk">⚐ {r.risks[0].text}</em>
                      )}
                    </span>
                    <span className="cl__sector">{r.sector}</span>
                    <span className="r cl__num">{r.members > 0 ? fmtK(r.members) : '—'}</span>
                    <span className="r cl__num">{fmtK(r.reach)}</span>
                    <span className="cl__release">
                      {r.release ? (
                        <>
                          <b>{r.release.split(' ')[0].split('-').slice(1).join('/')}</b>
                          <em>{r.release.split(' ')[1] || ''}</em>
                        </>
                      ) : <em>—</em>}
                    </span>
                    <span className="cl__champ">{r.champion}</span>
                    <span className={`cl__status status--${r.status}`}>
                      <i className="dot"></i>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {/* Detail rail */}
        {open && (
          <div className="cl__detail">
            <div className={`cl__d-head cl__d-head--${open.status}`}>
              <div className="cl__d-eyebrow">{open.id} · {STATUS_LABEL[open.status]}</div>
              <h3>{open.org}</h3>
              <div className="cl__d-sector">{open.sector}</div>
            </div>

            <div className="cl__d-stats">
              <div><span>MEMBERS</span><b>{open.members > 0 ? fmtK(open.members) : '—'}</b></div>
              <div><span>REACH</span><b>{fmtK(open.reach)}</b></div>
              <div><span>$ COMMIT</span><b>${open.money.toLocaleString()}</b></div>
              <div><span>CHAMPION</span><b>{open.champion}</b></div>
            </div>

            <div className="cl__d-section">
              <div className="cl__d-h">STRATEGY</div>
              <p className="cl__d-p">{open.strategy}</p>
            </div>

            {open.note && (
              <div className="cl__d-section">
                <div className="cl__d-h">NOTE</div>
                <p className="cl__d-p">{open.note}</p>
              </div>
            )}

            {open.release && (
              <div className="cl__d-section">
                <div className="cl__d-h">RELEASE</div>
                <div className="cl__d-release">
                  <b>{open.release}</b>
                </div>
              </div>
            )}

            {open.risks && open.risks.length > 0 && (
              <div className="cl__d-section">
                <div className="cl__d-h">RISKS &amp; FLAGS</div>
                {open.risks.map((r, i) => (
                  <div key={i} className={`cl__d-risk cl__d-risk--${r.kind}`}>
                    <span className="cl__d-risk-kind">{r.kind}</span>
                    <span>{r.text}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="cl__d-actions">
              <button>Open file</button>
              <button>Log touch</button>
              <button>+ Ask</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Main shell ───────────────────────────────────── */
const Coalition2 = () => {
  const [tab, setTab] = cUS('ledger');
  const { isEmpty: noEndorsements } = useLiveRecords('coalition', 'endorsement', COA_LEDGER_FB);
  if (noEndorsements) return <EmptyModule module="COALITION" label="Coalition" accent="var(--m-coalition)" />;

  return (
    <div className="coa">
      <CoaCrumbs tab={tab} />
      <CoaKpiStrip />
      <CoaTabs tab={tab} setTab={setTab} />

      <div className="coa__body">
        {tab === 'ledger'    && <CoaLedger />}
        {tab === 'graph'     && CoaGraph     && <CoaGraph />}
        {tab === 'directory' && CoaDirectory && <CoaDirectory />}
        {tab === 'asks'      && CoaAsks      && <CoaAsks />}
        {tab === 'ops'       && CoaOps       && <CoaOps />}
        {tab === 'comms'     && CoaComms     && <CoaComms />}
        {tab === 'events'    && CoaEvents    && <CoaEvents />}
      </div>
    </div>
  );
};

export { CoaLedger, Coalition2 };