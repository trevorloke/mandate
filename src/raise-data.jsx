// Mandate 2.0 — Raise (fundraising / moves management)
//
// All seed data and decorative dashboard blobs have been emptied. Pages
// read entity records (donors, prospects, gifts, pledges) live from the
// database via useLiveRecords; KPIs / pipelines / feeds render empty
// frames until the workspace has real records.

const RAISE_KPIS = {
  ytd:        { label: 'Raised YTD',       value: '—', delta: '', tone: 'flat', sub: '' },
  pipeline:   { label: 'Active pipeline',  value: '—', delta: '', tone: 'flat', sub: '' },
  averagegift:{ label: 'Average gift',     value: '—', delta: '', tone: 'flat', sub: '' },
  retention:  { label: '12-mo retention',  value: '—', delta: '', tone: 'flat', sub: '' },
  burn:       { label: 'Cash on hand',     value: '—', delta: '', tone: 'flat', sub: '' },
  pledgesdue: { label: 'Pledges due',      value: '—', delta: '', tone: 'flat', sub: '' },
};

// Moves-management stage definitions are configuration (not data);
// counts/values are zero until prospects exist.
const RAISE_STAGES = [
  { id: 'identify',  name: 'Identify',  count: 0, value: '—', hint: 'Wealth + capacity screened' },
  { id: 'qualify',   name: 'Qualify',   count: 0, value: '—', hint: 'Confirmed interest' },
  { id: 'cultivate', name: 'Cultivate', count: 0, value: '—', hint: 'In motion · briefings, dinners' },
  { id: 'solicit',   name: 'Solicit',   count: 0, value: '—', hint: 'Ask scheduled' },
  { id: 'steward',   name: 'Steward',   count: 0, value: '—', hint: 'Closed · keep warm' },
];

const RAISE_PROSPECTS = [];
const RAISE_DONORS = [];
const RAISE_FEED = [];
const RAISE_STORIES = [];
const RAISE_PULSE = [];
const RAISE_TODAY = [];
const RAISE_GIFTMIX = [];
const RAISE_COMPLIANCE = { cycleCap: '—', flagged: 0, flaggedNote: '', filing: '—', audited: '' };
const RAISE_PROSPECT_DETAIL = {};

export {
  RAISE_KPIS, RAISE_STAGES, RAISE_PROSPECTS, RAISE_DONORS,
  RAISE_FEED, RAISE_STORIES, RAISE_PULSE, RAISE_COMPLIANCE,
  RAISE_TODAY, RAISE_GIFTMIX, RAISE_PROSPECT_DETAIL,
};
