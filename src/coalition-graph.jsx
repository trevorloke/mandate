import React from 'react';
import './coalition-graph.css';
import { COA_GRAPH, COA_LEDGER as COA_LEDGER_FB } from './coalition-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Mandate 2.0 — Coalition · GRAPH tab
// Force graph of relationships — candidate, orgs, people, opposition

const { useState: cgUS, useMemo: cgUM } = React;

const NODE_STYLES = {
  cand:           { fill:'#2a4d35', stroke:'#1a3a25', text:'#fff',     fontWeight:600 },
  'org-public':   { fill:'#d6e3da', stroke:'#2a4d35', text:'#1a3a25', fontWeight:600 },
  'org-committed':{ fill:'#e0e8d8', stroke:'#6b8b73', text:'#3d6248', fontWeight:500 },
  'org-warm':     { fill:'#f0e0cc', stroke:'#c5874f', text:'#8a5a30', fontWeight:500 },
  'org-prospect': { fill:'#d8e2e8', stroke:'#5a7a8a', text:'#3a5260', fontWeight:500 },
  'org-hostile':  { fill:'#f0d6d2', stroke:'#b94a3a', text:'#7a2a1f', fontWeight:600 },
  person:         { fill:'#fcfaf2', stroke:'#56655a', text:'#3a4a3e', fontWeight:500 },
  opp:            { fill:'#7a2a1f', stroke:'#5a1a10', text:'#fff',     fontWeight:600 },
};

const EDGE_STYLES = {
  strong:    { stroke:'#2a4d35', width:2.2,  dash:null,    opacity:0.9 },
  med:       { stroke:'#6b8b73', width:1.6,  dash:null,    opacity:0.8 },
  weak:      { stroke:'#9aaa9e', width:1.2,  dash:null,    opacity:0.7 },
  prospect:  { stroke:'#7a8a98', width:1.0,  dash:'3 3',   opacity:0.6 },
  hostile:   { stroke:'#b94a3a', width:1.8,  dash:null,    opacity:0.85 },
  contested: { stroke:'#c5874f', width:1.6,  dash:'4 3',   opacity:0.85 },
  affil:     { stroke:'#c4cfb3', width:1.0,  dash:'2 4',   opacity:0.55 },
  contact:   { stroke:'#b8c0aa', width:0.8,  dash:'1 3',   opacity:0.5 },
  self:      { stroke:'#56655a', width:0.8,  dash:'1 3',   opacity:0.4 },
  owns:      { stroke:'#56655a', width:0.6,  dash:'1 3',   opacity:0.4 },
  warm:      { stroke:'#c5874f', width:1.2,  dash:'2 3',   opacity:0.7 },
};

const FILTER_DEFS = [
  { k:'all',       label:'ALL',         hint:'show full graph' },
  { k:'public',    label:'PUBLIC',      hint:'committed + visible' },
  { k:'targets',   label:'TARGETS',     hint:'warm + prospect' },
  { k:'affil',     label:'AFFILIATIONS',hint:'inter-org links' },
  { k:'people',    label:'PEOPLE',      hint:'champions + contacts' },
  { k:'risk',      label:'RISK',        hint:'hostile + contested' },
];

const CoaGraph = () => {
  const { records: COA_LEDGER } = useLiveRecords('coalition', 'endorsement', COA_LEDGER_FB);
  const [filter, setFilter] = cgUS('all');
  const [hover, setHover] = cgUS(null);
  const [selected, setSelected] = cgUS('bcfl');

  const { nodes, edges } = COA_GRAPH;

  const visibleNodes = cgUM(() => {
    if (filter === 'all') return new Set(nodes.map(n => n.id));
    const s = new Set(['cand']);
    nodes.forEach(n => {
      if (filter === 'public'   && (n.kind === 'org-public' || n.kind === 'org-committed')) s.add(n.id);
      if (filter === 'targets'  && (n.kind === 'org-warm' || n.kind === 'org-prospect'))    s.add(n.id);
      if (filter === 'affil'    && (n.kind.startsWith('org-')))                              s.add(n.id);
      if (filter === 'people'   && (n.kind === 'person' || n.kind === 'cand' || n.kind === 'org-public')) s.add(n.id);
      if (filter === 'risk'     && (n.kind === 'org-hostile' || n.kind === 'opp' || n.id === 'bec')) s.add(n.id);
    });
    return s;
  }, [filter]);

  const visibleEdges = cgUM(() => {
    return edges.filter(([a,b,kind]) => {
      if (!visibleNodes.has(a) || !visibleNodes.has(b)) return false;
      if (filter === 'affil' && kind !== 'affil') return false;
      if (filter === 'people' && !['contact','self','owns','warm','strong'].includes(kind)) return false;
      if (filter === 'risk' && !['hostile','contested'].includes(kind)) return false;
      return true;
    });
  }, [filter, visibleNodes]);

  const nodeMap = cgUM(() => Object.fromEntries(nodes.map(n => [n.id, n])), []);

  const sel = nodes.find(n => n.id === selected);
  const ledger = sel ? COA_LEDGER.find(r => r.slug === sel.id || r.id === sel.id) : null;

  // Connected nodes for highlight
  const connected = cgUM(() => {
    if (!hover) return new Set();
    const c = new Set([hover]);
    edges.forEach(([a,b]) => {
      if (a === hover) c.add(b);
      if (b === hover) c.add(a);
    });
    return c;
  }, [hover]);

  return (
    <div className="cg">
      <div className="cg__head">
        <div>
          <div className="cg__eyebrow">Coalition · relationship graph</div>
          <h2>The web <em>— who orbits whom</em></h2>
        </div>
        <div className="cg__legend">
          {Object.entries({
            'cand':'Candidate', 'org-public':'Public', 'org-committed':'Committed',
            'org-warm':'Warm', 'org-prospect':'Prospect', 'org-hostile':'Hostile',
            'person':'Person', 'opp':'Opposition'
          }).map(([k, lbl]) => (
            <span key={k} className="cg__leg">
              <i className="cg__leg-dot" style={{ background: NODE_STYLES[k].fill, borderColor: NODE_STYLES[k].stroke }} />
              {lbl}
            </span>
          ))}
        </div>
      </div>

      <div className="cg__bar">
        <div className="cg__filters">
          {FILTER_DEFS.map(f => (
            <button key={f.k} className={`cg__filter ${filter === f.k ? 'on' : ''}`} onClick={() => setFilter(f.k)}>
              <span>{f.label}</span>
              <em>{f.hint}</em>
            </button>
          ))}
        </div>
        <div className="cg__bar-meta">
          <span>{visibleNodes.size} nodes · {visibleEdges.length} ties</span>
          <span className="cg__sep">·</span>
          <span>hover any node to trace</span>
        </div>
      </div>

      <div className="cg__layout">
        <div className="cg__canvas">
          <svg viewBox="0 0 1000 580" preserveAspectRatio="xMidYMid meet" className="cg__svg">
            {/* Concentric rings */}
            <g className="cg__rings" opacity="0.35">
              {[80, 160, 240, 320].map((r, i) => (
                <circle key={i} cx="500" cy="280" r={r} fill="none" stroke="#c4cfb3" strokeDasharray="2 6" strokeWidth="0.6" />
              ))}
            </g>

            {/* Edges */}
            <g className="cg__edges">
              {visibleEdges.map(([a, b, kind], i) => {
                const A = nodeMap[a], B = nodeMap[b];
                if (!A || !B) return null;
                const st = EDGE_STYLES[kind] || EDGE_STYLES.weak;
                const isHi = hover && (a === hover || b === hover);
                return (
                  <line key={i}
                    x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                    stroke={st.stroke}
                    strokeWidth={isHi ? st.width + 0.8 : st.width}
                    strokeDasharray={st.dash || undefined}
                    opacity={hover ? (isHi ? 1 : 0.15) : st.opacity}
                  />
                );
              })}
            </g>

            {/* Nodes */}
            <g className="cg__nodes">
              {nodes.filter(n => visibleNodes.has(n.id)).map(n => {
                const s = NODE_STYLES[n.kind] || NODE_STYLES['org-public'];
                const isSel = selected === n.id;
                const isHov = hover === n.id;
                const dimmed = hover && !connected.has(n.id);
                return (
                  <g key={n.id}
                    transform={`translate(${n.x} ${n.y})`}
                    className="cg__node"
                    style={{ cursor:'pointer', opacity: dimmed ? 0.25 : 1 }}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSelected(n.id)}
                  >
                    {isSel && (
                      <circle r={n.r + 6} fill="none" stroke="#2a4d35" strokeWidth="1.2" strokeDasharray="2 2" />
                    )}
                    <circle
                      r={n.r}
                      fill={s.fill}
                      stroke={s.stroke}
                      strokeWidth={isHov || isSel ? 2 : 1.2}
                    />
                    {n.kind === 'cand' && (
                      <text y="3" textAnchor="middle"
                        fontFamily="var(--font-mono)" fontSize="8" fill={s.text}
                        fontWeight={s.fontWeight} letterSpacing="0.06em">
                        YOU
                      </text>
                    )}
                    {n.kind === 'opp' && (
                      <text y="3" textAnchor="middle"
                        fontFamily="var(--font-mono)" fontSize="8" fill={s.text}
                        fontWeight={s.fontWeight} letterSpacing="0.06em">
                        OPP
                      </text>
                    )}
                    <text
                      y={n.r + 11}
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                      fontSize={n.kind === 'cand' ? 11 : 9.5}
                      fill={n.kind === 'person' ? '#56655a' : '#1a2a1e'}
                      fontWeight={s.fontWeight}
                      letterSpacing="0.02em"
                      style={{ pointerEvents: 'none' }}
                    >
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating annotations are populated from live coalition records when present. */}
          <div className="cg__ann cg__ann--br">
            <div className="cg__ann-eyebrow">CLUSTERS</div>
            <div>Labour federation · 7 nodes, all linked through BCFL</div>
          </div>
        </div>

        {/* Detail rail */}
        <div className="cg__detail">
          {sel ? (
            <>
              <div className={`cg__d-head cg__d-head--${sel.kind}`}>
                <div className="cg__d-eyebrow">
                  {sel.kind === 'cand' ? 'CANDIDATE' :
                   sel.kind === 'opp' ? 'OPPOSITION' :
                   sel.kind === 'person' ? 'PERSON' :
                   sel.kind.replace('org-','').toUpperCase()}
                </div>
                <h3>{sel.label}</h3>
                {ledger && <div className="cg__d-sector">{ledger.sector}</div>}
              </div>

              {ledger ? (
                <>
                  <div className="cg__d-stats">
                    <div><span>MEMBERS</span><b>{ledger.members > 0 ? ledger.members.toLocaleString() : '—'}</b></div>
                    <div><span>REACH</span><b>{ledger.reach.toLocaleString()}</b></div>
                    <div><span>$ COMMIT</span><b>${ledger.money.toLocaleString()}</b></div>
                    <div><span>CHAMPION</span><b>{ledger.champion}</b></div>
                  </div>
                  <div className="cg__d-section">
                    <div className="cg__d-h">STRATEGY</div>
                    <p>{ledger.strategy}</p>
                  </div>
                  {ledger.note && (
                    <div className="cg__d-section">
                      <div className="cg__d-h">NOTE</div>
                      <p>{ledger.note}</p>
                    </div>
                  )}
                </>
              ) : sel.kind === 'cand' ? (
                <div className="cg__d-section">
                  <div className="cg__d-h">CENTER OF GRAPH</div>
                  <p>You. <b>22</b> orgs in the network · <b>14</b> committed · <b>9</b> public · 4 of 5 strongest ties run through labour federation.</p>
                </div>
              ) : sel.kind === 'opp' ? (
                <div className="cg__d-section">
                  <div className="cg__d-h">OPPOSITION CLUSTER</div>
                </div>
              ) : sel.kind === 'person' ? (
                <div className="cg__d-section">
                  <div className="cg__d-h">PERSON</div>
                  <p>{sel.label.includes('us') ? 'Coalition team member' : 'Org contact / champion'}.</p>
                </div>
              ) : null}

              <div className="cg__d-actions">
                <button>Open file</button>
                <button>Trace path</button>
                <button>+ Ask</button>
              </div>
            </>
          ) : (
            <div className="cg__d-empty">Click any node to inspect.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export { CoaGraph };