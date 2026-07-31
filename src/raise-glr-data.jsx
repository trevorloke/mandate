// Mandate 2.0 — Raise Gifts/Lists/Reports data
//
// All entity seeds and decorative dashboard blobs are empty. Pages read
// live records via useLiveRecords; reports/sparklines/leaderboards render
// blank until real data exists.

const RAISE_GIFTS_TODAY = { count: 0, total: '—', avg: '—', recurring: 0, peakHour: '' };

// ── Sample gifts (kind 'gift') ──────────────────────────────────
// Demo data — clearly synthetic, BC-Canadian-campaign flavoured.
// Each record needs numeric `amt`; string `date`/`t`/`donor`/`src`/
// `method`/`fund`/`status`/`officer`. `status` ∈ cleared|pending|flagged.
// `src` ∈ major|online|email|event|recurring (matches journal filter chips).
const RAISE_GIFTS = [
  { id: 'g-0001', date: 'Jun 22', t: '09:14', donor: 'Yuki Tanaka',    amt: 2500, src: 'major',     method: 'cheque', fund: 'Major gift', status: 'cleared', officer: 'M. Reyes', appeal: 'Spring major ask', note: 'matched at gala' },
  { id: 'g-0002', date: 'Jun 22', t: '11:42', donor: 'Grace Wong',     amt: 100,  src: 'recurring', method: 'card',   fund: 'Recurring',  status: 'cleared', officer: 'auto',     appeal: 'Monthly sustainer' },
  { id: 'g-0003', date: 'Jun 22', t: '14:08', donor: 'Bill Fraser',    amt: 35,   src: 'online',    method: 'card',   fund: 'General',    status: 'pending', officer: 'auto',     appeal: 'Donate page' },
  { id: 'g-0004', date: 'Jun 21', t: '10:31', donor: 'Eleanor Craft',  amt: 1000, src: 'major',     method: 'wire',   fund: 'Major gift', status: 'cleared', officer: 'M. Reyes', appeal: 'Housing brief follow-up' },
  { id: 'g-0005', date: 'Jun 21', t: '16:55', donor: 'Tomas Rivera',   amt: 250,  src: 'email',     method: 'card',   fund: 'General',    status: 'cleared', officer: 'auto',     appeal: 'Q2 email appeal' },
  { id: 'g-0006', date: 'Jun 20', t: '08:47', donor: 'Amara Bello',    amt: 500,  src: 'event',     method: 'card',   fund: 'General',    status: 'cleared', officer: 'J. Park',  appeal: 'Spring gala', note: 'table host' },
  { id: 'g-0007', date: 'Jun 20', t: '13:22', donor: 'Priya Anand',    amt: 50,   src: 'recurring', method: 'ach',    fund: 'Recurring',  status: 'cleared', officer: 'auto',     appeal: 'Monthly sustainer' },
  { id: 'g-0008', date: 'Jun 19', t: '15:10', donor: 'Anonymous',      amt: 1600, src: 'major',     method: 'cash',   fund: 'Major gift', status: 'flagged', officer: 'M. Reyes', appeal: 'Walk-in', note: 'over BC cycle cap — hold for review' },
];

const RAISE_GIFTS_HOURLY = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
const RAISE_GIFTS_SOURCES = [];
const RAISE_LISTS = [];
const RAISE_REPORT_GOAL = [];
const RAISE_REPORT_ACQ = [];
const RAISE_REPORT_COHORTS = [];
const RAISE_REPORT_MIX = [];
const RAISE_REPORT_OFFICERS = [];
const RAISE_REPORT_AVG = [];
const RAISE_REPORT_PYRAMID = [];

export {
  RAISE_GIFTS_TODAY, RAISE_GIFTS, RAISE_GIFTS_HOURLY, RAISE_GIFTS_SOURCES,
  RAISE_LISTS,
  RAISE_REPORT_GOAL, RAISE_REPORT_ACQ, RAISE_REPORT_COHORTS, RAISE_REPORT_MIX,
  RAISE_REPORT_OFFICERS, RAISE_REPORT_AVG, RAISE_REPORT_PYRAMID,
};
