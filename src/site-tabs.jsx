import React from 'react';
import { SITE_PAGES as SITE_PAGES_FB, SITE_LAYER_TREE, SITE_COLLECTIONS, SITE_CMS_ISSUES, SITE_EXPERIMENTS as SITE_EXPERIMENTS_FB, SITE_FORMS as SITE_FORMS_FB, SITE_DONATE_FUNNEL, SITE_AUDIENCE, SITE_DEPLOYS, SITE_HEALTH } from './site-data';
import { useLiveRecords } from './auth/useLiveRecords';

// Site 2.0 — tab content components
// Builder canvas, CMS, Experiments, Forms, Audience, Deploys

const { useState: stUS2, useMemo: stUM2 } = React;

/* ── PAGES ── */
function SitePagesTab() {
  const { records: SITE_PAGES } = useLiveRecords('site', 'page', SITE_PAGES_FB);
  return (
    <div className="site2__pages">
      <aside className="site2__pages-aside">
        <h3 className="site2__aside-h">Sitemap · 12 routes</h3>
        <div className="site2__sitemap">
          {SITE_PAGES.map(p => (
            <div key={p.id} className={`site2__sitemap-row ${p.id==='p-home'?'is-on':''}`}>
              <span className="site2__sitemap-route">{p.route}</span>
              <span className="site2__sitemap-views">{p.views7d.toLocaleString()}</span>
            </div>
          ))}
        </div>
        <h3 className="site2__aside-h" style={{marginTop:24}}>Templates</h3>
        <div className="site2__sitemap">
          {['Landing · Hero','Long-form','Conversion','Issue page','CMS feed','Editorial','Receipt'].map(t => (
            <div key={t} className="site2__sitemap-row"><span className="site2__sitemap-route">{t}</span><span className="site2__sitemap-views">{Math.floor(Math.random()*4)+1} pages</span></div>
          ))}
        </div>
      </aside>

      <div className="site2__page-grid">
        {SITE_PAGES.map(p => (
          <article key={p.id} className={`site2__page-card ${p.status==='draft'?'draft':''}`}>
            <div className="site2__page-thumb">
              <span className="body1"></span><span className="body2"></span><span className="body3"></span><span className="cta"></span>
              {p.abTest && <span className="site2__page-thumb-ab">A/B {p.abTest}</span>}
              <span className={`site2__page-thumb-flag ${p.status==='draft'?'draft':p.status==='in-review'?'review':''}`}>
                {p.status}
              </span>
            </div>
            <div className="site2__page-meta">
              <div className="site2__page-route">{p.route}</div>
              <div className="site2__page-name">{p.title}</div>
              <div className="site2__page-stats">
                <span><b>{p.views7d.toLocaleString()}</b> views/7d</span>
                {p.conv7d!=null && <span><b>{p.conv7d.toFixed(1)}%</b> conv</span>}
              </div>
            </div>
            <div className="site2__page-foot">
              <span>{p.template}</span>
              <span>{p.author} · {p.updated}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ── BUILDER ── */
function SiteBuilderTab() {
  const [view, setView] = stUS2('desktop');
  const [sel, setSel] = stUS2('l5');

  return (
    <div className="site2__builder" style={{ gridTemplateRows: 'auto 1fr' }}>
      <div className="site2__builder-bar">
        <div style={{display:'flex', gap:14, alignItems:'center'}}>
          <strong style={{fontFamily:'var(--font-display)', fontSize:16, color:'var(--ink)'}}>Home</strong>
          <span style={{color:'var(--text-3)'}}>·  /</span>
          <span className="site2__url-pill" style={{marginLeft:0}}>kestrel-bc.ca</span>
          <span style={{color:'var(--text-3)'}}>· last save 18s ago</span>
        </div>
        <div style={{display:'flex', gap:12, alignItems:'center'}}>
          <div className="site2__viewport">
            <button className={view==='desktop'?'is-on':''} onClick={()=>setView('desktop')}>Desktop</button>
            <button className={view==='tablet'?'is-on':''} onClick={()=>setView('tablet')}>Tablet</button>
            <button className={view==='mobile'?'is-on':''} onClick={()=>setView('mobile')}>Mobile</button>
          </div>
          <span style={{color:'var(--text-3)'}}>1280 × 720</span>
          <button className="site2__c-btn ghost" style={{padding:'6px 12px', fontSize:10}}>Preview</button>
          <button className="site2__c-btn primary" style={{padding:'6px 12px', fontSize:10}}>Publish</button>
        </div>
      </div>

      {/* Layer tree */}
      <aside className="site2__panel">
        <div className="site2__panel-h"><span>Layers</span><span style={{color:'var(--text-3)'}}>17</span></div>
        <div className="site2__panel-body">
          {SITE_LAYER_TREE.map(l => (
            <div key={l.id}
              className={`site2__layer ${sel===l.id?'is-on':''}`}
              style={{ paddingLeft: 8 + l.depth*14 }}
              onClick={()=>setSel(l.id)}>
              <span className="site2__layer-glyph">
                {l.type==='page'?'◫':l.type==='section'?'▤':l.type==='text'?'T':l.type==='image'?'▢':l.type==='button'?'◉':l.type==='cms'?'◇':l.type==='nav'?'≡':l.type==='group'?'⊞':'·'}
              </span>
              <span>{l.name}</span>
              {l.bound && <span className="site2__layer-bound">CMS</span>}
              {l.abVariant && <span className="site2__layer-ab">{l.abVariant}</span>}
            </div>
          ))}
        </div>
      </aside>

      {/* Canvas */}
      <main className="site2__canvas">
        <div className="site2__canvas-page" style={{ width: view==='mobile'?420:view==='tablet'?720:880, transition:'width .25s' }}>
          {/* Header */}
          <div className="site2__c-section">
            <span className="site2__c-tag">Header / Nav</span>
            <div className="site2__c-nav">
              <strong style={{fontFamily:'var(--font-display)', fontSize:18, color:'var(--ink)'}}>KESTREL</strong>
              <span style={{display:'flex', gap:18}}>
                <span>Platform</span><span>Issues</span><span>Events</span><span>Endorsements</span><span>News</span>
              </span>
              <span className="site2__c-btn primary" style={{padding:'6px 12px', fontSize:10}}>Donate</span>
            </div>
          </div>

          {/* Hero (selected) */}
          <div className="site2__c-section" data-selected="">
            <span className="site2__c-tag">Hero · selected</span>
            <div className="site2__c-eyebrow">Vote · May 12 · Vancouver-Mount Pleasant</div>
            <h1 className="site2__c-h1">A government that finally builds, listens, and pays its way.</h1>
            <p className="site2__c-sub">Twelve plans. One mandate. Funded line-by-line, costed by the legislature, written for the next generation, not the next news cycle.</p>
            <div className="site2__c-cta">
              <span className="site2__c-btn primary">Chip in $10</span>
              <span className="site2__c-btn ghost">Volunteer</span>
            </div>
            <div className="site2__c-photo"></div>
          </div>

          {/* Issues strip */}
          <div className="site2__c-section">
            <span className="site2__c-tag">Issues Strip · CMS bound</span>
            <div className="site2__c-eyebrow">Twelve commitments</div>
            <div className="site2__c-issues">
              {[['Affordability','Housing for working families'],['Mobility','Transit that works'],['Family','$10/day childcare']].map(([t,h])=>(
                <div key={h} className="site2__c-issue">
                  <div className="site2__c-issue-tag">{t}</div>
                  <div className="site2__c-issue-h">{h}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Properties */}
      <aside className="site2__panel">
        <div className="site2__panel-h"><span>Properties · Hero</span><span style={{color:'var(--text-3)'}}>Section</span></div>
        <div className="site2__panel-body">
          <div className="site2__props">
            <div className="site2__prop-group">
              <h4 className="site2__prop-h">Layout</h4>
              <div className="site2__prop-row"><span className="k">display</span><span className="v">grid</span></div>
              <div className="site2__prop-row"><span className="k">cols</span><span className="v">12 · 72px</span></div>
              <div className="site2__prop-row"><span className="k">padding</span><span className="v">96 / 32 / 80</span></div>
              <div className="site2__prop-row"><span className="k">align</span><span className="v">start / center</span></div>
            </div>
            <div className="site2__prop-group">
              <h4 className="site2__prop-h">Typography</h4>
              <div className="site2__prop-row"><span className="k">family</span><span className="v">GT Super Display</span></div>
              <div className="site2__prop-row"><span className="k">size</span><span className="v">44 / 16 px</span></div>
              <div className="site2__prop-row"><span className="k">tracking</span><span className="v">−1.2%</span></div>
            </div>
            <div className="site2__prop-group">
              <h4 className="site2__prop-h">Color</h4>
              <div className="site2__prop-row"><span className="k">bg</span><span className="v">paper-0</span></div>
              <div className="site2__prop-row"><span className="k">ink</span><span className="v">#0c0c0c</span></div>
              <div className="site2__prop-row"><span className="k">accent</span><span className="v">mark · #ffd400</span></div>
            </div>
            <div className="site2__prop-group">
              <h4 className="site2__prop-h">Bindings</h4>
              <div className="site2__prop-row"><span className="k">headline</span><span className="v"><span className="site2__prop-bound">cms.copy.hero.headline</span></span></div>
              <div className="site2__prop-row"><span className="k">photo</span><span className="v"><span className="site2__prop-bound">cms.assets.hero-photo</span></span></div>
              <div className="site2__prop-row"><span className="k">cta.label</span><span className="v"><span className="site2__prop-bound">exp.x-hero.variant</span></span></div>
            </div>
            <div className="site2__prop-group">
              <h4 className="site2__prop-h">Experiment</h4>
              <div className="site2__prop-row"><span className="k">test</span><span className="v">x-hero · running</span></div>
              <div className="site2__prop-row"><span className="k">variants</span><span className="v">A / B (50/50)</span></div>
              <div className="site2__prop-row"><span className="k">conf.</span><span className="v">94%</span></div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ── CMS ── */
function SiteCMSTab() {
  const [coll, setColl] = stUS2('c-issues');
  const active = SITE_COLLECTIONS.find(c => c.id===coll);

  return (
    <div className="site2__cms">
      <aside className="site2__cms-list">
        <h3 className="site2__aside-h">Collections · 7</h3>
        {SITE_COLLECTIONS.map(c => (
          <div key={c.id} className={`site2__coll ${coll===c.id?'is-on':''}`} onClick={()=>setColl(c.id)}>
            <div className="site2__coll-name">{c.name}<b>{c.items}</b></div>
            <div className="site2__coll-meta">
              <span>edited {c.lastEdit}</span>
              {c.draft>0 && <span className="draft">{c.draft} draft</span>}
              <span>{c.publishedRefs} ref</span>
            </div>
            <div className="site2__schema">
              {c.schema.slice(0,5).map(k => <span key={k} className="site2__schema-key">{k}</span>)}
              {c.schema.length>5 && <span className="site2__schema-key">+{c.schema.length-5}</span>}
            </div>
          </div>
        ))}
      </aside>

      <section className="site2__cms-detail">
        <div className="site2__cms-detail-h">
          <div>
            <div className="site2__title-sub">Collection · {active.id}</div>
            <div className="t">{active.name}</div>
          </div>
          <div style={{display:'flex', gap:10}}>
            <button className="site2__c-btn ghost" style={{padding:'6px 12px', fontSize:10}}>Edit schema</button>
            <button className="site2__c-btn primary" style={{padding:'6px 12px', fontSize:10}}>+ New item</button>
          </div>
        </div>
        <table className="site2__cms-table">
          <thead><tr>
            <th style={{width:30}}>#</th>
            <th>Title</th>
            <th>Slug</th>
            <th>Tag</th>
            <th>Status</th>
            <th>Refs</th>
            <th>Updated</th>
          </tr></thead>
          <tbody>
            {SITE_CMS_ISSUES.map(r => (
              <tr key={r.id}>
                <td style={{color:'var(--text-3)'}}>{r.priority}</td>
                <td><strong style={{fontFamily:'var(--font-display)', fontSize:14, fontWeight:400}}>{r.title}</strong></td>
                <td style={{color:'var(--site-ink)'}}>/issues/{r.slug}</td>
                <td>{r.tag}</td>
                <td><span className={`site2__status-pill ${r.status}`}>{r.status}</span></td>
                <td>{r.refs}</td>
                <td style={{color:'var(--text-3)'}}>{r.updated}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/* ── EXPERIMENTS ── */
function SiteExperimentsTab() {
  const { records: SITE_EXPERIMENTS } = useLiveRecords('site', 'experiment', SITE_EXPERIMENTS_FB);
  return (
    <div className="site2__xp-grid">
      {SITE_EXPERIMENTS.map(x => {
        const totVis = x.variants.reduce((s,v)=>s+v.visitors,0);
        const winnerLetter = x.winner;
        return (
          <article key={x.id} className={`site2__xp ${x.status==='won'?'won':''}`}>
            <header className="site2__xp-h">
              <div>
                <div className="site2__xp-name">{x.name}</div>
                <div className="site2__xp-meta">
                  <span>{x.page}</span><span>·</span>
                  <span>{x.metric}</span><span>·</span>
                  <span>{x.runningDays}d</span><span>·</span>
                  <span>{x.visitors.toLocaleString()} visitors</span>
                </div>
              </div>
              <span className={`site2__xp-stamp ${x.status==='won'?'win':x.status==='running'?'run':x.status}`}>
                {x.status}
              </span>
            </header>

            <div className="site2__xp-bars">
              {x.variants.map(v => {
                const max = Math.max(...x.variants.map(vv=>vv.rate));
                return (
                  <React.Fragment key={v.name}>
                    <span className="site2__xp-letter">{v.name}</span>
                    <span style={{color:'var(--text-2)'}}>{v.label}</span>
                    <span className={`site2__xp-bar ${winnerLetter===v.name?'is-winner':''}`}>
                      <span className="site2__xp-bar-fill" style={{ width: `${(v.rate/max)*100}%` }}></span>
                    </span>
                    <span className="site2__xp-rate">{v.rate.toFixed(2)}%</span>
                    <span className="site2__xp-conv">{v.conv}/{v.visitors.toLocaleString()}</span>
                    <span style={{color:'var(--text-3)', fontSize:10}}>
                      {v.avg ? v.avg : ''}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>

            <div className="site2__xp-foot">
              <span className="site2__xp-conf">
                <span style={{textTransform:'uppercase', letterSpacing:'0.1em', fontSize:9.5}}>Confidence</span>
                <span className="site2__xp-conf-bar"><span style={{ width: `${x.confidence*100}%` }}></span></span>
                <span style={{color:'var(--ink)'}}>{(x.confidence*100).toFixed(0)}%</span>
              </span>
              <span className={`site2__xp-lift ${x.lift.startsWith('−')?'neg':''}`}>{x.lift}</span>
            </div>
            {x.pauseReason && (
              <div style={{marginTop:8, fontFamily:'var(--font-mono)', fontSize:10, color:'var(--danger)'}}>⚠ {x.pauseReason}</div>
            )}
          </article>
        );
      })}
    </div>
  );
}

/* ── FORMS ── */
function SiteFormsTab() {
  const { records: SITE_FORMS } = useLiveRecords('site', 'form', SITE_FORMS_FB);
  return (
    <div className="site2__forms">
      <div className="site2__forms-list">
        {SITE_FORMS.map(f => (
          <div key={f.id} className="site2__form-row">
            <div>
              <div className="name">{f.name}<small>{f.page} · {f.fields.length} fields · avg {f.completionTime}</small></div>
            </div>
            <div className="stat"><b>{f.submits7d.toLocaleString()}</b><span>submits/7d</span></div>
            <div className="stat"><b>{f.views7d.toLocaleString()}</b><span>views</span></div>
            <div className="stat"><b>{f.complete.toFixed(1)}%</b><span>complete</span></div>
            <div className="stat" style={{color: f.errors>10?'var(--danger)':'inherit'}}>
              <b>{f.errors}</b><span>errors/7d</span>
            </div>
          </div>
        ))}
      </div>

      <div className="site2__funnel">
        <div className="site2__funnel-h">Donate funnel · /donate</div>
        <div className="site2__funnel-sub">Last 7 days · 6,310 entries</div>
        {SITE_DONATE_FUNNEL.map((s, i) => (
          <div key={s.step} className={`site2__funnel-row ${i===SITE_DONATE_FUNNEL.length-1?'final':''}`}>
            <span className="step">{s.step}</span>
            <span className="bar"><span style={{ width: `${s.pct}%` }}></span></span>
            <span className="count">{s.count.toLocaleString()}</span>
            <span className="pct">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
        <div style={{marginTop:18, paddingTop:14, borderTop:'1px solid var(--rule)', fontFamily:'var(--font-mono)', fontSize:10.5, color:'var(--text-3)'}}>
          <strong style={{color:'var(--ink)', fontFamily:'var(--font-display)', fontSize:14, fontWeight:400}}>Step-2 drop-off &nbsp;</strong>
          —  62% leave between "Choose amount" and "Begin form".  Likely friction:  required postal-code field,  no Apple Pay.
        </div>
      </div>
    </div>
  );
}

/* ── AUDIENCE ── */
function SiteAudienceTab() {
  const a = SITE_AUDIENCE;
  return (
    <div className="site2__aud">
      <div className="site2__aud-headline">
        <div className="site2__aud-sub">Visitors · last 7 days</div>
        <div>
          <span className="site2__aud-big">{a.visitors7d.toLocaleString()}</span>
          <span className="site2__aud-up">▲ {Math.round(((a.visitors7d-a.visitors_prev)/a.visitors_prev)*100)}% vs prior 7d</span>
        </div>

        <div className="site2__aud-mini">
          <div><div className="v">{a.newPct}%</div><div className="k">New</div></div>
          <div><div className="v">{a.retPct}%</div><div className="k">Returning</div></div>
          <div><div className="v">{a.avgSession}</div><div className="k">Avg session</div></div>
          <div><div className="v">{a.bounce}%</div><div className="k">Bounce</div></div>
        </div>

        <h4 className="site2__aud-card-h" style={{marginTop:24, marginBottom:8}}>Devices</h4>
        <div className="site2__device">
          <div className="site2__device-cell"><div className="v">{a.device.mobile}%</div><div className="k">Mobile</div></div>
          <div className="site2__device-cell"><div className="v">{a.device.desktop}%</div><div className="k">Desktop</div></div>
          <div className="site2__device-cell"><div className="v">{a.device.tablet}%</div><div className="k">Tablet</div></div>
        </div>

        <h4 className="site2__aud-card-h" style={{marginTop:24}}>Top pages</h4>
        {a.topPages.map(p => (
          <div key={p.route} className="site2__src-row" style={{gridTemplateColumns:'140px 1fr 80px'}}>
            <span className="nm" style={{color:'var(--site-ink)', fontFamily:'var(--font-mono)'}}>{p.route}</span>
            <span className="bar"><span style={{ width: `${(p.visitors/a.topPages[0].visitors)*100}%` }}></span></span>
            <span className="ct">{p.visitors.toLocaleString()}</span>
          </div>
        ))}
      </div>

      <div className="site2__aud-stack">
        <div className="site2__aud-card">
          <h4 className="site2__aud-card-h">Sources <span style={{color:'var(--text-3)'}}>{a.sources.length}</span></h4>
          {a.sources.map(s => (
            <div key={s.name} className="site2__src-row">
              <span className="nm">{s.name}</span>
              <span className="bar"><span style={{ width: `${s.share*3}%` }}></span></span>
              <span className="ct">{s.visitors.toLocaleString()}</span>
              <span className={`tr ${s.trend.startsWith('−')?'dn':''}`}>{s.trend}</span>
            </div>
          ))}
        </div>

        <div className="site2__aud-card">
          <h4 className="site2__aud-card-h">Geography</h4>
          {a.topCountries.map(c => (
            <div key={c.name} className="site2__src-row" style={{gridTemplateColumns:'160px 1fr 80px 60px'}}>
              <span className="nm">{c.name}</span>
              <span className="bar"><span style={{ width: `${c.share}%` }}></span></span>
              <span className="ct">{c.visitors.toLocaleString()}</span>
              <span className="tr" style={{color:'var(--text-3)'}}>{c.share.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── DEPLOYS ── */
function SiteDeploysTab() {
  return (
    <div className="site2__deploys">
      {SITE_DEPLOYS.map(d => (
        <div key={d.id} className="site2__deploy-row">
          <span className={`site2__deploy-dot ${d.status==='rolled-back'?'fail':''}`}></span>
          <span className="site2__deploy-sha">{d.sha}</span>
          <div className="site2__deploy-title">
            {d.title}
            <small>{d.pages} page{d.pages===1?'':'s'} · branch:{d.branch}{d.error?' · '+d.error:''}</small>
          </div>
          <span className="site2__deploy-when">{d.when}</span>
          <span className="site2__deploy-who">{d.by}</span>
          <span className="site2__deploy-ms"><b>{d.ms}ms</b></span>
        </div>
      ))}
    </div>
  );
}

export { SitePagesTab, SiteBuilderTab, SiteCMSTab, SiteExperimentsTab, SiteFormsTab, SiteAudienceTab, SiteDeploysTab };
