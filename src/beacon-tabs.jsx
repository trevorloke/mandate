import React from 'react';
import './beacon-tabs.css';
import { BEACON_ACCOUNTS as BEACON_ACCOUNTS_FB, BEACON_DAYS, BEACON_POSTS as BEACON_POSTS_FB } from './beacon-data';
import { useLiveRecords } from './auth/useLiveRecords';
import { BEACON_TRACKED_TERMS, BEACON_MENTION_TIMELINE, BEACON_AUTHORS, BEACON_SOV_HISTORY, BEACON_TOP_POSTS, BEACON_ENG_OVER_TIME, BEACON_BEST_TIME, BEACON_CONTENT_SCORE, BEACON_BOOSTS, BEACON_BOOST_SUGGESTIONS, BEACON_PRESS, BEACON_PRESS_OUTLETS } from './beacon-data2';

// Mandate 2.0 — Beacon · Queue / Listening / Performance / Boost / Press tabs

const PLAT_TAB = {
  x:    { label:'X',    cls:'x' },
  ig:   { label:'IG',   cls:'ig' },
  fb:   { label:'FB',   cls:'fb' },
  tt:   { label:'TT',   cls:'tt' },
  li:   { label:'LI',   cls:'li' },
  yt:   { label:'YT',   cls:'yt' },
  news: { label:'PR',   cls:'news' },
  reddit:{ label:'RD',  cls:'news' },
  alert:{ label:'!!',   cls:'news' },
};

// ─────────────────────────────────────────────────────────────────────────
// QUEUE TAB — flat list of all posts grouped by day, with kanban-ish columns
// ─────────────────────────────────────────────────────────────────────────

function BTabQueue({ onOpenPost }) {
  const { records: BEACON_POSTS } = useLiveRecords('beacon', 'post', BEACON_POSTS_FB);
  const lanes = [
    { key:'DRAFT',     label:'Draft',     hint:'requires editing' },
    { key:'needs',     label:'Awaiting sign-off', hint:'5 items'  },
    { key:'SCHEDULED', label:'Scheduled', hint:'queued for publish' },
    { key:'LIVE',      label:'Live',      hint:'shipped today' },
    { key:'HOLD',      label:'On hold',   hint:'legal / political' },
  ];
  const bucket = (p) => {
    if (p.status === 'DRAFT' && p.signoff && p.signoff.startsWith('needs')) return 'needs';
    return p.status;
  };
  const grouped = {};
  lanes.forEach(l => grouped[l.key] = []);
  BEACON_POSTS.forEach(p => {
    const k = bucket(p);
    if (grouped[k]) grouped[k].push(p);
  });

  return (
    <div className="b-queue">
      {lanes.map(l => (
        <div key={l.key} className={'b-q-lane b-q-lane--' + l.key}>
          <div className="b-q-lane__hd">
            <div className="b-q-lane__title">{l.label}</div>
            <div className="b-q-lane__count">{grouped[l.key].length}</div>
            <div className="b-q-lane__hint">{l.hint}</div>
          </div>
          <div className="b-q-lane__body">
            {grouped[l.key].map(p => {
              const plat = PLAT_TAB[p.platform];
              return (
                <div key={p.id} className="b-q-card" onClick={() => onOpenPost(p)}>
                  <div className="b-q-card__hd">
                    <span className={'b-post__plat b-post__plat--' + plat.cls}>{plat.label}</span>
                    <span className="b-q-card__day">{p.day.toUpperCase()} · {p.slot}</span>
                    {p.urgent && <span className="b-q-card__urgent">URGENT</span>}
                  </div>
                  <div className="b-q-card__title">{p.headline}</div>
                  <div className="b-q-card__body">{p.body}</div>
                  <div className="b-q-card__ft">
                    {p.author && <span>{p.author}</span>}
                    {p.signoff && <span className="b-q-card__sig">· {p.signoff}</span>}
                    {p.boost && <span className="b-post__boost">◆ {p.boost.spend}</span>}
                  </div>
                </div>
              );
            })}
            {grouped[l.key].length === 0 && (
              <div className="b-q-empty">— nothing here —</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// LISTENING TAB — tracked terms, mention timeline, top authors, SoV
// ─────────────────────────────────────────────────────────────────────────

function BSparkBars({ data, max, color = 'var(--b-accent)', height = 56 }) {
  const m = max || Math.max(...data, 1);
  return (
    <svg className="b-spark-bars" viewBox={`0 0 ${data.length * 4} ${height}`} preserveAspectRatio="none"
         style={{ width:'100%', height: height+'px', display:'block' }}>
      {data.map((v, i) => {
        const h = (v / m) * (height - 2);
        return <rect key={i} x={i*4 + 0.5} y={height - h} width={3} height={h} fill={color} />;
      })}
    </svg>
  );
}

function BTabListening() {
  const maxMent = Math.max(...BEACON_MENTION_TIMELINE);
  return (
    <div className="b-listen-tab">
      {/* Top: timeline + tracked terms summary */}
      <div className="b-l-grid">
        <section className="b-l-panel b-l-panel--span2">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Mention volume · last 24h</div>
            <div className="b-l-panel__sub">848 total · 412 about Marcus directly · spike at 14:00 (Vance quote)</div>
          </div>
          <div className="b-l-panel__body">
            <BSparkBars data={BEACON_MENTION_TIMELINE} height={120} />
            <div className="b-l-axis">
              <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>now</span>
            </div>
          </div>
        </section>

        <section className="b-l-panel">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Share of voice · 14d</div>
            <div className="b-l-panel__sub">Hale 34% · Vance 28% · Premier 21%</div>
          </div>
          <div className="b-l-panel__body">
            <BSovChart data={BEACON_SOV_HISTORY} />
          </div>
        </section>
      </div>

      <div className="b-l-grid b-l-grid--equal">
        <section className="b-l-panel">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Tracked terms</div>
            <div className="b-l-panel__sub">8 active · auto-flagged · drag to reorder</div>
          </div>
          <div className="b-l-panel__body b-l-panel__body--list">
            {BEACON_TRACKED_TERMS.map((t, i) => (
              <div key={i} className="b-term">
                <div className="b-term__name">{t.term}</div>
                <div className="b-term__count">{t.mentions.toLocaleString()}</div>
                <div className={'b-term__delta ' + (t.delta.startsWith('+') ? 'pos' : 'neg')}>{t.delta}</div>
                <div className="b-term__sent">
                  <BSentimentBar v={t.sentiment} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="b-l-panel">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Top authors · 24h</div>
            <div className="b-l-panel__sub">By reach × mentions</div>
          </div>
          <div className="b-l-panel__body b-l-panel__body--list">
            {BEACON_AUTHORS.map((a, i) => (
              <div key={i} className="b-author">
                <span className={'b-author__kind b-author__kind--' + a.kind}>{a.kind === 'news' ? 'PR' : a.kind === 'reddit' ? 'RD' : 'X'}</span>
                <div className="b-author__main">
                  <div className="b-author__name">{a.name}</div>
                  <div className="b-author__handle">{a.handle}</div>
                </div>
                <div className="b-author__num">{a.reach}</div>
                <div className="b-author__num b-author__num--small">{a.posts}p</div>
                <BSentimentDot v={a.sentiment} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function BSentimentBar({ v }) {
  // v is -1..1 — render as centered bar
  const pct = Math.abs(v) * 50;
  const color = v >= 0 ? 'var(--ok)' : 'var(--danger)';
  return (
    <div className="b-sb">
      <div className="b-sb__track">
        <div className="b-sb__fill" style={{
          left: v >= 0 ? '50%' : (50 - pct) + '%',
          width: pct + '%',
          background: color
        }} />
        <div className="b-sb__zero" />
      </div>
      <div className="b-sb__num" style={{ color }}>
        {v >= 0 ? '+' : ''}{(v*100).toFixed(0)}
      </div>
    </div>
  );
}

function BSentimentDot({ v }) {
  const color = v >= 0.3 ? 'var(--ok)' : v <= -0.3 ? 'var(--danger)' : 'var(--text-3)';
  return <span style={{
    width: 8, height: 8, borderRadius: '50%', background: color, display:'inline-block', flex:'none',
  }} title={`sentiment ${v.toFixed(2)}`} />;
}

function BSovChart({ data }) {
  const W = 320, H = 140, P = 18;
  const xs = (i) => P + (i / (data.length - 1)) * (W - P*2);
  const ys = (v) => H - P - (v / 50) * (H - P*2);
  const lines = [
    { key:'hale', label:'Hale', color:'var(--b-accent)', dash:false },
    { key:'vance', label:'Vance', color:'var(--text-2)', dash:true },
    { key:'prem',  label:'Premier', color:'var(--text-3)', dash:true },
  ];
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'140px', display:'block' }}>
        {/* gridlines */}
        {[0, 20, 40].map(g => (
          <line key={g} x1={P} x2={W-P} y1={ys(g)} y2={ys(g)} stroke="var(--rule)" strokeWidth="1" />
        ))}
        {[0, 20, 40].map(g => (
          <text key={g} x={4} y={ys(g)+3} fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-3)">{g}%</text>
        ))}
        {lines.map(l => {
          const d = data.map((p, i) => `${i?'L':'M'} ${xs(i).toFixed(1)} ${ys(p[l.key]).toFixed(1)}`).join(' ');
          return <path key={l.key} d={d} fill="none" stroke={l.color} strokeWidth="1.6"
                       strokeDasharray={l.dash ? '3 3' : undefined} strokeLinejoin="round" strokeLinecap="round" />;
        })}
        {/* end-points */}
        {lines.map(l => (
          <g key={l.key+'pt'}>
            <circle cx={xs(data.length-1)} cy={ys(data[data.length-1][l.key])} r="2.5" fill={l.color} />
            <text x={xs(data.length-1)+5} y={ys(data[data.length-1][l.key])+3}
                  fontSize="10" fontFamily="var(--font-mono)" fill={l.color}>{l.label}</text>
          </g>
        ))}
      </svg>
      <div className="b-l-axis">
        <span>{data[0].d}</span>
        <span>{data[Math.floor(data.length/2)].d}</span>
        <span>now</span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PERFORMANCE TAB — top posts, engagement curves, audience growth, score
// ─────────────────────────────────────────────────────────────────────────

function BTabPerformance() {
  return (
    <div className="b-perf">
      {/* Row 1: top posts list + content score */}
      <div className="b-perf__row">
        <section className="b-l-panel" style={{ flex: '2 1 0' }}>
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Top performing · last 14 days</div>
            <div className="b-l-panel__sub">Ranked by engagement × reach. 5 of 87 posts shown.</div>
          </div>
          <div className="b-l-panel__body b-l-panel__body--list">
            {BEACON_TOP_POSTS.map((p, i) => {
              const plat = PLAT_TAB[p.platform];
              return (
                <div key={p.id} className="b-tp">
                  <div className="b-tp__rank">{(i+1).toString().padStart(2,'0')}</div>
                  <span className={'b-post__plat b-post__plat--' + plat.cls}>{plat.label}</span>
                  <div className="b-tp__main">
                    <div className="b-tp__title">{p.headline}</div>
                    <div className="b-tp__body">{p.body}</div>
                  </div>
                  <div className="b-tp__nums">
                    <div className="b-tp__num"><span className="b-tp__nv">{p.imp}</span><span>imp</span></div>
                    <div className="b-tp__num"><span className="b-tp__nv">{p.eng}</span><span>eng</span></div>
                    <div className="b-tp__num"><span className="b-tp__nv">{p.shares.toLocaleString()}</span><span>shares</span></div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="b-l-panel" style={{ flex: '1 1 0' }}>
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Content scorecard · this week</div>
            <div className="b-l-panel__sub">vs. prior week · 4-axis rubric</div>
          </div>
          <div className="b-l-panel__body">
            {Object.entries(BEACON_CONTENT_SCORE).map(([k, s]) => (
              <div key={k} className="b-score">
                <div className="b-score__hd">
                  <div className="b-score__name">{k}</div>
                  <div className="b-score__val">{s.score}</div>
                  <div className={'b-score__delta ' + (s.delta.startsWith('+') ? 'pos' : 'neg')}>{s.delta}</div>
                </div>
                <div className="b-score__bar">
                  <div className="b-score__bar-fill" style={{ width: (s.score * 10) + '%' }} />
                </div>
                <div className="b-score__sub">{s.sub}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Row 2: engagement-over-time curves + best time heatmap */}
      <div className="b-perf__row">
        <section className="b-l-panel" style={{ flex: '1 1 0' }}>
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Engagement rate · trailing 8 weeks</div>
            <div className="b-l-panel__sub">Per-platform · % engaged of impressions</div>
          </div>
          <div className="b-l-panel__body">
            <BEngChart data={BEACON_ENG_OVER_TIME} />
          </div>
        </section>

        <section className="b-l-panel" style={{ flex: '1 1 0' }}>
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Best time to post</div>
            <div className="b-l-panel__sub">Engagement % · day × 3-hour window</div>
          </div>
          <div className="b-l-panel__body">
            <BHeatmap data={BEACON_BEST_TIME} />
          </div>
        </section>
      </div>
    </div>
  );
}

function BEngChart({ data }) {
  const W = 360, H = 160, P = 22;
  const lines = [
    { key:'tt', label:'TikTok', color:'#e5366b' },
    { key:'ig', label:'Instagram', color:'#f58529' },
    { key:'x',  label:'X', color:'#0c0c0c' },
    { key:'fb', label:'Facebook', color:'#1877f2' },
  ];
  const max = 12;
  const xs = (i) => P + (i / (data.length - 1)) * (W - P*2);
  const ys = (v) => H - P - (v / max) * (H - P*2);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:'160px', display:'block' }}>
        {[0, 4, 8, 12].map(g => (
          <g key={g}>
            <line x1={P} x2={W-P} y1={ys(g)} y2={ys(g)} stroke="var(--rule)" strokeWidth="1" />
            <text x={4} y={ys(g)+3} fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-3)">{g}%</text>
          </g>
        ))}
        {lines.map(l => {
          const d = data.map((p, i) => `${i?'L':'M'} ${xs(i).toFixed(1)} ${ys(p[l.key]).toFixed(1)}`).join(' ');
          return <path key={l.key} d={d} fill="none" stroke={l.color} strokeWidth="1.8" strokeLinejoin="round" />;
        })}
        {data.map((p, i) => (
          <text key={i} x={xs(i)} y={H-4} fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-3)" textAnchor="middle">{p.d}</text>
        ))}
        {lines.map((l, i) => (
          <g key={l.key+'lab'}>
            <circle cx={xs(data.length-1)} cy={ys(data[data.length-1][l.key])} r="3" fill={l.color} />
            <text x={xs(data.length-1)+6} y={ys(data[data.length-1][l.key])+3} fontSize="10" fontFamily="var(--font-mono)" fill={l.color}>{l.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function BHeatmap({ data }) {
  const cols = ['00–03','03–06','06–09','09–12','12–15','15–18','18–21','21–24'];
  const max = Math.max(...data.flatMap(r => r.vals));
  return (
    <div className="b-heatmap">
      <div className="b-heatmap__cols">
        <div className="b-heatmap__day-spacer" />
        {cols.map(c => <div key={c} className="b-heatmap__col-lbl">{c}</div>)}
      </div>
      {data.map(row => (
        <div key={row.d} className="b-heatmap__row">
          <div className="b-heatmap__day">{row.d}</div>
          {row.vals.map((v, i) => {
            const opacity = 0.08 + (v / max) * 0.92;
            const isPeak = v === max;
            return (
              <div key={i} className={'b-heatmap__cell' + (isPeak ? ' b-heatmap__cell--peak' : '')}
                style={{ background: `rgba(184,51,74,${opacity})` }}>
                {v.toFixed(1)}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// BOOST TAB — paid promotions, suggestions, spend chart
// ─────────────────────────────────────────────────────────────────────────

function BTabBoost() {
  const totalSpend = BEACON_BOOSTS.filter(b => b.state === 'ACTIVE').reduce((a,b) => a + b.spend, 0);
  const totalBudget = BEACON_BOOSTS.reduce((a,b) => a + b.budget, 0);
  const totalImp = BEACON_BOOSTS.reduce((a,b) => a + b.impressions, 0);
  const totalConv = BEACON_BOOSTS.reduce((a,b) => a + b.conversions, 0);

  return (
    <div className="b-boost">
      {/* Stat strip */}
      <div className="b-boost__strip">
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Active spend</div>
          <div className="b-boost__stat-val">${totalSpend.toLocaleString()}</div>
          <div className="b-boost__stat-sub">of ${totalBudget.toLocaleString()} authorized</div>
        </div>
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Paid impressions</div>
          <div className="b-boost__stat-val">{(totalImp/1000).toFixed(0)}K</div>
          <div className="b-boost__stat-sub">+34% vs prior week</div>
        </div>
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Conversions</div>
          <div className="b-boost__stat-val">{totalConv.toLocaleString()}</div>
          <div className="b-boost__stat-sub">signups + petition + RSVP</div>
        </div>
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Cost per</div>
          <div className="b-boost__stat-val">${(totalSpend/totalConv).toFixed(2)}</div>
          <div className="b-boost__stat-sub">blended · target $4.50</div>
        </div>
      </div>

      <div className="b-l-grid">
        <section className="b-l-panel b-l-panel--span2">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Active campaigns</div>
            <div className="b-l-panel__sub">{BEACON_BOOSTS.filter(b => b.state==='ACTIVE').length} live · {BEACON_BOOSTS.filter(b => b.state==='PLANNED').length} planned</div>
          </div>
          <div className="b-l-panel__body">
            <table className="b-camp">
              <thead>
                <tr>
                  <th>Campaign</th><th>Audience</th><th>Spend</th><th>CTR</th><th>Imp / Conv</th><th>State</th>
                </tr>
              </thead>
              <tbody>
                {BEACON_BOOSTS.map(b => {
                  const plat = PLAT_TAB[b.platform];
                  const pct = b.budget ? Math.min(100, (b.spend / b.budget) * 100) : 0;
                  return (
                    <tr key={b.id} className={'b-camp__row b-camp__row--' + b.state}>
                      <td className="b-camp__title">
                        <div style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                          <span className={'b-post__plat b-post__plat--' + plat.cls} style={{ marginTop:2 }}>{plat.label}</span>
                          <div>
                            <div className="b-camp__h">{b.headline}</div>
                            <div className="b-camp__sub">{b.started} → {b.ends}</div>
                          </div>
                        </div>
                      </td>
                      <td className="b-camp__aud">{b.audience}</td>
                      <td className="b-camp__spend">
                        <div className="b-camp__amt">${b.spend.toLocaleString()} <span style={{color:'var(--text-3)'}}>/ ${b.budget.toLocaleString()}</span></div>
                        <div className="b-camp__bar"><div className="b-camp__bar-fill" style={{ width: pct+'%' }} /></div>
                      </td>
                      <td className="b-camp__num">{b.ctr ? b.ctr+'%' : '—'}</td>
                      <td className="b-camp__num">
                        {b.impressions ? <>
                          <div>{(b.impressions/1000).toFixed(1)}K</div>
                          <div style={{color:'var(--text-3)', fontSize:10}}>{b.conversions} conv</div>
                        </> : '—'}
                      </td>
                      <td>
                        <span className={'b-camp__state b-camp__state--' + b.state}>{b.state}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="b-l-panel">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Suggested boosts</div>
            <div className="b-l-panel__sub">Organic posts saturating · amplify candidates</div>
          </div>
          <div className="b-l-panel__body b-l-panel__body--list">
            {BEACON_BOOST_SUGGESTIONS.map(s => {
              const plat = PLAT_TAB[s.platform];
              return (
                <div key={s.id} className="b-sug">
                  <div className="b-sug__hd">
                    <span className={'b-post__plat b-post__plat--' + plat.cls}>{plat.label}</span>
                    <span className="b-sug__title">{s.headline}</span>
                  </div>
                  <div className="b-sug__why">{s.why}</div>
                  <div className="b-sug__meta">
                    <span>{s.organic_imp} organic</span>
                    <span>·</span>
                    <span>{s.organic_eng} eng</span>
                  </div>
                  <div className="b-sug__rec">
                    <div>
                      <div className="b-sug__rec-lbl">Recommend</div>
                      <div className="b-sug__rec-val">${s.recommend}</div>
                    </div>
                    <div>
                      <div className="b-sug__rec-lbl">Est lift</div>
                      <div className="b-sug__rec-val" style={{ color:'var(--ok)' }}>{s.est_lift}</div>
                    </div>
                    <button className="b-sug__btn">Boost</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// PRESS TAB — journalists list, outlet breakdown, relationship strength
// ─────────────────────────────────────────────────────────────────────────

function BTabPress() {
  const totalReplies = BEACON_PRESS.reduce((a,p) => a+p.replies, 0);
  const totalEmails = BEACON_PRESS.reduce((a,p) => a+p.emails, 0);
  const replyRate = ((totalReplies/totalEmails)*100).toFixed(0);

  return (
    <div className="b-press">
      {/* Strip */}
      <div className="b-boost__strip">
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Press list size</div>
          <div className="b-boost__stat-val">184</div>
          <div className="b-boost__stat-sub">across 6 categories</div>
        </div>
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Reply rate · 30d</div>
          <div className="b-boost__stat-val">{replyRate}%</div>
          <div className="b-boost__stat-sub">{totalReplies} of {totalEmails} pitches</div>
        </div>
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Strong relationships</div>
          <div className="b-boost__stat-val" style={{color:'var(--ok)'}}>{BEACON_PRESS.filter(p => p.relationship==='strong').length}</div>
          <div className="b-boost__stat-sub">replies in 24h</div>
        </div>
        <div className="b-boost__stat">
          <div className="b-boost__stat-lbl">Cooling</div>
          <div className="b-boost__stat-val" style={{color:'var(--warn)'}}>{BEACON_PRESS.filter(p => p.relationship==='cool').length}</div>
          <div className="b-boost__stat-sub">need re-engagement</div>
        </div>
      </div>

      <div className="b-l-grid">
        <section className="b-l-panel b-l-panel--span2">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Journalist roster</div>
            <div className="b-l-panel__sub">12 of 184 shown · sortable · filter by beat</div>
          </div>
          <div className="b-l-panel__body">
            <table className="b-press-tbl">
              <thead>
                <tr>
                  <th>Journalist</th><th>Outlet · beat</th><th>Relationship</th><th>Last contact</th><th>Replies / Emails</th><th>Recent</th><th>Pitch</th>
                </tr>
              </thead>
              <tbody>
                {BEACON_PRESS.map(p => (
                  <tr key={p.id} className="b-press-row">
                    <td><div className="b-press__name">{p.name}</div><div className="b-press__email">{p.email}</div></td>
                    <td><div className="b-press__outlet">{p.outlet}</div><div className="b-press__beat">{p.beat}</div></td>
                    <td><span className={'b-press__rel b-press__rel--' + p.relationship}>{p.relationship}</span></td>
                    <td className="b-press__last">{p.last} ago</td>
                    <td className="b-press__num">
                      <div>{p.replies} <span style={{color:'var(--text-3)'}}>/ {p.emails}</span></div>
                      <div style={{ width: 60, height: 3, background:'var(--rule)', borderRadius:2, marginTop:2 }}>
                        <div style={{ width: `${(p.replies/p.emails)*100}%`, height:'100%', background:'var(--ok)', borderRadius:2 }} />
                      </div>
                    </td>
                    <td className="b-press__recent"><em>{p.recent}</em></td>
                    <td className="b-press__pitch">
                      <div className="b-press__pitch-num">{p.pitch_score}</div>
                      <div className="b-press__pitch-bar"><div style={{ width: (p.pitch_score*10)+'%' }} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="b-l-panel">
          <div className="b-l-panel__hd">
            <div className="b-l-panel__title">Press list breakdown</div>
            <div className="b-l-panel__sub">By medium</div>
          </div>
          <div className="b-l-panel__body b-l-panel__body--list">
            {BEACON_PRESS_OUTLETS.map((o, i) => {
              const max = Math.max(...BEACON_PRESS_OUTLETS.map(x => x.count));
              return (
                <div key={i} className="b-outlet">
                  <div className="b-outlet__name">{o.name}</div>
                  <div className="b-outlet__count">{o.count}</div>
                  <div className="b-outlet__bar"><div className="b-outlet__bar-fill" style={{ width: (o.count/max)*100 + '%' }} /></div>
                  <div className="b-outlet__sub">{o.sub}</div>
                </div>
              );
            })}
            <div style={{ borderTop: '1px solid var(--rule)', marginTop: 6, paddingTop: 10, fontFamily:'var(--font-mono)', fontSize: 10, color:'var(--text-3)', letterSpacing:'.08em', textTransform:'uppercase' }}>
              ⌄ Press release queue
            </div>
            <div className="b-pressrel">
              <div className="b-pressrel__hd"><strong>EMBARGOED · Friday 11:00</strong></div>
              <div className="b-pressrel__body">Committee vote · Bill X-14 · Press list (184)</div>
            </div>
            <div className="b-pressrel">
              <div className="b-pressrel__hd">DRAFT</div>
              <div className="b-pressrel__body">Op-ed teaser · Tyee · Tuesday 12:00</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export { BTabQueue, BTabListening, BTabPerformance, BTabBoost, BTabPress, BSparkBars, BSentimentBar, BSentimentDot, BSovChart, BEngChart, BHeatmap };
