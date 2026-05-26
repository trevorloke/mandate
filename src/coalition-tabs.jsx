import React from 'react';
import './coalition-tabs.css';
import { COA_ASKS as COA_ASKS_FB, COA_ASKS_STAGES, COA_COMMS as COA_COMMS_FB, COA_EVENTS, COA_OPS } from './coalition-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Mandate 2.0 — Coalition · ASKS, OPS, COMMS, EVENTS tabs

const { useState: caUS } = React;

/* ── ASKS · kanban pipeline ─────────────────────── */
const STAGE_TONES = ['#7a8a98','#c5874f','#6b8b73','#2a4d35','#9aa09a'];

const CoaAsks = () => {
  const { records: COA_ASKS } = useLiveRecords('coalition', 'ask', COA_ASKS_FB);
  const [hover, setHover] = caUS(null);
  const stages = COA_ASKS_STAGES;
  const asks = COA_ASKS;

  const counts = stages.map((_,i) => asks.filter(a => a.stage === i).length);
  const totalDue14 = asks.filter(a => {
    if (a.stage === 3 || a.stage === 4) return false;
    const d = new Date(a.due);
    const days = (d - new Date())/(1000*60*60*24);
    return days >= 0 && days <= 14;
  }).length;

  return (
    <div className="ca">
      <div className="ca__head">
        <div>
          <div className="ca__eyebrow">Coalition · pipeline</div>
          <h2>Asks <em>— what we owe and what we're owed</em></h2>
        </div>
        <div className="ca__totals">
          <div><span>OPEN</span><b>{asks.filter(a=>a.stage<3).length}</b></div>
          <div><span>DUE ≤ 14D</span><b>{totalDue14}</b></div>
          <div><span>WON Q2</span><b>{asks.filter(a=>a.stage===3).length}</b></div>
          <div><span>HIGH-VALUE OPEN</span><b>{asks.filter(a=>a.stage<3 && a.value==='high').length}</b></div>
        </div>
      </div>

      <div className="ca__board">
        {stages.map((s,i) => (
          <div key={s} className="ca__col">
            <div className="ca__col-head" style={{borderTopColor:STAGE_TONES[i]}}>
              <span className="ca__col-lbl">{s}</span>
              <span className="ca__col-cnt">{counts[i]}</span>
            </div>
            <div className="ca__col-body">
              {asks.filter(a=>a.stage===i).map(a => {
                const dueDate = new Date(a.due);
                const days = Math.round((dueDate - new Date())/(1000*60*60*24));
                const overdue = days < 0 && a.stage < 3;
                const soon = days >= 0 && days <= 7 && a.stage < 3;
                return (
                  <div
                    key={a.id}
                    className={`ca__card ca__card--v-${a.value} ${a.heat?'on':''}`}
                    onMouseEnter={()=>setHover(a.id)}
                    onMouseLeave={()=>setHover(null)}
                  >
                    <div className="ca__card-meta">
                      <span className="ca__card-id">{a.id}</span>
                      <span className={`ca__card-value v--${a.value}`}>{a.value}</span>
                    </div>
                    <div className="ca__card-org">{a.org}</div>
                    <div className="ca__card-text">{a.text}</div>
                    {a.notes && <div className="ca__card-notes">{a.notes}</div>}
                    <div className="ca__card-foot">
                      <span className={`ca__card-due ${overdue?'overdue':soon?'soon':''}`}>
                        {a.stage === 3 && a.delivered ? 'delivered ' + a.delivered.slice(5) : a.due.slice(5)}
                      </span>
                      <span className="ca__card-champ">{a.champion}</span>
                    </div>
                    {a.heat && <span className="ca__card-heat">⚡ heat</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── OPS · joint operation cards ────────────────── */
const STAGE_TINT = {
  imminent:   '#b94a3a',
  launching:  '#c5874f',
  'in-progress':'#6b8b73',
  done:       '#2a4d35',
};

const CoaOps = () => {
  const [sel, setSel] = caUS(null);
  const ops = COA_OPS;
  const open = ops.find(o => o.id === sel);

  return (
    <div className="co">
      <div className="co__head">
        <div>
          <div className="co__eyebrow">Coalition · joint operations</div>
          <h2>Ops <em>— what we're running together</em></h2>
        </div>
        <div className="co__totals">
          <div><span>ACTIVE</span><b>{ops.filter(o=>o.stage!=='done').length}</b></div>
          <div><span>EXPECTED REACH</span><b>{(ops.reduce((a,o)=>a+(o.expected||0),0)/1000).toFixed(0)}k</b></div>
          <div><span>LAUNCHING WK</span><b>{ops.filter(o=>o.stage==='launching'||o.stage==='imminent').length}</b></div>
        </div>
      </div>

      <div className="co__layout">
        <div className="co__list">
          {ops.map(o => (
            <div
              key={o.id}
              className={`co__row co__row--${o.stage} ${sel===o.id?'on':''}`}
              onClick={()=>setSel(o.id)}
            >
              <div className="co__row-stripe" style={{background:STAGE_TINT[o.stage]}} />
              <div className="co__row-body">
                <div className="co__row-meta">
                  <span className="co__row-id">{o.id}</span>
                  <span className={`co__row-stage st--${o.stage}`}>{o.stage}</span>
                  <span className="co__row-date">{o.date.slice(5)}</span>
                </div>
                <div className="co__row-name">{o.name}</div>
                <div className="co__row-leads">
                  {o.leads.map(l => <span key={l} className="co__lead-chip">{l}</span>)}
                </div>
                <div className="co__row-bar">
                  <div className="co__row-bar-fill" style={{width:o.progress+'%', background:STAGE_TINT[o.stage]}} />
                  <span>{o.progress}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="co__detail">
          {open && (
            <>
              <div className={`co__d-head co__d-head--${open.stage}`}>
                <div className="co__d-eyebrow">{open.id} · {open.stage.toUpperCase()}</div>
                <h3>{open.name}</h3>
                <div className="co__d-date">{open.date} · {open.venue}</div>
              </div>

              <div className="co__d-stats">
                <div><span>EXPECTED</span><b>{open.expected ? open.expected.toLocaleString() : '—'}</b></div>
                <div><span>ROLE</span><b>{open.my_role}</b></div>
                <div><span>OWNER</span><b>{open.owner}</b></div>
                <div><span>PROGRESS</span><b>{open.progress}%</b></div>
              </div>

              <div className="co__d-section">
                <div className="co__d-h">PARTNERS</div>
                <div className="co__d-leads">
                  {open.leads.map(l => <span key={l} className="co__d-lead">{l}</span>)}
                </div>
              </div>

              <div className="co__d-section">
                <div className="co__d-h">ASSETS &amp; CHECKLIST</div>
                <ul className="co__d-assets">
                  {open.assets.map((a,i) => (
                    <li key={i}><i className="dot" />{a}</li>
                  ))}
                </ul>
              </div>

              {open.note && (
                <div className="co__d-section">
                  <div className="co__d-h">NOTE</div>
                  <p>{open.note}</p>
                </div>
              )}

              {open.metrics && (
                <div className="co__d-section">
                  <div className="co__d-h">RESULTS</div>
                  <div className="co__d-metrics">
                    <div><span>attended</span><b>{open.metrics.attended.toLocaleString()}</b></div>
                    <div><span>press hits</span><b>{open.metrics.hits}</b></div>
                    <div><span>impressions</span><b>{open.metrics.impressions.toLocaleString()}</b></div>
                  </div>
                </div>
              )}

              <div className="co__d-actions">
                <button>Open run-sheet</button>
                <button>Add asset</button>
                <button className="primary">Brief team</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

/* ── COMMS · log feed ───────────────────────────── */
const KIND_TONES = {
  call:'#c5874f', email:'#5a7a8a', meeting:'#6b8b73', event:'#2a4d35',
};

const CoaComms = () => {
  const { records: COA_COMMS } = useLiveRecords('coalition', 'comm', COA_COMMS_FB);
  const [filter, setFilter] = caUS('all');
  const comms = COA_COMMS;
  const filtered = filter === 'all' ? comms : comms.filter(c => c.kind === filter);

  // group by date
  const grouped = {};
  filtered.forEach(c => { (grouped[c.d] ||= []).push(c); });
  const dates = Object.keys(grouped).sort().reverse();

  return (
    <div className="cc">
      <div className="cc__head">
        <div>
          <div className="cc__eyebrow">Coalition · communications log</div>
          <h2>Touch log <em>— the last seven days</em></h2>
        </div>
        <div className="cc__filters">
          {[['all','ALL'],['call','CALLS'],['email','EMAIL'],['meeting','MTGS'],['event','EVENTS']].map(([k,l]) => (
            <button key={k} className={`cc__filter ${filter===k?'on':''}`} onClick={()=>setFilter(k)}>
              {l}<em>{k==='all'?comms.length:comms.filter(c=>c.kind===k).length}</em>
            </button>
          ))}
        </div>
      </div>

      <div className="cc__feed">
        {dates.map(d => (
          <div key={d} className="cc__day">
            <div className="cc__day-head">
              <span className="cc__day-date">{d}</span>
              <span className="cc__day-cnt">{grouped[d].length} touches</span>
              <span className="cc__day-rule" />
            </div>
            {grouped[d].map((c,i) => (
              <div key={i} className="cc__row">
                <span className="cc__time">{c.t}</span>
                <span className={`cc__kind cc__kind--${c.kind}`} style={{color:KIND_TONES[c.kind]}}>
                  <i className="dot" style={{background:KIND_TONES[c.kind]}} />
                  {c.kind}
                </span>
                <span className="cc__org">{c.org}</span>
                <span className="cc__what">{c.what}</span>
                <span className="cc__who">{c.who}</span>
                <span className="cc__dur">{c.dur}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ── EVENTS · co-hosting calendar list ─────────── */
const STAGE_EV = {
  done:'#2a4d35', confirmed:'#6b8b73', holding:'#c5874f', tentative:'#9aaa9e',
};

const CoaEvents = () => {
  const events = COA_EVENTS;

  // Group by week
  const weeks = {};
  events.forEach(e => {
    const d = new Date(e.date);
    const w = new Date(d);
    w.setDate(d.getDate() - d.getDay());
    const k = w.toISOString().slice(0,10);
    (weeks[k] ||= []).push(e);
  });
  const weekKeys = Object.keys(weeks).sort();

  return (
    <div className="ce">
      <div className="ce__head">
        <div>
          <div className="ce__eyebrow">Coalition · co-hosting calendar</div>
          <h2>Events <em>— shared stages</em></h2>
        </div>
        <div className="ce__totals">
          <div><span>CONFIRMED</span><b>{events.filter(e=>e.stage==='confirmed').length}</b></div>
          <div><span>HOLDING</span><b>{events.filter(e=>e.stage==='holding'||e.stage==='tentative').length}</b></div>
          <div><span>EXPECTED</span><b>{(events.reduce((a,e)=>a+e.attended,0)/1000).toFixed(0)}k</b></div>
        </div>
      </div>

      <div className="ce__list">
        {weekKeys.map(wk => (
          <div key={wk} className="ce__week">
            <div className="ce__week-head">
              <span className="ce__week-lbl">Week of {wk.slice(5)}</span>
              <span className="ce__week-cnt">{weeks[wk].length} events</span>
              <span className="ce__week-rule" />
            </div>
            {weeks[wk].map(e => (
              <div key={e.id} className={`ce__row ce__row--${e.stage}`}>
                <div className="ce__date">
                  <span className="ce__date-day">{e.date.slice(8)}</span>
                  <span className="ce__date-mo">{['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][parseInt(e.date.slice(5,7))-1]}</span>
                </div>
                <div className="ce__row-stripe" style={{background:STAGE_EV[e.stage]}} />
                <div className="ce__row-body">
                  <div className="ce__row-meta">
                    <span className="ce__row-id">{e.id}</span>
                    <span className={`ce__row-stage st--${e.stage}`}>{e.stage}</span>
                    <span className="ce__row-role">role: {e.role}</span>
                  </div>
                  <div className="ce__row-name">{e.name}</div>
                  <div className="ce__row-orgs">
                    {e.orgs.map(o => <span key={o} className="ce__org-chip">{o}</span>)}
                  </div>
                </div>
                <div className="ce__attended">
                  <span>{e.stage==='done'?'attended':'expected'}</span>
                  <b>{e.attended ? e.attended.toLocaleString() : '—'}</b>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export { CoaAsks, CoaOps, CoaComms, CoaEvents };