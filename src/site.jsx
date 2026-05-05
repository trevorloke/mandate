import React from 'react';
import './site.css';
import { SITE_PAGES as SITE_PAGES_FB, SITE_EXPERIMENTS as SITE_EXPERIMENTS_FB, SITE_LAYER_TREE, SITE_COLLECTIONS, SITE_CMS_ISSUES, SITE_FORMS, SITE_DONATE_FUNNEL, SITE_AUDIENCE, SITE_DEPLOYS, SITE_HEALTH } from './site-data';
import { useLiveRecords } from './auth/useLiveRecords';
import EmptyModule from './EmptyModule';
import { SitePagesTab, SiteBuilderTab, SiteCMSTab, SiteExperimentsTab, SiteFormsTab, SiteAudienceTab, SiteDeploysTab } from './site-tabs';

// Site 2.0 — main shell + Pages tab + tab dispatch

const { useState: stUS, useMemo: stUM } = React;

const SITE_TAB_DEFS = [
  { k:'pages',       label:'Pages' },
  { k:'builder',     label:'Builder' },
  { k:'cms',         label:'CMS' },
  { k:'experiments', label:'Experiments' },
  { k:'forms',       label:'Forms' },
  { k:'audience',    label:'Audience' },
  { k:'deploys',     label:'Deploys' },
];

function Site2() {
  const [tab, setTab] = stUS('pages');
  const { records: SITE_PAGES, isEmpty: noPages } = useLiveRecords('site', 'page', SITE_PAGES_FB);
  const { records: SITE_EXPERIMENTS, isEmpty: noExperiments } = useLiveRecords('site', 'experiment', SITE_EXPERIMENTS_FB);
  if (noPages && noExperiments) return <EmptyModule module="SITE" label="Site" accent="var(--m-site)" />;

  const totalViews = SITE_PAGES.reduce((s,p)=>s+(p.views7d||0), 0);
  const live = SITE_PAGES.filter(p=>p.status==='published').length;
  const drafts = SITE_PAGES.filter(p=>p.status!=='published').length;
  const runningTests = SITE_EXPERIMENTS.filter(x=>x.status==='running').length;
  const wonTests = SITE_EXPERIMENTS.filter(x=>x.status==='won' || x.status==='shipped').length;

  const tabBadges = {
    pages:       String(SITE_PAGES.length),
    cms:         String(SITE_COLLECTIONS.reduce((s,c)=>s+c.items,0)),
    experiments: `${runningTests} live`,
    forms:       String(SITE_FORMS.length),
    deploys:     'live',
  };

  return (
    <div className="site2" data-screen-label="08 Site · Builder & CMS">
      <header className="site2__head">
        <div>
          <div className="site2__title">
            Site
            <span className="site2__url-pill">kestrel-bc.ca</span>
          </div>
          <div className="site2__title-sub">Build · 04ax912 · deploy 2h ago · CDN edge 14ms</div>
        </div>

        <div className="site2__health">
          <div className="site2__lh"><span className="site2__lh-ring">{SITE_HEALTH.lighthouse.perf}</span><span>Perf</span></div>
          <div className="site2__lh"><span className="site2__lh-ring">{SITE_HEALTH.lighthouse.a11y}</span><span>A11y</span></div>
          <div className="site2__lh"><span className="site2__lh-ring">{SITE_HEALTH.lighthouse.bp}</span><span>BP</span></div>
          <div className="site2__lh"><span className="site2__lh-ring">{SITE_HEALTH.lighthouse.seo}</span><span>SEO</span></div>
        </div>

        <div className="site2__metrics">
          <div className="site2__metric"><span className="site2__metric-v">{live}</span><span className="site2__metric-k">live pages</span></div>
          <div className="site2__metric"><span className="site2__metric-v warn">{drafts}</span><span className="site2__metric-k">drafts</span></div>
          <div className="site2__metric"><span className="site2__metric-v">{(totalViews/1000).toFixed(0)}k</span><span className="site2__metric-k">views/7d</span></div>
          <div className="site2__metric"><span className="site2__metric-v go">{runningTests}</span><span className="site2__metric-k">tests live</span></div>
          <div className="site2__metric"><span className="site2__metric-v">{wonTests}</span><span className="site2__metric-k">won / shipped</span></div>
          <div className="site2__metric"><span className="site2__metric-v">{SITE_HEALTH.uptime}%</span><span className="site2__metric-k">uptime · 30d</span></div>
        </div>
      </header>

      <nav className="site2__tabs">
        {SITE_TAB_DEFS.map(t => (
          <button key={t.k} className={`site2__tab ${tab===t.k?'is-on':''}`} onClick={()=>setTab(t.k)}>
            {t.label}
            {tabBadges[t.k] && <span className="site2__tab-badge">{tabBadges[t.k]}</span>}
          </button>
        ))}
      </nav>

      <div className="site2__body">
        {tab==='pages'       && <SitePagesTab />}
        {tab==='builder'     && <SiteBuilderTab />}
        {tab==='cms'         && <SiteCMSTab />}
        {tab==='experiments' && <SiteExperimentsTab />}
        {tab==='forms'       && <SiteFormsTab />}
        {tab==='audience'    && <SiteAudienceTab />}
        {tab==='deploys'     && <SiteDeploysTab />}
      </div>
    </div>
  );
}

export { Site2 };
