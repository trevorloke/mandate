import React from 'react';
import './raise-glr.css';
import { RAISE_GIFTS_TODAY, RAISE_GIFTS as RAISE_GIFTS_FB, RAISE_GIFTS_HOURLY, RAISE_GIFTS_SOURCES, RAISE_LISTS, RAISE_REPORT_GOAL, RAISE_REPORT_ACQ, RAISE_REPORT_COHORTS, RAISE_REPORT_MIX, RAISE_REPORT_OFFICERS, RAISE_REPORT_AVG, RAISE_REPORT_PYRAMID } from './raise-glr-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Mandate 2.0 — Raise · Gifts / Lists / Reports tab views

const { useState: glrUS, useMemo: glrUM } = React;

/* ── Gifts: daily summary strip ───────────────────────────── */
const GiftsSummary = () => {
  const t = RAISE_GIFTS_TODAY;
  const hourly = RAISE_GIFTS_HOURLY;
  const peak = Math.max(...hourly);
  return (
    <div className="r-gifts-summary">
      <div className="r-gs-cell">
        <div className="r-gs-cell__lbl">Today · gifts</div>
        <div className="r-gs-cell__val">{t.count}</div>
        <div className="r-gs-cell__sub">3.1/min last hour</div>
      </div>
      <div className="r-gs-cell">
        <div className="r-gs-cell__lbl">Today · raised</div>
        <div className="r-gs-cell__val money">{t.total}</div>
        <div className="r-gs-cell__sub">+18% vs avg Tue</div>
      </div>
      <div className="r-gs-cell">
        <div className="r-gs-cell__lbl">Average gift</div>
        <div className="r-gs-cell__val money">{t.avg}</div>
        <div className="r-gs-cell__sub">214 YTD</div>
      </div>
      <div className="r-gs-cell">
        <div className="r-gs-cell__lbl">Recurring · today</div>
        <div className="r-gs-cell__val">{t.recurring}</div>
        <div className="r-gs-cell__sub">38% of count</div>
      </div>
      <div className="r-gs-cell r-gs-cell--chart">
        <div className="r-gs-cell__lbl">Hourly · today</div>
        <div className="r-gs-cell__chart">
          {hourly.map((h, i) => (
            <div key={i}
              className={`b ${h === peak && h > 0 ? 'peak' : ''}`}
              style={{ height: `${peak > 0 ? (h / peak) * 100 : 0}%`, opacity: h === 0 ? 0.18 : 0.85 }}
            ></div>
          ))}
        </div>
        <div className="r-gs-cell__chart-axis">
          <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
        </div>
      </div>
    </div>
  );
};

/* ── Gifts: filters ──────────────────────────────────────── */
const GiftsFilters = ({ active, setActive }) => {
  const { records: RAISE_GIFTS } = useLiveRecords('raise', 'gift', RAISE_GIFTS_FB);
  const sources = RAISE_GIFTS_SOURCES;
  return (
    <div className="r-gifts-filters">
      <button className={`r-fil ${active === 'all' ? 'is-active' : ''}`} onClick={() => setActive('all')}>
        All <span className="r-fil__count">{RAISE_GIFTS.length}</span>
      </button>
      {sources.map(s => (
        <button key={s.id} className={`r-fil ${active === s.id ? 'is-active' : ''}`} onClick={() => setActive(s.id)}>
          <span className="dot" style={{ background: s.color }}></span>
          {s.lbl} <span className="r-fil__count">{s.count}</span>
        </button>
      ))}
      <button className="r-fil">Status: any</button>
      <button className="r-fil">Fund: all</button>
      <div className="r-fil__spacer"></div>
      <div className="r-fil r-fil--search">
        <input placeholder="Search donor, appeal, fund…" />
      </div>
    </div>
  );
};

/* ── Gifts: journal table ─────────────────────────────────── */
const GiftsJournal = ({ filter }) => {
  const { records: RAISE_GIFTS } = useLiveRecords('raise', 'gift', RAISE_GIFTS_FB);
  const all = RAISE_GIFTS;
  const rows = filter === 'all' ? all : all.filter(g => g.src === filter);
  // group by date label
  const groups = {};
  rows.forEach(g => {
    if (!groups[g.date]) groups[g.date] = [];
    groups[g.date].push(g);
  });
  const order = Object.keys(groups);
  const fmt = (n) => '$' + n.toLocaleString();
  const total = rows.reduce((s, g) => s + g.amt, 0);
  const cleared = rows.filter(g => g.status === 'cleared').reduce((s, g) => s + g.amt, 0);
  const flagged = rows.filter(g => g.status === 'flagged').length;
  const pending = rows.filter(g => g.status === 'pending').length;

  return (
    <>
    <table className="r-journal">
      <thead>
        <tr>
          <th>Time</th>
          <th>Donor / appeal</th>
          <th>Source</th>
          <th>Method</th>
          <th>Fund</th>
          <th>Status</th>
          <th>By</th>
          <th className="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        {order.map(dateLbl => (
          <React.Fragment key={dateLbl}>
            <tr className="day-row">
              <td colSpan="8">
                {dateLbl} · {groups[dateLbl].length} gifts · {fmt(groups[dateLbl].reduce((s, g) => s + g.amt, 0))}
              </td>
            </tr>
            {groups[dateLbl].map(g => (
              <tr key={g.id}>
                <td className="t">{g.t}</td>
                <td>
                  <div className="donor">
                    {g.donor}
                    {g.appeal && <em>{g.appeal}{g.note ? ' · ' + g.note : ''}</em>}
                  </div>
                </td>
                <td><span className={`src ${g.src}`}>{g.src}</span></td>
                <td className="meta">{g.method}</td>
                <td className="meta">{g.fund}</td>
                <td><span className={`status ${g.status}`}>{g.status}</span></td>
                <td><span className="officer">{g.officer}</span></td>
                <td className={`amt ${g.amt >= 1000 ? 'major' : ''}`}>{fmt(g.amt)}</td>
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
    </table>
    <div className="r-journal-foot">
      <div>Showing<b>{rows.length} of {all.length}</b></div>
      <div>Total<b>{fmt(total)}</b></div>
      <div>Cleared<b>{fmt(cleared)}</b></div>
      <div>Pending<b>{pending} gifts</b></div>
      <div>Flagged<b>{flagged} review</b></div>
    </div>
    </>
  );
};

const RaiseGifts = () => {
  const [filter, setFilter] = glrUS('all');
  return (
    <>
      <div className="r-sec">
        <span className="r-sec__num">—</span>
        <span className="r-sec__h">Gifts</span>
        <span className="r-sec__sub">— live register, 24h window</span>
        <button className="r-sec__action">Export CSV →</button>
      </div>
      <div className="r-gifts-wrap">
        <GiftsSummary />
        <GiftsFilters active={filter} setActive={setFilter} />
        <GiftsJournal filter={filter} />
      </div>
    </>
  );
};

/* ── Lists tab ────────────────────────────────────────────── */
const ListCard = ({ list }) => {
  const fmt = (n) => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '') + 'k' : n;
  return (
    <div className="r-list-card" style={{ '--list-color': list.color }}>
      <div className="r-list-card__kind">
        <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: list.color }}></span>
        {list.kind === 'smart' ? 'Smart list · auto-refresh' : 'Static list · imported'}
      </div>
      <div className="r-list-card__refresh">refreshed {list.refreshed}</div>
      <div className="r-list-card__name">{list.name}</div>
      <div className="r-list-card__desc">{list.desc}</div>
      <div className="r-list-card__rules">
        {list.rules.map((r, i) => <span className="r-list-card__rule" key={i}>{r}</span>)}
      </div>
      <div className="r-list-card__foot">
        <div className="r-list-card__size">
          {list.size.toLocaleString()}<em>donors</em>
        </div>
        <div className={`r-list-card__growth ${list.growth === '+0' ? 'zero' : ''}`}>{list.growth} this week</div>
        <div className="r-list-card__use">{list.uses}</div>
      </div>
    </div>
  );
};

const RaiseLists = () => (
  <>
    <div className="r-sec">
      <span className="r-sec__num">—</span>
      <span className="r-sec__h">Lists & segments</span>
      <span className="r-sec__sub">— eight live audiences powering asks, recovery, stewardship</span>
      <button className="r-sec__action">+ New list →</button>
    </div>
    <div className="r-lists-wrap">
      <div className="r-lists-grid">
        {RAISE_LISTS.map(l => <ListCard list={l} key={l.id} />)}
      </div>
    </div>
  </>
);

/* ── Reports: cumulative line chart ──────────────────────── */
const GoalChart = () => {
  const data = RAISE_REPORT_GOAL;
  const w = 720, h = 200, pad = { l: 38, r: 14, t: 14, b: 22 };
  const max = Math.max(...data.map(d => Math.max(d.raised, d.goal)));
  const dx = (w - pad.l - pad.r) / (data.length - 1);
  const y = v => pad.t + (h - pad.t - pad.b) * (1 - v / max);
  const xy = (key) => data.map((d, i) => [pad.l + i * dx, y(d[key])]);
  const toPath = arr => arr.map(([x, yy], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + yy.toFixed(1)).join(' ');
  const fillPath = arr => toPath(arr) + ` L ${pad.l + (data.length - 1) * dx} ${h - pad.b} L ${pad.l} ${h - pad.b} Z`;
  const raisedXY = xy('raised'), goalXY = xy('goal');
  // Y-axis ticks every $500K
  const ticks = [0, 500, 1000, 1500];
  return (
    <svg className="r-goal-chart" viewBox={`0 0 ${w} ${h}`}>
      {ticks.map(t => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#e9e3d2" strokeDasharray={t === 0 ? '0' : '2 2'} strokeWidth="1" />
          <text x={pad.l - 6} y={y(t) + 3} fontSize="9" fill="#8c8770" textAnchor="end" fontFamily="JetBrains Mono, monospace">${t}K</text>
        </g>
      ))}
      {data.map((d, i) => (
        <text key={i} x={pad.l + i * dx} y={h - 6} fontSize="9" fill="#8c8770" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{d.m}</text>
      ))}
      {/* Goal as dashed grey */}
      <path d={toPath(goalXY)} stroke="#8c8770" strokeWidth="1.2" fill="none" strokeDasharray="3 3" />
      {/* Raised as evergreen with fill */}
      <path d={fillPath(raisedXY)} fill="#0d4f3c" fillOpacity="0.08" />
      <path d={toPath(raisedXY)} stroke="#0d4f3c" strokeWidth="2" fill="none" />
      {raisedXY.map(([x, yy], i) => (
        <circle key={i} cx={x} cy={yy} r={i === raisedXY.length - 1 ? 3.5 : 2} fill="#0d4f3c" />
      ))}
      {/* End-of-line annotation for goal */}
      <text x={goalXY[goalXY.length - 1][0] + 4} y={goalXY[goalXY.length - 1][1] + 3} fontSize="9" fill="#8c8770" fontFamily="JetBrains Mono, monospace" fontStyle="italic">goal</text>
      <text x={raisedXY[raisedXY.length - 1][0] + 4} y={raisedXY[raisedXY.length - 1][1] + 3} fontSize="9" fill="#0d4f3c" fontFamily="JetBrains Mono, monospace" fontWeight="500">raised</text>
    </svg>
  );
};

/* ── Reports: acquisition bars ───────────────────────────── */
const AcqBars = () => {
  const data = RAISE_REPORT_ACQ;
  const max = Math.max(...data.map(d => d.amt));
  return (
    <div className="r-acq">
      {data.map(d => (
        <div className="r-acq-row" key={d.ch}>
          <div className="ch">{d.ch}</div>
          <div className="bar" style={{ width: `${(d.amt / max) * 100}%`, opacity: 0.4 + (d.amt / max) * 0.6 }}></div>
          <div className="amt">${(d.amt / 1000).toFixed(1)}K · {d.count}</div>
        </div>
      ))}
    </div>
  );
};

/* ── Reports: cohort heatmap ─────────────────────────────── */
const CohortHeatmap = () => {
  const data = RAISE_REPORT_COHORTS;
  const cellColor = (v) => {
    if (!v) return null;
    // Map 0..100 → opacity on evergreen
    const t = v / 100;
    return `rgba(13, 79, 60, ${0.15 + t * 0.85})`;
  };
  return (
    <div className="r-cohort">
      <div className="r-cohort__head">Cohort</div>
      <div className="r-cohort__head" style={{ textAlign: 'right' }}>Size</div>
      {[0,1,2,3,4,5,6,7,8,9,10,11].map(m => (
        <div className="r-cohort__head" key={m}>M{m}</div>
      ))}
      {data.map(c => (
        <React.Fragment key={c.cohort}>
          <div className="r-cohort__lbl">{c.cohort}</div>
          <div className="r-cohort__size">{c.size}</div>
          {c.retention.map((v, i) => (
            <div key={i} className={`r-cohort__cell ${v === 0 ? 'empty' : ''}`} style={v ? { background: cellColor(v) } : undefined}>
              {v ? v : ''}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
};

/* ── Reports: gift mix donut ─────────────────────────────── */
const MixDonut = () => {
  const data = RAISE_REPORT_MIX;
  const total = data.reduce((s, d) => s + d.pct, 0);
  let acc = 0;
  const r = 50, cx = 60, cy = 60, sw = 16;
  const C = 2 * Math.PI * r;
  return (
    <div className="r-donut-wrap">
      <svg className="r-donut" viewBox="0 0 120 120">
        {data.map(d => {
          const len = (d.pct / total) * C;
          const dash = `${len} ${C - len}`;
          const off = -acc * C / total;
          acc += d.pct;
          return (
            <circle key={d.id} cx={cx} cy={cy} r={r} fill="none"
              stroke={d.color} strokeWidth={sw}
              strokeDasharray={dash} strokeDashoffset={off}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
        })}
        <text x={cx} y={cy + 2} textAnchor="middle" fontSize="20" fontFamily="Fraunces, serif" fontWeight="500" fill="#14110a">$1.42M</text>
        <text x={cx} y={cy + 18} textAnchor="middle" fontSize="9" fontFamily="JetBrains Mono, monospace" fill="#8c8770" letterSpacing="0.1em">RAISED YTD</text>
      </svg>
      <div className="r-donut-legend">
        {data.map(d => (
          <div className="r-donut-legend-row" key={d.id}>
            <span className="dot" style={{ background: d.color }}></span>
            <span className="lbl">{d.lbl} <em style={{ fontFamily: 'JetBrains Mono, monospace', fontStyle: 'normal', color: '#8c8770', fontSize: '10px' }}> · {d.pct}%</em></span>
            <span className="amt">{d.amt}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── Reports: officer leaderboard ─────────────────────────── */
const Leaderboard = () => {
  const data = RAISE_REPORT_OFFICERS;
  const max = Math.max(...data.map(d => d.raised));
  return (
    <div className="r-leaderboard">
      {data.map((o, i) => (
        <div className="r-lb-row" key={o.name}>
          <div className="rank">{String(i + 1).padStart(2, '0')}</div>
          <div className="body">
            <div className="name">{o.name}</div>
            <div className="stats">{o.prospects} prospects · {o.asks} asks · {o.closed} closed</div>
            <div className="bar"><div className="bar-fill" style={{ width: `${(o.raised / max) * 100}%`, background: o.color }}></div></div>
          </div>
          <div className="raised">${o.raised}K<em>raised YTD</em></div>
        </div>
      ))}
    </div>
  );
};

/* ── Reports: avg gift area ──────────────────────────────── */
const AvgGiftArea = () => {
  const data = RAISE_REPORT_AVG;
  const w = 360, h = 100, pad = { l: 28, r: 8, t: 8, b: 18 };
  const max = Math.max(...data.map(d => d.avg)) * 1.1;
  const min = Math.min(...data.map(d => d.avg)) * 0.85;
  const dx = (w - pad.l - pad.r) / (data.length - 1);
  const y = v => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / (max - min));
  const xy = data.map((d, i) => [pad.l + i * dx, y(d.avg)]);
  const path = xy.map(([x, yy], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + yy.toFixed(1)).join(' ');
  const fill = path + ` L ${pad.l + (data.length - 1) * dx} ${h - pad.b} L ${pad.l} ${h - pad.b} Z`;
  return (
    <svg className="r-avg-chart" viewBox={`0 0 ${w} ${h}`}>
      <text x={pad.l - 6} y={y(max) + 3} fontSize="9" fill="#8c8770" textAnchor="end" fontFamily="JetBrains Mono, monospace">${Math.round(max)}</text>
      <text x={pad.l - 6} y={y(min) + 3} fontSize="9" fill="#8c8770" textAnchor="end" fontFamily="JetBrains Mono, monospace">${Math.round(min)}</text>
      {data.map((d, i) => (
        <text key={i} x={pad.l + i * dx} y={h - 4} fontSize="8.5" fill="#8c8770" textAnchor="middle" fontFamily="JetBrains Mono, monospace">{d.m}</text>
      ))}
      <path d={fill} fill="#0d4f3c" fillOpacity="0.1" />
      <path d={path} stroke="#0d4f3c" strokeWidth="1.6" fill="none" />
      {xy.map(([x, yy], i) => (
        <circle key={i} cx={x} cy={yy} r={i === xy.length - 1 ? 2.6 : 1.5} fill="#0d4f3c" />
      ))}
    </svg>
  );
};

/* ── Reports: donor pyramid ──────────────────────────────── */
const Pyramid = () => {
  const data = RAISE_REPORT_PYRAMID;
  const maxCount = Math.max(...data.map(d => d.count));
  return (
    <div className="r-pyramid">
      {data.map(p => {
        const tiny = p.pct < 4;
        return (
          <div className="r-pyr-row" key={p.tier}>
            <div className="tier">{p.tier}</div>
            <div className={`bar ${tiny ? 'tiny' : ''}`} style={{ width: `${(p.count / maxCount) * 100}%`, opacity: 0.4 + (p.count / maxCount) * 0.6 }}>
              {tiny ? <span>{p.pct}%</span> : `${p.pct}%`}
            </div>
            <div className="count">{p.count.toLocaleString()}</div>
            <div className="amt">{p.amt}</div>
          </div>
        );
      })}
    </div>
  );
};

/* ── Reports: page ─────────────────────────────────────────── */
const RaiseReports = () => {
  const [range, setRange] = glrUS('ytd');
  return (
    <>
      <div className="r-sec">
        <span className="r-sec__num">—</span>
        <span className="r-sec__h">Reports</span>
        <span className="r-sec__sub">— fundraising health, last 12 months</span>
      </div>
      <div className="r-reports-wrap">
        <div className="r-reports-bar">
          <span className="r-reports-bar__lbl">Range</span>
          {['30d', '90d', 'ytd', '12m', 'cycle'].map(r => (
            <button key={r} className={`r-fil ${range === r ? 'is-active' : ''}`} onClick={() => setRange(r)}>{r.toUpperCase()}</button>
          ))}
          <div className="r-reports-bar__spacer"></div>
          <button className="r-fil">Compare → prior cycle</button>
          <button className="r-fil">Export PDF</button>
        </div>

        <div className="r-reports-grid">
          {/* Goal chart spans 2 cols */}
          <div className="r-panel r-panel--span2">
            <div className="r-panel__hd">
              <div className="r-panel__title">Cumulative raised vs goal</div>
              <div className="r-panel__sub">Cycle to date · monthly</div>
            </div>
            <div className="r-panel__caption">Tracking 96% of pace. Recurring backbone is holding the gap; major-gift close rate is the swing factor for Q2.</div>
            <div className="r-goal-stat">
              <div className="r-goal-stat__big">$1.42M<em>of $1.48M target</em></div>
              <div className="r-goal-stat__delta warn">−$60K vs goal</div>
              <div className="r-goal-stat__delta">+18.4% vs same period last cycle</div>
            </div>
            <GoalChart />
          </div>

          {/* Acquisition */}
          <div className="r-panel">
            <div className="r-panel__hd">
              <div className="r-panel__title">Acquisition by channel</div>
              <div className="r-panel__sub">Last 30d · revenue · count</div>
            </div>
            <div className="r-panel__caption">Major-gift wires drove half of April. Email volume is up but per-gift average dipped — list fatigue is the working hypothesis.</div>
            <AcqBars />
          </div>

          {/* Donut */}
          <div className="r-panel">
            <div className="r-panel__hd">
              <div className="r-panel__title">Gift mix · YTD</div>
              <div className="r-panel__sub">By stream</div>
            </div>
            <div className="r-panel__caption">Recurring is a moat — half the file, almost half the money, 96% retention.</div>
            <MixDonut />
          </div>

          {/* Cohort retention */}
          <div className="r-panel r-panel--span2">
            <div className="r-panel__hd">
              <div className="r-panel__title">Cohort retention</div>
              <div className="r-panel__sub">% retained · months since first gift</div>
            </div>
            <div className="r-panel__caption">2025 Q2 onboarding sequence is paying off — that cohort is retaining 5pt better than 2024 at every checkpoint.</div>
            <CohortHeatmap />
          </div>

          {/* Officers */}
          <div className="r-panel">
            <div className="r-panel__hd">
              <div className="r-panel__title">Officer leaderboard</div>
              <div className="r-panel__sub">Major-gift officers</div>
            </div>
            <div className="r-panel__caption">Marcus's pipeline is bigger; Lila's close rate is higher. Pair them on Tier-1 prospects.</div>
            <Leaderboard />
          </div>

          {/* Avg gift */}
          <div className="r-panel">
            <div className="r-panel__hd">
              <div className="r-panel__title">Average gift over time</div>
              <div className="r-panel__sub">Monthly · all sources</div>
            </div>
            <div className="r-panel__caption">$214 in April — highest in the cycle. Story-led emails outperform issue-only by ~22%.</div>
            <AvgGiftArea />
          </div>

          {/* Pyramid */}
          <div className="r-panel r-panel--span2">
            <div className="r-panel__hd">
              <div className="r-panel__title">Donor pyramid</div>
              <div className="r-panel__sub">By gift tier · YTD</div>
            </div>
            <div className="r-panel__caption">Classic 80/20 inversion — 6 donors at $10K+ outpace the 1,045 sub-$25 donors. Every tier matters: the small-dollar base is the future major-gift pipeline.</div>
            <Pyramid />
          </div>
        </div>
      </div>
    </>
  );
};

export { RaiseGifts, RaiseLists, RaiseReports };