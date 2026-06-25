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

// ── Sample prospects (kind 'prospect') ──────────────────────────
// Demo data — clearly synthetic, BC-Canadian-campaign flavoured.
// `stage` MUST be one of the RAISE_STAGES ids. Records with
// stageKey==='committed' OR stage==='Verbal yes' are derived into the
// 'pledge' kind by the seed pipeline.
const RAISE_PROSPECTS = [
  {
    id: 'p-tara-nguyen', name: 'Tara Nguyen', stage: 'cultivate', warmth: 'hot',
    capacity: '$25K', ask: '$10K', score: 'A · 92', next: 'Coffee re: housing brief · Tue',
    officer: 'Mira Reyes', tags: ['housing', 'tech', 'founder'],
    last: 'Jun 18 2026', notes: 'Sold her startup last fall; primed by the rent-cap story. Wants a private briefing before committing.',
  },
  {
    id: 'p-david-okafor', name: 'David Okafor', stage: 'solicit', warmth: 'hot',
    capacity: '$50K', ask: '$25K', score: 'A · 88', next: 'Ask meeting · Burnaby office · Thu',
    officer: 'Mira Reyes', tags: ['transit', 'union', 'major-prospect'],
    last: 'Jun 20 2026', notes: 'Ready to talk numbers. Transit file is the lever — bring the SkyTrain extension one-pager.',
    stageKey: 'committed',
  },
  {
    id: 'p-helen-mcallister', name: 'Helen McAllister', stage: 'qualify', warmth: 'warm',
    capacity: '$10K', ask: '$3K', score: 'B · 74', next: 'Confirm interest · email follow-up',
    officer: 'Jonah Park', tags: ['education', 'first-time'],
    last: 'Jun 12 2026', notes: 'Retired teacher in New West, lifelong volunteer. Cares about the schools file; never given before.',
  },
  {
    id: 'p-raj-bhandari', name: 'Raj Bhandari', stage: 'identify', warmth: 'cold',
    capacity: '$15K', ask: '$5K', score: 'B · 68', next: 'Wealth screen · assign officer',
    officer: '—', tags: ['climate', 'lawyer'],
    last: 'Jun 06 2026', notes: 'Surfaced from the climate-list import. Partner at a Vancouver firm; unscreened, no contact yet.',
  },
  {
    id: 'p-sandra-leung', name: 'Sandra Leung', stage: 'steward', warmth: 'warm',
    capacity: '$25K', ask: '$10K', score: 'A · 90', next: 'Thank-you call + stewardship plan',
    officer: 'Mira Reyes', tags: ['housing', 'founder', 'monthly-prospect'],
    last: 'Jun 22 2026', notes: 'Closed her $10K at the Mount Pleasant dinner. Keep warm — strong renewal and major-gift potential.',
    stageKey: 'committed',
  },
  {
    id: 'p-marcus-doyle', name: 'Marcus Doyle', stage: 'cultivate', warmth: 'warm',
    capacity: '$5K', ask: '$2K', score: 'C · 61', next: 'Send transit briefing · invite to town hall',
    officer: 'Jonah Park', tags: ['transit', 'first-time'],
    last: 'Jun 15 2026', notes: 'Met canvassing in Mount Pleasant. Engaged renter, frustrated by commute times. Warming nicely.',
  },
];

// ── Sample donor file (kind 'donor') ────────────────────────────
// Every row needs numeric `gift` + `ltv` (rendered with .toLocaleString()).
const RAISE_DONORS = [
  { id: 'd-eleanor-craft',  name: 'Eleanor Craft',   gift: 1000, freq: 'Annual',    ltv: 8400,  list: 'Major giving',           first: '2019-03', last: '2026-06-20' },
  { id: 'd-priya-anand',    name: 'Priya Anand',     gift: 50,   freq: 'Monthly',   ltv: 1850,  list: 'Recurring · sustainers', first: '2022-09', last: '2026-06-01' },
  { id: 'd-tomas-rivera',   name: 'Tomas Rivera',    gift: 250,  freq: 'Quarterly', ltv: 3100,  list: 'Email · 2026 launch',    first: '2021-01', last: '2026-05-28' },
  { id: 'd-grace-wong',     name: 'Grace Wong',      gift: 100,  freq: 'Monthly',   ltv: 2400,  list: 'Recurring · sustainers', first: '2020-11', last: '2026-06-18' },
  { id: 'd-bill-fraser',    name: 'Bill Fraser',     gift: 35,   freq: 'One-time',  ltv: 35,    list: 'Web · donate page',      first: '2026-06', last: '2026-06-10' },
  { id: 'd-amara-bello',    name: 'Amara Bello',     gift: 500,  freq: 'Annual',    ltv: 4250,  list: 'Event · spring gala',    first: '2018-05', last: '2026-04-12' },
  { id: 'd-leo-martin',     name: 'Leo Martin',      gift: 25,   freq: 'Monthly',   ltv: 600,   list: 'Email · 2026 launch',    first: '2024-02', last: '2026-06-05' },
  { id: 'd-yuki-tanaka',    name: 'Yuki Tanaka',     gift: 2500, freq: 'Annual',    ltv: 12750, list: 'Major giving',           first: '2017-10', last: '2026-06-22' },
];

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
