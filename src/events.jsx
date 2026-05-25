import React from 'react';
import './events.css';
import { EvScheduleTab, EvCalendarTab, EvDetailTab, EvVenuesTab, EvHostsTab, EvShiftsTab } from './events-tabs';
import { EV_LIST as EV_LIST_FB, EV_TYPES, EV_VENUES as EV_VENUES_FB, EV_HOSTS as EV_HOSTS_FB, EV_SUMMARY, EV_SHIFTS } from './events-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';

// Events 2.0 — main shell

const { useState: evUS } = React;

const EV_TAB_DEFS = [
  { k:'schedule', label:'Schedule' },
  { k:'calendar', label:'Calendar' },
  { k:'detail',   label:'Spring Gala' },
  { k:'shifts',   label:'Shifts' },
  { k:'venues',   label:'Venues' },
  { k:'hosts',    label:'Hosts' },
];

function Events2() {
  const [tab, setTab] = evUS('schedule');
  const { records: EV_LIST, isEmpty: noEvents } = useLiveRecords('events', 'event', EV_LIST_FB);
  const { records: EV_VENUES } = useLiveRecords('events', 'venue', EV_VENUES_FB);
  const { records: EV_HOSTS } = useLiveRecords('events', 'host', EV_HOSTS_FB);
  if (noEvents) return <EmptyModule module="EVENTS" label="Events" accent="var(--m-events)" />;

  const upcoming = EV_LIST.filter(e => e.attended === null).length;
  const totalRsvp = EV_LIST.filter(e => e.attended === null).reduce((s,e)=>s+e.rsvped, 0);
  const totalShifts = EV_LIST.filter(e=>e.attended===null).reduce((s,e)=>s+e.shifts,0);
  const totalShiftsFilled = EV_LIST.filter(e=>e.attended===null).reduce((s,e)=>s+e.shiftsFilled,0);
  const ticketRev = 210000;

  const tabBadges = {
    schedule: String(upcoming),
    calendar: 'May',
    shifts:   `${Math.round((totalShiftsFilled/totalShifts)*100)}%`,
    venues:   String(EV_VENUES.length),
    hosts:    String(EV_HOSTS.filter(h=>h.status==='active').length),
  };

  return (
    <div className="ev2" data-screen-label="09 Events · Schedule">
      <header className="ev2__head">
        <div>
          <div className="ev2__masthead-row">
            <span className="ev2__title">The Programme</span>
            <span className="ev2__title-deco"></span>
          </div>
          <div className="ev2__title-sub">Apr 28 → E-Day · 14 days · {upcoming} events · {EV_VENUES.length} venues on file</div>
        </div>
        <div className="ev2__metrics">
          <div className="ev2__metric"><span className="ev2__metric-v">{upcoming}</span><span className="ev2__metric-k">upcoming</span></div>
          <div className="ev2__metric"><span className="ev2__metric-v">{totalRsvp.toLocaleString()}</span><span className="ev2__metric-k">total RSVP</span></div>
          <div className="ev2__metric"><span className="ev2__metric-v">${(ticketRev/1000).toFixed(0)}k</span><span className="ev2__metric-k">ticket rev.</span></div>
          <div className="ev2__metric"><span className="ev2__metric-v go">{totalShiftsFilled}<span style={{color:'var(--text-3)', fontSize:14}}>/{totalShifts}</span></span><span className="ev2__metric-k">shifts filled</span></div>
          <div className="ev2__metric"><span className="ev2__metric-v">{EV_HOSTS.filter(h=>h.status==='active').length}</span><span className="ev2__metric-k">active hosts</span></div>
        </div>
      </header>

      <nav className="ev2__tabs">
        {EV_TAB_DEFS.map(t => (
          <button key={t.k} className={`ev2__tab ${tab===t.k?'is-on':''}`} onClick={()=>setTab(t.k)}>
            {t.label}
            {tabBadges[t.k] && <span className="ev2__tab-badge">{tabBadges[t.k]}</span>}
          </button>
        ))}
      </nav>

      <div className="ev2__body">
        {tab==='schedule' && <EvScheduleTab onPick={()=>setTab('detail')} />}
        {tab==='calendar' && <EvCalendarTab />}
        {tab==='detail'   && <EvDetailTab />}
        {tab==='shifts'   && <EvShiftsTab />}
        {tab==='venues'   && <EvVenuesTab />}
        {tab==='hosts'    && <EvHostsTab />}
      </div>
    </div>
  );
}

export { Events2 };
