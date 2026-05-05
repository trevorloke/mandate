import React from 'react';
import './opp.css';
import { OP_TARGETS as OP_TARGETS_FB, OP_CLAIMS as OP_CLAIMS_FB, OP_EVIDENCE as OP_EVIDENCE_FB, OP_LEADS, OP_REBUTTALS, OP_MONITORS } from './opp-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { OpLeads, OpRebuttals, OpMonitors, OpSources } from './opp-tabs';

// Opposition 2.0 — shell + Targets / Claims / Evidence

const { useState: opUS, useMemo: opUM } = React;

const OP_TABS = [
  { k: 'targets',  label: 'Targets' },
  { k: 'claims',   label: 'Claim Ledger' },
  { k: 'evidence', label: 'Evidence Vault' },
  { k: 'leads',    label: 'Leads Queue' },
  { k: 'rebuttals',label: 'Rebuttals' },
  { k: 'monitors', label: 'Monitors' },
  { k: 'sources',  label: 'Sources' },
];

function Opposition2() {
  const [tab, setTab] = opUS('targets');
  const { records: OP_TARGETS, isEmpty: noTargets } = useLiveRecords('opposition', 'target', OP_TARGETS_FB);
  const { records: OP_CLAIMS, isEmpty: noClaims } = useLiveRecords('opposition', 'claim', OP_CLAIMS_FB);
  const { records: OP_EVIDENCE } = useLiveRecords('opposition', 'evidence', OP_EVIDENCE_FB);
  if (noTargets && noClaims) return <EmptyModule module="OPPOSITION" label="Opposition" accent="var(--m-opp)" />;

  const liveSpikes  = OP_MONITORS.filter(m => m.spike).length;
  const openLeads   = OP_LEADS.filter(l => l.status !== 'cold' && l.status !== 'evidence-secured').length;
  const inReview    = OP_REBUTTALS.filter(r => r.status === 'in-review' || r.status === 'drafted').length;
  const newClaims   = OP_CLAIMS.filter(c => !c.rebuttalId || OP_REBUTTALS.find(r=>r.id===c.rebuttalId)?.status === 'drafted').length;
  const tabBadges = {
    targets:   String(OP_TARGETS.filter(t=>t.dossierStatus==='live').length),
    claims:    String(OP_CLAIMS.length),
    evidence:  String(OP_EVIDENCE.length),
    leads:     String(openLeads),
    rebuttals: String(inReview),
    monitors:  liveSpikes ? `${liveSpikes} spike` : '—',
  };

  return (
    <div className="op2" data-screen-label="10 Opposition · Dossier Desk">
      {/* ─── Masthead ─── */}
      <div className="op2__head">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span className="op2__stamp">Restricted</span>
            <div>
              <div className="op2__masthead">Opposition Desk</div>
              <div className="op2__masthead-sub">Dossier #042 · 11 ridings · class III</div>
            </div>
          </div>
        </div>

        <div /> {/* spacer */}

        <div className="op2__metrics">
          <div className="op2__metric">
            <span className="op2__metric-v">{OP_TARGETS.length}</span>
            <span className="op2__metric-k">targets</span>
          </div>
          <div className="op2__metric">
            <span className="op2__metric-v">{OP_CLAIMS.length}</span>
            <span className="op2__metric-k">claims tracked</span>
          </div>
          <div className="op2__metric">
            <span className="op2__metric-v go">{OP_EVIDENCE.filter(e=>e.strength==='A').length}</span>
            <span className="op2__metric-k">A-grade ev.</span>
          </div>
          <div className="op2__metric">
            <span className="op2__metric-v warn">{openLeads}</span>
            <span className="op2__metric-k">open leads</span>
          </div>
          <div className="op2__metric">
            <span className="op2__metric-v">{OP_REBUTTALS.filter(r=>r.status==='published').length}</span>
            <span className="op2__metric-k">rebuttals out</span>
          </div>
        </div>

        {liveSpikes > 0 && (
          <div className="op2__alert">{liveSpikes} live · 3 new claims · QP clip</div>
        )}
      </div>

      {/* ─── Tabs ─── */}
      <div className="op2__tabs">
        {OP_TABS.map(t => (
          <button key={t.k}
                  className={'op2__tab' + (tab===t.k ? ' is-on' : '')}
                  onClick={() => setTab(t.k)}>
            {t.label}
            {tabBadges[t.k] && (
              <span className={'op2__tab-badge' + (t.k === 'monitors' && liveSpikes ? ' alert' : '')}>
                {tabBadges[t.k]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ─── Body ─── */}
      <div className="op2__body">
        {tab === 'targets'   && <OpTargets />}
        {tab === 'claims'    && <OpClaims />}
        {tab === 'evidence'  && <OpEvidence />}
        {tab === 'leads'     && <OpLeads />}
        {tab === 'rebuttals' && <OpRebuttals />}
        {tab === 'monitors'  && <OpMonitors />}
        {tab === 'sources'   && <OpSources />}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// TARGETS — dossier card grid
// ════════════════════════════════════════════════════════════
function OpTargets() {
  const { records: OP_TARGETS } = useLiveRecords('opposition', 'target', OP_TARGETS_FB);
  const sorted = [...OP_TARGETS].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.threat] - order[b.threat];
  });
  return (
    <div>
      <div className="op2__filters">
        <span className="op2__filters-label">SORTED BY THREAT · DESC</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)', letterSpacing: '0.06em' }}>
          {sorted.filter(t => t.dossierStatus === 'live').length} live · {sorted.filter(t => t.dossierStatus === 'monitoring').length} monitoring
        </span>
      </div>

      <div className="op2__targets">
        {sorted.map(t => (
          <div key={t.id} className={'op2__target ' + t.threat}>
            <div className="op2__target-photo">{t.photo}</div>
            <div>
              <div className="op2__target-name">{t.name}</div>
              <div className="op2__target-role">{t.role} · {t.party} · {t.riding}</div>
              <div className="op2__target-note">{t.note}</div>
            </div>
            <div className="op2__target-stats">
              <span className="op2__threat" style={{ display: 'inline-block', marginBottom: 8 }}>
                <span className={'op2__threat ' + t.threat}>{t.threat}</span>
              </span>
              <div className="op2__target-stats-row">
                <span className="op2__target-stats-v">{t.evidenceCount}</span>
                <span>evidence</span>
              </div>
              <div className="op2__target-stats-row">
                <span className="op2__target-stats-v">{t.claimsTracked}</span>
                <span>claims</span>
              </div>
              <div className="op2__target-stats-row">
                <span className="op2__target-stats-v" style={{ color: t.openLeads > 0 ? 'var(--op-flag)' : 'var(--op-ink-3)' }}>{t.openLeads}</span>
                <span>open leads</span>
              </div>
            </div>

            <div className="op2__target-tags">
              {t.weaknesses.map((w, i) => <span key={i} className="op2__weakness">⚠ {w}</span>)}
              {t.strengths.slice(0, 2).map((s, i) => <span key={i} className="op2__strength">◆ {s}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CLAIMS — claim ledger
// ════════════════════════════════════════════════════════════
function OpClaims() {
  const { records: OP_TARGETS } = useLiveRecords('opposition', 'target', OP_TARGETS_FB);
  const { records: OP_CLAIMS } = useLiveRecords('opposition', 'claim', OP_CLAIMS_FB);
  const [vfilter, setVfilter] = opUS('all');
  const [tfilter, setTfilter] = opUS('all');

  const verdictOptions = ['all', 'false', 'misleading', 'contradicted-self', 'contradicted-record', 'true · damaging', 'arguable'];

  const rows = OP_CLAIMS.filter(c => {
    if (vfilter !== 'all' && c.verdict !== vfilter) return false;
    if (tfilter !== 'all' && c.target !== tfilter) return false;
    return true;
  }).sort((a, b) => b.heat - a.heat);

  return (
    <div>
      <div className="op2__filters">
        <span className="op2__filters-label">VERDICT</span>
        {verdictOptions.map(v => (
          <button key={v} className={'op2__filter' + (vfilter===v ? ' is-on' : '')} onClick={() => setVfilter(v)}>
            {v.replace(/-/g, ' ')}
          </button>
        ))}
        <span className="op2__filters-label" style={{ marginLeft: 18 }}>TARGET</span>
        <button className={'op2__filter' + (tfilter==='all' ? ' is-on' : '')} onClick={() => setTfilter('all')}>all</button>
        {OP_TARGETS.filter(t => t.dossierStatus === 'live').map(t => (
          <button key={t.id} className={'op2__filter' + (tfilter===t.id ? ' is-on' : '')} onClick={() => setTfilter(t.id)}>
            {t.name.split(' ').pop()}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)', letterSpacing: '0.06em' }}>
          {rows.length} of {OP_CLAIMS.length} · sorted by heat
        </span>
      </div>

      <div>
        {rows.map((c, i) => {
          const target = OP_TARGETS.find(t => t.id === c.target);
          const evs = c.evidenceIds.map(id => OP_EVIDENCE.find(e => e.id === id)).filter(Boolean);
          const reb = OP_REBUTTALS.find(r => r.id === c.rebuttalId);
          const verdictKey = c.verdict.replace(/[\s·]+/g, '-').replace(/--+/g, '-');
          return (
            <div key={c.id} className="op2__claim">
              <div className="op2__claim-num">
                #{String(i+1).padStart(3, '0')}
                <div style={{ marginTop: 6, color: 'var(--op-ink-3)' }}>
                  {c.date.slice(5)}
                </div>
              </div>
              <div>
                <div className="op2__claim-meta-top">
                  <span className="target">▸ {target?.name || c.target}</span>
                  <span>{c.venue}</span>
                  <span>· {c.channel}</span>
                  {c.clipMin && <span>· clip {c.clipMin}</span>}
                </div>
                <div className="op2__claim-quote">{c.quote}</div>
                <div className="op2__claim-foot">
                  <span>topic · <b style={{ color: 'var(--op-ink-2)' }}>{c.topic}</b></span>
                  <span>visibility · {c.visibility}</span>
                  <span>evidence · {evs.map((e, i) => (
                    <span key={e.id} className="ev-link">{e.id}{i < evs.length - 1 ? ', ' : ''}</span>
                  ))}</span>
                  {reb && <span>rebuttal · <b style={{ color: reb.status==='published' ? 'var(--op-go)' : 'var(--op-warn)' }}>{reb.status}</b></span>}
                  {!reb && <span style={{ color: 'var(--op-ink-3)' }}>· no rebuttal yet</span>}
                </div>
              </div>
              <div className="op2__claim-side">
                <span className={'op2__verdict ' + verdictKey}>{c.verdict}</span>
                <div className="op2__heat">
                  <span>HEAT</span>
                  <div className="op2__heat-bar"><span style={{ width: (c.heat*100) + '%' }} /></div>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(c.heat*100)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// EVIDENCE VAULT — manila card grid
// ════════════════════════════════════════════════════════════
function OpEvidence() {
  const { records: OP_EVIDENCE } = useLiveRecords('opposition', 'evidence', OP_EVIDENCE_FB);
  const [kfilter, setKfilter] = opUS('all');
  const [vfilter, setVfilter] = opUS('all');

  const kinds = ['all', ...new Set(OP_EVIDENCE.map(e => e.kind))];
  const vaults = ['all', 'public', 'foi-cleared', 'restricted'];

  const rows = OP_EVIDENCE.filter(e => {
    if (kfilter !== 'all' && e.kind !== kfilter) return false;
    if (vfilter !== 'all' && e.vault !== vfilter) return false;
    return true;
  });

  return (
    <div>
      <div className="op2__filters">
        <span className="op2__filters-label">TYPE</span>
        {kinds.map(k => (
          <button key={k} className={'op2__filter' + (kfilter===k ? ' is-on' : '')} onClick={() => setKfilter(k)}>{k}</button>
        ))}
        <span className="op2__filters-label" style={{ marginLeft: 18 }}>VAULT</span>
        {vaults.map(v => (
          <button key={v} className={'op2__filter' + (vfilter===v ? ' is-on' : '')} onClick={() => setVfilter(v)}>{v.replace('-',' ')}</button>
        ))}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--op-ink-3)' }}>
          {rows.length}/{OP_EVIDENCE.length} files · {OP_EVIDENCE.filter(e => e.vault === 'restricted').length} restricted
        </span>
      </div>

      <div className="op2__vault-grid">
        {rows.map(e => (
          <div key={e.id} className="op2__ev">
            <div className="op2__ev-head">
              <span>{e.id} · {e.kind} · {e.vault}</span>
              <span className={'op2__ev-strength ' + e.strength.replace('+','\\+')}>{e.strength}</span>
            </div>
            <div className="op2__ev-title">
              {e.vault === 'restricted'
                ? <RedactedTitle title={e.title} />
                : e.title}
            </div>
            <div className="op2__ev-summary">
              {e.vault === 'restricted'
                ? <RedactedTitle title={e.summary} />
                : e.summary}
            </div>
            <div className="op2__ev-source">
              {e.source.toUpperCase()} · {e.date.slice(0,10)} · linked to {e.linked.length} claim{e.linked.length===1?'':'s'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RedactedTitle({ title }) {
  // Replace ~25% of words with redaction bars to evoke classified docs
  const words = title.split(' ');
  return (
    <span>
      {words.map((w, i) => {
        // Redact specific words consistently per word length
        if (i % 4 === 1 && w.length > 3) {
          return <span key={i} className="op2__ev-redact" style={{ width: (w.length * 6) + 'px' }} />;
        }
        return <span key={i}>{w} </span>;
      })}
    </span>
  );
}

export { Opposition2, OpTargets, OpClaims, OpEvidence, RedactedTitle };
