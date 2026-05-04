import React from 'react';
import './ledger-tabs1.css';
import { LEDGER_BILLS, LEDGER_COA, LEDGER_JOURNAL, LEDGER_RECONCILE } from './ledger-data';

// Mandate 2.0 — Ledger tabs (Chart, Reconcile, Bills, Filings, Reports)

const { useState: lTUS, useMemo: lTUM } = React;

/* ──────────────────────────────────────────────────────
   CHART OF ACCOUNTS
   ────────────────────────────────────────────────────── */
const LedgerChart = () => {
  const [collapsed, setCollapsed] = lTUS({ '6000': false }); // expense expanded
  const [picked, setPicked] = lTUS('1010');

  const groups = lTUM(() => {
    const by = {};
    LEDGER_COA.forEach(a => {
      if (a.kind === 'header') by[a.code] = { header: a, kids: [] };
      else if (a.parent && by[a.parent]) by[a.parent].kids.push(a);
    });
    return Object.values(by);
  }, []);

  const fmt = (n) => {
    const neg = n < 0;
    return (neg ? '−$' : '$') + Math.abs(n).toLocaleString();
  };

  const pickedAcct = LEDGER_COA.find(a => a.code === picked);

  return (
    <div className="lcoa">
      <div className="lcoa__head">
        <div>
          <div className="lcoa__eyebrow">Ledger · books</div>
          <h2>Chart of accounts <em>— 42 active</em></h2>
        </div>
        <div className="lcoa__head-r">
          <button className="lcoa__btn">Map to QBO</button>
          <button className="lcoa__btn">+ Account</button>
        </div>
      </div>

      <div className="lcoa__layout">
        {/* tree */}
        <div className="lcoa__tree">
          {groups.map(g => {
            const subTotal = g.kids.reduce((a, k) => a + (k.balance || 0), 0);
            const isCollapsed = collapsed[g.header.code];
            return (
              <div className="lcoa__group" key={g.header.code}>
                <div
                  className={`lcoa__group-h ${g.header.kind}`}
                  onClick={() => setCollapsed({ ...collapsed, [g.header.code]: !isCollapsed })}
                >
                  <span className="lcoa__caret">{isCollapsed ? '▸' : '▾'}</span>
                  <span className="lcoa__code">{g.header.code}</span>
                  <span className="lcoa__name">{g.header.name}</span>
                  <span className="lcoa__bal">{fmt(g.header.balance)}</span>
                  <span className="lcoa__count">{g.kids.length} accounts</span>
                </div>
                {!isCollapsed && (
                  <div className="lcoa__kids">
                    {g.kids.map(a => (
                      <div
                        key={a.code}
                        className={`lcoa__row ${a.kind} ${a.subkind || ''} ${picked === a.code ? 'on' : ''}`}
                        onClick={() => setPicked(a.code)}
                      >
                        <span className="lcoa__code">{a.code}</span>
                        <span className="lcoa__name">{a.name}</span>
                        <span className={`lcoa__bal ${a.balance < 0 ? 'neg' : ''}`}>{fmt(a.balance)}</span>
                        <span className="lcoa__chip">{a.subkind || a.kind}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* detail rail */}
        {pickedAcct && (
          <div className="lcoa__detail">
            <div className="lcoa__detail-eyebrow">Account · {pickedAcct.kind.toUpperCase()}</div>
            <div className="lcoa__detail-code">{pickedAcct.code}</div>
            <div className="lcoa__detail-name">{pickedAcct.name}</div>
            <div className="lcoa__detail-bal">
              <span>Current balance</span>
              <b>{fmt(pickedAcct.balance)}</b>
            </div>

            <div className="lcoa__detail-chart">
              <div className="lcoa__detail-chart-h">12-WEEK ACTIVITY</div>
              <svg viewBox="0 0 240 80" className="lcoa__sparkline">
                {(() => {
                  const seed = pickedAcct.code.charCodeAt(2) || 50;
                  const pts = Array.from({ length: 12 }, (_, i) => {
                    const v = (Math.sin((i + seed) * 0.7) * 0.4 + 0.5 + (i / 30));
                    return [i * (240 / 11), 70 - v * 50];
                  });
                  const d = pts.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
                  return (
                    <>
                      <path d={d + ' L 240 80 L 0 80 Z'} fill="#5c4a1f" fillOpacity="0.08" />
                      <path d={d} stroke="#5c4a1f" strokeWidth="1.4" fill="none" />
                      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#5c4a1f" />)}
                    </>
                  );
                })()}
              </svg>
            </div>

            <div className="lcoa__detail-stats">
              <div><span>Last entry</span><b>04-22 · JE-3142</b></div>
              <div><span>Avg / week</span><b>$4,820</b></div>
              <div><span>YoY</span><b className="up">+18.4%</b></div>
              <div><span>vs budget</span><b className={pickedAcct.kind === 'exp' ? 'flat' : 'up'}>+2.1%</b></div>
            </div>

            <div className="lcoa__detail-h">RECENT ACTIVITY</div>
            <div className="lcoa__detail-feed">
              {LEDGER_JOURNAL.filter(je => je.account.startsWith(pickedAcct.code)).slice(0, 5).map(je => (
                <div className="lcoa__detail-feed-row" key={je.id}>
                  <span className="lcoa__date">{je.date}</span>
                  <span className="lcoa__memo">{je.memo}</span>
                  <span className={`lcoa__num ${je.credit ? 'cr' : ''}`}>
                    {je.debit ? '$' + je.debit.toLocaleString() : '$' + je.credit.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>

            <div className="lcoa__detail-actions">
              <button>Open register</button>
              <button>Run report</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   RECONCILE
   ────────────────────────────────────────────────────── */
const LedgerReconcile = () => {
  const r = LEDGER_RECONCILE;
  const [rows, setRows] = lTUS(r.rows);

  const cleared = rows.filter(x => x.cleared).reduce((a, x) => a + (x.side === 'cr' ? x.amt : -x.amt), 0);
  const outstanding = rows.filter(x => !x.cleared);
  const out$ = outstanding.reduce((a, x) => a + (x.side === 'cr' ? x.amt : -x.amt), 0);
  const reconciledBal = r.bookBalance + 0; // synthetic: remains $614,820 since outstanding cheques are book-only

  const toggle = (id) => {
    setRows(rows.map(x => x.id === id ? { ...x, cleared: !x.cleared } : x));
  };

  const fmt = (n) => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="lrec">
      <div className="lrec__head">
        <div>
          <div className="lrec__eyebrow">Ledger · reconciliation</div>
          <h2>Bank reconciliation <em>— {r.account}</em></h2>
        </div>
        <div className="lrec__head-r">
          <em>{r.bank}</em>
          <span>Last reconciled <b>{r.lastReconciled}</b></span>
        </div>
      </div>

      <div className="lrec__balances">
        <div className="lrec__bal">
          <span className="lbl">STATEMENT BALANCE</span>
          <b className="big">{fmt(r.statementBalance)}</b>
          <em>per BMO statement · {r.statementDate}</em>
        </div>
        <div className="lrec__sep">−</div>
        <div className="lrec__bal">
          <span className="lbl">CLEARED THIS PERIOD</span>
          <b className="big">{fmt(cleared)}</b>
          <em>{rows.filter(x => x.cleared).length} of {rows.length} entries</em>
        </div>
        <div className="lrec__sep">+</div>
        <div className="lrec__bal">
          <span className="lbl">OUTSTANDING</span>
          <b className="big out">{fmt(out$)}</b>
          <em>{outstanding.length} cheques uncashed</em>
        </div>
        <div className="lrec__sep">=</div>
        <div className="lrec__bal lrec__bal--final">
          <span className="lbl">BOOK BALANCE</span>
          <b className="big match">{fmt(r.bookBalance)}</b>
          <em>variance <b>$0.00</b></em>
        </div>
      </div>

      <div className="lrec__bar">
        <div className="lrec__progress">
          <div className="lrec__progress-bar">
            <div className="lrec__progress-fill" style={{ width: `${(rows.filter(x => x.cleared).length / rows.length) * 100}%` }} />
          </div>
          <em>{rows.filter(x => x.cleared).length} / {rows.length} matched</em>
        </div>
        <div className="lrec__bar-actions">
          <button>Auto-match</button>
          <button>Import statement</button>
          <button className="primary">Lock period</button>
        </div>
      </div>

      <div className="lrec__table">
        <div className="lrec__thead">
          <span className="ck"></span>
          <span>DATE</span>
          <span>DESCRIPTION</span>
          <span>REF</span>
          <span className="r">DEBIT</span>
          <span className="r">CREDIT</span>
          <span className="ck">✓</span>
        </div>
        {rows.map(x => (
          <div
            key={x.id}
            className={`lrec__row ${x.cleared ? 'cleared' : 'open'} ${x.flag ? 'flag' : ''}`}
            onClick={() => toggle(x.id)}
          >
            <span className="ck"><i className={`tick ${x.cleared ? 'on' : ''}`}>{x.cleared ? '✓' : ''}</i></span>
            <span className="lrec__date">{x.date}</span>
            <span className="lrec__desc">
              <b>{x.desc}</b>
              {x.note && <em>{x.note}</em>}
            </span>
            <span className="lrec__ref">{x.ref}</span>
            <span className="r ljr__num">{x.side === 'dr' ? '$' + x.amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
            <span className="r ljr__num cr">{x.side === 'cr' ? '$' + x.amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</span>
            <span className="ck">{x.cleared ? '✓' : '○'}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   BILLS (Accounts Payable)
   ────────────────────────────────────────────────────── */
const LedgerBills = () => {
  const [filter, setFilter] = lTUS('all');
  const [picked, setPicked] = lTUS([]);

  const bills = LEDGER_BILLS.filter(b => filter === 'all' || b.status === filter);
  const total = bills.reduce((a, b) => a + b.amt, 0);
  const dueSoon = LEDGER_BILLS.filter(b => {
    const d = new Date(b.due); const now = new Date('2026-04-22');
    return (d - now) < 7 * 86400000;
  });
  const dueSoon$ = dueSoon.reduce((a, b) => a + b.amt, 0);

  const togglePick = (id) => {
    setPicked(picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);
  };
  const pickedTotal = bills.filter(b => picked.includes(b.id)).reduce((a, b) => a + b.amt, 0);

  const daysUntil = (d) => {
    const dt = new Date(d); const now = new Date('2026-04-22');
    return Math.round((dt - now) / 86400000);
  };

  return (
    <div className="lbills">
      <div className="lbills__head">
        <div>
          <div className="lbills__eyebrow">Ledger · accounts payable</div>
          <h2>Vendor bills <em>— 9 open · ${total.toLocaleString()} due</em></h2>
        </div>
        <div className="lbills__head-r">
          <div className="lbills__alert">
            <span>⚠ {dueSoon.length} due ≤ 7 days</span>
            <b>${dueSoon$.toLocaleString()}</b>
          </div>
        </div>
      </div>

      <div className="lbills__bar">
        <div className="lbills__filters">
          {[['all','All',9],['open','Approved',6],['review','In review',2],['flagged','Flagged',1]].map(([k, l, n]) => (
            <button key={k} className={`lbills__filter ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>
              {l} <em>{n}</em>
            </button>
          ))}
        </div>
        <div className="lbills__bar-r">
          {picked.length > 0 ? (
            <>
              <em>{picked.length} selected · ${pickedTotal.toLocaleString()}</em>
              <button className="lbills__pay">Pay batch</button>
            </>
          ) : (
            <>
              <button>Import bill</button>
              <button>+ Add bill</button>
            </>
          )}
        </div>
      </div>

      <div className="lbills__table">
        <div className="lbills__thead">
          <span className="ck"></span>
          <span>BILL #</span>
          <span>VENDOR</span>
          <span>CATEGORY</span>
          <span className="r">AMOUNT</span>
          <span>DUE</span>
          <span>APPROVER</span>
          <span>STATUS</span>
        </div>
        {bills.map(b => {
          const days = daysUntil(b.due);
          const dueClass = days < 0 ? 'over' : days < 7 ? 'soon' : '';
          return (
            <div key={b.id} className={`lbills__row ${b.urgent ? 'urgent' : ''} ${b.status}`}>
              <span className="ck">
                <input type="checkbox" checked={picked.includes(b.id)} onChange={() => togglePick(b.id)} />
              </span>
              <span className="lbills__id">{b.id}</span>
              <span className="lbills__vendor">
                <b>{b.vendor}</b>
                <em>{b.notes}</em>
              </span>
              <span className="lbills__cat">{b.kind}</span>
              <span className="r lbills__amt">${b.amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`lbills__due ${dueClass}`}>
                <b>{b.due.split('-').slice(1).join('/')}</b>
                <em>{days < 0 ? Math.abs(days) + 'd over' : days === 0 ? 'today' : days + 'd'}</em>
              </span>
              <span className="lbills__approver">
                <span className={`avatar ${b.approver === 'auto' ? 'auto' : ''}`}>{b.approver}</span>
                <em>{b.terms}</em>
              </span>
              <span className={`lbills__status status--${b.status}`}>
                <i className="dot"></i>
                {b.status === 'open' ? 'Approved' : b.status === 'review' ? 'In review' : 'Flagged'}
                {b.signed === 'unsigned' && <em>· unsigned</em>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="lbills__foot">
        <div>
          <span>9 bills</span> · <span>$31,762 total</span> · <span>$12,400 due ≤7d</span>
        </div>
        <div>
          <button>Export to QBO</button>
          <button>Generate cheque run</button>
        </div>
      </div>
    </div>
  );
};

export { LedgerChart, LedgerReconcile, LedgerBills };