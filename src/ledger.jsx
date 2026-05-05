import React, { memo } from 'react';
import './ledger.css';
import { LEDGER_JOURNAL, LEDGER_KPIS } from './ledger-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { NewEntryModal } from './ledger-modal';
import { LedgerChart, LedgerReconcile, LedgerBills } from './ledger-tabs1';
import { LedgerFilings, LedgerReports } from './ledger-tabs2';
import { LedgerCompliance, LedgerAssets } from './ledger-tabs3';

// Mandate 2.0 — Ledger (Finance / QuickBooks) v2
// Editorial accounting: ledger paper, ink, mono numbers, double-entry feel.

const { useState: lUS, useMemo: lUM } = React;

/* ── Sparkline ─────────────────────────────────────── */
const LSpark = ({ pts, color = '#5c4a1f', fill = false }) => {
  const w = 56, h = 22, pad = 1;
  const max = Math.max(...pts), min = Math.min(...pts);
  const r = max - min || 1;
  const dx = (w - pad * 2) / (pts.length - 1);
  const xy = pts.map((p, i) => [pad + i * dx, h - pad - ((p - min) / r) * (h - pad * 2)]);
  const d = xy.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join(' ');
  const fillD = d + ` L ${w - pad} ${h - pad} L ${pad} ${h - pad} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="ledger__kpi-spark">
      {fill && <path d={fillD} fill={color} fillOpacity="0.1" />}
      <path d={d} stroke={color} strokeWidth="1.2" fill="none" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="1.6" fill={color} />
    </svg>
  );
};

const LKPI_SPARKS = {
  cash:    [689, 686, 678, 672, 668, 660, 651, 642, 635, 628, 622, 614],
  q2burn:  [180, 184, 190, 195, 198, 200, 202, 204, 206, 207, 208, 208],
  ar:      [62, 64, 68, 70, 72, 74, 76, 78, 80, 82, 84, 84],
  ap:      [22, 24, 25, 27, 28, 29, 30, 30, 31, 31, 32, 32],
  filing:  [40, 50, 60, 65, 70, 75, 78, 82, 85, 88, 90, 92],
  comp:    [96, 96.5, 97, 97.2, 97.4, 97.6, 97.8, 98, 98.1, 98.2, 98.3, 98.4],
};

const LedgerKpiStrip = () => (
  <div className="ledger__kpis">
    {Object.entries(LEDGER_KPIS).map(([k, v]) => (
      <div className="ledger__kpi" key={k}>
        <div className="ledger__kpi-lbl">{v.label}</div>
        <div className={`ledger__kpi-val ${v.tone}`}>{v.value}</div>
        <LSpark pts={LKPI_SPARKS[k]} fill color={v.tone === 'warn' ? '#b94a3a' : v.tone === 'good' ? '#0d4f3c' : '#5c4a1f'} />
        <div className={`ledger__kpi-delta ${v.tone}`}>
          <b>{v.delta}</b>
          <span>{v.sub}</span>
        </div>
      </div>
    ))}
  </div>
);

/* ── Tabs ─────────────────────────────────────────── */
const LEDGER_TABS = [
  { k:'journal',    label:'JOURNAL',    count:24,       hint:'register' },
  { k:'chart',      label:'BOOKS',      count:42,       hint:'accounts' },
  { k:'reconcile',  label:'RECONCILE',  count:'3 OPEN', hint:'bank' },
  { k:'bills',      label:'BILLS',      count:9,        hint:'AP' },
  { k:'filings',    label:'FILINGS',    count:5,        hint:'regulators' },
  { k:'compliance', label:'COMPLIANCE', count:'4 FLAG', hint:'rules · audit' },
  { k:'assets',     label:'ASSETS',     count:287,      hint:'inventory' },
  { k:'reports',    label:'REPORTS',    count:'',       hint:'P&L · runway' },
];

const LedgerTabs = ({ tab, setTab, onNewEntry }) => (
  <div className="ledger__tabs">
    {LEDGER_TABS.map(t => (
      <button
        key={t.k}
        className={`ledger__tab ${tab === t.k ? 'on' : ''}`}
        onClick={() => setTab(t.k)}
      >
        <span className="ledger__tab-lbl">{t.label}</span>
        {t.count !== '' && <span className="ledger__tab-cnt">{t.count}</span>}
        <em className="ledger__tab-hint">{t.hint}</em>
      </button>
    ))}
    <div className="ledger__tabs-spacer" />
    <div className="ledger__period">
      <span>Period</span>
      <b>Apr 1 – Jun 30</b>
      <em>Q2 2026</em>
    </div>
    <button className="ledger__compose" onClick={onNewEntry}>+ NEW ENTRY</button>
  </div>
);

/* ── Journal — register view ─────────────────────── */
const LedgerJournal = ({ onPick }) => {
  const [filter, setFilter] = lUS('all');
  const [q, setQ] = lUS('');
  const [openId, setOpenId] = lUS(null);

  // Live-load journal entries from DB; fallback to prototype data if API empty.
  const { records: journal, loading } = useLiveRecords('ledger', 'journal', LEDGER_JOURNAL);

  const filtered = journal.filter(je => {
    if (filter !== 'all' && je.type !== filter) return false;
    if (q && !(je.memo + ' ' + je.ref + ' ' + je.account).toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const totals = filtered.reduce((a, je) => ({ dr: a.dr + je.debit, cr: a.cr + je.credit }), { dr: 0, cr: 0 });
  const flagged = filtered.filter(je => je.flagged).length;

  return (
    <div className="ljr">
      <div className="ljr__head">
        <div className="ljr__title">
          <div className="ljr__eyebrow">Ledger · register</div>
          <h2>Journal entries <em>— general ledger</em></h2>
        </div>
        <div className="ljr__totals">
          <div className="ljr__total"><span>DEBITS</span><b className="ljr__num">${totals.dr.toLocaleString()}</b></div>
          <div className="ljr__total"><span>CREDITS</span><b className="ljr__num">${totals.cr.toLocaleString()}</b></div>
          <div className="ljr__total flag"><span>FLAGGED</span><b>{flagged}</b></div>
        </div>
      </div>

      <div className="ljr__bar">
        <div className="ljr__filters">
          {[
            ['all','All'],['gift','Gifts'],['bill','Bills'],
            ['payroll','Payroll'],['expense','Expenses'],['adj','Adjustments'],['pledge','Pledges']
          ].map(([k, l]) => (
            <button key={k} className={`ljr__filter ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="ljr__search">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search memo, ref, account…" />
          <span className="ljr__shortcut">⌘ K</span>
        </div>
      </div>

      <div className="ljr__table">
        <div className="ljr__thead">
          <span>JE #</span>
          <span>DATE</span>
          <span>REF</span>
          <span>MEMO &nbsp;·&nbsp; ACCOUNT</span>
          <span className="r">DEBIT</span>
          <span className="r">CREDIT</span>
          <span className="r">BALANCE</span>
          <span>SIGN</span>
        </div>
        {filtered.map(je => (
          <React.Fragment key={je.id}>
            <div
              className={`ljr__row ${je.flagged ? 'flag' : ''} ${openId === je.id ? 'open' : ''}`}
              onClick={() => setOpenId(openId === je.id ? null : je.id)}
            >
              <span className="ljr__id">{je.id}</span>
              <span className="ljr__date">
                <b>{je.date}</b>
                <em>{je.day}</em>
              </span>
              <span className={`ljr__ref ${je.type}`}>{je.ref}</span>
              <span className="ljr__memo">
                <b>{je.memo}</b>
                <em>{je.account}</em>
              </span>
              <span className="ljr__num r">{je.debit ? '$' + je.debit.toLocaleString() : '—'}</span>
              <span className="ljr__num r cr">{je.credit ? '$' + je.credit.toLocaleString() : '—'}</span>
              <span className="ljr__num r bal">${je.balance.toLocaleString()}</span>
              <span className={`ljr__sig ${je.signed === 'auto' ? 'auto' : 'human'}`}>{je.signed}</span>
            </div>
            {openId === je.id && (
              <div className="ljr__detail">
                <div className="ljr__detail-h">
                  <span>SPLITS &nbsp;·&nbsp; {je.id}</span>
                  <em>{je.source} · {je.type.toUpperCase()}</em>
                </div>
                <div className="ljr__splits">
                  <div className="ljr__split-h">
                    <span>ACCOUNT</span>
                    <span className="r">DEBIT</span>
                    <span className="r">CREDIT</span>
                  </div>
                  {je.splits.map((s, i) => (
                    <div key={i} className="ljr__split">
                      <span>{s.acct}</span>
                      <span className="r ljr__num">{s.dr ? '$' + s.dr.toLocaleString() : ''}</span>
                      <span className="r ljr__num cr">{s.cr ? '$' + s.cr.toLocaleString() : ''}</span>
                    </div>
                  ))}
                  <div className="ljr__split totals">
                    <span>TOTALS</span>
                    <span className="r ljr__num">${je.splits.reduce((a, s) => a + s.dr, 0).toLocaleString()}</span>
                    <span className="r ljr__num cr">${je.splits.reduce((a, s) => a + s.cr, 0).toLocaleString()}</span>
                  </div>
                </div>
                {je.flagged && (
                  <div className="ljr__flag">
                    <b>FLAG</b> {je.flagReason}
                  </div>
                )}
                <div className="ljr__detail-actions">
                  <button>View source · {je.source}</button>
                  <button>Edit splits</button>
                  <button className="warn">Reverse</button>
                </div>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      <div className="ljr__foot">
        <div className="ljr__foot-l">
          <em>{filtered.length} entries</em>
          <span>Showing posted · trailing 7 days</span>
        </div>
        <div className="ljr__foot-r">
          <button>Export to QBO</button>
          <button>Export CSV</button>
        </div>
      </div>
    </div>
  );
};

/* ── Main shell ───────────────────────────────────── */
const Ledger2 = () => {
  const [tab, setTab] = lUS('journal');
  const [newOpen, setNewOpen] = lUS(false);
  const [toast, setToast] = lUS(null);
  const { isEmpty: noJournal } = useLiveRecords('ledger', 'journal', LEDGER_JOURNAL);
  if (noJournal) return <EmptyModule module="LEDGER" label="Ledger" accent="var(--m-ledger)" />;

  const handlePosted = (je) => {
    setTab('journal');
    setToast({ id: je.id, ref: je.ref });
    setTimeout(() => setToast(null), 3200);
  };

  const NEM = NewEntryModal;

  return (
    <div className="ledger">
      <LedgerKpiStrip />
      <LedgerTabs tab={tab} setTab={setTab} onNewEntry={() => setNewOpen(true)} />

      <div className="ledger__body">
        {tab === 'journal' && <LedgerJournal />}
        {tab === 'chart' && <LedgerChart />}
        {tab === 'reconcile' && <LedgerReconcile />}
        {tab === 'bills' && <LedgerBills />}
        {tab === 'filings' && <LedgerFilings />}
        {tab === 'compliance' && <LedgerCompliance />}
        {tab === 'assets' && <LedgerAssets />}
        {tab === 'reports' && <LedgerReports />}
      </div>

      {NEM && <NEM open={newOpen} onClose={() => setNewOpen(false)} onPosted={handlePosted} />}

      {toast && (
        <div className="ledger__toast">
          <b>✓ Posted</b>
          <span>{toast.id} · {toast.ref}</span>
        </div>
      )}
    </div>
  );
};

export { Ledger2 };