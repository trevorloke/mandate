import React from 'react';
import './beacon.css';
import { BEACON_ACCOUNTS as BEACON_ACCOUNTS_FB, BEACON_DAYS, BEACON_POSTS as BEACON_POSTS_FB, BEACON_LISTENING, BEACON_APPROVALS, BEACON_METRICS } from './beacon-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { BTabQueue, BTabListening, BTabPerformance, BTabBoost, BTabPress } from './beacon-tabs';

// Mandate 2.0 — Beacon

const { useState: bUS, useEffect: bUE, useMemo: bUM } = React;

// Time slot → row index (calendar starts 6am, 1hr = 2 rows of 30min)
const START_HOUR = 6;
const ROWS_PER_HOUR = 2;
const HOUR_PX = 56 * ROWS_PER_HOUR; // matches grid-auto-rows: 56px × 2
const slotToRow = (slot) => {
  const [h,m] = slot.split(':').map(Number);
  return (h - START_HOUR) * ROWS_PER_HOUR + (m >= 30 ? 1 : 0) + 1; // 1-indexed
};
const slotToTop = (slot) => {
  const [h,m] = slot.split(':').map(Number);
  return ((h - START_HOUR) + m/60) * HOUR_PX;
};

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

// ── Calendar post card
function BPost({ p, onOpen }) {
  const plat = PLAT[p.platform];
  return (
    <div
      className={'b-post b-post--' + p.status}
      style={{
        top: (slotToTop(p.slot) + 4) + 'px',
        height: '56px',
      }}
      onClick={() => onOpen(p)}
    >
      {p.urgent && <span className="b-post__urgent" />}
      <div className="b-post__hd">
        <span className={'b-post__plat b-post__plat--' + plat.cls}>{plat.label}</span>
        <span className="b-post__time">{p.slot}</span>
        <span className="b-post__status">· {p.status}</span>
      </div>
      <div className="b-post__title">{p.headline}</div>
      {(p.boost || p.stats) && (
        <div className="b-post__foot">
          {p.boost && <span className="b-post__boost">◆ BOOST {p.boost.spend}</span>}
          {p.stats && <span>{p.stats.imp} · {p.stats.eng}</span>}
        </div>
      )}
    </div>
  );
}

// ── Calendar grid
function BCalendar({ onOpenPost }) {
  const { records: BEACON_POSTS } = useLiveRecords('beacon', 'post', BEACON_POSTS_FB);
  const hours = Array.from({ length: 16 }, (_, i) => START_HOUR + i); // 6am to 10pm

  return (
    <div className="b-cal">
      <div className="b-cal__hd">
        <div className="b-cal__hd-corner">PT</div>
        {BEACON_DAYS.map(d => (
          <div key={d.key} className={'b-cal__hd-day' + (d.today ? ' b-cal__hd-day--today' : '')}>
            <div>{d.label.split(' · ')[0]}</div>
            <div className="b-cal__hd-day-date">{d.date.split('.')[1]}</div>
          </div>
        ))}
      </div>
      <div className="b-cal__grid">
        <div className="b-cal__inner" style={{ gridTemplateRows: `repeat(${hours.length * ROWS_PER_HOUR}, 56px)` }}>
          {/* Hour labels down left column */}
          {hours.map((h, i) => (
            <React.Fragment key={h}>
              <div className="b-cal__time" style={{ gridColumn: 1, gridRow: `${i*ROWS_PER_HOUR + 1} / span ${ROWS_PER_HOUR}` }}>
                {h.toString().padStart(2,'0')}:00
              </div>
            </React.Fragment>
          ))}
          {/* 7 day columns — each spans all rows, posts absolutely positioned inside */}
          {BEACON_DAYS.map((d, di) => (
            <div
              key={d.key}
              className={'b-cal__cell' + (d.today ? ' b-cal__cell--today' : '')}
              style={{
                gridColumn: di + 2,
                gridRow: `1 / span ${hours.length * ROWS_PER_HOUR}`,
                padding: 0,
                position: 'relative',
              }}
            >
              {/* background hour lines */}
              {hours.map((h, hi) => (
                <div key={h} style={{
                  position:'absolute', left:0, right:0,
                  top: (hi*HOUR_PX) + 'px',
                  height: HOUR_PX + 'px',
                  borderBottom: '1px solid rgba(0,0,0,0.05)',
                }} />
              ))}
              {/* posts for this day */}
              {BEACON_POSTS.filter(p => p.day === d.key).map(p => (
                <BPost key={p.id} p={p} onOpen={onOpenPost} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Listening row
function BLr({ l }) {
  return (
    <div className={'b-lr b-lr--' + l.sentiment + (l.isSource ? ' b-lr--source' : '')}>
      <div className="b-lr__hd">
        <span>{l.t}</span>
        <span>·</span>
        <span className="b-lr__src">{l.src}</span>
        {l.reach && <span className="b-lr__reach">{l.reach} reach</span>}
      </div>
      <div className="b-lr__title">{l.title}</div>
      <div className="b-lr__quote">{l.quote}</div>
    </div>
  );
}

// ── Approval card
function BApp({ a, onOpen }) {
  const { records: BEACON_POSTS } = useLiveRecords('beacon', 'post', BEACON_POSTS_FB);
  const plat = PLAT[a.platform];
  return (
    <div className={'b-app' + (a.priority === 'urgent' ? ' b-app--urgent' : '')}>
      <div className="b-app__hd">
        <span className={'b-post__plat b-post__plat--' + plat.cls}>{plat.label}</span>
        <span>{a.required}</span>
        <span style={{ marginLeft:'auto' }}>waiting {a.waiting}</span>
      </div>
      <div className="b-app__title">{a.headline}</div>
      <div className="b-app__meta">requested by {a.requester}</div>
      <div className="b-app__actions">
        <button className="b-app__btn b-app__btn--approve">✓ Approve</button>
        <button className="b-app__btn b-app__btn--edit" onClick={() => onOpen(BEACON_POSTS.find(p => p.id === a.post))}>Edit</button>
        <button className="b-app__btn b-app__btn--reject">Reject</button>
      </div>
    </div>
  );
}

// ── Post modal
function BModal({ post, onClose }) {
  if (!post) return null;
  const plat = PLAT[post.platform];
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
            <div className="b-modal__row"><span className="b-modal__row-k">Cross-post</span><span>Coupled with p{post.id.slice(1)} on companion account</span></div>
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
  const [activeAcct, setActiveAcct] = bUS('x-marcus');
  const [tab, setTab] = bUS('calendar');
  const [openPost, setOpenPost] = bUS(null);
  const { records: BEACON_ACCOUNTS, isEmpty: noAccounts } = useLiveRecords('beacon', 'account', BEACON_ACCOUNTS_FB);
  const { records: BEACON_POSTS, isEmpty: noPosts } = useLiveRecords('beacon', 'post', BEACON_POSTS_FB);
  if (noAccounts && noPosts) return <EmptyModule module="BEACON" label="Beacon" accent="var(--m-beacon)" />;

  bUE(() => {
    const esc = (e) => { if (e.key === 'Escape') setOpenPost(null); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  return (
    <div className="beacon">
      {/* Ribbon */}
      <div className="beacon__ribbon">
        {BEACON_METRICS.map(m => <BMetric key={m.key} m={m} />)}
      </div>

      {/* Tabs */}
      <div className="beacon__tabs">
        {[
          ['calendar','Calendar'],
          ['queue','Publishing queue'],
          ['listen','Listening'],
          ['performance','Performance'],
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
          <span style={{ color: 'var(--text-3)' }}>This week · 18 posts · 5 awaiting</span>
          <div className="beacon__compose">◇ Compose</div>
        </div>
      </div>

      {/* Body — layout depends on active tab */}
      {tab === 'calendar' ? (
        <div className="beacon__body">
          <aside className="b-accts">
            <div className="b-accts__hd">Accounts</div>
            {BEACON_ACCOUNTS.map(a => (
              <div
                key={a.id}
                className={'b-acct' + (a.id === activeAcct ? ' b-acct--active' : '')}
                onClick={() => setActiveAcct(a.id)}
              >
                <div className={'b-acct__icon b-acct__icon--' + a.kind}>{PLAT[a.kind]?.label || a.kind.toUpperCase()}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="b-acct__name">{a.name}</div>
                  <div className="b-acct__handle">{a.handle}</div>
                </div>
                <div className="b-acct__follow">{a.followers}</div>
              </div>
            ))}
          </aside>

          <BCalendar onOpenPost={setOpenPost} />

          <aside className="b-rails">
            <div className="b-rails__hd">
              <span className="live-dot" />
              <span>Listening · live</span>
              <span className="b-rails__hd-badge">127 today</span>
            </div>
            <div className="b-listen">
              {BEACON_LISTENING.map(l => <BLr key={l.id} l={l} />)}
            </div>

            <div className="b-rails__hd">
              <span>Approval queue</span>
              <span className="b-rails__hd-badge">5</span>
            </div>
            <div className="b-apps">
              {BEACON_APPROVALS.map(a => <BApp key={a.id} a={a} onOpen={setOpenPost} />)}
            </div>
          </aside>
        </div>
      ) : (
        <div className="beacon__body beacon__body--full">
          {tab === 'queue'       && <BTabQueue onOpenPost={setOpenPost} />}
          {tab === 'listen'      && <BTabListening />}
          {tab === 'performance' && <BTabPerformance />}
          {tab === 'boost'       && <BTabBoost />}
          {tab === 'press'       && <BTabPress />}
        </div>
      )}

      <BModal post={openPost} onClose={() => setOpenPost(null)} />
    </div>
  );
}

export { Beacon };
