import React, { useState as opUS, useMemo as opUM } from 'react';
import { OP_TARGETS as OP_TARGETS_FB, OP_CLAIMS as OP_CLAIMS_FB, OP_LEADS as OP_LEADS_FB, OP_LEAD_STAGES, OP_REBUTTALS, OP_MONITORS, OP_SOURCES } from './opp-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Opposition 2.0 — Leads / Rebuttals / Monitors / Sources

// ════════════════════════════════════════════════════════════
// LEADS — investigative kanban
// ════════════════════════════════════════════════════════════
function OpLeads() {
  const { records: OP_LEADS } = useLiveRecords('opposition', 'lead', OP_LEADS_FB);
  const { records: OP_TARGETS } = useLiveRecords('opposition', 'target', OP_TARGETS_FB);
  return (
    <div>
      <div className="op2__filters">
        <span className="op2__filters-label">PIPELINE</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)', letterSpacing: '0.06em' }}>
          {OP_LEADS.length} threads · {OP_LEADS.filter(l => l.priority === 'A').length} priority A · {OP_LEADS.filter(l => l.status === 'cold').length} cold
        </span>
      </div>

      <div className="op2__leads-pipe">
        {OP_LEAD_STAGES.map(stage => {
          const inStage = OP_LEADS.filter(l => l.status === stage.k);
          return (
            <div key={stage.k} className="op2__leads-col">
              <div className="op2__leads-col-head">
                <span>{stage.label}</span>
                <span>{inStage.length}</span>
              </div>
              {inStage.map(l => {
                const target = OP_TARGETS.find(t => t.id === l.target);
                return (
                  <div key={l.id} className={'op2__lead ' + l.priority}>
                    <div className="op2__lead-meta">
                      ▸ {target?.name?.split(' ').pop() || l.target} · {l.priority}
                    </div>
                    <div className="op2__lead-topic">
                      {l.redactions > 0 && <span className="op2__ev-redact" style={{ width: '40px', display: 'inline-block', marginRight: 4 }} />}
                      {l.topic}
                    </div>
                    <div className="op2__lead-foot">
                      <span>{!l.owner || l.owner === '—' ? 'unowned' : l.owner.split(' ')[0]}</span>
                      <span className={'conf' + ((l.confidence || 0) < 0.5 ? ' lo' : '')}>{Math.round((l.confidence || 0) * 100)}%</span>
                    </div>
                    <div className="op2__lead-foot">
                      <span>{l.source} · {l.age}d old</span>
                      {l.sublead > 0 && <span style={{ color: 'var(--op-flag)' }}>+{l.sublead}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Source breakdown chip strip */}
      <div className="op2__panel" style={{ marginTop: 16 }}>
        <div className="op2__panel-title">
          <span>Threads by source</span>
          <span className="op2__panel-title-r">last 90 days</span>
        </div>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          {['tip', 'leak', 'public', 'foi'].map(src => {
            const count = OP_LEADS.filter(l => l.source === src).length;
            return (
              <div key={src} style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 96 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>{src}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, color: 'var(--op-ink)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              </div>
            );
          })}
          <div style={{ flex: 1, borderLeft: '1px dashed var(--op-rule)', paddingLeft: 18 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>Note</span>
            <p style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: 'var(--op-ink-2)', margin: '4px 0 0 0', fontStyle: 'italic', lineHeight: 1.45 }}>
              All leads observe single-source quarantine until corroborated. Restricted-vault threads are not surfaced in any rebuttal until legal-cleared.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// REBUTTALS workshop
// ════════════════════════════════════════════════════════════
function OpRebuttals() {
  const { records: OP_TARGETS } = useLiveRecords('opposition', 'target', OP_TARGETS_FB);
  const { records: OP_CLAIMS } = useLiveRecords('opposition', 'claim', OP_CLAIMS_FB);
  const [sfilter, setSfilter] = opUS('all');
  const statuses = ['all', 'drafted', 'in-review', 'published', 'spike'];

  const rows = OP_REBUTTALS.filter(r => sfilter === 'all' || r.status === sfilter);

  return (
    <div>
      <div className="op2__filters">
        <span className="op2__filters-label">STATUS</span>
        {statuses.map(s => (
          <button key={s} className={'op2__filter' + (sfilter===s ? ' is-on' : '')} onClick={() => setSfilter(s)}>
            {s.replace('-', ' ')}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)', letterSpacing: '0.06em' }}>
          {rows.length} files · {OP_REBUTTALS.filter(r => r.status === 'published').reduce((s, r) => s + r.pickup, 0)} pickups across all
        </span>
      </div>

      <div className="op2__rebuttals">
        {rows.map(r => {
          const claim  = OP_CLAIMS.find(c => c.id === r.claim);
          const target = OP_TARGETS.find(t => t.id === claim?.target);
          return (
            <div key={r.id} className="op2__rebuttal">
              <div>
                <div className="op2__rb-head">
                  <span>FILE {r.id.toUpperCase()}</span>
                  <span className={'op2__rb-status ' + r.status}>{r.status.replace('-',' ')}</span>
                  {claim && <span>vs · <b style={{ color: 'var(--op-ink-2)' }}>{target?.name}</b></span>}
                  {claim && <span>· topic {claim.topic}</span>}
                </div>
                <div className="op2__rb-headline">{r.headline}</div>
                {claim && (
                  <div className="op2__rb-against">
                    “{claim.quote}” <span style={{ color: 'var(--op-ink-3)', fontStyle: 'normal' }}>— {claim.venue}, {claim.date.slice(5)}</span>
                  </div>
                )}
                <div className="op2__rb-meta">
                  <span>by {r.authoredBy}</span>
                  {r.reviewedBy && <span>· reviewed {r.reviewedBy}</span>}
                  <span>· {r.wordCount} words</span>
                  <span>· drafted {r.draftedAt}</span>
                  {r.publishedAt && <span>· published {r.publishedAt}</span>}
                  {r.evidenceIds.length > 0 && (
                    <span>· evidence {r.evidenceIds.join(', ')}</span>
                  )}
                </div>
              </div>
              <div className="op2__rb-side">
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--op-ink-3)', textTransform: 'uppercase', marginBottom: 6 }}>SURFACE</div>
                  <div className="op2__rb-surface">
                    {r.surface.length === 0 && <span style={{ color: 'var(--op-ink-3)', fontSize: 11, fontFamily: 'var(--font-mono)' }}>—</span>}
                    {r.surface.map((s, i) => (
                      <span key={i} className="op2__rb-pill">{s}</span>
                    ))}
                  </div>
                </div>
                {r.status === 'published' && (
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: '0.14em', color: 'var(--op-ink-3)', textTransform: 'uppercase', marginBottom: 6 }}>PICKUP</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 28, color: 'var(--op-go)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                      {r.pickup}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)', letterSpacing: '0.04em', marginTop: 2 }}>
                      outlets / surrogates
                    </div>
                  </div>
                )}
                {r.status === 'in-review' && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--op-warn)', textTransform: 'uppercase' }}>
                    ⏵ AWAITING REVIEW
                  </div>
                )}
                {r.status === 'spike' && (
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--op-stamp)', textTransform: 'uppercase' }}>
                    ✕ SPIKED · weak signal
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// MONITORS — live signal grid
// ════════════════════════════════════════════════════════════
function OpMonitors() {
  return (
    <div>
      <div className="op2__filters">
        <span className="op2__filters-label">LIVE SIGNALS</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)' }}>
          {OP_MONITORS.filter(m => m.spike).length} spiking · {OP_MONITORS.length} total
        </span>
      </div>

      <div className="op2__mons">
        {OP_MONITORS.map(m => {
          const ratio = m.current / Math.max(m.threshold, 0.001);
          const fillW = Math.min(100, (m.current / Math.max(m.threshold * 1.5, 0.001)) * 100);
          const markPos = Math.min(100, (m.threshold / Math.max(m.threshold * 1.5, 0.001)) * 100);
          return (
            <div key={m.id} className={'op2__mon' + (m.spike ? ' spike' : '')}>
              <div>
                <div className="op2__mon-name">{m.label}</div>
                <div className="op2__mon-kind">{m.kind} · last seen {m.last}</div>
                <div className="op2__mon-note">{m.note}</div>
                <div className={'op2__mon-bar' + (m.spike ? ' spike' : '')}>
                  <span style={{ width: fillW + '%' }} />
                  <span className="op2__mon-bar-mark" style={{ left: markPos + '%' }} />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em', color: 'var(--op-ink-3)', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                  <span>baseline {m.baseline.toFixed(1)}</span>
                  <span>threshold {m.threshold.toFixed(1)}</span>
                  <span>now {m.current.toFixed(1)}</span>
                </div>
              </div>
              <div className="op2__mon-side">
                <span className={'op2__mon-side-v' + (m.spike ? ' spike' : '')}>{m.newClaims}</span>
                <span style={{ letterSpacing: '0.1em', textTransform: 'uppercase' }}>new claims</span>
                {m.spike && (
                  <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--op-stamp)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    ⚠ {(ratio).toFixed(1)}× threshold
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SOURCES — confidential roster
// ════════════════════════════════════════════════════════════
function OpSources() {
  return (
    <div>
      <div className="op2__filters">
        <span className="op2__filters-label">SOURCE ROSTER · CONFIDENTIAL</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)' }}>
          {OP_SOURCES.length} entries
        </span>
      </div>

      <div className="op2__panel">
        <div className="op2__panel-title">
          <span>Roster</span>
          <span className="op2__panel-title-r">single-source rule applies · trust grade leads</span>
        </div>
        {OP_SOURCES.map(s => (
          <div key={s.id} className="op2__src-row">
            <div>
              <div className="op2__src-name">{s.name}</div>
              <div className="op2__src-meta" style={{ marginTop: 2, fontStyle: 'italic', color: 'var(--op-ink-2)', fontFamily: 'var(--font-serif)', fontSize: 12 }}>
                {s.notes}
              </div>
            </div>
            <span className={'op2__src-trust ' + s.trust.replace('+','\\+')}>{s.trust}</span>
            <span className="op2__src-meta">{s.contact}</span>
            <span className="op2__src-meta">{s.topics.join(' · ')}</span>
            <span className="op2__src-meta">last {s.lastContact.slice(5)}</span>
          </div>
        ))}
      </div>

      <div className="op2__panel" style={{ marginTop: 14 }}>
        <div className="op2__panel-title">
          <span>Working rules</span>
          <span className="op2__panel-title-r">read once</span>
        </div>
        <ul style={{ fontFamily: 'var(--font-serif)', fontSize: 13.5, color: 'var(--op-ink-2)', lineHeight: 1.55, paddingLeft: 20, margin: 0 }}>
          <li>Two independent sources before any restricted-vault file leaves the desk.</li>
          <li>No rebuttal cites a confidential source by name; cite the public corroborator.</li>
          <li>Single-source tips are quarantined until a B-grade or better corroborator is found.</li>
          <li>Spike a thread rather than ship a weak rebuttal — trust compounds, hot takes don’t.</li>
          <li>If the target self-contradicts on record, lead with their own footage; commentary is filler.</li>
        </ul>
      </div>
    </div>
  );
}

export { OpLeads, OpRebuttals, OpMonitors, OpSources };
