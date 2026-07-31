// Civic 2.0 — sitting member's command desk.
//
// All entity seeds and decorative dashboard blobs emptied. Pages read
// live records from the DB via useLiveRecords. The two configuration
// enums (case categories list — no counts; pipeline stages) are kept
// because they are vocabulary, not data.

const CV_MEMBER = {
  name: '', title: '', constituency: '', party: '', email: '', phone: '', office: '',
  caucusRole: '', terms: 0, photo: '',
  // Surface fields the Civic UI reads (kept zero/empty until computed from live records).
  initials: '', role: '', session: '',
  caseloadOpen: 0, voteAttendance: 0,
  allowance: { spentYTD: 0, annual: 0 },
};

const CV_ORDER_TODAY = [];

// ── Seed: bills (kind 'bill') ──────────────────────────────────────────
const CV_BILLS = [
  {
    id: 'cv-bill-31',
    num: 'Bill 31',
    title: 'Residential Tenancy Amendment Act (Renoviction Limits)',
    sponsor: 'Hon. Priya Sandhu',
    summary: 'Caps above-guideline rent increases after renovation and requires right-of-first-refusal for displaced tenants. [SAMPLE DATA]',
    myBill: false,
    myVote: 'yea (intent)',
    whip: 'one-line',
    next: '2nd reading · 27 Jun',
    cosigners: 6,
    amendments: 2,
    inFavor: 0.62,
    issues: ['Housing', 'Affordability'],
    readings: [
      { stage: '1R', status: 'done',    date: '06-04' },
      { stage: '2R', status: 'now',     date: '06-27' },
      { stage: 'Cmte', status: 'pending', date: '—' },
      { stage: '3R', status: 'pending', date: '—' },
    ],
    linked: { promise: 'cv-prom-1' },
  },
  {
    id: 'cv-bill-12',
    num: 'Bill 12',
    title: 'Coastal Ferry Service Accountability Act',
    sponsor: 'Member for Powell River–Sunshine Coast',
    summary: 'Establishes binding on-time service standards and fare caps for the coastal ferry network. [SAMPLE DATA]',
    myBill: true,
    myVote: 'sponsor',
    whip: 'free',
    next: 'Cmte · 02 Jul',
    cosigners: 3,
    amendments: 0,
    inFavor: 0.48,
    issues: ['Transport', 'Rural'],
    readings: [
      { stage: '1R', status: 'done', date: '05-21' },
      { stage: '2R', status: 'done', date: '06-11' },
      { stage: 'Cmte', status: 'now', date: '07-02' },
      { stage: '3R', status: 'pending', date: '—' },
    ],
    linked: {},
  },
  {
    id: 'cv-bill-08',
    num: 'Bill 8',
    title: 'Wildfire Preparedness & FireSmart Funding Act',
    sponsor: 'Hon. Daniel Whitecloud',
    summary: 'Funds municipal FireSmart programs and a standing provincial crew for the Interior. [SAMPLE DATA]',
    myBill: false,
    myVote: 'yea',
    whip: 'three-line',
    next: '3rd reading · 26 Jun',
    cosigners: 11,
    amendments: 4,
    inFavor: 0.81,
    issues: ['Emergency', 'Climate'],
    readings: [
      { stage: '1R', status: 'done', date: '04-30' },
      { stage: '2R', status: 'done', date: '05-28' },
      { stage: 'Cmte', status: 'done', date: '06-12' },
      { stage: '3R', status: 'now', date: '06-26' },
    ],
    linked: { promise: 'cv-prom-3' },
  },
  {
    id: 'cv-bill-22',
    num: 'Bill 22',
    title: 'Family Doctor Recruitment & Retention Act',
    sponsor: 'Hon. Mei-Lin Chow',
    summary: 'Loan-forgiveness and rural premiums to attract family physicians to underserved health regions. [SAMPLE DATA]',
    myBill: false,
    myVote: '',
    whip: 'two-line',
    next: '2nd reading · 30 Jun',
    cosigners: 8,
    amendments: 1,
    inFavor: 0.55,
    issues: ['Health', 'Rural'],
    readings: [
      { stage: '1R', status: 'done', date: '06-09' },
      { stage: '2R', status: 'now', date: '06-30' },
      { stage: 'Cmte', status: 'pending', date: '—' },
      { stage: '3R', status: 'pending', date: '—' },
    ],
    linked: {},
  },
  {
    id: 'cv-bill-40',
    num: 'Bill 40',
    title: 'Childcare Expansion ($10/day) Act',
    sponsor: 'Member for Victoria–Beacon Hill',
    summary: 'Phases in $10/day licensed childcare spaces province-wide over three fiscal years. [SAMPLE DATA]',
    myBill: false,
    myVote: 'yea (intent)',
    whip: 'one-line',
    next: '1st reading · 03 Jul',
    cosigners: 5,
    amendments: 0,
    inFavor: 0.69,
    issues: ['Family', 'Affordability'],
    readings: [
      { stage: '1R', status: 'now', date: '07-03' },
      { stage: '2R', status: 'pending', date: '—' },
      { stage: 'Cmte', status: 'pending', date: '—' },
      { stage: '3R', status: 'pending', date: '—' },
    ],
    linked: { promise: 'cv-prom-2' },
  },
];

// ── Seed: casework (kind 'case') ───────────────────────────────────────
const CV_CASES = [
  {
    id: 'cv-case-1', ref: 'CW-2026-0481', constituent: 'Margaret Olsen',
    postal: 'V8R 2P4', category: 'Health', issue: 'Surgery wait-list escalation — hip replacement [SAMPLE]',
    assigned: 'R. Mahoney', status: 'waiting-ministry', urgency: 'high',
    sla: '2 days overdue', touches: 4,
  },
  {
    id: 'cv-case-2', ref: 'CW-2026-0492', constituent: 'Tomás Reyes',
    postal: 'V9A 6T1', category: 'Housing', issue: 'BC Housing transfer request after renoviction [SAMPLE]',
    assigned: 'J. Forsythe', status: 'in-progress', urgency: 'high',
    sla: 'due today', touches: 2,
  },
  {
    id: 'cv-case-3', ref: 'CW-2026-0503', constituent: 'Aanya Gill',
    postal: 'V8T 1C9', category: 'Insurance', issue: 'ICBC dispute — total-loss valuation [SAMPLE]',
    assigned: 'R. Mahoney', status: 'ack-sent', urgency: 'medium',
    sla: '5 days', touches: 1,
  },
  {
    id: 'cv-case-4', ref: 'CW-2026-0510', constituent: 'Walter Kruse',
    postal: 'V8N 3R2', category: 'Disability', issue: 'PWD benefit reinstatement after review [SAMPLE]',
    assigned: 'L. Tran', status: 'in-progress', urgency: 'medium',
    sla: '3 days', touches: 3,
  },
  {
    id: 'cv-case-5', ref: 'CW-2026-0517', constituent: 'Sofia Bélanger',
    postal: 'V8P 5M8', category: 'Immigration', issue: 'PNP nomination delay — provincial referral [SAMPLE]',
    assigned: 'L. Tran', status: 'resolved', urgency: 'low',
    sla: 'closed', touches: 5,
  },
  {
    id: 'cv-case-6', ref: 'CW-2026-0521', constituent: 'Dev Patil',
    postal: 'V8R 1J7', category: 'Transport', issue: 'Bus route 14 cut — accessibility complaint [SAMPLE]',
    assigned: 'J. Forsythe', status: 'new', urgency: 'low',
    sla: '7 days', touches: 0,
  },
];

// Category vocabulary — names only. Counts/trends come from live cases.
const CV_CASE_CATS = [
  { k: 'Housing',     count: 0, trend: 0 },
  { k: 'Health',      count: 0, trend: 0 },
  { k: 'Insurance',   count: 0, trend: 0 },
  { k: 'Immigration', count: 0, trend: 0 },
  { k: 'Transport',   count: 0, trend: 0 },
  { k: 'Disability',  count: 0, trend: 0 },
  { k: 'Federal',     count: 0, trend: 0 },
  { k: 'Labour',      count: 0, trend: 0 },
  { k: 'Education',   count: 0, trend: 0 },
  { k: 'Utilities',   count: 0, trend: 0 },
];

// Casework pipeline stages — pure configuration (kept).
const CV_CASE_PIPE_STAGES = [
  { k: 'new',              label: 'NEW · triage',        tone: 'info' },
  { k: 'ack-sent',         label: 'ACK SENT',            tone: 'mid' },
  { k: 'in-progress',      label: 'IN PROGRESS',         tone: 'mid' },
  { k: 'waiting-ministry', label: 'WAITING · MINISTRY',  tone: 'warn' },
  { k: 'resolved',         label: 'RESOLVED',            tone: 'ok' },
];

const CV_VOTES = [];
const CV_MOTIONS = [];

// ── Seed: speeches (kind 'speech') ─────────────────────────────────────
const CV_SPEECHES = [
  {
    id: 'cv-sp-1', stage: '2nd reading', at: '2026-06-11', title: 'On the Coastal Ferry Accountability Act [SAMPLE]',
    duration: '11:20', words: 1840, hansardRef: 'V42-118', clipped: true,
    topics: ['Transport', 'Rural'],
  },
  {
    id: 'cv-sp-2', stage: 'Question Period', at: '2026-06-09', title: 'Surgical wait-times in Island Health [SAMPLE]',
    duration: '02:05', words: 320, hansardRef: 'V42-116', clipped: true,
    topics: ['Health'],
  },
  {
    id: 'cv-sp-3', stage: "Members' statements", at: '2026-06-04', title: 'Honouring the Esquimalt Volunteer Fire Brigade [SAMPLE]',
    duration: '01:50', words: 290, hansardRef: 'V42-112', clipped: false,
    topics: ['Community'],
  },
  {
    id: 'cv-sp-4', stage: 'Committee', at: '2026-05-28', title: 'FireSmart funding — clause-by-clause remarks [SAMPLE]',
    duration: '07:40', words: 1210, hansardRef: 'V42-104', clipped: false,
    topics: ['Emergency', 'Climate'],
  },
  {
    id: 'cv-sp-5', stage: 'Budget debate', at: '2026-05-14', title: 'Response to Estimates — Housing vote [SAMPLE]',
    duration: '14:55', words: 2360, hansardRef: 'V42-091', clipped: true,
    topics: ['Housing', 'Affordability'],
  },
];

const CV_COMMITTEES = [];
const CV_HEARINGS = [];

// ── Seed: promises (kind 'promise') ────────────────────────────────────
const CV_PROMISES = [
  {
    id: 'cv-prom-1', title: 'Stop renovictions in our riding [SAMPLE]', segment: 'Renters',
    owner: 'Constituency office', stage: 'Legislation tabled', status: 'on-track',
    pct: 0.55, cost: '$0', receipts: 3, evidence: ['Bill 31 1R', 'Town hall · Apr', 'BC Housing letter'],
    linkedBill: 'cv-bill-31',
  },
  {
    id: 'cv-prom-2', title: 'Expand $10/day childcare spaces [SAMPLE]', segment: 'Families',
    owner: 'Caucus · Family critic', stage: 'Funding secured', status: 'on-track',
    pct: 0.40, cost: '$120M', receipts: 2, evidence: ['Budget 2026 line', 'Ministry MOU'],
    linkedBill: 'cv-bill-40',
  },
  {
    id: 'cv-prom-3', title: 'Year-round wildfire crew for the Interior [SAMPLE]', segment: 'Rural / Interior',
    owner: 'Hon. D. Whitecloud', stage: 'Passed 3R', status: 'kept',
    pct: 1, cost: '$48M', receipts: 4, evidence: ['Bill 8 Royal Assent', 'OIC 224/26', 'Press release', 'EMBC plan'],
    linkedBill: 'cv-bill-08',
  },
  {
    id: 'cv-prom-4', title: 'Recruit 25 new family doctors locally [SAMPLE]', segment: 'Patients',
    owner: 'Island Health liaison', stage: 'In negotiation', status: 'slipping',
    pct: 0.20, cost: '$9M', receipts: 1, evidence: ['Health Authority memo'],
    linkedBill: 'cv-bill-22',
  },
  {
    id: 'cv-prom-5', title: 'Restore bus route 14 service [SAMPLE]', segment: 'Transit riders',
    owner: 'Constituency office', stage: 'Advocacy', status: 'at-risk',
    pct: 0.10, cost: '$2M', receipts: 1, evidence: ['BC Transit correspondence'],
  },
];

const CV_OFFICE_WEEK = [];
const CV_LETTERS = [];
const CV_STAFF = [];
const CV_SPEND = [];
const CV_TRENDS = [];

export {
  CV_MEMBER, CV_ORDER_TODAY, CV_BILLS, CV_CASES, CV_CASE_CATS, CV_CASE_PIPE_STAGES,
  CV_VOTES, CV_MOTIONS, CV_SPEECHES, CV_COMMITTEES, CV_HEARINGS, CV_PROMISES,
  CV_OFFICE_WEEK, CV_LETTERS, CV_STAFF, CV_SPEND, CV_TRENDS,
};
