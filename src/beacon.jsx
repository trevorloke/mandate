import React from 'react';
import './beacon.css';
import { BEACON_ACCOUNTS as BEACON_ACCOUNTS_FB, BEACON_POSTS as BEACON_POSTS_FB, BEACON_LISTENING as BEACON_LISTENING_FB, BEACON_METRICS } from './beacon-data';
import { useLiveRecords } from './auth/useLiveRecords';
import { useBusinessMetrics } from './auth/useBusinessMetrics';
import { BTabQueue, BTabBoost, BTabPress } from './beacon-tabs';
import { BConnections, BComposer, BOutbox, BPerformance, BInbox, BLibrary, BFeeds, BScheduleCalendar, BListening, BHealth } from './beacon-social';
import { useSocial } from './use-social';

// Mandate 2.0 — Beacon

const { useState: bUS, useEffect: bUE } = React;

// Platform label + icon class
const PLAT = {
  x:    { label:'X',       cls:'x' },
  ig:   { label:'IG',      cls:'ig' },
  fb:   { label:'FB',      cls:'fb' },
  tt:   { label:'TT',      cls:'tt' },
  li:   { label:'LI',      cls:'li' },
  yt:   { label:'YT',      cls:'yt' },
  news: { label:'PR',      cls:'news' },
};

// ── Top metric cell
function BMetric({ m }) {
  const pts = m.spark;
  const max = Math.max(...pts), min = Math.min(...pts);
  const range = max - min || 1;
  const w = 80, h = 24;
  const d = pts.map((v,i) => [
    (i/(pts.length-1))*w,
    h - ((v-min)/range)*(h-2) - 1
  ]);
  const pathD = d.map((p,i) => (i?'L':'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

  return (
    <div className="b-metric">
      <div className="b-metric__lbl">{m.label}</div>
      <div className="b-metric__val">
        <span className="n">{m.val}</span>
      </div>
      <div className={'b-metric__delta' + (m.tone==='pos' ? ' b-metric__delta--pos' : (m.tone==='warn' ? ' b-metric__delta--warn' : ''))}>
        {m.delta}
      </div>
      <div className="b-metric__sub">{m.sub}</div>
      <svg className="b-metric__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Post modal
function BModal({ post, onClose }) {
  if (!post) return null;
  const plat = PLAT[post.platform] || { label:'', cls:'' };
  return (
    <div className="b-modal-backdrop" onClick={onClose}>
      <div className="b-modal" onClick={e => e.stopPropagation()}>
        <div className="b-modal__hd">
          <span className={'b-post__plat b-post__plat--' + plat.cls} style={{ width: 26, height: 26, fontSize: 11 }}>{plat.label}</span>
          <div>
            <div className="b-modal__hd-title">{post.headline}</div>
            <div className="b-modal__hd-meta">{post.slot} · {post.status} · {plat.label}</div>
          </div>
          <div className="b-modal__hd-x" onClick={onClose}>ESC</div>
        </div>
        <div className="b-modal__body">
          <div>
            <div className="b-modal__sect-lbl">PREVIEW</div>
            <div className="b-modal__preview">{post.body}</div>
          </div>
          <div>
            <div className="b-modal__sect-lbl">DETAILS</div>
            {post.author && <div className="b-modal__row"><span className="b-modal__row-k">Author</span><span>{post.author}</span></div>}
            {post.signoff && <div className="b-modal__row"><span className="b-modal__row-k">Sign-off</span><span>{post.signoff}</span></div>}
            {post.boost && <div className="b-modal__row"><span className="b-modal__row-k">Paid boost</span><span>{post.boost.spend} · {post.boost.state}</span></div>}
            {post.stats && <div className="b-modal__row"><span className="b-modal__row-k">Live performance</span><span>{post.stats.imp} impressions · {post.stats.eng} engagement</span></div>}
            <div className="b-modal__row"><span className="b-modal__row-k">Scheduled</span><span>Monday, April 14 · {post.slot} PT</span></div>
            <div className="b-modal__row"><span className="b-modal__row-k">Cross-post</span><span>Coupled with p{String(post.id || '').slice(1)} on companion account</span></div>
          </div>
        </div>
        <div className="b-modal__ft">
          <button className="b-modal__btn">Edit draft</button>
          <button className="b-modal__btn">Reschedule</button>
          <button className="b-modal__btn b-modal__btn--approve">✓ Approve & publish</button>
        </div>
      </div>
    </div>
  );
}

// ── Root
function Beacon() {
  const [tab, setTab] = bUS('calendar');
  const [openPost, setOpenPost] = bUS(null);
  const [composerOpen, setComposerOpen] = bUS(false);
  const [outboxKey, setOutboxKey] = bUS(0);
  // Real connected accounts (for the composer + Connections tab).
  const { accounts: socialAccounts } = useSocial();
  const { records: BEACON_ACCOUNTS } = useLiveRecords('beacon', 'account', BEACON_ACCOUNTS_FB);
  const { records: BEACON_POSTS } = useLiveRecords('beacon', 'post', BEACON_POSTS_FB);
  const { records: BEACON_LISTENING } = useLiveRecords('beacon', 'mention', BEACON_LISTENING_FB);
  const bizMetrics = useBusinessMetrics();

  bUE(() => {
    const esc = (e) => { if (e.key === 'Escape') setOpenPost(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  // Note: we no longer hard-gate the whole module on an empty mock dataset —
  // the Connections/Compose/Outbox surfaces must stay reachable so users can
  // connect real accounts and publish even in a fresh workspace.

  // Ribbon: when BEACON_METRICS is configured, layer business-metrics on
  // top. Otherwise compute a minimal live ribbon from the workspace's own
  // posts / accounts / mentions so the strip reflects real workspace state.
  const ribbon = BEACON_METRICS.length > 0
    ? BEACON_METRICS.map(m => {
        const mk = bizMetrics[`beacon.${m.key}`];
        if (!mk) return m;
        if (mk.source === 'integration') return { ...m, val: mk.display, delta: 'needs integration', sub: 'Connect a media-monitoring integration to populate.' };
        const spark = (mk.spark && mk.spark.length >= 2) ? mk.spark : (mk.value != null ? [mk.value, mk.value] : m.spark);
        return { ...m, val: mk.display, delta: mk.delta?.text ?? '—', spark };
      })
    : [
        { key:'posts',    label:'Posts in workspace', val: String(BEACON_POSTS.length),    delta:'', sub:'', spark: [] },
        { key:'queued',   label:'Queued',             val: String(BEACON_POSTS.filter(p => ['SCHEDULED','queued','DRAFT'].includes(p.status)).length), delta:'', sub:'', spark: [] },
        { key:'accounts', label:'Accounts',           val: String(BEACON_ACCOUNTS.length), delta:'', sub:'', spark: [] },
        { key:'mentions', label:'Mentions',           val: String(BEACON_LISTENING.length), delta:'', sub:'', spark: [] },
      ];

  return (
    <div className="beacon">
      {/* Ribbon */}
      <div className="beacon__ribbon">
        {ribbon.map(m => <BMetric key={m.key} m={m} />)}
      </div>

      {/* Tabs */}
      <div className="beacon__tabs">
        {[
          ['connect','Connections'],
          ['outbox','Outbox'],
          ['inbox','Inbox'],
          ['library','Library'],
          ['calendar','Calendar'],
          ['queue','Publishing queue'],
          ['listen','Listening'],
          ['performance','Performance'],
          ['health','System'],
          ['boost','Boost'],
          ['press','Press list'],
        ].map(([k, l]) => (
          <div
            key={k}
            className={'beacon__tab' + (tab===k ? ' beacon__tab--active' : '')}
            onClick={() => setTab(k)}
          >{l}</div>
        ))}
        <div className="beacon__tabs-right">
          <span style={{ color: 'var(--text-3)' }}>This week · {BEACON_POSTS.length} posts · {BEACON_POSTS.filter(p => p.status !== 'LIVE' && p.status !== 'SCHEDULED').length} awaiting</span>
          <div className="beacon__compose" onClick={() => setComposerOpen(true)}>◇ Compose</div>
        </div>
      </div>

      {/* Body */}
      <div className="beacon__body beacon__body--full">
        {tab === 'calendar'    && <BScheduleCalendar />}
        {tab === 'connect'     && <BConnections />}
        {tab === 'outbox'      && <BOutbox key={outboxKey} />}
        {tab === 'inbox'       && <BInbox />}
        {tab === 'library'     && <><BLibrary /><BFeeds /></>}
        {tab === 'queue'       && <BTabQueue onOpenPost={setOpenPost} />}
        {tab === 'listen'      && <BListening />}
        {tab === 'performance' && <BPerformance />}
        {tab === 'health'      && <BHealth />}
        {tab === 'boost'       && <BTabBoost />}
        {tab === 'press'       && <BTabPress />}
      </div>

      <BModal post={openPost} onClose={() => setOpenPost(null)} />
      {composerOpen && (
        <BComposer
          accounts={socialAccounts}
          onClose={() => setComposerOpen(false)}
          onPosted={() => setOutboxKey(k => k + 1)}
        />
      )}
    </div>
  );
}

export { Beacon };
