import React from 'react';
import './ledger-tabs2.css';
import { LEDGER_FILINGS, LEDGER_REGULATORS, LEDGER_REPORTS } from './ledger-data';

// Mandate 2.0 — Ledger tabs (Filings, Reports)

const { useState: lT2US, useMemo: lT2UM } = React;

/* ──────────────────────────────────────────────────────
   FILINGS — multi-jurisdiction regulatory
   ────────────────────────────────────────────────────── */
const LedgerFilings = () => {
  const f = LEDGER_FILINGS.current;
  const passed = f.checks.filter(c => c.pass).length;
  const regs = LEDGER_REGULATORS;
  const regBy = Object.fromEntries(regs.map(r => [r.id, r]));
  const queue = LEDGER_FILINGS.queue;
  const primary = regs.find(r => r.role === 'primary');

  return (
    <div className="lfile">
      <div className="lfile__head">
        <div>
          <div className="lfile__eyebrow">Ledger · regulatory filings</div>
          <h2>Filings <em>— 5 regulators · 1 in flight</em></h2>
        </div>
        <div className="lfile__head-r">
          <div className="lfile__count">
            <b>{f.daysToFile}</b>
            <em>days · primary filing</em>
          </div>
          <div className="lfile__due">
            <span>NEXT DUE</span>
            <b>{f.due}</b>
          </div>
          <button className="lfile__submit">Submit to {primary.short}</button>
        </div>
      </div>

      {/* Regulator strip */}
      <div className="lfile__regs">
        {regs.map(r => {
          const open = queue.filter(q => q.regulator === r.id).length;
          return (
            <div key={r.id} className={`lfile__reg ${r.role === 'primary' ? 'primary' : ''}`}>
              <div className="lfile__reg-l">
                <div className="lfile__reg-short">{r.short}</div>
                <div className="lfile__reg-long">{r.long}</div>
                <div className="lfile__reg-meta"><em>cycle</em> {r.cycle} · <em>filer</em> {r.filer}</div>
              </div>
              <div className="lfile__reg-r">
                <span className="lfile__reg-cnt">{open}</span>
                <em>{open === 1 ? 'open' : 'open'}</em>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filing queue */}
      <div className="lfile__queue">
        <div className="lfile__h">FILING QUEUE <em>— next 90 days, all regulators</em></div>
        <div className="lfile__qhead">
          <span>REG</span>
          <span>FILING</span>
          <span>DUE</span>
          <span className="r">DAYS</span>
          <span>OWNER</span>
          <span className="lfile__qprog">PROGRESS</span>
          <span>STATUS</span>
        </div>
        {queue.map(q => (
          <div key={q.id} className={`lfile__qrow ${q.urgent ? 'urgent' : ''} ${q.id === f.id ? 'current' : ''}`}>
            <span className="lfile__qreg">{regBy[q.regulator].short}</span>
            <span className="lfile__qname">
              <b>{q.period}</b>
              <em>{q.id}</em>
            </span>
            <span className="lfile__qdue">{q.due}</span>
            <span className={`r lfile__qdays ${q.daysToFile <= 30 ? 'soon' : ''}`}>{q.daysToFile}d</span>
            <span className="lfile__qowner">{q.external ? <em>{q.owner}</em> : q.owner}</span>
            <span className="lfile__qprog-cell">
              <span className="lfile__qprog-bar"><span style={{ width: q.progress + '%' }} /></span>
              <em>{q.progress}%</em>
            </span>
            <span className={`lfile__qstatus status--${q.status}`}>
              <i className="dot"></i>{q.status.replace('-', ' ')}
            </span>
          </div>
        ))}
      </div>

      {/* Current filing spotlight */}
      <div className="lfile__current">
        <div className="lfile__current-h">
          <div>
            <div className="lfile__eyebrow">Spotlight · in flight</div>
            <h3>{regBy[f.regulator].short} <em>· {f.title}</em></h3>
          </div>
          <div className="lfile__chip ready">READY · awaiting candidate signature</div>
        </div>

        {/* Status bar */}
        <div className="lfile__status">
          <div className="lfile__status-l">
            <div className="lfile__progress">
              <div className="lfile__progress-bar">
                <div className="lfile__progress-fill" style={{ width: f.progress + '%' }} />
              </div>
              <em>{f.progress}% complete · {passed} of {f.checks.length} checks passed</em>
            </div>
          </div>
        </div>

        <div className="lfile__layout">
        {/* Left: Schedules table */}
        <div className="lfile__schedules">
          <div className="lfile__h">SCHEDULES <em>— 9 sections</em></div>

          {/* Summary numbers */}
          <div className="lfile__summary">
            <div><span>Revenue</span><b>${f.summary.totalRevenue.toLocaleString()}</b></div>
            <div><span>Expense</span><b>${f.summary.totalExpense.toLocaleString()}</b></div>
            <div><span>Net</span><b className="up">${f.summary.netCash.toLocaleString()}</b></div>
            <div><span>Itemized</span><b>{f.summary.itemizedDonations}</b></div>
          </div>

          <div className="lfile__sched-table">
            <div className="lfile__sched-head">
              <span>SCH.</span>
              <span>NAME</span>
              <span className="r">ITEMS</span>
              <span className="r">AMOUNT</span>
              <span>STATUS</span>
            </div>
            {f.schedules.map(s => (
              <div key={s.id} className={`lfile__sched-row status--${s.status}`}>
                <span className="lfile__sched-code">{s.code}</span>
                <span className="lfile__sched-name">
                  <b>{s.name}</b>
                  {s.note && <em>{s.note}</em>}
                </span>
                <span className="r ljr__num">{s.items}</span>
                <span className="r ljr__num">${s.$.toLocaleString()}</span>
                <span className={`lfile__sched-status status--${s.status}`}>
                  {s.status === 'done' && <><i className="dot"></i>Done</>}
                  {s.status === 'na'   && <><i className="dot"></i>N/A</>}
                  {s.status === 'flag' && <><i className="dot"></i>Flag</>}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Checks + Activity */}
        <div className="lfile__rail">
          <div className="lfile__checks">
            <div className="lfile__h">PRE-FILING CHECKS</div>
            {f.checks.map(c => (
              <div key={c.id} className={`lfile__check ${c.pass ? 'pass' : 'pend'}`}>
                <span className="lfile__check-i">{c.pass ? '✓' : '○'}</span>
                <span className="lfile__check-l">
                  <b>{c.label}</b>
                  {c.note && <em>{c.note}</em>}
                </span>
              </div>
            ))}
          </div>

          <div className="lfile__activity">
            <div className="lfile__h">ACTIVITY</div>
            {f.activity.map((a, i) => (
              <div className="lfile__act" key={i}>
                <span className="lfile__act-t">{a.t}</span>
                <span className={`lfile__act-w ${a.who === 'auto' ? 'auto' : ''}`}>{a.who}</span>
                <span className="lfile__act-x">{a.what}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* History */}
      <div className="lfile__history">
        <div className="lfile__h">FILING HISTORY <em>— all regulators · 10 prior</em></div>
        <div className="lfile__hist-table">
          <div className="lfile__hist-head">
            <span>PERIOD</span>
            <span>REG</span>
            <span>FILED</span>
            <span className="r">AMOUNT</span>
            <span className="r">FLAGS</span>
            <span>AUDITOR</span>
            <span>STATUS</span>
          </div>
          {LEDGER_FILINGS.history.map(h => (
            <div key={h.id} className={`lfile__hist-row ${h.annual ? 'annual' : ''}`}>
              <span className="lfile__hist-period">
                <b>{h.period}</b>
                <em>due {h.due}</em>
              </span>
              <span className="lfile__hist-reg">{regBy[h.regulator].short}</span>
              <span>{h.filed}</span>
              <span className="r ljr__num">${h.amount.toLocaleString()}</span>
              <span className={`r ${h.flags > 0 ? 'flag' : ''}`}>{h.flags}</span>
              <span className="lfile__hist-auditor">{h.auditor}</span>
              <span className={`lfile__hist-status status--${h.status}`}>
                <i className="dot"></i>
                {h.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   REPORTS — P&L, expense mix, donor mix, runway
   ────────────────────────────────────────────────────── */
const LedgerReports = () => {
  const r = LEDGER_REPORTS;

  // P&L bar chart
  const maxPL = Math.max(...r.pnl.flatMap(q => [q.rev, q.exp]));

  // Runway projection chart
  const runway = r.runway;
  const maxRun = Math.max(...runway.map(x => x.cash));
  const minRun = Math.min(...runway.map(x => x.cash));
  const W = 720, H = 200, pad = 16;

  const xs = (i) => pad + (i / (runway.length - 1)) * (W - pad * 2);
  const ys = (v) => H - pad - ((v - minRun) / (maxRun - minRun || 1)) * (H - pad * 2);

  const pathActual = runway.filter(x => !x.projected).map((x, i) => `${i ? 'L' : 'M'} ${xs(i)} ${ys(x.cash)}`).join(' ');
  const splitIdx = runway.findIndex(x => x.projected);
  const pathProjected = runway.slice(splitIdx - 1).map((x, i) => `${i ? 'L' : 'M'} ${xs(i + splitIdx - 1)} ${ys(x.cash)}`).join(' ');

  return (
    <div className="lrpt">
      <div className="lrpt__head">
        <div>
          <div className="lrpt__eyebrow">Ledger · reports</div>
          <h2>Financial reports <em>— rolling 18 months</em></h2>
        </div>
        <div className="lrpt__head-r">
          <button>P&L statement</button>
          <button>Balance sheet</button>
          <button>Cash flow</button>
          <button>Custom</button>
        </div>
      </div>

      <div className="lrpt__grid">
        {/* P&L chart */}
        <section className="lrpt__card lrpt__pnl">
          <div className="lrpt__card-h">
            <h3>Revenue vs expense</h3>
            <em>by quarter · trailing 6Q</em>
          </div>
          <div className="lrpt__pnl-bars">
            {r.pnl.map(q => {
              const net = q.rev - q.exp;
              return (
                <div className="lrpt__pnl-q" key={q.q}>
                  <div className="lrpt__pnl-bars-pair">
                    <div className="lrpt__pnl-bar rev" style={{ height: (q.rev / maxPL * 100) + '%' }}>
                      <em>${(q.rev / 1000).toFixed(0)}k</em>
                    </div>
                    <div className="lrpt__pnl-bar exp" style={{ height: (q.exp / maxPL * 100) + '%' }}>
                      <em>${(q.exp / 1000).toFixed(0)}k</em>
                    </div>
                  </div>
                  <div className="lrpt__pnl-q-lbl">{q.q}{q.partial && <span className="partial">·</span>}</div>
                  <div className={`lrpt__pnl-net ${net > 0 ? 'up' : 'down'}`}>
                    {net > 0 ? '+' : ''}${(net / 1000).toFixed(0)}k
                  </div>
                </div>
              );
            })}
          </div>
          <div className="lrpt__legend">
            <span><i className="sw rev"></i>Revenue</span>
            <span><i className="sw exp"></i>Expense</span>
            <span><i className="sw partial"></i>· partial period</span>
          </div>
        </section>

        {/* Runway projection */}
        <section className="lrpt__card lrpt__runway">
          <div className="lrpt__card-h">
            <h3>Cash runway</h3>
            <em>actual + 8wk projection</em>
          </div>
          <div className="lrpt__runway-stats">
            <div><span>CURRENT</span><b>$614,820</b></div>
            <div><span>8wk projected</span><b>$348,800</b></div>
            <div><span>WEEKLY BURN</span><b>$33,200</b></div>
            <div><span>RUNWAY</span><b className="warn">11 wk</b></div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="lrpt__runway-svg">
            {/* gridlines */}
            {[0, 0.25, 0.5, 0.75, 1].map(t => {
              const v = minRun + t * (maxRun - minRun);
              return (
                <g key={t}>
                  <line x1={pad} x2={W - pad} y1={ys(v)} y2={ys(v)} stroke="#e7e3d8" strokeDasharray="2 3" />
                  <text x={W - pad + 2} y={ys(v) + 3} fontSize="9" fill="#8a8472" fontFamily="JetBrains Mono">${(v/1000).toFixed(0)}k</text>
                </g>
              );
            })}
            {/* actual area */}
            <path d={pathActual + ` L ${xs(splitIdx - 1)} ${H - pad} L ${pad} ${H - pad} Z`} fill="#5c4a1f" fillOpacity="0.1" />
            <path d={pathActual} stroke="#5c4a1f" strokeWidth="1.6" fill="none" />
            {/* projection */}
            <path d={pathProjected} stroke="#b94a3a" strokeWidth="1.4" fill="none" strokeDasharray="3 3" />
            {/* dots */}
            {runway.map((x, i) => (
              <circle key={i} cx={xs(i)} cy={ys(x.cash)} r={x.projected ? 1.6 : 2.4}
                fill={x.projected ? '#b94a3a' : '#5c4a1f'} />
            ))}
            {/* x labels */}
            {runway.map((x, i) => (
              i % 2 === 0 && <text key={i} x={xs(i)} y={H - 2} fontSize="9" fill="#6b6855" fontFamily="JetBrains Mono" textAnchor="middle">{x.wk}</text>
            ))}
            {/* split divider */}
            <line x1={xs(splitIdx - 0.5)} x2={xs(splitIdx - 0.5)} y1={pad} y2={H - pad} stroke="#b94a3a" strokeOpacity="0.3" strokeWidth="1" />
            <text x={xs(splitIdx - 0.5)} y={pad - 2} fontSize="8" fill="#b94a3a" fontFamily="JetBrains Mono" textAnchor="middle">PROJECTED →</text>
          </svg>
        </section>

        {/* Expense mix */}
        <section className="lrpt__card lrpt__mix">
          <div className="lrpt__card-h">
            <h3>Expense mix</h3>
            <em>YTD · by category</em>
          </div>
          <div className="lrpt__mix-rows">
            {r.expenseMix.map(x => (
              <div className="lrpt__mix-row" key={x.cat}>
                <span className="lrpt__mix-cat">{x.cat}</span>
                <div className="lrpt__mix-bar">
                  <div className="lrpt__mix-fill" style={{ width: (x.pct * 5) + '%' }} />
                </div>
                <span className="lrpt__mix-v">${(x.v / 1000).toFixed(0)}k</span>
                <span className="lrpt__mix-pct">{x.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>

        {/* Donor mix */}
        <section className="lrpt__card lrpt__donor">
          <div className="lrpt__card-h">
            <h3>Revenue by source</h3>
            <em>YTD · 1.42M total</em>
          </div>
          <div className="lrpt__donor-rows">
            {r.donorMix.map(d => (
              <div className="lrpt__donor-row" key={d.src}>
                <span className="lrpt__donor-src">{d.src}</span>
                <div className="lrpt__donor-bar">
                  <div className="lrpt__donor-fill" style={{ width: (d.pct * 2.2) + '%' }} />
                </div>
                <span className="lrpt__donor-v">${(d.v / 1000).toFixed(0)}k</span>
                <span className="lrpt__donor-pct">{d.pct.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export { LedgerFilings, LedgerReports };