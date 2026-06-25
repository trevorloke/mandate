import React from 'react';
import './ledger-tabs3.css';
import { LEDGER_ASSETS, LEDGER_COMPLIANCE } from './ledger-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Mandate 2.0 — Ledger tabs (Compliance, Assets)

const { useState: lT3US, useMemo: lT3UM } = React;

/* ──────────────────────────────────────────────────────
   COMPLIANCE — rules engine + audit log
   ────────────────────────────────────────────────────── */
const LedgerCompliance = () => {
  const c = LEDGER_COMPLIANCE;
  const [areaFilter, setAreaFilter] = lT3US('all');
  const [statusFilter, setStatusFilter] = lT3US('all');

  const areas = ['all', ...Array.from(new Set(c.rules.map(r => r.area)))];
  const flagCount = c.rules.filter(r => r.status === 'amber' || r.status === 'red').length;
  const greenCount = c.rules.filter(r => r.status === 'green').length;
  const inactive = c.rules.filter(r => r.status === 'inactive').length;
  const totalChecks = c.rules.reduce((a, r) => a + (typeof r.checks === 'number' ? r.checks : 0), 0);

  const filtered = c.rules.filter(r =>
    (areaFilter === 'all' || r.area === areaFilter) &&
    (statusFilter === 'all' || r.status === statusFilter)
  );

  // Score sparkline
  const scoreSeries = c.scoreSeries || [];
  const score = scoreSeries[scoreSeries.length - 1] ?? 0;
  const min = Math.min(...scoreSeries) - 0.5;
  const max = Math.max(...scoreSeries) + 0.2;
  const w = 220, h = 36, pad = 2;
  const pts = scoreSeries.map((v, i) => {
    const x = pad + (i / (scoreSeries.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    return [x, y];
  });
  const sparkD = pts.map((p, i) => `${i ? 'L' : 'M'} ${p[0]} ${p[1]}`).join(' ');

  return (
    <div className="lcomp">
      <div className="lcomp__head">
        <div>
          <div className="lcomp__eyebrow">Ledger · compliance</div>
          <h2>Compliance <em>— rules · audit · controls</em></h2>
        </div>
        <div className="lcomp__head-r">
          <div className="lcomp__score">
            <span>SCORE</span>
            <b>{score.toFixed(1)}<em>%</em></b>
            <svg viewBox={`0 0 ${w} ${h}`} className="lcomp__spark">
              <path d={sparkD} stroke="#0d4f3c" strokeWidth="1.4" fill="none" />
              {pts.length > 0 && <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="2.5" fill="#0d4f3c" />}
            </svg>
            <em>10-period trailing</em>
          </div>
        </div>
      </div>

      {/* Summary band */}
      <div className="lcomp__band">
        <div className="lcomp__stat">
          <span>RULES TRACKED</span>
          <b>{c.rules.length}</b>
          <em>across {areas.length - 1} areas</em>
        </div>
        <div className="lcomp__stat">
          <span>CHECKS / PERIOD</span>
          <b>{totalChecks.toLocaleString()}</b>
          <em>automated · daily</em>
        </div>
        <div className="lcomp__stat lcomp__stat--good">
          <span>PASSING</span>
          <b>{greenCount}</b>
          <em>green</em>
        </div>
        <div className="lcomp__stat lcomp__stat--warn">
          <span>FLAGGED</span>
          <b>{flagCount}</b>
          <em>amber · need action</em>
        </div>
        <div className="lcomp__stat">
          <span>INACTIVE</span>
          <b>{inactive}</b>
          <em>writ-period rules</em>
        </div>
        <div className="lcomp__stat">
          <span>NEXT REVIEW</span>
          <b>—</b>
          <em></em>
        </div>
      </div>

      <div className="lcomp__body">
        {/* Left: Rules */}
        <div className="lcomp__rules">
          <div className="lcomp__h">RULES <em>· {filtered.length} of {c.rules.length}</em></div>

          {/* Filters */}
          <div className="lcomp__filters">
            <div className="lcomp__filter-group">
              <span>AREA</span>
              {areas.map(a => (
                <button key={a} className={`lcomp__chip ${areaFilter === a ? 'on' : ''}`} onClick={() => setAreaFilter(a)}>
                  {a === 'all' ? 'All' : a}
                </button>
              ))}
            </div>
            <div className="lcomp__filter-group">
              <span>STATUS</span>
              {['all','green','amber','inactive'].map(s => (
                <button key={s} className={`lcomp__chip ${statusFilter === s ? 'on' : ''}`} onClick={() => setStatusFilter(s)}>
                  {s === 'all' ? 'All' : s}
                </button>
              ))}
            </div>
          </div>

          {/* Rules list */}
          <div className="lcomp__rule-list">
            {filtered.map(r => (
              <div key={r.id} className={`lcomp__rule lcomp__rule--${r.status}`}>
                <div className="lcomp__rule-l">
                  <span className="lcomp__rule-id">{r.id}</span>
                  <div className="lcomp__rule-area">{r.area}</div>
                </div>
                <div className="lcomp__rule-mid">
                  <div className="lcomp__rule-name">{r.rule}</div>
                  <div className="lcomp__rule-juris">
                    <em>{r.jurisdiction}</em> · <em>window:</em> {r.windowed}
                  </div>
                  {r.detail && <div className="lcomp__rule-detail">{r.detail}</div>}
                </div>
                <div className="lcomp__rule-r">
                  <div className="lcomp__rule-checks">
                    <span>CHECKS</span>
                    <b>{r.checks}</b>
                  </div>
                  <div className={`lcomp__rule-flags ${r.flagged > 0 ? 'on' : ''}`}>
                    <span>FLAGS</span>
                    <b>{r.flagged}</b>
                  </div>
                  <div className={`lcomp__rule-status status--${r.status}`}>
                    <i className="dot"></i>
                    <span>{r.status}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Audit log */}
        <div className="lcomp__audit">
          <div className="lcomp__h">INTERNAL AUDIT LOG <em>· {c.audit.length} entries · 7-day window</em></div>
          <div className="lcomp__audit-list">
            {c.audit.map((a, i) => (
              <div key={i} className={`lcomp__aud lcomp__aud--${a.sev}`}>
                <div className="lcomp__aud-t">
                  <span className="lcomp__aud-ts">{a.t}</span>
                  <span className={`lcomp__aud-who ${a.who === 'auto' ? 'auto' : ''}`}>{a.who}</span>
                </div>
                <div className="lcomp__aud-x">
                  <div className="lcomp__aud-area">{a.area}</div>
                  <div className="lcomp__aud-what">{a.what}</div>
                  {a.resolution && <div className="lcomp__aud-res"><em>↳</em> {a.resolution}</div>}
                  <div className="lcomp__aud-ref">{a.ref}</div>
                </div>
                <div className={`lcomp__aud-sev sev--${a.sev}`}>
                  {a.sev === 'flag-cleared' && '✓'}
                  {a.sev === 'open' && '!'}
                  {a.sev === 'info' && '·'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ──────────────────────────────────────────────────────
   ASSETS — inventory
   ────────────────────────────────────────────────────── */
const LedgerAssets = () => {
  const { records: items } = useLiveRecords('ledger', 'asset', LEDGER_ASSETS.items);
  const [catFilter, setCatFilter] = lT3US('all');
  const [openId, setOpenId] = lT3US(null);

  const categories = LEDGER_ASSETS.categories;
  const filtered = catFilter === 'all' ? items : items.filter(i => i.cat === catFilter);
  const catBy = Object.fromEntries(categories.map(c => [c.id, c]));
  const totalValue = items.reduce((s, i) => s + (i.book || 0), 0);
  const catAgg = Object.fromEntries(categories.map(c => {
    const inCat = items.filter(i => i.cat === c.id);
    return [c.id, { items: inCat.length, value: inCat.reduce((s, i) => s + (i.book || 0), 0) }];
  }));

  return (
    <div className="lasset">
      <div className="lasset__head">
        <div>
          <div className="lasset__eyebrow">Ledger · asset register</div>
          <h2>Asset inventory <em>— {items.length} items · ${totalValue.toLocaleString()} book</em></h2>
        </div>
        <div className="lasset__head-r">
          <div className="lasset__count">
            <b>${(totalValue / 1000).toFixed(1)}<em>k</em></b>
            <em>book value</em>
          </div>
          <div className="lasset__due">
            <span>NEXT AUDIT</span>
            <b>{LEDGER_ASSETS.summary.nextAudit}</b>
          </div>
          <button className="lasset__add">+ Receive asset</button>
        </div>
      </div>

      {/* Category band */}
      <div className="lasset__cats">
        <button className={`lasset__cat ${catFilter === 'all' ? 'on' : ''}`} onClick={() => setCatFilter('all')}>
          <div className="lasset__cat-l">
            <div className="lasset__cat-name">All categories</div>
            <em>full register</em>
          </div>
          <div className="lasset__cat-r">
            <b>{items.length}</b>
            <span>${(totalValue / 1000).toFixed(1)}k</span>
          </div>
        </button>
        {categories.map(c => (
          <button key={c.id} className={`lasset__cat ${catFilter === c.id ? 'on' : ''}`} onClick={() => setCatFilter(c.id)}>
            <div className="lasset__cat-l">
              <div className="lasset__cat-name">{c.label}</div>
              <em>{c.cycle}</em>
            </div>
            <div className="lasset__cat-r">
              <b>{catAgg[c.id].items}</b>
              <span>${(catAgg[c.id].value / 1000).toFixed(1)}k</span>
            </div>
          </button>
        ))}
      </div>

      {/* Inventory table */}
      <div className="lasset__table">
        <div className="lasset__thead">
          <span>ID</span>
          <span>NAME</span>
          <span>CAT</span>
          <span>SN / BATCH</span>
          <span>ACQUIRED</span>
          <span className="r">COST</span>
          <span className="r">BOOK</span>
          <span>CUSTODIAN</span>
          <span>STATUS</span>
        </div>
        {filtered.map(it => {
          const open = openId === it.id;
          return (
            <React.Fragment key={it.id}>
              <div className={`lasset__row ${open ? 'open' : ''} ${it.flag ? 'flag' : ''}`}
                   onClick={() => setOpenId(open ? null : it.id)}>
                <span className="lasset__id">{it.id}</span>
                <span className="lasset__name">
                  {it.name}
                  {it.batch && it.deployed != null && (
                    <em className="lasset__deployed">{it.deployed}/{it.batch} deployed</em>
                  )}
                </span>
                <span className="lasset__cat-pill">{catBy[it.cat]?.label}</span>
                <span className="lasset__sn">{it.sn}</span>
                <span className="lasset__date">{it.acquired}</span>
                <span className="r ljr__num">${(it.cost ?? 0).toLocaleString()}</span>
                <span className="r ljr__num">${(it.book ?? 0).toLocaleString()}</span>
                <span className="lasset__cust">{it.custodian}</span>
                <span className={`lasset__status status--${it.status}`}>
                  <i className="dot"></i>{it.status}
                </span>
              </div>
              {open && (
                <div className="lasset__detail">
                  <div className="lasset__detail-grid">
                    <div><span>LOCATION</span><b>{it.loc}</b></div>
                    {it.warranty && <div><span>WARRANTY</span><b>{it.warranty}</b></div>}
                    {it.plate && <div><span>PLATE</span><b>{it.plate}</b></div>}
                    {it.insurance && <div><span>INSURANCE</span><b>{it.insurance}</b></div>}
                    {it.batch && <div><span>BATCH SIZE</span><b>{it.batch}</b></div>}
                    {it.deployed != null && <div><span>DEPLOYED</span><b>{it.deployed} of {it.batch}</b></div>}
                    <div><span>DEPRECIATION</span><b>${((it.cost ?? 0) - (it.book ?? 0)).toLocaleString()}</b></div>
                  </div>
                  {it.flag && <div className="lasset__detail-flag">⚐ {it.flag}</div>}
                  <div className="lasset__detail-actions">
                    <button>Edit</button>
                    <button>Move</button>
                    <button>Disposition</button>
                    <button>Audit trail</button>
                  </div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

export { LedgerCompliance, LedgerAssets };