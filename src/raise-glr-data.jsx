// Mandate 2.0 — Raise Gifts/Lists/Reports data

// ── Gifts (incoming donations register) ─────────────────────────
const RAISE_GIFTS_TODAY = { count: 47, total: '$8,420', avg: '$179', recurring: 18, peakHour: '14:00' };

const RAISE_GIFTS = [
  { id: 'g-001', t: '14:32', date: 'Today',  donor: 'Dr. Marisol Vega',   amt: 1000, src: 'online',  method: 'card',     fund: 'General',     status: 'cleared',  appeal: 'Email · Apr launch',         note: 'Sustaining $1K — first time this cycle', officer: 'LH' },
  { id: 'g-002', t: '14:28', date: 'Today',  donor: 'Anika Patel',        amt: 50,   src: 'recurring', method: 'card',    fund: 'General',     status: 'cleared',  appeal: 'Monthly · 2025 cohort',      note: '',  officer: '—' },
  { id: 'g-003', t: '14:19', date: 'Today',  donor: 'Lin Wang',           amt: 500,  src: 'online',  method: 'card',     fund: 'Climate',     status: 'cleared',  appeal: 'Climate caucus',             note: '', officer: 'MR' },
  { id: 'g-004', t: '13:52', date: 'Today',  donor: 'Jordan Marsh',       amt: 25,   src: 'recurring', method: 'card',    fund: 'General',     status: 'cleared',  appeal: 'Monthly · 2025 cohort',      note: '', officer: '—' },
  { id: 'g-005', t: '13:41', date: 'Today',  donor: 'Theo Nakamura',      amt: 100,  src: 'recurring', method: 'card',    fund: 'General',     status: 'cleared',  appeal: 'Quarterly',                  note: '', officer: '—' },
  { id: 'g-006', t: '13:08', date: 'Today',  donor: 'Anonymous',          amt: 250,  src: 'mail',    method: 'check',    fund: 'General',     status: 'flagged',  appeal: 'Direct mail · Spring',       note: 'Source verification needed', officer: 'LH' },
  { id: 'g-007', t: '12:47', date: 'Today',  donor: 'Rashid Karim',       amt: 25,   src: 'online',  method: 'card',     fund: 'General',     status: 'cleared',  appeal: 'Email · Apr launch',         note: '', officer: '—' },
  { id: 'g-008', t: '12:30', date: 'Today',  donor: 'Femi Okafor',        amt: 15000, src: 'major',  method: 'wire',     fund: 'General',     status: 'cleared',  appeal: 'Pledge · housing dinner',    note: 'Pledge fulfillment', officer: 'MR' },
  { id: 'g-009', t: '12:12', date: 'Today',  donor: 'Greta Olsen',        amt: 250,  src: 'recurring', method: 'card',    fund: 'Climate',     status: 'cleared',  appeal: 'Quarterly',                  note: '', officer: '—' },
  { id: 'g-010', t: '11:58', date: 'Today',  donor: 'Ben Iverson',        amt: 50,   src: 'recurring', method: 'card',    fund: 'General',     status: 'cleared',  appeal: 'Monthly · 2025 cohort',      note: '', officer: '—' },
  { id: 'g-011', t: '11:42', date: 'Today',  donor: 'Carmen Liu',         amt: 5000, src: 'major',   method: 'card',     fund: 'General',     status: 'cleared',  appeal: 'Solicit · LH Apr 27',        note: 'Upgrade from $2K', officer: 'LH' },
  { id: 'g-012', t: '11:15', date: 'Today',  donor: 'Tomás Reyes',        amt: 100,  src: 'recurring', method: 'card',    fund: 'General',     status: 'cleared',  appeal: 'Monthly · 2024 cohort',      note: '', officer: '—' },
  { id: 'g-013', t: '10:58', date: 'Today',  donor: 'Wai-Ling Cheng',     amt: 75,   src: 'event',   method: 'card',     fund: 'General',     status: 'pending',  appeal: 'Donor brunch · Apr 25',      note: 'Card declined retry', officer: 'LH' },
  { id: 'g-014', t: '10:32', date: 'Today',  donor: 'Priya Singh',        amt: 5000, src: 'major',   method: 'card',     fund: 'General',     status: 'cleared',  appeal: 'House party · Apr 22',       note: 'Closed at full ask', officer: 'LH' },
  { id: 'g-015', t: '10:14', date: 'Today',  donor: 'Anonymous',          amt: 35,   src: 'online',  method: 'card',     fund: 'General',     status: 'flagged',  appeal: 'Email · Apr launch',         note: 'Card mismatch', officer: '—' },
  { id: 'g-016', t: '09:48', date: 'Today',  donor: 'Elena Costa',        amt: 250,  src: 'online',  method: 'card',     fund: 'General',     status: 'cleared',  appeal: 'Email · Apr launch',         note: '', officer: '—' },
  { id: 'g-017', t: '09:22', date: 'Today',  donor: 'Yusef Marwan',       amt: 100,  src: 'event',   method: 'card',     fund: 'General',     status: 'cleared',  appeal: 'Town hall · Apr 14',         note: '', officer: 'LH' },
  { id: 'g-018', t: '08:54', date: 'Today',  donor: 'Hannah Ito',         amt: 50,   src: 'recurring', method: 'card',    fund: 'General',     status: 'cleared',  appeal: 'Monthly · 2024 cohort',      note: '', officer: '—' },
  { id: 'g-019', t: '08:31', date: 'Today',  donor: 'Daniel Tran',        amt: 25000, src: 'major',  method: 'wire',     fund: 'General',     status: 'pending',  appeal: 'Solicit · MR Apr 30',        note: 'Wire confirmation pending', officer: 'MR' },
  { id: 'g-020', t: '17:18', date: 'Yest.',  donor: 'Sara Kornblum',      amt: 500,  src: 'online',  method: 'card',     fund: 'Climate',     status: 'cleared',  appeal: 'Climate caucus',             note: '', officer: 'MR' },
  { id: 'g-021', t: '16:52', date: 'Yest.',  donor: 'Mira Aoki',          amt: 2500, src: 'major',   method: 'card',     fund: 'Climate',     status: 'cleared',  appeal: 'Climate dinner pledge',      note: 'Increase from $1K', officer: 'MR' },
  { id: 'g-022', t: '15:30', date: 'Yest.',  donor: 'Marvin Holt',        amt: 100,  src: 'mail',    method: 'check',    fund: 'General',     status: 'cleared',  appeal: 'Direct mail · Spring',       note: '', officer: '—' },
];

// Hour-by-hour donation count for the day's spark (24 buckets)
const RAISE_GIFTS_HOURLY = [0,0,0,0,0,0,1,2,3,4,5,4,7,5,8,3,2,1,0,0,0,0,0,0];

// Source breakdown
const RAISE_GIFTS_SOURCES = [
  { id: 'online',     lbl: 'Online',     count: 22, amt: 1485,  color: '#0d4f3c' },
  { id: 'recurring',  lbl: 'Recurring',  count: 14, amt: 745,   color: '#3d7a5e' },
  { id: 'major',      lbl: 'Major',      count: 4,  amt: 50000, color: '#0a3d2e' },
  { id: 'event',      lbl: 'Event',      count: 4,  amt: 425,   color: '#6b9d82' },
  { id: 'mail',       lbl: 'Mail',       count: 3,  amt: 350,   color: '#a9c4b4' },
];

// ── Lists (donor segments) ──────────────────────────────────────
const RAISE_LISTS = [
  { id: 'l-monthly', name: 'Monthly sustainers · $25+', kind: 'smart', size: 1284, growth: '+24',  refreshed: '2m ago',  color: '#0d4f3c',
    rules: ['Frequency = Monthly', 'Last gift ≥ $25', 'Status = Active'],
    desc: 'Recurring backbone — 30% of YTD revenue, 96% retention.', uses: 'Quarterly thank-you · stewardship' },
  { id: 'l-lapsed',  name: 'Lapsed · 12+ months',       kind: 'smart', size: 487,  growth: '+8',   refreshed: '12m ago', color: '#b94a3a',
    rules: ['Last gift > 365 days', 'Lifetime gifts ≥ 1', 'Email opt-in = true'],
    desc: 'Win-back targets. Personal asks outperform email here 4:1.', uses: 'Recovery campaign · officer assignments' },
  { id: 'l-major',   name: 'Major prospects · capacity $5K+', kind: 'smart', size: 312, growth: '+19', refreshed: '5m ago', color: '#0a3d2e',
    rules: ['Wealth score ≥ 75', 'Capacity rating ≥ $5,000', 'Stage ≠ Steward'],
    desc: 'Wealth-screened pipeline. Officers Marcus & Lila assigned.', uses: 'Moves management · briefings' },
  { id: 'l-climate', name: 'Climate Forward attendees',  kind: 'static', size: 218, growth: '+0',   refreshed: 'Mar 14',  color: '#3d7a5e',
    rules: ['Imported: ClimateFwd_attendees_2026.csv'],
    desc: 'Panel attendees. 12 already gave. 18 high-capacity flagged.', uses: 'Cultivation · climate caucus dinner' },
  { id: 'l-firstgift', name: 'First-gift · last 30 days', kind: 'smart', size: 94, growth: '+94',  refreshed: '2m ago',  color: '#d68a4f',
    rules: ['First gift date ≥ 30 days ago', 'Lifetime gifts = 1'],
    desc: 'Welcome series targets. 2nd-gift conversion sits at 38%.', uses: 'Onboarding · welcome email · personal call' },
  { id: 'l-doorstep', name: 'Doorstep · 2025 canvass',   kind: 'static', size: 612, growth: '+0',  refreshed: 'Feb 02',  color: '#6b9d82',
    rules: ['Imported: ground_canvass_2025.csv'],
    desc: 'IDed at the door, opted in to follow-up. Convert at 8%.', uses: 'GOTV · ride-along invites' },
  { id: 'l-major-board', name: 'Board members & circle', kind: 'static', size: 47,  growth: '+0',  refreshed: 'Jan 12',  color: '#7a6b8a',
    rules: ['Manual list · curated'],
    desc: 'Inner circle. Personal asks from candidate only.', uses: 'Quarterly briefings · house parties' },
  { id: 'l-housing', name: 'Housing issue · engaged',    kind: 'smart', size: 854,  growth: '+62',  refreshed: '8m ago',  color: '#3d7a5e',
    rules: ['Tag contains "housing"', 'Engagement score ≥ 60', 'Email opt-in = true'],
    desc: 'Matched on Bridge Park story interaction & open rates.', uses: 'Housing crisis appeal · ask sequence' },
];

// ── Reports ─────────────────────────────────────────────────────
// Cumulative raised vs goal, by month
const RAISE_REPORT_GOAL = [
  { m: 'Jul', raised: 95,  goal: 100 },
  { m: 'Aug', raised: 195, goal: 220 },
  { m: 'Sep', raised: 320, goal: 360 },
  { m: 'Oct', raised: 480, goal: 510 },
  { m: 'Nov', raised: 640, goal: 690 },
  { m: 'Dec', raised: 820, goal: 880 },
  { m: 'Jan', raised: 950, goal: 1040 },
  { m: 'Feb', raised: 1100, goal: 1190 },
  { m: 'Mar', raised: 1240, goal: 1330 },
  { m: 'Apr', raised: 1420, goal: 1480 },
];

// Acquisition by channel (last 30d, by donor count)
const RAISE_REPORT_ACQ = [
  { ch: 'Email',     count: 184, amt: 18420 },
  { ch: 'Recurring', count: 96,  amt: 7400  },
  { ch: 'Event',     count: 71,  amt: 12200 },
  { ch: 'Major',     count: 4,   amt: 50000 },
  { ch: 'Doorstep',  count: 38,  amt: 1900  },
  { ch: 'Mail',      count: 22,  amt: 4400  },
  { ch: 'Referral',  count: 14,  amt: 6800  },
];

// Cohort retention (rows = first-gift cohort, cols = months since)
const RAISE_REPORT_COHORTS = [
  { cohort: '2024 Q3', size: 412, retention: [100, 78, 65, 58, 54, 51, 48, 46, 44, 43, 42, 41] },
  { cohort: '2024 Q4', size: 521, retention: [100, 82, 71, 64, 60, 57, 55, 53, 51,  0,  0,  0] },
  { cohort: '2025 Q1', size: 489, retention: [100, 79, 68, 61, 58, 55, 53,  0,  0,  0,  0,  0] },
  { cohort: '2025 Q2', size: 614, retention: [100, 84, 73, 66, 62,  0,  0,  0,  0,  0,  0,  0] },
  { cohort: '2025 Q3', size: 583, retention: [100, 81, 70,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
  { cohort: '2025 Q4', size: 702, retention: [100,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0,  0] },
];

// Recurring vs one-time
const RAISE_REPORT_MIX = [
  { id: 'recurring', lbl: 'Recurring',     pct: 48, amt: '$682K', color: '#0d4f3c' },
  { id: 'onetime',   lbl: 'One-time',      pct: 38, amt: '$540K', color: '#3d7a5e' },
  { id: 'pledge',    lbl: 'Pledge install', pct: 14, amt: '$198K', color: '#a9c4b4' },
];

// Officer leaderboard
const RAISE_REPORT_OFFICERS = [
  { name: 'Marcus Reilly', raised: 612, prospects: 28, closed: 14, asks: 23, color: '#0d4f3c' },
  { name: 'Lila Howe',     raised: 487, prospects: 18, closed: 11, asks: 18, color: '#3d7a5e' },
  { name: 'Devon Park',    raised: 184, prospects: 9,  closed: 6,  asks: 8,  color: '#6b9d82' },
  { name: 'Sara Kim',      raised: 137, prospects: 7,  closed: 4,  asks: 6,  color: '#a9c4b4' },
];

// Avg gift over time (area)
const RAISE_REPORT_AVG = [
  { m: 'Jul', avg: 142 }, { m: 'Aug', avg: 156 }, { m: 'Sep', avg: 168 },
  { m: 'Oct', avg: 174 }, { m: 'Nov', avg: 182 }, { m: 'Dec', avg: 198 },
  { m: 'Jan', avg: 188 }, { m: 'Feb', avg: 192 }, { m: 'Mar', avg: 205 },
  { m: 'Apr', avg: 214 },
];

// Donor pyramid (gift amount tier)
const RAISE_REPORT_PYRAMID = [
  { tier: '$10K+',     count: 6,    pct: 0.1,  amt: '$184K' },
  { tier: '$1K–9.9K',  count: 84,   pct: 2.0,  amt: '$356K' },
  { tier: '$250–999',  count: 412,  pct: 9.8,  amt: '$298K' },
  { tier: '$100–249',  count: 824,  pct: 19.5, amt: '$214K' },
  { tier: '$25–99',    count: 1842, pct: 43.7, amt: '$248K' },
  { tier: '<$25',      count: 1045, pct: 24.8, amt: '$120K' },
];

export {
  RAISE_GIFTS_TODAY, RAISE_GIFTS, RAISE_GIFTS_HOURLY, RAISE_GIFTS_SOURCES,
  RAISE_LISTS,
  RAISE_REPORT_GOAL, RAISE_REPORT_ACQ, RAISE_REPORT_COHORTS, RAISE_REPORT_MIX,
  RAISE_REPORT_OFFICERS, RAISE_REPORT_AVG, RAISE_REPORT_PYRAMID,
};
