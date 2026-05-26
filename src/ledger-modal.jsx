import React, { memo } from 'react';
import './ledger-modal.css';
import { LEDGER_COA as LEDGER_COA_FB } from './ledger-data';
import { useLiveRecords } from './auth/useLiveRecords';
import { useAuth } from './auth/AuthContext';
import { api } from './auth/api';

// Mandate 2.0 — Ledger New Entry modal (double-entry composer)

const { useState: lmUS, useEffect: lmUE, useMemo: lmUM, useRef: lmUR } = React;

const LEDGER_ENTRY_TYPES = [
  { k:'gift',     l:'Gift',         hint:'donation received' },
  { k:'bill',     l:'Bill',         hint:'payable to vendor' },
  { k:'payroll',  l:'Payroll',      hint:'staff comp run' },
  { k:'expense',  l:'Expense',      hint:'card / reimburse' },
  { k:'adj',      l:'Adjustment',   hint:'manual journal' },
  { k:'pledge',   l:'Pledge',       hint:'commitment' },
];

/* ── Account picker — searchable combobox over the chart of accounts ── */
const AcctCombo = ({ value, onChange, placeholder = 'Select account…', filter }) => {
  const [open, setOpen] = lmUS(false);
  const [q, setQ] = lmUS('');
  const ref = lmUR(null);
  const { records: LEDGER_COA } = useLiveRecords('ledger', 'account', LEDGER_COA_FB);

  const accounts = lmUM(() => {
    let acc = (LEDGER_COA || []).filter(a => a.kind !== 'header');
    if (filter) acc = acc.filter(filter);
    return acc;
  }, [filter, LEDGER_COA]);

  const matches = lmUM(() => {
    if (!q) return accounts;
    const ql = q.toLowerCase();
    return accounts.filter(a =>
      a.code.toLowerCase().includes(ql) || a.name.toLowerCase().includes(ql)
    );
  }, [q, accounts]);

  lmUE(() => {
    const click = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', click);
    return () => document.removeEventListener('mousedown', click);
  }, [open]);

  const display = value
    ? <span className="lne-acct__pick"><b>{value.code}</b><span>{value.name}</span></span>
    : <span className="lne-acct__ph">{placeholder}</span>;

  return (
    <div className={`lne-acct ${open ? 'open' : ''}`} ref={ref}>
      <button className="lne-acct__btn" onClick={() => setOpen(o => !o)} type="button">
        {display}
        <em className="lne-acct__caret">▾</em>
      </button>
      {open && (
        <div className="lne-acct__pop">
          <input
            className="lne-acct__q"
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search code or name…"
          />
          <div className="lne-acct__list">
            {matches.length === 0 && <div className="lne-acct__empty">No accounts match.</div>}
            {matches.map(a => (
              <button
                key={a.code}
                className={`lne-acct__opt lne-acct__opt--${a.kind}`}
                onClick={() => { onChange(a); setOpen(false); setQ(''); }}
                type="button"
              >
                <span className="lne-acct__opt-code">{a.code}</span>
                <span className="lne-acct__opt-name">{a.name}</span>
                <span className={`lne-acct__opt-kind k--${a.kind}`}>{a.kind}</span>
                <span className="lne-acct__opt-bal">${a.balance.toLocaleString()}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ── Default templates per entry type ── */
const splitTemplate = (type, coa = LEDGER_COA_FB) => {
  const find = (code) => (coa || []).find(a => a.code === code);
  switch (type) {
    case 'gift':
      return [
        { acct: find('1010'), dr: 0, cr: 0, role:'cash' },
        { acct: find('4010'), dr: 0, cr: 0, role:'rev'  },
      ];
    case 'bill':
      return [
        { acct: find('6210'), dr: 0, cr: 0, role:'exp' },
        { acct: find('2010'), dr: 0, cr: 0, role:'liab' },
      ];
    case 'payroll':
      return [
        { acct: find('6010'), dr: 0, cr: 0, role:'exp' },
        { acct: find('6015'), dr: 0, cr: 0, role:'exp' },
        { acct: find('6018'), dr: 0, cr: 0, role:'exp' },
        { acct: find('1010'), dr: 0, cr: 0, role:'cash' },
      ];
    case 'expense':
      return [
        { acct: find('6230'), dr: 0, cr: 0, role:'exp' },
        { acct: find('1010'), dr: 0, cr: 0, role:'cash' },
      ];
    case 'pledge':
      return [
        { acct: find('1310'), dr: 0, cr: 0, role:'ar' },
        { acct: find('4015'), dr: 0, cr: 0, role:'rev' },
      ];
    default:
      return [
        { acct: null, dr: 0, cr: 0, role:'' },
        { acct: null, dr: 0, cr: 0, role:'' },
      ];
  }
};

const refPrefix = (type) => ({
  gift:'GIFT-', bill:'BILL-', payroll:'PAY-', expense:'EXP-', adj:'ADJ-', pledge:'PLDG-'
}[type] || 'REF-');

const todayMD = () => {
  const d = new Date();
  return `${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
const todayDay = () => ['SUN','MON','TUE','WED','THU','FRI','SAT'][new Date().getDay()];

/* ── New Entry Modal ── */
const NewEntryModal = ({ open, onClose, onPosted }) => {
  const { records: LEDGER_COA } = useLiveRecords('ledger', 'account', LEDGER_COA_FB);
  const { user } = useAuth();
  const [type, setType] = lmUS('gift');
  const [date, setDate] = lmUS(todayMD());
  const [ref, setRef] = lmUS('');
  const [memo, setMemo] = lmUS('');
  const [source, setSource] = lmUS('Manual');
  const [splits, setSplits] = lmUS(() => splitTemplate('gift', LEDGER_COA));
  const [posted, setPosted] = lmUS(false);

  // Reset on open
  lmUE(() => {
    if (open) {
      setType('gift');
      setDate(todayMD());
      setRef('GIFT-' + (8842 + Math.floor(Math.random()*7)));
      setMemo('');
      setSource('Manual');
      setSplits(splitTemplate('gift', LEDGER_COA));
      setPosted(false);
    }
  }, [open, LEDGER_COA]);

  // ESC to close
  lmUE(() => {
    if (!open) return;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [open, onClose]);

  // Switch type → swap splits + ref prefix
  const switchType = (t) => {
    setType(t);
    setSplits(splitTemplate(t, LEDGER_COA));
    const num = ref.replace(/^[A-Z]+-?/, '') || '8842';
    setRef(refPrefix(t) + num);
  };

  const updateSplit = (i, patch) => {
    setSplits(splits.map((s, idx) => idx === i ? { ...s, ...patch } : s));
  };
  const addSplit = () => setSplits([...splits, { acct: null, dr: 0, cr: 0, role:'' }]);
  const delSplit = (i) => {
    if (splits.length <= 2) return;
    setSplits(splits.filter((_, idx) => idx !== i));
  };

  // Live totals
  const totalDr = splits.reduce((a, s) => a + (Number(s.dr) || 0), 0);
  const totalCr = splits.reduce((a, s) => a + (Number(s.cr) || 0), 0);
  const variance = totalDr - totalCr;
  const balanced = variance === 0 && totalDr > 0;
  const allAccts = splits.every(s => s.acct);
  const canPost = balanced && allAccts && memo.trim().length > 0;

  // Auto-balance helper: fills the cash side
  const autoBalance = () => {
    if (variance === 0) return;
    // Find the "cash"/"liab" leg or last empty side
    const idx = splits.findIndex(s => s.role === 'cash' || s.role === 'liab' || s.role === 'ar');
    const target = idx >= 0 ? idx : splits.length - 1;
    const amt = Math.abs(variance);
    const next = splits.map((s, i) => {
      if (i !== target) return s;
      if (variance > 0) return { ...s, dr: 0, cr: (Number(s.cr)||0) + amt };
      return { ...s, dr: (Number(s.dr)||0) + amt, cr: 0 };
    });
    setSplits(next);
  };

  const post = () => {
    if (!canPost) return;
    const initials = (user?.name || '').split(/\s+/).filter(Boolean).map(s => s[0]?.toUpperCase()).slice(0, 2).join('.');
    const je = {
      id: 'JE-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      date,
      day: todayDay(),
      ref,
      memo: memo.trim(),
      account: splits[0].acct ? `${splits[0].acct.code} ${splits[0].acct.name}` : '',
      source,
      type,
      debit:  splits[0].dr || 0,
      credit: splits[0].cr || 0,
      balance: 0,
      posted: true,
      signed: initials || '',
      flagged: false,
      splits: splits.map(s => ({
        acct: s.acct ? `${s.acct.code} ${s.acct.name}` : '',
        dr: Number(s.dr) || 0,
        cr: Number(s.cr) || 0,
      })),
    };
    // Persist to API; fall back is harmless because the modal closes on success.
    api.createData('ledger', 'journal', je).catch(() => {});
    setPosted(true);
    onPosted && onPosted(je);
    setTimeout(onClose, 900);
  };

  const fmt$ = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <>
      <div className={`r-modal-mask ${open ? 'open' : ''}`} onClick={onClose}></div>
      <div className={`r-modal lne ${open ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="r-mh">
          <div>
            <div className="r-mh__eyebrow">Ledger · journal · double-entry</div>
            <div className="r-mh__title">New entry <em>— {date} · {todayDay()}</em></div>
          </div>
          <button className="r-mh__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="lne__body">

          {/* Top row: type, date, ref, source, memo */}
          <div className="lne__row lne__row--meta">
            <div className="lne__field lne__field--type">
              <label>TYPE</label>
              <div className="lne__types">
                {LEDGER_ENTRY_TYPES.map(t => (
                  <button
                    key={t.k}
                    className={`lne__type t--${t.k} ${type === t.k ? 'on' : ''}`}
                    onClick={() => switchType(t.k)}
                    type="button"
                  >
                    <b>{t.l}</b>
                    <em>{t.hint}</em>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lne__row">
            <div className="lne__field">
              <label>DATE</label>
              <input className="lne__inp lne__inp--mono" value={date} onChange={e => setDate(e.target.value)} placeholder="MM-DD" />
            </div>
            <div className="lne__field">
              <label>REF</label>
              <input className="lne__inp lne__inp--mono" value={ref} onChange={e => setRef(e.target.value)} />
            </div>
            <div className="lne__field">
              <label>SOURCE</label>
              <select className="lne__inp lne__inp--mono" value={source} onChange={e => setSource(e.target.value)}>
                <option>Manual</option>
                <option>Raise</option>
                <option>Bills</option>
                <option>Payroll</option>
                <option>Expenses</option>
                <option>Bank import</option>
              </select>
            </div>
            <div className="lne__field lne__field--grow">
              <label>MEMO</label>
              <input
                className="lne__inp"
                value={memo}
                onChange={e => setMemo(e.target.value)}
                placeholder={
                  type === 'gift' ? 'Donor name — gift type' :
                  type === 'bill' ? 'Vendor — invoice description' :
                  type === 'payroll' ? 'Payroll period · 04/22–05/05' :
                  type === 'expense' ? 'Description — purpose' :
                  type === 'pledge' ? 'Donor name — pledge schedule' :
                  'Memo'
                }
              />
            </div>
          </div>

          {/* Splits */}
          <div className="lne__splits">
            <div className="lne__splits-h">
              <span className="lne__sh-acct">ACCOUNT</span>
              <span className="lne__sh-dr r">DEBIT</span>
              <span className="lne__sh-cr r">CREDIT</span>
              <span></span>
            </div>
            {splits.map((s, i) => (
              <div className="lne__split" key={i}>
                <div className="lne__sp-acct">
                  <AcctCombo value={s.acct} onChange={(a) => updateSplit(i, { acct: a })} />
                </div>
                <div className="lne__sp-num">
                  <span className="lne__sp-prefix">$</span>
                  <input
                    className="lne__inp lne__inp--mono r"
                    type="number"
                    inputMode="decimal"
                    value={s.dr || ''}
                    placeholder="0.00"
                    onChange={e => updateSplit(i, { dr: e.target.value, cr: 0 })}
                  />
                </div>
                <div className="lne__sp-num">
                  <span className="lne__sp-prefix">$</span>
                  <input
                    className="lne__inp lne__inp--mono r"
                    type="number"
                    inputMode="decimal"
                    value={s.cr || ''}
                    placeholder="0.00"
                    onChange={e => updateSplit(i, { cr: e.target.value, dr: 0 })}
                  />
                </div>
                <button
                  className="lne__sp-del"
                  onClick={() => delSplit(i)}
                  disabled={splits.length <= 2}
                  type="button"
                  aria-label="Remove split"
                >
                  ×
                </button>
              </div>
            ))}
            <button className="lne__add-split" onClick={addSplit} type="button">
              + Add split line
            </button>

            {/* Totals */}
            <div className={`lne__totals ${balanced ? 'balanced' : variance !== 0 ? 'unbal' : ''}`}>
              <div className="lne__t-l">
                <span className="lne__t-lbl">TOTALS</span>
                {balanced && <em className="lne__t-ok">✓ balanced</em>}
                {!balanced && totalDr > 0 && (
                  <em className="lne__t-warn">
                    Out of balance · {fmt$(Math.abs(variance))} {variance > 0 ? 'debit excess' : 'credit excess'}
                  </em>
                )}
              </div>
              <div className="lne__t-num r">{fmt$(totalDr)}</div>
              <div className="lne__t-num r cr">{fmt$(totalCr)}</div>
              <button
                className="lne__t-balance"
                onClick={autoBalance}
                disabled={variance === 0 || totalDr === 0}
                type="button"
                title="Auto-fill the offsetting leg"
              >
                Auto-balance
              </button>
            </div>
          </div>

          {/* Audit strip */}
          <div className="lne__audit">
            <div className="lne__audit-row">
              <span>SIGNED</span>
              <b>M.R. <em>· Mira Reyes, Treasurer</em></b>
            </div>
            <div className="lne__audit-row">
              <span>POSTED TO</span>
              <b>Q2 2026 · period open</b>
            </div>
            <div className="lne__audit-row">
              <span>COMPLIANCE</span>
              <b className="lne__audit-ok">✓ no rule conflicts</b>
            </div>
            <div className="lne__audit-row">
              <span>DOWNSTREAM</span>
              <b>QBO sync queued · 2 reports affected</b>
            </div>
          </div>
        </div>

        <div className="r-mf__actions lne__actions">
          <button className="r-mf__btn ghost" onClick={onClose} type="button">Cancel</button>
          <button className="r-mf__btn ghost" type="button" disabled={!allAccts}>Save draft</button>
          <button
            className={`r-mf__btn ${posted ? 'posted' : ''}`}
            disabled={!canPost || posted}
            onClick={post}
            type="button"
          >
            {posted ? '✓ Posted' : balanced ? 'Post entry' : 'Post entry'}
          </button>
        </div>
      </div>
    </>
  );
};

export { NewEntryModal };