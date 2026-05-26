// Site 2.0 — data
//
// All entity seeds (pages, collections, experiments, forms) and
// decorative dashboards (donate funnel, audience, deploys, health) are
// empty. Pages read live records via useLiveRecords. The layer tree is
// a default editor scaffold (config), kept for the page builder.

const SITE_PAGES = [];
const SITE_LAYER_TREE = [];
const SITE_COLLECTIONS = [];
const SITE_CMS_ISSUES = [];
const SITE_EXPERIMENTS = [];
const SITE_FORMS = [];
const SITE_DONATE_FUNNEL = [];
const SITE_AUDIENCE = {
  uniques7d: 0, returning7d: 0, sessions7d: 0,
  topPages: [], devices: [], sources: [], geo: [],
};
const SITE_DEPLOYS = [];
const SITE_HEALTH = { uptime: '—', p95: '—', errors24h: 0, lhDesktop: 0, lhMobile: 0, checks: [] };

export { SITE_PAGES, SITE_LAYER_TREE, SITE_COLLECTIONS, SITE_CMS_ISSUES, SITE_EXPERIMENTS, SITE_FORMS, SITE_DONATE_FUNNEL, SITE_AUDIENCE, SITE_DEPLOYS, SITE_HEALTH };
