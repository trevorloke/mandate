import React from 'react';
import './coalition.css';
import './coalition-ledger.css';
import { COA_KPIS, COA_LEDGER as COA_LEDGER_FB } from './coalition-data';
import { useLiveRecords } from './auth/useLiveRecords';
import { useBusinessMetrics } from './auth/useBusinessMetrics';
import { useAuth } from './auth/AuthContext';
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

const CoaKpiStrip = ({ kpis }) => {
  const metrics = useBusinessMetrics();
  return (
  <div className="coa__kpis">
    {Object.entries(kpis).map(([k, v]) => {
      const mk = metrics[`coalition.${k}`];
      const value = mk?.display ?? v.value;
      const delta = mk ? (mk.delta?.text ?? '—') : v.delta;
      const spark = (mk?.spark && mk.spark.length >= 2) ? mk.spark
                  : (mk?.value != null ? [mk.value, mk.value] : COA_KPI_SPARKS[k]);
      return (
      <div className="coa__kpi" key={k}>
        <div className="coa__kpi-lbl">{v.label}</div>
        <div className={`coa__kpi-val ${v.tone}`}>{value}</div>
        <CSpark pts={spark} color={v.tone === 'good' ? '#2a4d35' : v.tone === 'warn' ? '#b94a3a' : '#56655a'} />
        <div className={`coa__kpi-delta ${v.tone}`}>
          <b>{delta}</b>
          <span>{v.sub}</span>
        </div>
      </div>
    );})}
  </div>
  );
};

/* ── Tabs ─────────────────────────────────────────── */
const COA_TABS = [
  { k:'ledger',    label:'LEDGER',    hint:'endorsements' },
  { k:'graph',     label:'GRAPH',     hint:'relationships' },
  { k:'directory', label:'DIRECTORY', hint:'org files' },
  { k:'asks',      label:'ASKS',      hint:'pipeline' },
  { k:'ops',       label:'OPS',       hint:'joint operations' },
  { k:'comms',     label:'COMMS',     hint:'log' },
  { k:'events',    label:'EVENTS',    hint:'co-hosting' },
];

const CoaTabs = ({ tab, setTab, counts = {}, cycleLabel = '', wsLabel = '' }) => (
  <div className="coa__tabs">
    {COA_TABS.map(t => {
      const c = counts[t.k];
      const cntStr = c == null ? '' : String(c);
      return (
        <button
          key={t.k}
          className={`coa__tab ${tab === t.k ? 'on' : ''}`}
          onClick={() => setTab(t.k)}
        >
          <span className="coa__tab-lbl">{t.label}</span>
          {cntStr !== '' && <span className="coa__tab-cnt">{cntStr}</span>}
          <em className="coa__tab-hint">{t.hint}</em>
        </button>
      );
    })}
    <div className="coa__tabs-spacer" />
    {(cycleLabel || wsLabel) && (
      <div className="coa__period">
        <span>Cycle</span>
        {cycleLabel && <b>{cycleLabel}</b>}
        {wsLabel && <em>{wsLabel}</em>}
      </div>
    )}
    <button className="coa__compose">+ NEW ASK</button>
  </div>
);

/* ── Crumbs ───────────────────────────────────────── */
const CoaCrumbs = ({ tab, summary }) => {
  const t = COA_TABS.find(x => x.k === tab);
  return (
    <div className="coa__crumbs">
      <span>Coalition</span>
      <span>·</span>
      <span>{t?.label}</span>
      {summary && <em style={{ marginLeft: 'auto' }}>{summary}</em>}
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
  const [openId, setOpenId] = cUS(null);
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
    n = Number(n) || 0;
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
              <div><span>$ COMMIT</span><b>${(open.money ?? 0).toLocaleString()}</b></div>
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
  const { workspace } = useAuth();
  const [tab, setTab] = cUS('ledger');
  const { records: COA_LEDGER, isEmpty: noEndorsements } = useLiveRecords('coalition', 'endorsement', COA_LEDGER_FB);
  const { records: liveAsks } = useLiveRecords('coalition', 'ask', []);
  const { records: liveOrgs } = useLiveRecords('coalition', 'org', []);
  const { records: liveComms } = useLiveRecords('coalition', 'comm', []);
  if (noEndorsements) return <EmptyModule module="COALITION" label="Coalition" accent="var(--m-coalition)" />;

  const committed = COA_LEDGER.filter(r => r.status === 'committed' || r.status === 'public').length;
  const publicCount = COA_LEDGER.filter(r => r.status === 'public').length;
  const totalReach = COA_LEDGER.reduce((s, r) => s + (Number(r.reach) || 0), 0);
  const openAsks = liveAsks.filter(a => !['Delivered', 'Lost', 'delivered', 'lost'].includes(a.stage)).length;
  const fmtReach = (n) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
                       : n >= 1_000 ? `${Math.round(n / 1_000)}k`
                       : String(n);
  const kpis = {
    ...COA_KPIS,
    committed: { ...COA_KPIS.committed, value: `${committed} / ${COA_LEDGER.length}` },
    public:    { ...COA_KPIS.public,    value: String(publicCount) },
    reach:     { ...COA_KPIS.reach,     value: totalReach ? fmtReach(totalReach) : '—',
                                         delta: totalReach ? 'members · followers · sum of endorser reach' : '' },
    asks:      { ...COA_KPIS.asks,      value: String(openAsks),
                                         delta: liveAsks.length ? `${liveAsks.length} total` : '' },
  };

  return (
    <div className="coa">
      <CoaCrumbs
        tab={tab}
        summary={
          COA_LEDGER.length
            ? `${committed} of ${COA_LEDGER.length} committed · ${publicCount} public`
            : ''
        }
      />
      <CoaKpiStrip kpis={kpis} />
      <CoaTabs
        tab={tab} setTab={setTab}
        counts={{
          ledger:    `${committed}/${COA_LEDGER.length}`,
          directory: liveOrgs.length || null,
          asks:      liveAsks.length || null,
          comms:     liveComms.length || null,
        }}
        cycleLabel={workspace?.phase || ''}
        wsLabel={workspace?.name || workspace?.candidate || ''}
      />

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