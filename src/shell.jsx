// Mandate 2.0 — Shell primitives

import React, { useState, useEffect, useRef } from 'react';
import './shell.css';
import { useT } from './i18n';

// ── Module registry (ink/paper, per-module chromatic territory)
const MOD2 = [
  { k:'ground',     n:'Ground',     s:'Field ops',        ac:'var(--m-ground)',     tint:'var(--m-ground-tint)',     tag:'G' },
  { k:'beacon',     n:'Beacon',     s:'Voice & press',    ac:'var(--m-beacon)',     tint:'var(--m-beacon-tint)',     tag:'B' },
  { k:'raise',      n:'Raise',      s:'Fundraising',      ac:'var(--m-raise)',      tint:'var(--m-raise-tint)',      tag:'R' },
  { k:'ledger',     n:'Ledger',     s:'Finance',          ac:'var(--m-ledger)',     tint:'var(--m-ledger-tint)',     tag:'L' },
  { k:'coalition',  n:'Coalition',  s:'Allies & orgs',    ac:'var(--m-coalition)',  tint:'var(--m-coalition-tint)',  tag:'C' },
  { k:'opposition', n:'Opposition', s:'Counter-ops',      ac:'var(--m-opposition)', tint:'var(--m-opposition-tint)', tag:'O' },
  { k:'site',       n:'Site',       s:'Web & CMS',        ac:'var(--m-site)',       tint:'var(--m-site-tint)',       tag:'S' },
  { k:'events',     n:'Events',     s:'Calendar & RSVP',  ac:'var(--m-events)',     tint:'var(--m-events-tint)',     tag:'E' },
  { k:'civic',      n:'Civic',      s:'Governing',        ac:'var(--m-civic)',      tint:'var(--m-civic-tint)',      tag:'V' },
  { k:'academy',    n:'Academy',    s:'Method & training',ac:'var(--m-academy)',    tint:'var(--m-academy-tint)',    tag:'A' },
];
const modByKey = (k) => MOD2.find(m => m.k === k);

// ── Clock that ticks once per second (for heartbeat, real-time feel)
const useClock = () => {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return t;
};
const fmtTime = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

// ── Heartbeat counter (actions/min, updating)
const useHeartbeat = (base = 247) => {
  const [n, setN] = useState(base);
  useEffect(() => {
    const id = setInterval(() => setN(v => v + Math.floor(Math.random() * 5) + 1), 2300);
    return () => clearInterval(id);
  }, []);
  return n;
};

// ── Nav context
const Nav2Ctx = React.createContext({ route: 'home', go: () => {} });
const useNav2 = () => React.useContext(Nav2Ctx);

// ── The suite shell
const Shell = ({ route, onGo, workspace, user = 'MR', onCmd, onConductor, conductorCount = 8, userMenu, notifications, enabledModules, children }) => {
  const isEnabled = (k) => !enabledModules || enabledModules[k] !== false;
  const active = route === 'home' ? null : modByKey(route);
  const t = useT();
  const clock = useClock();
  const beats = useHeartbeat();
  const stripStyle = active
    ? { '--strip-bg': active.tint, '--mod-accent': active.ac }
    : {};

  return (
    <div className="mdt">
      <header className="mdt__bar">
        <div className="mdt__brand-wrap">
          <button className="mdt__brand" onClick={() => onGo('home')} style={{ cursor:'pointer' }}>
            <span className="mdt__mark">M</span>
            <span className="mdt__word">mandate</span>
          </button>
          <button className="mdt__workspace">
            <span className="mdt__ws-type">{workspace.kind}</span>
            <span className="mdt__ws-name">{workspace.name}</span>
            <span className="mdt__ws-chev">▾</span>
          </button>
        </div>

        <div className="mdt__nav-wrap">
          <nav className="mdt__nav">
          <button
            className={'mdt__tab' + (route==='home' ? ' is-active' : '')}
            onClick={() => onGo('home')}>
            <span className="mdt__tab-dot" />{t('shell.home')}
          </button>
          <span className="mdt__nav-sep" />
          {MOD2.filter(m => isEnabled(m.k)).map(m => (
            <button
              key={m.k}
              className={'mdt__tab' + (route===m.k ? ' is-active' : '')}
              onClick={() => onGo(m.k)}>
              {m.n}
            </button>
          ))}
          <span className="mdt__nav-sep" />
          {isEnabled('command') && <button
            className={'mdt__tab mdt__tab--peer' + (route==='command' ? ' is-active' : '')}
            onClick={() => onGo('command')}>
            <span className="live-dot" />{t('shell.command')}
          </button>}
          </nav>
        </div>

        <div className="mdt__right">
          <div className="mdt__heartbeat" title="Actions across the org, this minute">
            <span className="live-dot" />
            <span className="mdt__heartbeat-label">PULSE</span>
            <span className="mdt__heartbeat-val tnum">{beats}</span>
          </div>
          <button className="mdt__cmd" onClick={onCmd}>
            <span style={{ opacity:0.7 }}>⌕</span>
            <span className="mdt__cmd-label">{t('shell.jump')}</span>
            <kbd>⌘K</kbd>
          </button>
          {notifications}
          {userMenu || <button className="mdt__avatar">{user}</button>}
        </div>
      </header>

      <div className="mdt__strip" style={stripStyle}>
        <div className="mdt__strip-crumb">
          <span className="mod-tag">{active ? active.tag : 'H'}</span>
          <span className="sep">/</span>
          <span>{active ? active.n : 'Home'}</span>
          {active && <>
            <span className="sep">·</span>
            <span style={{ color:'var(--text-3)', fontFamily:'var(--font-ui)', fontSize:12 }}>{active.s}</span>
          </>}
        </div>
        <div className="mdt__strip-middle">
          {workspace.phase} · T-{workspace.daysToVote}d to vote
        </div>
        <div className="mdt__strip-right">
          <div className="mdt__strip-pulse">
            <span className="live-dot" />
            <span>{workspace.livePulse}</span>
          </div>
          <span>{fmtTime(clock)} <b>{workspace.tz}</b></span>
        </div>
      </div>

      <div className="mdt__body">{children}</div>

      <button className="mdt__handle" onClick={onConductor}>
        <span className="mdt__handle-mark">M</span>
        <span className="mdt__handle-label">Conductor</span>
        <span className="mdt__handle-count tnum">{conductorCount}</span>
      </button>
    </div>
  );
};

// ── Small shared primitives
const Pill = ({ tone='neutral', children, mono=false }) => (
  <span className={'m-pill m-pill--' + tone + (mono ? ' mono' : '')}>{children}</span>
);

const Hr = ({ ink=false }) => <div className={ink ? 'rule-ink' : 'hairline'} />;

const ModDot2 = ({ k, size=6 }) => {
  const m = modByKey(k);
  if (!m) return null;
  return <span style={{ display:'inline-block', width:size, height:size, borderRadius:'50%', background:m.ac, flex:'none' }} title={m.n} />;
};

// ── Sparkline (editorial, thin)
const Spark2 = ({ data=[], w=120, h=28, color='var(--ink)', area=true }) => {
  if (!data.length) return null;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v,i) => [ (i/(data.length-1))*w, h - ((v-min)/range)*(h-4) - 2 ]);
  const d = pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display:'block' }}>
      {area && <path d={d + ` L${w},${h} L0,${h} Z`} fill="currentColor" opacity="0.08" />}
      <path d={d} fill="none" stroke={color} strokeWidth="1.25" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

export { Shell, MOD2, modByKey, Nav2Ctx, useNav2, Pill, Hr, ModDot2, Spark2, useClock, useHeartbeat, fmtTime };
