import React from 'react';
import './ground.css';
import { GROUND_VOCAB, UNIVERSE_DEFAULT, PDS, RIVER, LANDMARKS, VOTERS, CANVASSERS, SHIFTS, SCRIPTS, MODES } from './ground-data';
import { useLiveRecords } from './auth/useLiveRecords';
import { useAuth } from './auth/AuthContext';
import EmptyModule from './EmptyModule';

// Mandate 2.0 — Ground module (Desk + Field tabs)

const { useState: gUS, useEffect: gUE, useRef: gUR, useMemo: gUM } = React;

// ── Universe sentence — editable pills
function UniverseSentence({ cuts, onChange, count }) {
  const [popAt, setPopAt] = gUS(null); // {idx, key, rect}

  const openPop = (i, key, e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPopAt({ idx: i, key, x: r.left, y: r.bottom + 4 });
  };
  const pickValue = (val) => {
    const nx = cuts.slice();
    nx[popAt.idx] = { ...nx[popAt.idx], val };
    onChange(nx);
    setPopAt(null);
  };
  const removeCut = (i) => onChange(cuts.filter((_,j) => j !== i));

  const addable = Object.keys(GROUND_VOCAB.filters).filter(k => !cuts.find(c => c.key === k));

  return (
    <div className="universe" onClick={() => setPopAt(null)}>
      <span className="universe__eyebrow">Universe</span>
      <div className="universe__sentence">
        <span className="universe__word">Voters in </span>
        {cuts.map((c, i) => {
          const spec = GROUND_VOCAB.filters[c.key];
          return (
            <React.Fragment key={c.key}>
              {i > 0 && i === 1 && <span className="universe__word"> who are </span>}
              {i > 0 && i === 2 && <span className="universe__word"> with </span>}
              {i > 0 && i >= 3 && <span className="universe__word"> and </span>}
              <span
                className="universe__pill"
                onClick={(e) => { e.stopPropagation(); openPop(i, c.key, e); }}
              >
                <span style={{ opacity: 0.65, fontSize: 11, marginRight: 3, letterSpacing: '0.04em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  {spec.label}:
                </span>
                {c.val}
                <span className="universe__pill-x" onClick={(e) => { e.stopPropagation(); removeCut(i); }}>✕</span>
              </span>
            </React.Fragment>
          );
        })}
        {addable.length > 0 && (
          <>
            <span className="universe__word"> </span>
            <span
              className="universe__pill universe__pill--add"
              onClick={(e) => { e.stopPropagation(); openPop(cuts.length, '__add', e); }}
            >
              + add cut
            </span>
          </>
        )}
      </div>
      <div className="universe__count">
        <span className="n">{count.toLocaleString()}</span>
        <span className="universe__count-lbl">voters</span>
      </div>

      {popAt && (
        <div className="pill-pop" style={{ left: popAt.x, top: popAt.y }} onClick={(e) => e.stopPropagation()}>
          {popAt.key === '__add'
            ? addable.map(k => (
                <div key={k} className="pill-pop__opt" onClick={() => { onChange([...cuts, { key: k, val: GROUND_VOCAB.filters[k].options[0] }]); setPopAt(null); }}>
                  <span>{GROUND_VOCAB.filters[k].label}</span>
                  <span style={{ color:'var(--text-3)', fontSize:10, fontFamily:'var(--font-mono)' }}>+</span>
                </div>
              ))
            : GROUND_VOCAB.filters[popAt.key].options.map(opt => (
                <div
                  key={opt}
                  className={'pill-pop__opt' + (cuts[popAt.idx]?.val === opt ? ' pill-pop__opt--selected' : '')}
                  onClick={() => pickValue(opt)}
                >
                  {opt}
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
}

// ── Map
function GroundMap({ activePd, onPickPd, shade }) {
  const { records: pds } = useLiveRecords('ground', 'pd', PDS);
  const { records: canvassers } = useLiveRecords('ground', 'canvasser', CANVASSERS);
  const shadeFor = (pd) => {
    if (shade === 'support') {
      const t = pd.support;
      // interpolate between ink (low) and g-accent (high) — simpler: use opacity
      const o = 0.15 + t * 0.75;
      return `rgba(30, 58, 95, ${o})`;
    }
    if (shade === 'turnout') {
      const o = 0.15 + pd.turnout * 0.75;
      return `rgba(138, 98, 6, ${o})`;
    }
    if (shade === 'progress') {
      const t = pd.knocked / pd.doors;
      const o = 0.15 + t * 0.75;
      return `rgba(46, 107, 62, ${o})`;
    }
    return 'rgba(200, 190, 168, 0.5)';
  };

  return (
    <svg className="map__svg" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid meet">
      <defs>
        <pattern id="paper-grain" x="0" y="0" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="#f4ecd8"/>
          <circle cx="1" cy="1" r="0.3" fill="#d8ccae" opacity="0.4"/>
          <circle cx="3" cy="3" r="0.3" fill="#d8ccae" opacity="0.4"/>
        </pattern>
      </defs>
      <rect width="1200" height="800" fill="url(#paper-grain)"/>

      {/* River */}
      <path d={RIVER} fill="none" stroke="#9fb8cc" strokeWidth="10" opacity="0.6"/>
      <path d={RIVER} fill="none" stroke="#c2d5e2" strokeWidth="4" opacity="0.7"/>

      {/* PD polygons */}
      {pds.map(pd => (
        <polygon
          key={pd.id}
          className={`pd-poly ${activePd === pd.id ? 'pd-poly--active' : ''} ${pd.target ? 'pd-poly--target' : ''}`}
          points={pd.points}
          style={{ '--pd-fill': shadeFor(pd) }}
          onClick={() => onPickPd(pd.id)}
        />
      ))}

      {/* PD labels — only target PDs (set pd.target on the record) */}
      {pds.filter(pd => pd.target).map(pd => {
        // centroid-ish
        const pts = pd.points.split(' ').map(p => p.split(',').map(Number));
        const cx = pts.reduce((a,p) => a+p[0], 0) / pts.length;
        const cy = pts.reduce((a,p) => a+p[1], 0) / pts.length;
        return (
          <g key={pd.id + '-l'} transform={`translate(${cx}, ${cy})`}>
            <text textAnchor="middle" fontFamily="Fraunces, serif" fontStyle="italic" fontSize="12" fill="#1a1814" opacity="0.85">{pd.name}</text>
            <text textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#1a1814" opacity="0.5" dy="14" letterSpacing="0.1em">{pd.id}</text>
          </g>
        );
      })}

      {/* Landmarks */}
      {LANDMARKS.map((l, i) => (
        <g key={i} transform={`translate(${l.x}, ${l.y})`}>
          {l.k === 'rally' && (
            <g>
              <circle r="6" fill="#b8334a" stroke="#1a1814" strokeWidth="0.8"/>
              <path d="M 0 -6 L 0 -22 Q -4 -26 0 -30 Q 4 -26 0 -22" fill="#b8334a" stroke="#1a1814" strokeWidth="0.6"/>
            </g>
          )}
          {l.k === 'park' && <circle r="18" fill="#c6d4a8" stroke="#5a7040" strokeWidth="0.6" opacity="0.8"/>}
          {l.k === 'station' && <rect x="-6" y="-6" width="12" height="12" fill="#1a1814" transform="rotate(45)"/>}
          {l.k === 'office' && (
            <g>
              <rect x="-8" y="-10" width="16" height="14" fill="#f4c65a" stroke="#1a1814" strokeWidth="0.8"/>
              <path d="M -10 -10 L 0 -18 L 10 -10 Z" fill="#b8334a" stroke="#1a1814" strokeWidth="0.8"/>
            </g>
          )}
          {l.k === 'school' && <path d="M 0 -10 L 10 -2 L 10 8 L -10 8 L -10 -2 Z" fill="#c9bfa8" stroke="#1a1814" strokeWidth="0.6"/>}
          <text x="0" y="20" textAnchor="middle" fontSize="9.5" fontFamily="Fraunces, serif" fontStyle="italic" fill="#1a1814">{l.name}</text>
        </g>
      ))}

      {/* Canvassers live */}
      {canvassers.map(c => (
        <g key={c.id} transform={`translate(${c.x}, ${c.y})`}>
          {c.status === 'knocking' && <circle className="ripple" cx="0" cy="0" r="3"/>}
          <circle
            className={`canvasser-dot ${c.status === 'done' ? 'canvasser-dot--done' : ''} ${c.status === 'refused' ? 'canvasser-dot--refused' : ''} ${c.status === 'on-break' ? 'canvasser-dot--break' : ''}`}
            cx="0" cy="0" r="5"
          />
        </g>
      ))}

      {/* Riding outline ornament */}
      <text x="60" y="30" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="0.2em" fill="#1a1814" opacity="0.5">
        MERIDIAN WEST · 24 POLLING DISTRICTS
      </text>
    </svg>
  );
}

// ── Voter list row + dossier
function VoterRow({ v, open, onToggle, onSelect, selected }) {
  return (
    <>
      <div className={'vrow ' + (open ? 'vrow--open' : '')} onClick={onToggle}>
        <div className={'vrow__check ' + (selected ? 'vrow__check--on' : '')} onClick={(e) => { e.stopPropagation(); onSelect(); }}/>
        <div className="vrow__name">
          {v.first} {v.last} <span className="meta">{v.age} · {v.tenure}</span>
        </div>
        <div className="vrow__addr">{v.addr}</div>
        <div className="vrow__supp">
          {v.support.toFixed(2)}
          <span className="vrow__supp-bar"><span className="fill" style={{ width: `${v.support*100}%` }}/></span>
        </div>
        <div className="vrow__bal">{v.ballots}</div>
        <div className="vrow__last">{v.lastContact}</div>
      </div>
      {open && (
        <div className="dossier">
          <div>
            <div className="dossier__col-title">Dossier</div>
            <div className="dossier__name">{v.first} {v.last}</div>
            <div className="dossier__sub">{v.age} · {v.tenure} · {v.addr}</div>
            <div className="dossier__facts">
              <div><b>Support</b> {v.support.toFixed(2)}</div>
              <div><b>Primary issue</b> {v.issue}</div>
              <div><b>Language</b> {v.lang}</div>
              <div><b>Household</b> {v.household}</div>
              <div><b>PD</b> {v.pd}</div>
              <div><b>Tags</b> {v.tags.length ? v.tags.join(', ') : '—'}</div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="dossier__col-title">Ballot History</div>
              <div className="dossier__ballots">
                {[2014,2016,2018,2020,2022,2024].map((y, i) => {
                  const voted = i < parseInt(v.ballots.split('/')[0], 10);
                  return (
                    <div key={y} className={'dossier__ballot ' + (voted ? 'dossier__ballot--voted' : '')}>
                      {String(y).slice(2)}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="dossier__col-title">Contact Log</div>
            <ul className="dossier__log">
              <li style={{ fontStyle: 'italic', color: 'var(--text-3)' }}>No contacts logged yet.</li>
            </ul>

            <div className="dossier__actions">
              <button className="dossier__btn">Queue for tonight</button>
              <button className="dossier__btn dossier__btn--ghost">Open script</button>
              <button className="dossier__btn dossier__btn--ghost">+ note</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ── Script dock (teleprompter feel)
function ScriptDock({ open, script, onClose }) {
  if (!script) return null;
  return (
    <div className={'script-dock ' + (open ? 'script-dock--open' : '')}>
      <div className="script-dock__hd">
        <div className="script-dock__eyebrow">SCRIPT · {script.mode.toUpperCase()}</div>
        <div className="script-dock__title">{script.title}</div>
        <div className="script-dock__meta">{script.author} · {script.updated}</div>
        <div className="script-dock__close" onClick={onClose}>✕ close</div>
      </div>
      <div className="script-dock__tabs">
        <div className="script-dock__tab script-dock__tab--active">Script</div>
        <div className="script-dock__tab">Branches</div>
        <div className="script-dock__tab">Capture</div>
        <div className="script-dock__tab">Revisions</div>
      </div>
      <div className="script-body">
        {script.scenes.map((scene, i) => (
          <div key={i} className="script-scene">
            <div className="script-direction">{scene.direction}</div>
            {scene.lines.map((ln, j) => (
              <div key={j} className="script-line">
                <span className={'script-who ' + (ln.who === 'VOTER' ? 'script-who--voter' : ln.who === 'SYSTEM' ? 'script-who--system' : '')}>
                  {ln.who}
                </span>
                {ln.text && <div className="script-text" contentEditable suppressContentEditableWarning>{ln.text}</div>}
                {ln.hint && <div className="script-hint">{ln.hint}</div>}
                {ln.capture && (
                  <div className="script-capture">
                    {ln.capture.map(c => <span key={c} className="script-capture-tag">{c}</span>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="script-dock__foot">
        <div className="script-dock__foot-note">Edits auto-save to revision history</div>
        <button className="dossier__btn">Save v4.3</button>
      </div>
    </div>
  );
}

// ── Field tab — phone frame + context columns
function FieldView({ mode, setMode }) {
  const { records: voters } = useLiveRecords('ground', 'voter', VOTERS);
  const { records: shifts } = useLiveRecords('ground', 'shift', SHIFTS);
  const { records: scripts } = useLiveRecords('ground', 'script', SCRIPTS);
  const [activeSub, setActiveSub] = gUS('door-knock');
  const activeGroup = MODES.find(g => g.sub.some(s => s.k === activeSub));
  const activeSubObj = activeGroup?.sub.find(s => s.k === activeSub);

  const script = scripts.find(s => s.mode === activeSub) || scripts[0];
  const voter = voters[0]; // first voter from live data

  return (
    <div className="field">
      {/* Left: mode picker + script preview context */}
      <div className="field__col">
        <h3>Mode</h3>
        <div className="fmodes">
          {MODES.map(g => (
            <div key={g.k} className="fmode-group">
              <div className="fmode-head">{g.label}</div>
              <div className="fmode-sub">
                {g.sub.map(s => (
                  <button
                    key={s.k}
                    className={'fmode-btn ' + (activeSub === s.k ? 'fmode-btn--active' : '')}
                    onClick={() => setActiveSub(s.k)}
                  >
                    <span className="fmode-btn-lbl">{s.label}</span>
                    <span className="fmode-btn-note">{s.note}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle: phone */}
      <div style={{ display:'grid', justifyItems:'center' }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.2em', color:'var(--text-3)', marginTop: 4 }}>
          CANVASSER HANDSET · LIVE
        </div>
        <div className="field__phone">
          <div className="field__screen">
            <div className="field__status">
              <span>9:41</span>
              <span>•••  ▲  ⬤</span>
            </div>
            <div className="field__hd">
              <div>
                <div className="field__hd-mode">{activeGroup?.label} · {activeSubObj?.label}</div>
                <div className="field__hd-title">{activeSub.startsWith('street') ? 'Trout Lake booth' : 'Universe 31-B'}</div>
              </div>
              <div className="field__hd-count">12 / 20</div>
            </div>
            <div className="field__body">
              {activeSub.startsWith('door') && script && <DoorScreen voter={voter} script={script} mode={activeSub}/>}
              {activeSub.startsWith('phone') && script && <PhoneScreen voter={voter} script={script} mode={activeSub}/>}
              {activeSub.startsWith('text') && <TextScreen mode={activeSub}/>}
              {activeSub.startsWith('street') && <StreetScreen mode={activeSub}/>}
            </div>
            <div className="field__foot">
              {activeSub === 'door-lit'
                ? <>
                    <button className="field__foot-btn field__foot-btn--ok">Dropped</button>
                    <button className="field__foot-btn">Skip</button>
                    <button className="field__foot-btn field__foot-btn--danger">Vacant</button>
                  </>
                : activeSub === 'text-broadcast'
                ? <>
                    <button className="field__foot-btn">Edit list</button>
                    <button className="field__foot-btn field__foot-btn--primary">Send 340</button>
                    <button className="field__foot-btn">Schedule</button>
                  </>
                : activeSub.startsWith('street')
                ? <>
                    <button className="field__foot-btn field__foot-btn--ok">Save contact</button>
                    <button className="field__foot-btn">+ Petition</button>
                    <button className="field__foot-btn">Pass</button>
                  </>
                : <>
                    <button className="field__foot-btn field__foot-btn--primary">Next door →</button>
                    <button className="field__foot-btn">Note</button>
                    <button className="field__foot-btn field__foot-btn--danger">Refused</button>
                  </>
              }
            </div>
          </div>
        </div>
      </div>

      {/* Right: shifts / turf */}
      <div className="field__col">
        <h3>Assigned Shifts</h3>
        {shifts.slice(0, 4).map(s => (
          <div key={s.id} className="shift-card">
            <div className="shift-card__day">{s.day} · {s.pd}</div>
            <div className="shift-card__time">{s.time}</div>
            <div className="shift-card__meta">
              {MODES.flatMap(g => g.sub).find(x => x.k === s.mode)?.label || s.mode}
              {s.venue && <> · {s.venue}</>}
              {s.issue && <> · {s.issue}</>}
            </div>
            <div className="shift-card__fill"><span className="fill" style={{ width: `${s.filled/s.cap*100}%` }}/></div>
            <div className="shift-card__stats">
              <span>{s.filled}/{s.cap} filled</span>
              <span>lead: {s.lead}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Door knock screen
function DoorScreen({ voter, script, mode }) {
  const [support, setSupport] = gUS(null);
  return (
    <>
      <div className="fvoter">
        <div className="fvoter-addr">{voter.addr.toUpperCase()}</div>
        <div className="fvoter-name">{voter.first} {voter.last}</div>
        <div className="fvoter-sub">{voter.age} · {voter.tenure} · ballot {voter.ballots} · issue: {voter.issue}</div>
      </div>
      {mode === 'door-lit' ? (
        <div className="fscript">
          <div className="fscript-dir">Silent drop. Confirm piece placed.</div>
          <div style={{ padding: '14px 0', textAlign: 'center' }}>
            <div style={{ width:120, height:140, margin:'0 auto', background:'#f4c65a', border:'1px solid #1a1814', transform:'rotate(-3deg)', display:'grid', placeItems:'center', fontFamily:'var(--font-display)', fontSize:14, padding:8, lineHeight:1.2, color:'var(--text-3)', fontStyle:'italic' }}>
              Leaflet preview
            </div>
            <div style={{ fontFamily:'var(--font-mono)', fontSize:10, marginTop:10, color:'var(--text-3)', letterSpacing:'0.1em' }}>
              SELECT A SCRIPT
            </div>
          </div>
        </div>
      ) : (
        <div className="fscript">
          {(script?.scenes || []).slice(0, 2).map((sc, i) => (
            <div key={i} style={{ marginBottom: 12 }}>
              <div className="fscript-dir">{sc.direction}</div>
              {sc.lines.map((ln, j) => (
                <div key={j} className="fscript-line">
                  <div className="fscript-who">{ln.who}</div>
                  {ln.text && <div>{ln.text.replace('{{name}}', voter.first || '[name]')}</div>}
                </div>
              ))}
            </div>
          ))}
          {mode === 'door-knock' && (
            <>
              <div className="fscript-who">CAPTURE — Support 1 to 5</div>
              <div className="fsupport">
                {[1,2,3,4,5].map(n => (
                  <div
                    key={n}
                    className={`fsupport-b fsupport-b--${n} ${support === n ? 'fsupport-b--on' : ''}`}
                    onClick={() => setSupport(n)}
                    style={support === n ? { background: '#1a1814', color: '#f4c65a', borderColor:'#1a1814' } : {}}
                  >
                    {n}
                  </div>
                ))}
              </div>
            </>
          )}
          {mode === 'door-petition' && (
            <div style={{ marginTop: 12, padding: 12, background: '#f4c65a', border: '1px solid #1a1814' }}>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.14em' }}>SIGN & SEND</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:18, margin:'4px 0', color:'var(--text-3)', fontStyle:'italic' }}>{script?.petition?.title || 'Petition title'}</div>
              <div style={{ borderBottom:'1px solid #1a1814', paddingBottom:18, marginTop:12, fontFamily:'cursive', fontSize:22, minHeight:32 }}>&nbsp;</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:9, letterSpacing:'0.1em', marginTop:4 }}>SIGNATURE</div>
            </div>
          )}
          {mode === 'door-gotv' && (
            <>
              <div className="fscript-who">GOTV · HAS VOTED?</div>
              <div style={{ display:'flex', gap: 6, marginTop: 8 }}>
                <div className="fsupport-b" style={{background:'rgba(46,107,62,0.2)'}}>Yes, voted</div>
                <div className="fsupport-b">Plans to</div>
                <div className="fsupport-b">Needs ride</div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function PhoneScreen({ voter, script, mode }) {
  return (
    <div>
      <div className="fvoter">
        <div className="fvoter-addr">DIALING{voter.phone ? ' · ' + voter.phone : ''}</div>
        <div className="fvoter-name">{voter.first} {voter.last}</div>
        <div className="fvoter-sub">{voter.age ? voter.age + ' · ' : ''}{voter.tenure || ''}</div>
      </div>
      <div style={{ textAlign:'center', padding:'14px 0' }}>
        <div style={{ width:80, height:80, margin:'0 auto', borderRadius:'50%', background:'#2e6b3e', display:'grid', placeItems:'center', color:'#fff', fontSize:28 }}>📞</div>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:11, marginTop:8, color:'var(--text-2)' }}>ringing</div>
      </div>
      {mode !== 'phone-gotv' && (
        <div className="fscript">
          <div className="fscript-dir">Warm tone. They can hear your smile.</div>
          <div className="fscript-line">
            <div className="fscript-who">CANVASSER</div>
            <div>{script.scenes[0]?.lines[0]?.text?.replace('{{name}}', 'Ben') || 'Opener.'}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function TextScreen({ mode }) {
  return (
    <div>
      <div className="fvoter">
        <div className="fvoter-addr">QUEUE</div>
        <div className="fvoter-name">Select a list</div>
        <div className="fvoter-sub">Choose a text-bank list from the universe sentence above.</div>
      </div>
      <div style={{ marginTop: 12 }}>
        <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.14em', color:'var(--text-3)' }}>MESSAGE</div>
        <div style={{ background:'#e2f0df', padding:12, borderRadius:14, marginTop:6, fontSize:13.5, maxWidth:'85%', color:'var(--text-3)', fontStyle:'italic' }}>
          Hi {'{first}'} — your message body goes here. Reply STOP to opt out.
        </div>
      </div>
      <div style={{ display:'flex', gap:6, marginTop: 14, flexWrap:'wrap' }}>
        {['Warm intro','Issue ask','Rally RSVP','Petition','GOTV'].map(m => (
          <span key={m} style={{ fontFamily:'var(--font-mono)', fontSize:10, padding:'4px 8px', border:'1px solid #1a1814', borderRadius: 2 }}>{m}</span>
        ))}
      </div>
    </div>
  );
}

function StreetScreen({ mode }) {
  return (
    <div>
      <div className="fvoter">
        <div className="fvoter-addr">INBOUND · STREET / EVENT</div>
        <div className="fvoter-name">They came to you</div>
        <div className="fvoter-sub">Inbound contact at a street/event booth</div>
      </div>
      <div className="fscript">
        <div className="fscript-dir">Don't pitch — ask. Let them lead.</div>
        <div className="fscript-line">
          <div className="fscript-who">OPENER</div>
          <div>Hi — what brought you over? Anything on your mind about the riding?</div>
        </div>
      </div>
      <div style={{ display:'grid', gap:8, marginTop:14 }}>
        <input placeholder="Name" style={{ padding:'10px 12px', border:'1px solid #1a1814', background:'#fff', fontSize:14 }}/>
        <input placeholder="Email" style={{ padding:'10px 12px', border:'1px solid #1a1814', background:'#fff', fontSize:14 }}/>
        <input placeholder="Primary issue" style={{ padding:'10px 12px', border:'1px solid #1a1814', background:'#fff', fontSize:14 }}/>
      </div>
    </div>
  );
}

// ── Main Ground page
function Ground() {
  const { workspace } = useAuth();
  const { records: voters, isEmpty: noVoters } = useLiveRecords('ground', 'voter', VOTERS);
  const { records: scripts } = useLiveRecords('ground', 'script', SCRIPTS);
  const { records: canvassersLive } = useLiveRecords('ground', 'canvasser', CANVASSERS);
  const [tab, setTab] = gUS('desk'); // desk | field | script
  const [cuts, setCuts] = gUS(UNIVERSE_DEFAULT);
  const [activePd, setActivePd] = gUS('ALL');
  const [shade, setShade] = gUS('support'); // support | turnout | progress
  const [openVoter, setOpenVoter] = gUS(null);
  const [selected, setSelected] = gUS(new Set());
  const [scriptOpen, setScriptOpen] = gUS(false);
  const [activeScriptId, setActiveScriptId] = gUS(null);
  const [mode, setMode] = gUS('door-knock');
  if (noVoters) return <EmptyModule module="GROUND" label="Ground" accent="var(--m-ground)" />;

  const activeScript = scripts.find(s => s.id === activeScriptId) || scripts[0];

  // Filter voters to active PD for the list
  const filtered = gUM(() => voters.filter(v => v.pd === activePd || activePd === 'ALL').slice(0, 18), [activePd, voters]);
  // Universe count derives from voters matching the active PD (or all voters when ALL).
  const totalInUniverse = activePd === 'ALL' ? voters.length : voters.filter(v => v.pd === activePd).length;
  const liveCanvassers = canvassersLive.filter(c => c.status === 'live').length;
  const wsLabel = workspace?.name || workspace?.candidate || 'Workspace';

  const toggleSel = (id) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div className="ground">
      <div className="ground__tabs">
        <div className={'ground__tab ' + (tab === 'desk' ? 'ground__tab--active' : '')} onClick={() => setTab('desk')}>DESK</div>
        <div className={'ground__tab ' + (tab === 'field' ? 'ground__tab--active' : '')} onClick={() => setTab('field')}>FIELD · CANVASSER APP</div>
        <div className={'ground__tab ' + (tab === 'script' ? 'ground__tab--active' : '')} onClick={() => setTab('script')}>SCRIPTS</div>
        <div className="ground__tabs-right">
          <span><span className="live-dot"/> {liveCanvassers} {liveCanvassers === 1 ? 'CANVASSER' : 'CANVASSERS'} LIVE</span>
          <span>PATH · Ground · {wsLabel}</span>
        </div>
      </div>

      {tab !== 'field' && (
        <UniverseSentence cuts={cuts} onChange={setCuts} count={totalInUniverse}/>
      )}

      {tab === 'desk' && (
        <div className="desk">
          <div className="desk__map">
            <div className="map__ctl">
              <button className={'map__ctl-btn ' + (shade === 'support' ? 'map__ctl-btn--active' : '')} onClick={() => setShade('support')}>Support</button>
              <button className={'map__ctl-btn ' + (shade === 'turnout' ? 'map__ctl-btn--active' : '')} onClick={() => setShade('turnout')}>Turnout</button>
              <button className={'map__ctl-btn ' + (shade === 'progress' ? 'map__ctl-btn--active' : '')} onClick={() => setShade('progress')}>Knock progress</button>
              <button className="map__ctl-btn" style={{marginLeft: 10}}>✎ Lasso</button>
            </div>
            <GroundMap activePd={activePd} onPickPd={setActivePd} shade={shade}/>
            <div className="map__legend">
              <div className="map__legend-row"><span className="map__legend-sw" style={{background:'rgba(30,58,95,0.2)'}}/> <span>low</span></div>
              <div className="map__legend-row"><span className="map__legend-sw" style={{background:'rgba(30,58,95,0.55)'}}/> <span>mid</span></div>
              <div className="map__legend-row"><span className="map__legend-sw" style={{background:'rgba(30,58,95,0.9)'}}/> <span>high {shade}</span></div>
            </div>
            <div className="map__zoom">24 PDs · 1,420 targets in 31-B</div>
          </div>

          <div className="desk__list">
            <div className="vlist-head">
              <div/>
              <div>Name · Age · Tenure</div>
              <div>Address</div>
              <div>Support</div>
              <div>Ballots</div>
              <div>Last</div>
            </div>
            {filtered.map(v => (
              <VoterRow
                key={v.id}
                v={v}
                open={openVoter === v.id}
                onToggle={() => setOpenVoter(o => o === v.id ? null : v.id)}
                onSelect={() => toggleSel(v.id)}
                selected={selected.has(v.id)}
              />
            ))}
          </div>
        </div>
      )}

      {tab === 'field' && <FieldView mode={mode} setMode={setMode}/>}

      {tab === 'script' && (
        <div style={{ padding: 30, display:'grid', gridTemplateColumns:'300px 1fr', gap:0, background:'var(--paper)', minHeight:'70vh' }}>
          <div style={{ borderRight:'1px solid var(--rule)', paddingRight:20 }}>
            <h3 style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.2em', color:'var(--text-3)', textTransform:'uppercase', margin:'0 0 14px' }}>Scripts</h3>
            {scripts.map(s => (
              <div
                key={s.id}
                onClick={() => { setActiveScriptId(s.id); }}
                style={{ padding:'12px 14px', border:'1px solid var(--rule)', marginBottom:8, cursor:'pointer', background: activeScript?.id === s.id ? 'var(--g-tint)' : 'var(--paper)', borderColor: activeScript?.id === s.id ? 'var(--ink)' : 'var(--rule)' }}
              >
                <div style={{ fontFamily:'var(--font-mono)', fontSize:9.5, letterSpacing:'0.14em', color:'var(--text-3)', textTransform:'uppercase' }}>{s.mode}</div>
                <div style={{ fontFamily:'var(--font-display)', fontSize:17, marginTop:2 }}>{s.title}</div>
                <div style={{ fontFamily:'var(--font-mono)', fontSize:10, color:'var(--text-3)', marginTop:2 }}>{s.updated}</div>
              </div>
            ))}
            <button className="dossier__btn" style={{ marginTop: 10 }}>+ New script</button>
          </div>
          <div>
            <div style={{ padding:'0 30px' }}>
              {activeScript ? (<>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.2em', color:'var(--text-3)' }}>SCRIPT · {activeScript.mode.toUpperCase()}</div>
              <div style={{ fontFamily:'var(--font-display)', fontSize:34, letterSpacing:'-0.01em', margin:'4px 0 6px' }}>{activeScript.title}</div>
              <div style={{ fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-3)' }}>{activeScript.author} · {activeScript.updated}</div>
              <div style={{ height: 1, background:'var(--rule)', margin:'18px 0' }}/>
              {activeScript.scenes.map((scene, i) => (
                <div key={i} className="script-scene">
                  <div className="script-direction">{scene.direction}</div>
                  {scene.lines.map((ln, j) => (
                    <div key={j} className="script-line">
                      <span className={'script-who ' + (ln.who === 'VOTER' ? 'script-who--voter' : ln.who === 'SYSTEM' ? 'script-who--system' : '')}>
                        {ln.who}
                      </span>
                      {ln.text && <div className="script-text" contentEditable suppressContentEditableWarning>{ln.text}</div>}
                      {ln.hint && <div className="script-hint">{ln.hint}</div>}
                      {ln.capture && (
                        <div className="script-capture">
                          {ln.capture.map(c => <span key={c} className="script-capture-tag">{c}</span>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
              </>) : (
                <div style={{ color:'var(--text-3)', fontFamily:'var(--font-mono)', fontSize:12, padding:'40px 0' }}>No scripts yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'desk' && (
        <div className="ground-fab">
          <div className="ground-fab__btn">{selected.size} selected</div>
          <div className="ground-fab__btn">Assign shift</div>
          <div className="ground-fab__btn" onClick={() => setScriptOpen(true)}>Open script</div>
          <div className="ground-fab__btn ground-fab__btn--accent">Push to Field →</div>
        </div>
      )}

      <ScriptDock open={scriptOpen} script={activeScript} onClose={() => setScriptOpen(false)}/>
    </div>
  );
}

export { Ground };
