import React from 'react';
import { EV_LIST as EV_LIST_FB, EV_TYPES, EV_VENUES as EV_VENUES_FB, EV_GALA_TICKETS, EV_GALA_ROS, EV_GALA_RSVPS, EV_SHIFTS, EV_HOSTS as EV_HOSTS_FB } from './events-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Events 2.0 — tab content components

const { useState: evUS2, useMemo: evUM2 } = React;

const _evDayName = (iso) => {
  const dt = new Date(iso + 'T12:00');
  return dt.toLocaleDateString('en-CA', { weekday:'long' });
};
const _evShortDay = (iso) => {
  const dt = new Date(iso + 'T12:00');
  return { num: dt.getDate(), mo: dt.toLocaleDateString('en-CA',{month:'short'}).toUpperCase(), wd: dt.toLocaleDateString('en-CA',{weekday:'short'}).toUpperCase() };
};

/* ── SCHEDULE (list view) ── */
function EvScheduleTab({ onPick }) {
  const { records: EV_LIST } = useLiveRecords('events', 'event', EV_LIST_FB);
  const groups = evUM2(() => {
    const future = EV_LIST.filter(e => e.attended === null).sort((a,b)=> a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
    const past   = EV_LIST.filter(e => e.attended !== null).sort((a,b)=> b.date.localeCompare(a.date));
    const byDate = (arr) => {
      const m = new Map();
      arr.forEach(e => { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); });
      return [...m.entries()];
    };
    return { upcoming: byDate(future), past: byDate(past) };
  }, []);

  return (
    <div className="ev2__schedule">
      <div style={{padding:'14px 22px', borderBottom:'1px solid var(--ev-rule)', display:'flex', justifyContent:'space-between', alignItems:'baseline', background:'var(--paper-0)'}}>
        <div className="ev2__title-sub" style={{margin:0}}>Upcoming · 13 events · next 14 days</div>
        <div style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-3)', letterSpacing:'0.06em'}}>List · Week · Month</div>
      </div>

      {groups.upcoming.map(([date, evts]) => {
        const sd = _evShortDay(date);
        const totalCap = evts.reduce((s,e)=>s+e.capacity, 0);
        const totalRsvp = evts.reduce((s,e)=>s+e.rsvped, 0);
        return (
          <React.Fragment key={date}>
            <div className="ev2__day-h">
              <div className="ev2__day-date">{sd.num}<small>{sd.mo} · {_evDayName(date)}</small></div>
              <div className="ev2__day-meta">
                <span>{evts.length} event{evts.length===1?'':'s'}</span>
                <span>·</span>
                <span>{totalRsvp.toLocaleString()} RSVP</span>
                <span>·</span>
                <span>cap {totalCap.toLocaleString()}</span>
              </div>
            </div>
            {evts.map(e => <EvRow key={e.id} e={e} onPick={onPick} />)}
          </React.Fragment>
        );
      })}

      <div className="ev2__day-h" style={{background:'#f5efe2'}}>
        <div className="ev2__day-date" style={{color:'var(--text-3)'}}>—<small>RECENT · COMPLETED</small></div>
        <div className="ev2__day-meta"><span>{groups.past.reduce((s,[,a])=>s+a.length,0)} past · 14 days</span></div>
      </div>
      {groups.past.flatMap(([,evts]) => evts).map(e => <EvRow key={e.id} e={e} onPick={onPick} past />)}
    </div>
  );
}

function EvRow({ e, onPick, past }) {
  const { records: EV_VENUES } = useLiveRecords('events', 'venue', EV_VENUES_FB);
  const type = EV_TYPES[e.type];
  const venue = EV_VENUES.find(v => v.id === e.venue);
  const fillPct = Math.min(100, Math.round((e.rsvped / e.capacity) * 100));
  const shiftPct = Math.round((e.shiftsFilled / e.shifts) * 100);
  return (
    <div className={`ev2__row ${past?'past':''}`} onClick={()=>onPick && onPick(e.id)}>
      <div className="ev2__time">
        <span>{e.start}</span>
        <span className="end">→ {e.end}</span>
      </div>
      <div className="ev2__main" style={{ borderLeftColor: type.tint }}>
        <span className="ev2__row-type" style={{color: type.tint}}>{type.label}</span>
        <span className="ev2__row-title">{e.title}</span>
        <span className="ev2__row-sub">{e.subtitle}</span>
        <div className="ev2__row-meta" style={{marginTop:8, flexDirection:'row', display:'flex', flexWrap:'wrap', gap:'4px 14px', alignItems:'center'}}>
          <span className="l">{venue?.name} <span style={{color:'var(--text-4)'}}>·</span> {venue?.city}</span>
          <span className="ev2__row-host">
            <span className="ev2__row-host-pip">{e.host.split(/[ &]/).map(x=>x[0]).slice(0,2).join('')}</span>
            <span>{e.host}</span>
          </span>
          {e.ticketed && <span style={{color:'var(--ev-rust)'}}>● ticketed</span>}
          <span className={`ev2__pri-inline ${e.priority}`}>P · {e.priority}</span>
        </div>
      </div>
      <div className="ev2__cap">
        <div className="ev2__cap-row">
          <span>RSVP</span>
          <span className={`ev2__cap-bar ${fillPct>=95?'full':fillPct<50?'warn':''}`}><span style={{ width: `${fillPct}%`}}></span></span>
          <span className="ev2__cap-num">{e.rsvped}/{e.capacity}</span>
        </div>
        <div className="ev2__cap-row">
          <span>Shifts</span>
          <span className={`ev2__cap-bar ${shiftPct>=100?'full':shiftPct<60?'warn':''}`}><span style={{ width: `${shiftPct}%`}}></span></span>
          <span className="ev2__cap-num">{e.shiftsFilled}/{e.shifts}</span>
        </div>
        {past && (
          <div className="ev2__cap-row">
            <span>Att.</span>
            <span className="ev2__cap-bar full"><span style={{ width: `${Math.round((e.attended/e.rsvped)*100)}%`}}></span></span>
            <span className="ev2__cap-num">{e.attended}/{e.rsvped}</span>
          </div>
        )}
      </div>
      <div className="ev2__cta">
        <button className="ev2__cta-btn primary">Dossier</button>
        <button className="ev2__cta-btn">Run-of-show</button>
      </div>
    </div>
  );
}

/* ── CALENDAR ── */
function EvCalendarTab() {
  const { records: EV_LIST } = useLiveRecords('events', 'event', EV_LIST_FB);
  // Render May 2026 (the active campaign month)
  // 1 May 2026 is a Friday
  const firstDay = 5; // 0=Sun, 5=Fri
  const days = 31;
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push({ dim: true, num: 26 + i }); // late April
  for (let d = 1; d <= days; d++) cells.push({ d, num: d });
  while (cells.length % 7) cells.push({ dim: true, num: cells.length - days - firstDay + 1 });

  const eventsByDay = {};
  EV_LIST.forEach(e => {
    const dt = new Date(e.date + 'T12:00');
    if (dt.getMonth() === 4) { // May
      const d = dt.getDate();
      if (!eventsByDay[d]) eventsByDay[d] = [];
      eventsByDay[d].push(e);
    }
  });

  return (
    <div className="ev2__cal">
      <div className="ev2__cal-bar">
        <span className="ev2__cal-month">May · 2026</span>
        <span style={{flex:1}}></span>
        {Object.entries(EV_TYPES).slice(0,7).map(([k, v]) => (
          <span key={k} className="ev2__cal-leg">
            <span style={{ display:'inline-block', width:9, height:9, borderRadius:2, background:v.tint }}></span>
            {v.label}
          </span>
        ))}
      </div>
      <div className="ev2__cal-h">
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d}>{d}</div>)}
      </div>
      <div className="ev2__cal-grid">
        {cells.map((c, i) => (
          <div key={i} className={`ev2__cal-cell ${c.dim?'dim':''} ${c.d===12?'today':''}`}>
            <div className="ev2__cal-num">
              <span>{c.num}</span>
              {c.d===12 && <small>E-DAY</small>}
            </div>
            {c.d && (eventsByDay[c.d]||[]).map(ev => (
              <div key={ev.id} className="ev2__cal-event" data-type={ev.type}>
                <b>{ev.title.replace(/^[^·]+·\s*/,'').replace(/^Town Hall · /,'')}</b>
                <small>{ev.start} · {ev.rsvped}/{ev.capacity}</small>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── EVENT DETAIL (Gala) ── */
function EvDetailTab() {
  const { records: EV_LIST } = useLiveRecords('events', 'event', EV_LIST_FB);
  const { records: EV_VENUES } = useLiveRecords('events', 'venue', EV_VENUES_FB);
  const e = EV_LIST.find(x => x.id === 'e-fund-gala');
  const venue = EV_VENUES.find(v => v.id === e.venue);
  const totalRev = EV_GALA_TICKETS.reduce((s,t)=>s+t.rev, 0);
  const totalSold = EV_GALA_TICKETS.reduce((s,t)=>s+t.sold, 0);
  const totalCap = EV_GALA_TICKETS.reduce((s,t)=>s+t.cap, 0);
  const maxRsvp = Math.max(...EV_GALA_RSVPS.map(p=>p.n));

  const galaShifts = EV_SHIFTS.filter(s=>s.eventId==='e-fund-gala');

  return (
    <div className="ev2__detail">
      <div>
        <div className="ev2__d-hero">
          <div className="ev2__d-eyebrow">{EV_TYPES[e.type].label} · Saturday · 02 May 2026</div>
          <div className="ev2__d-h1">{e.title}</div>
          <div className="ev2__d-sub">{e.subtitle}</div>
          <div className="ev2__d-stamp">Sold ▸ 91%</div>

          <div className="ev2__d-meta">
            <div className="ev2__d-meta-cell"><span className="k">Venue</span><span className="v">{venue.name}<small>{venue.city}</small></span></div>
            <div className="ev2__d-meta-cell"><span className="k">Doors / Start</span><span className="v">17:30<small>· dinner 19:45</small></span></div>
            <div className="ev2__d-meta-cell"><span className="k">RSVP</span><span className="v">{e.rsvped}<small>of {e.capacity}</small></span></div>
            <div className="ev2__d-meta-cell"><span className="k">Tonight's pace</span><span className="v">${(totalRev/1000).toFixed(0)}k<small>· goal $230k</small></span></div>
          </div>
        </div>

        <div className="ev2__tickets">
          <div className="ev2__tickets-h">Ticketing<small>{totalSold}/{totalCap} seats · ${(totalRev/1000).toFixed(0)}k gross</small></div>
          {EV_GALA_TICKETS.map(t => {
            const pct = (t.sold / t.cap) * 100;
            return (
              <div key={t.tier} className="ev2__ticket-row">
                <span className="tier">{t.tier}</span>
                <span className="price">{t.price ? `$${t.price.toLocaleString()}` : 'Comp'}</span>
                <span className={`bar ${pct>=95?'full':''}`}><span style={{ width: `${pct}%`}}></span></span>
                <span className="sold">{t.sold} / {t.cap}</span>
                <span className="rev">{t.rev ? `$${(t.rev/1000).toFixed(0)}k` : '—'}</span>
              </div>
            );
          })}
        </div>

        <div className="ev2__ros">
          <div className="ev2__ros-h">Run of show</div>
          {EV_GALA_ROS.map(r => (
            <div key={r.t} className="ev2__ros-row">
              <span className="t">{r.t}</span>
              <span className="w">{r.what}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="ev2__d-right">
        <div className="ev2__chart">
          <div className="ev2__chart-h">RSVPs · last 14 days</div>
          <div className="ev2__chart-bars">
            {EV_GALA_RSVPS.map((p, i) => (
              <div key={p.d} className={`ev2__chart-bar ${i===EV_GALA_RSVPS.length-1?'last':''}`} style={{ height: `${(p.n/maxRsvp)*100}%` }} title={`${p.d}: ${p.n}`}></div>
            ))}
          </div>
          <div className="ev2__chart-axis">
            {EV_GALA_RSVPS.map(p => <span key={p.d}>{p.d==='today'?'TDY':p.d}</span>)}
          </div>
          <div style={{marginTop:14, fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text-3)', letterSpacing:'0.06em'}}>
            Pace: <strong style={{color:'var(--ink)'}}>+25 RSVP/day</strong> last 7d.  Cap risk:  4d to event,  ~30 seats remaining.
          </div>
        </div>

        <div className="ev2__shifts">
          <div className="ev2__shifts-h">Shifts<small>{galaShifts.reduce((s,sh)=>s+sh.filled,0)}/{galaShifts.reduce((s,sh)=>s+sh.cap,0)} filled</small></div>
          {galaShifts.map(s => (
            <div key={s.id} className="ev2__shift">
              <div>
                <div className="ev2__shift-role">{s.role}</div>
                <div className="ev2__shift-meta">{s.start}–{s.end} · cap. {s.captain || <em style={{color:'var(--warn)'}}>captain needed</em>}</div>
              </div>
              <div className="ev2__shift-fill">
                <span className="ev2__shift-pips">
                  {Array.from({length: s.cap}).map((_, i) => {
                    const cls = i < s.filled ? 'on' : (s.flag === 'open' && i === s.filled ? 'flag' : '');
                    return <span key={i} className={`ev2__shift-pip ${cls}`}></span>;
                  })}
                </span>
                <span>{s.filled}/{s.cap}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="ev2__chart" style={{padding:'14px 18px 18px'}}>
          <div className="ev2__chart-h">Venue · {venue.name}</div>
          <div style={{fontFamily:'var(--font-serif)', fontSize:13, color:'var(--text-2)', fontStyle:'italic', marginBottom:8}}>{venue.notes}</div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, fontFamily:'var(--font-mono)', fontSize:10.5}}>
            <div><span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.12em', fontSize:9}}>Cap</span><br/><strong style={{fontFamily:'var(--font-display)', fontSize:18, fontWeight:400}}>{venue.cap}</strong></div>
            <div><span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.12em', fontSize:9}}>Hist.</span><br/><strong style={{fontFamily:'var(--font-display)', fontSize:18, fontWeight:400}}>{venue.priorEvents}</strong></div>
            <div><span style={{color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.12em', fontSize:9}}>Access</span><br/><strong style={{fontFamily:'var(--font-display)', fontSize:13, fontWeight:400}}>{venue.accessibility}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── VENUES ── */
function EvVenuesTab() {
  const { records: EV_VENUES } = useLiveRecords('events', 'venue', EV_VENUES_FB);
  return (
    <div className="ev2__venues">
      {EV_VENUES.map(v => (
        <article key={v.id} className="ev2__venue">
          <div className="ev2__venue-kind">{v.kind} · {v.city}</div>
          <div>
            <div className="ev2__venue-name">{v.name}</div>
            <div className="ev2__venue-city">{v.contact} · {v.phone}</div>
          </div>
          <div className="ev2__venue-notes">{v.notes}</div>
          <div className="ev2__venue-stats">
            <div><span className="v">{v.cap}</span><span className="k">Capacity</span></div>
            <div><span className="v">{v.priorEvents}</span><span className="k">Past events</span></div>
            <div><span className="v" style={{fontSize:11, fontFamily:'var(--font-mono)', letterSpacing:'0.04em'}}>{v.accessibility.includes('Full')?'A11y full':v.accessibility.split(' · ')[0]}</span><span className="k">A11y</span></div>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ── HOSTS ── */
function EvHostsTab() {
  const { records: EV_HOSTS } = useLiveRecords('events', 'host', EV_HOSTS_FB);
  return (
    <div className="ev2__hosts">
      <div className="ev2__host-row head">
        <span>Host</span>
        <span>Joined</span>
        <span style={{textAlign:'right'}}>Events</span>
        <span style={{textAlign:'right'}}>Raised</span>
        <span style={{textAlign:'right'}}>RSVPs</span>
        <span>City</span>
        <span>Status</span>
      </div>
      {EV_HOSTS.map(h => (
        <div key={h.id} className="ev2__host-row">
          <span className="ev2__host-name">
            <span className="ev2__host-pip">{h.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</span>
            {h.name}
          </span>
          <span className="ev2__host-num" style={{textAlign:'left', color:'var(--text-3)'}}>{h.joined}</span>
          <span className="ev2__host-num big">{h.events}</span>
          <span className="ev2__host-num big" style={{color: h.raised > 100000 ? 'var(--ev-rust)' : 'var(--ink)'}}>
            {h.raised ? `$${(h.raised/1000).toFixed(0)}k` : '—'}
          </span>
          <span className="ev2__host-num">{h.rsvps}</span>
          <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--text-3)'}}>{h.city}</span>
          <span className={`ev2__host-stat ${h.status}`}>● {h.status}</span>
        </div>
      ))}
    </div>
  );
}

/* ── SHIFTS (across events) ── */
function EvShiftsTab() {
  const { records: EV_LIST } = useLiveRecords('events', 'event', EV_LIST_FB);
  // Group by event
  const byEvent = {};
  EV_SHIFTS.forEach(s => {
    if (!byEvent[s.eventId]) byEvent[s.eventId] = [];
    byEvent[s.eventId].push(s);
  });

  return (
    <div style={{display:'flex', flexDirection:'column', gap:18}}>
      {Object.entries(byEvent).map(([eid, shifts]) => {
        const e = EV_LIST.find(x => x.id === eid);
        const totFilled = shifts.reduce((s,sh)=>s+sh.filled,0);
        const totCap = shifts.reduce((s,sh)=>s+sh.cap,0);
        return (
          <div key={eid} className="ev2__shifts">
            <div className="ev2__shifts-h">
              <span>
                <span style={{fontFamily:'var(--font-mono)', fontSize:10, color:'var(--ev-rust)', letterSpacing:'0.16em', textTransform:'uppercase', display:'block'}}>{e.date} · {e.start}</span>
                {e.title}
              </span>
              <small>{totFilled}/{totCap} filled · {Math.round((totFilled/totCap)*100)}%</small>
            </div>
            {shifts.map(s => (
              <div key={s.id} className="ev2__shift">
                <div>
                  <div className="ev2__shift-role">{s.role}</div>
                  <div className="ev2__shift-meta">{s.start}–{s.end} · cap. {s.captain || <em style={{color:'var(--warn)'}}>captain needed</em>}</div>
                </div>
                <div className="ev2__shift-fill">
                  <span className="ev2__shift-pips">
                    {Array.from({length: s.cap}).map((_, i) => {
                      const cls = i < s.filled ? 'on' : (s.flag === 'open' && i === s.filled ? 'flag' : '');
                      return <span key={i} className={`ev2__shift-pip ${cls}`}></span>;
                    })}
                  </span>
                  <span>{s.filled}/{s.cap}</span>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export { EvScheduleTab, EvCalendarTab, EvDetailTab, EvVenuesTab, EvHostsTab, EvShiftsTab };
