// Civic 2.0 — sitting member's command desk.
// Object model: Bills · Cases · Promises · Motions · Speeches · Witnesses · Hearings · Letters · Constituents

const CV_MEMBER = {
  name: 'Amara Tanaka',
  initials: 'AT',
  role: 'MLA · Meridian West',
  party: 'Meridian Forward',
  caucus: 'Government',
  sworn: '2024-09-17',
  seat: 'Row 3 · Seat 12',
  session: '42nd Parl · 2nd Sess · Day 47',
  office: {
    constituency: '312 Main St, Vancouver',
    legislature: 'Room 218, Parliament Buildings, Victoria',
    phone: '(604) 555-0148',
    email: 'amara.tanaka.mla@leg.bc.ca',
  },
  allowance: { annual: 119_000, spentYTD: 62_140, fyPct: 0.62 },
  staff: 5,
  caseloadOpen: 47,
  voteAttendance: 0.94,
  speeches: 38,
  motionsTabled: 14,
  bills: 2,
};

// ═══ ORDER OF THE DAY · live ═══
const CV_ORDER_TODAY = [
  { t: '09:00', what: 'Committee · Transpo (chair)',           where: 'Cttee Rm 1', kind: 'committee', detail: 'BCT Q1 capital plan · 3 witnesses · brief signed' },
  { t: '10:30', what: 'Constituency call block',               where: 'Office',     kind: 'cases',     detail: '2 overdue cases: Choi (disability), Hoang (eviction)' },
  { t: '13:00', what: 'Caucus · whip Bill 14',                 where: 'Caucus rm',  kind: 'caucus',    detail: 'Hard yes · Wong soft no · whip count 31/35' },
  { t: '14:00', what: 'House · Supply estimates · Transport',  where: 'Chamber',    kind: 'floor',     detail: 'Yea, whipped · vote 14:00' },
  { t: '14:30', what: 'House · Bill 14 second reading',        where: 'Chamber',    kind: 'floor',     detail: 'Speech slot 13:50 · remarks drafted' },
  { t: '15:00', what: 'Office hours · walk-ins',               where: 'Main St',    kind: 'cases',     detail: '9 booked · 4 housing · 2 health · 3 misc' },
  { t: '18:30', what: 'Town hall · Chestnut Hill · transit',   where: 'Comm ctr',   kind: 'community', detail: '114/180 booked · campaign side · staffer Devon' },
];

// ═══ BILLS · current session — full lifecycle ═══
const CV_BILLS = [
  { id: 'b-14',  num: 'Bill 14',   title: 'Transportation & Transit Financing Act',
    sponsor: 'Hon. P. Singh (Min. Transport)', sponsorOurs: true, myBill: false,
    stage: '2nd reading', whip: 'yes', myVote: 'yea (intent)', next: 'Tue 14:30',
    readings: [
      { stage: '1st reading',  date: '2026-02-12', status: 'done' },
      { stage: '2nd reading',  date: '2026-03-11', status: 'today' },
      { stage: 'Cttee whole',  date: '2026-03-18', status: 'pending' },
      { stage: '3rd reading',  date: '2026-03-25', status: 'pending' },
      { stage: 'Royal assent', date: '—',          status: 'pending' },
    ],
    inFavor: 0.62, cosigners: 24, amendments: 4,
    issues: ['transit', 'fiscal'],
    linked: { promise: 'p-1', cases: ['cw-5'] },
    summary: 'Authorizes $1.4B over 6yr for rapid transit corridors · Eastside spine.',
  },
  { id: 'b-21',  num: 'Bill 21',   title: 'Residential Tenancy Amendment Act',
    sponsor: 'Hon. R. Mehta (Min. Housing)', sponsorOurs: true,
    stage: '3rd reading', whip: 'yes', myVote: 'yea', next: 'Wed 10:30',
    readings: [
      { stage: '1st reading', date: '2026-01-22', status: 'done' },
      { stage: '2nd reading', date: '2026-02-19', status: 'done' },
      { stage: 'Cttee whole', date: '2026-03-04', status: 'done' },
      { stage: '3rd reading', date: '2026-03-12', status: 'pending' },
      { stage: 'Royal assent', date: '—',         status: 'pending' },
    ],
    inFavor: 0.54, cosigners: 18, amendments: 11,
    issues: ['housing'],
    linked: { promise: 'p-2', cases: ['cw-3'] },
    summary: 'Caps annual rent increases at CPI+2 · stronger eviction guardrails.',
  },
  { id: 'b-9',   num: 'Bill 9',    title: 'Child Care Fee Reduction Act',
    sponsor: 'Hon. K. Liu (Min. Social)', sponsorOurs: true,
    stage: 'committee', whip: 'yes', myVote: null, next: 'Mar 18 cttee',
    readings: [
      { stage: '1st reading', date: '2026-02-04', status: 'done' },
      { stage: '2nd reading', date: '2026-02-26', status: 'done' },
      { stage: 'Cttee whole', date: '2026-03-18', status: 'pending' },
      { stage: '3rd reading', date: '—',          status: 'pending' },
    ],
    inFavor: 0.78, cosigners: 31, amendments: 2,
    issues: ['childcare', 'families'],
    linked: { promise: 'p-4' },
    summary: '8,000 new $10/day spaces · expansion of subsidized care across BC.',
  },
  { id: 'b-m22', num: 'Bill M-22', title: 'Rent Stabilization (Seniors) Act',
    sponsor: 'A. Tanaka (Member · ours)', sponsorOurs: true, myBill: true,
    stage: '1st reading', whip: 'free', myVote: 'sponsor', next: '2nd on Fri 13:30',
    readings: [
      { stage: 'Drafted',     date: '2026-01-08', status: 'done' },
      { stage: '1st reading', date: '2026-02-03', status: 'done' },
      { stage: '2nd reading', date: '2026-03-13', status: 'pending' },
      { stage: 'Cttee whole', date: '—',          status: 'pending' },
      { stage: '3rd reading', date: '—',          status: 'pending' },
    ],
    inFavor: 0.48, cosigners: 9, amendments: 0,
    issues: ['housing', 'seniors'],
    linked: { promise: 'p-2' },
    summary: 'Freeze rent for tenants 65+ on fixed income · my private member\u2019s bill.',
  },
  { id: 'b-m17', num: 'Bill M-17', title: 'Climate Accountability Disclosure Act',
    sponsor: 'D. Vega (Member · ours)', sponsorOurs: true,
    stage: '1st reading', whip: 'free', myVote: 'yea (intent)', next: 'Thu 15:00',
    readings: [
      { stage: '1st reading', date: '2026-03-04', status: 'done' },
      { stage: '2nd reading', date: '2026-03-12', status: 'pending' },
    ],
    inFavor: 0.41, cosigners: 6, amendments: 0,
    issues: ['climate'],
    linked: { promise: 'p-6' },
    summary: 'Annual public disclosure of provincial climate cost & emissions.',
  },
  { id: 'b-18',  num: 'Bill 18',   title: 'Firearms Transport Exemption Act',
    sponsor: 'B. Vance (Opposition)', sponsorOurs: false,
    stage: '2nd reading', whip: 'no', myVote: 'nay', next: 'Tue 16:30',
    readings: [
      { stage: '1st reading', date: '2026-02-22', status: 'done' },
      { stage: '2nd reading', date: '2026-03-11', status: 'today' },
    ],
    inFavor: 0.32, cosigners: 11, amendments: 0,
    issues: ['public-safety'],
    linked: {},
    summary: 'Opposition bill · weaken transport restrictions · caucus whips against.',
  },
  { id: 'b-6',   num: 'Bill 6',    title: 'Resource Revenue Sharing Act',
    sponsor: 'Hon. M. Calder (Min. Indigenous Rel.)', sponsorOurs: true,
    stage: '1st reading', whip: 'yes', myVote: null, next: 'Mon 13:00',
    readings: [
      { stage: '1st reading', date: '2026-03-08', status: 'done' },
      { stage: '2nd reading', date: '2026-03-25', status: 'pending' },
    ],
    inFavor: 0.58, cosigners: 22, amendments: 0,
    issues: ['indigenous', 'fiscal'],
    linked: {},
    summary: 'Permanent revenue-share framework with First Nations on resource projects.',
  },
];

// ═══ CASES · constituent inbox (extends v1 CASEWORK) ═══
const CV_CASES = [
  { id: 'cw-1',  ref: 'MW-2024-0412', opened: '2026-03-10', constituent: 'Dariush Amini',    postal: 'V5N 2J1', issue: 'ICBC · claim denied after collision',     category: 'Insurance',  urgency: 'high',   status: 'in-progress',     assigned: 'L. Okafor', lastTouch: '2h',  sla: 'due Fri',    age: 1,  touches: 4 },
  { id: 'cw-2',  ref: 'MW-2024-0411', opened: '2026-03-10', constituent: 'Priya Chen',        postal: 'V5P 3A9', issue: 'MSP · prior authorization for MRI',       category: 'Health',     urgency: 'medium', status: 'waiting-ministry',assigned: 'L. Okafor', lastTouch: '1d',  sla: 'waiting',     age: 1,  touches: 3 },
  { id: 'cw-3',  ref: 'MW-2024-0409', opened: '2026-03-08', constituent: 'Marcus Hoang',      postal: 'V5L 5R2', issue: 'BC Housing · eviction defense letter',     category: 'Housing',    urgency: 'high',   status: 'in-progress',     assigned: 'S. Medina', lastTouch: '4h',  sla: 'overdue 1d', age: 3,  touches: 6 },
  { id: 'cw-4',  ref: 'MW-2024-0408', opened: '2026-03-08', constituent: 'Fatimah Jalloh',    postal: 'V5N 1H4', issue: 'IRCC · spousal sponsorship delay',         category: 'Immigration', urgency: 'medium', status: 'waiting-ministry',assigned: 'A. Park',   lastTouch: '2d',  sla: 'escalate Mon', age: 3, touches: 5 },
  { id: 'cw-5',  ref: 'MW-2024-0406', opened: '2026-03-07', constituent: 'Nadia Ibrahim',     postal: 'V5M 4T0', issue: 'Transit · bus 134 schedule change',         category: 'Transport',  urgency: 'low',    status: 'ack-sent',         assigned: 'A. Park',   lastTouch: '2d',  sla: '5-day reply', age: 4,  touches: 1 },
  { id: 'cw-6',  ref: 'MW-2024-0404', opened: '2026-03-06', constituent: 'Robert Kowalski',   postal: 'V5P 4G2', issue: 'Pharmacare · drug not covered',             category: 'Health',     urgency: 'medium', status: 'resolved',         assigned: 'L. Okafor', lastTouch: '4d',  sla: 'closed',      age: 5,  touches: 7 },
  { id: 'cw-7',  ref: 'MW-2024-0402', opened: '2026-03-05', constituent: 'Youssef El-Amin',   postal: 'V5N 3K1', issue: 'WorkSafeBC · back injury claim appeal',     category: 'Labour',     urgency: 'medium', status: 'in-progress',     assigned: 'S. Medina', lastTouch: '1d',  sla: 'due next Wed', age: 6, touches: 4 },
  { id: 'cw-8',  ref: 'MW-2024-0401', opened: '2026-03-05', constituent: 'Linnea Johansson',  postal: 'V5L 2H8', issue: 'Seniors freeze · confusion re eligibility', category: 'Housing',    urgency: 'low',    status: 'resolved',         assigned: 'A. Park',   lastTouch: '5d',  sla: 'closed',      age: 6,  touches: 2 },
  { id: 'cw-9',  ref: 'MW-2024-0399', opened: '2026-03-04', constituent: 'Marisol Choi',      postal: 'V5M 2E4', issue: 'Disability review · delayed 7 months',      category: 'Disability', urgency: 'high',   status: 'in-progress',     assigned: 'L. Okafor', lastTouch: '1d',  sla: 'due today',   age: 7,  touches: 8 },
  { id: 'cw-10', ref: 'MW-2024-0395', opened: '2026-03-03', constituent: 'Tyrone Reid',       postal: 'V5P 1B6', issue: 'Adoption · provincial fees',                category: 'Family',     urgency: 'low',    status: 'waiting-ministry',assigned: 'S. Medina', lastTouch: '3d',  sla: 'waiting',     age: 8,  touches: 3 },
  { id: 'cw-11', ref: 'MW-2024-0392', opened: '2026-03-02', constituent: 'Helen Brock',       postal: 'V5M 5W7', issue: 'CPP disability · MLA advocacy',             category: 'Federal',    urgency: 'medium', status: 'in-progress',     assigned: 'L. Okafor', lastTouch: '2d',  sla: 'due Thu',     age: 9,  touches: 4 },
  { id: 'cw-12', ref: 'MW-2024-0388', opened: '2026-02-28', constituent: 'Kofi Asante',       postal: 'V5N 4L2', issue: 'School catchment · appeal',                 category: 'Education',  urgency: 'low',    status: 'ack-sent',         assigned: 'A. Park',   lastTouch: '6d',  sla: '10-day reply', age: 11, touches: 1 },
  { id: 'cw-13', ref: 'MW-2024-0386', opened: '2026-02-27', constituent: 'Aleksei Petrov',    postal: 'V5L 1Y4', issue: 'BC Hydro · billing dispute',                 category: 'Utilities',  urgency: 'low',    status: 'in-progress',     assigned: 'A. Park',   lastTouch: '1d',  sla: 'due Mon',     age: 12, touches: 3 },
  { id: 'cw-14', ref: 'MW-2024-0383', opened: '2026-02-26', constituent: 'Saoirse O\u2019Connor', postal: 'V5N 2R7', issue: 'Public-school speech therapy waitlist',  category: 'Education',  urgency: 'medium', status: 'waiting-ministry',assigned: 'A. Park',   lastTouch: '4d',  sla: 'waiting',     age: 13, touches: 2 },
  { id: 'cw-15', ref: 'MW-2024-0379', opened: '2026-02-25', constituent: 'Hannah Bergeron',    postal: 'V5P 2B0', issue: 'CRA · GST credit disallowed',               category: 'Federal',    urgency: 'low',    status: 'resolved',         assigned: 'L. Okafor', lastTouch: '8d',  sla: 'closed',      age: 14, touches: 5 },
];

const CV_CASE_CATS = [
  { k: 'Housing', count: 14, trend: +0.22 },
  { k: 'Health', count: 9, trend: -0.04 },
  { k: 'Insurance', count: 7, trend: +0.08 },
  { k: 'Immigration', count: 6, trend: +0.15 },
  { k: 'Transport', count: 4, trend: +0.31 },
  { k: 'Disability', count: 3, trend: +0.00 },
  { k: 'Federal', count: 3, trend: +0.04 },
  { k: 'Labour', count: 2, trend: -0.02 },
  { k: 'Education', count: 4, trend: +0.05 },
  { k: 'Utilities', count: 2, trend: +0.10 },
];

const CV_CASE_PIPE_STAGES = [
  { k: 'new',                label: 'NEW · triage',          tone: 'info' },
  { k: 'ack-sent',           label: 'ACK SENT',              tone: 'mid' },
  { k: 'in-progress',        label: 'IN PROGRESS',           tone: 'mid' },
  { k: 'waiting-ministry',   label: 'WAITING · MINISTRY',    tone: 'warn' },
  { k: 'resolved',           label: 'RESOLVED',              tone: 'ok' },
];

// ═══ HANSARD · floor record (votes + motions + speeches) ═══
const CV_VOTES = [
  { id: 'v-2103', bill: 'Bill 11',   title: 'Supply Act No. 2',                  at: '2026-03-09', myVote: 'yea',    result: 'passed',   tally: '47–35', whipHeld: true,  duration: '12m', division: 'recorded' },
  { id: 'v-2102', bill: 'Bill 13',   title: 'Film Incentive Extension Act',      at: '2026-03-07', myVote: 'yea',    result: 'passed',   tally: '52–30', whipHeld: true,  duration: '9m',  division: 'recorded' },
  { id: 'v-2101', bill: 'Bill M-8',  title: 'Off-leash Dog Parks Act (member)',  at: '2026-03-07', myVote: 'nay',    result: 'defeated', tally: '38–46', whipHeld: true,  duration: '7m',  division: 'recorded' },
  { id: 'v-2100', bill: 'Bill 10',   title: 'Property Tax Amendment',            at: '2026-03-05', myVote: 'absent', result: 'passed',   tally: '44–38', whipHeld: false, duration: '6m',  division: 'recorded', reason: 'Transpo cttee clash' },
  { id: 'v-2099', bill: 'Bill 8',    title: 'Wildfire Preparedness Act',         at: '2026-03-04', myVote: 'yea',    result: 'passed',   tally: '80–2',  whipHeld: true,  duration: '4m',  division: 'on-division' },
  { id: 'v-2098', bill: 'Bill M-5',  title: 'Right to Disconnect Act (member)',  at: '2026-03-03', myVote: 'yea',    result: 'defeated', tally: '36–48', whipHeld: false, duration: '8m',  division: 'recorded', reason: 'Free vote · crossed w/ Greens' },
  { id: 'v-2097', bill: 'Motion 41', title: 'Recognize Filipino Heritage Mo.',   at: '2026-03-02', myVote: 'yea',    result: 'passed',   tally: '78–0',  whipHeld: true,  duration: '2m',  division: 'unanimous' },
  { id: 'v-2096', bill: 'Bill 7',    title: 'Public Sector Wage Settlement',     at: '2026-02-28', myVote: 'yea',    result: 'passed',   tally: '50–32', whipHeld: true,  duration: '14m', division: 'recorded' },
];

const CV_MOTIONS = [
  { id: 'mo-1', num: 'Motion 41', title: 'Filipino Heritage Month recognition',           tabledBy: 'Tanaka',      at: '2026-03-02', status: 'passed',   tally: '78–0',   ours: true },
  { id: 'mo-2', num: 'Motion 38', title: 'Bus 134 service restoration · urge Min Trans',  tabledBy: 'Tanaka',      at: '2026-02-21', status: 'passed',   tally: '64–18',  ours: true },
  { id: 'mo-3', num: 'Motion 44', title: 'Eastside transit corridor study',                tabledBy: 'Tanaka',      at: '2026-03-09', status: 'on-paper', tally: '—',      ours: true },
  { id: 'mo-4', num: 'Motion 47', title: 'Condemn anti-immigrant rhetoric (debated)',     tabledBy: 'Liu (Green)', at: '2026-03-08', status: 'debated',  tally: '—',      ours: false },
  { id: 'mo-5', num: 'Motion 39', title: 'Inquiry on ICBC fairness',                       tabledBy: 'Tanaka',      at: '2026-02-24', status: 'referred', tally: '—',      ours: true },
];

const CV_SPEECHES = [
  { id: 'sp-1', at: '2026-03-09', stage: 'Debate · Bill 11',  title: 'On supply estimates and the case for transit',     duration: '14m', words: 1840, hansardRef: 'H-2103-A', clipped: true,  topics: ['transit','fiscal'] },
  { id: 'sp-2', at: '2026-03-07', stage: 'Member statement', title: 'In recognition of frontline ICBC workers',          duration: '2m',  words: 240,  hansardRef: 'H-2102-B', clipped: false, topics: ['labour','insurance'] },
  { id: 'sp-3', at: '2026-03-05', stage: 'Debate · Bill 9',  title: 'Why $10/day is the floor, not the ceiling',          duration: '11m', words: 1420, hansardRef: 'H-2100-D', clipped: true,  topics: ['childcare'] },
  { id: 'sp-4', at: '2026-03-03', stage: 'Question period',  title: 'On the Eastside transit corridor delay',             duration: '1m',  words: 110,  hansardRef: 'QP-2098',   clipped: true,  topics: ['transit'] },
  { id: 'sp-5', at: '2026-02-28', stage: 'Member statement', title: 'A note for renters facing eviction this winter',     duration: '2m',  words: 280,  hansardRef: 'H-2096-C',  clipped: true,  topics: ['housing'] },
  { id: 'sp-6', at: '2026-02-21', stage: 'Motion 38',         title: 'Restoring Bus 134 — what one route means',          duration: '8m',  words: 1010, hansardRef: 'H-2089-A',  clipped: true,  topics: ['transit'] },
];

// ═══ COMMITTEES & HEARINGS ═══
const CV_COMMITTEES = [
  { id: 'ct-ti', name: 'Transportation & Infrastructure', role: 'Chair',  cadence: 'Wed 09:00', nextMeeting: '2026-03-11 09:00', hearings: 3, witnesses: 14, reports: 1, members: 9 },
  { id: 'ct-ho', name: 'Housing',                          role: 'Member', cadence: 'Thu 13:30', nextMeeting: '2026-03-12 13:30', hearings: 2, witnesses: 9,  reports: 0, members: 7 },
  { id: 'ct-pa', name: 'Public Accounts',                  role: 'Member', cadence: 'Mon 10:00', nextMeeting: '2026-03-16 10:00', hearings: 1, witnesses: 4,  reports: 2, members: 11 },
];

const CV_HEARINGS = [
  { id: 'h-1', cttee: 'ct-ti', title: 'BC Transit Q1 capital plan · testimony', date: '2026-03-11 09:00', witnesses: ['BCT CEO', 'Ministry DM', 'BCGEU rep'],            prep: 'brief signed', topics: ['transit'] },
  { id: 'h-2', cttee: 'ct-ho', title: 'Renters Advisory panel',                  date: '2026-03-12 13:30', witnesses: ['Eastside HC · S. Nkomo', 'Landlord BC', 'City'], prep: 'pending',     topics: ['housing'] },
  { id: 'h-3', cttee: 'ct-pa', title: 'ICBC financials review',                  date: '2026-03-16 10:00', witnesses: ['Auditor General', 'ICBC CFO'],                  prep: 'not started', topics: ['insurance'] },
  { id: 'h-4', cttee: 'ct-ti', title: 'Eastside corridor · public consultation', date: '2026-03-25 09:00', witnesses: ['8 community groups'],                            prep: 'invitations out', topics: ['transit'] },
];

// ═══ PROMISES ═══
const CV_PROMISES = [
  { id: 'p-1', title: 'Rapid transit to the Eastside by 2028',     stage: 'Tabled',     made: '2024-06-14', segment: 'Eastside renters', owner: 'Transit',     receipts: 7, cost: '$1.4B',  status: 'on-track', linkedBill: 'b-14',  evidence: ['Bill 14 · 2nd reading', 'Capital plan Q1'], pct: 0.55 },
  { id: 'p-2', title: 'Freeze rent increases for seniors',          stage: 'Law',        made: '2024-07-02', segment: 'Seniors',          owner: 'Housing',     receipts: 4, cost: '$82M',   status: 'kept',      linkedBill: 'b-m22', evidence: ['Bill M-22 · own bill', 'OIC 204-2025'], pct: 1.00 },
  { id: 'p-3', title: 'Triple urban tree canopy by 2030',           stage: 'Progress',   made: '2024-08-18', segment: 'Climate-first',    owner: 'Environment', receipts: 2, cost: '$240M',  status: 'on-track', linkedBill: null,    evidence: ['Budget 2025 line item'], pct: 0.30 },
  { id: 'p-4', title: '$10/day childcare · 8,000 new spaces',      stage: 'Funded',     made: '2024-09-01', segment: 'Young families',   owner: 'Social',      receipts: 5, cost: '$510M',  status: 'on-track', linkedBill: 'b-9',   evidence: ['Bill 9 cttee', '4,000 spaces opened'], pct: 0.50 },
  { id: 'p-5', title: 'Cap on intl student fee hikes',              stage: 'Studying',   made: '2024-09-10', segment: 'Students',         owner: 'Ed',          receipts: 1, cost: 'TBD',    status: 'slipping',  linkedBill: null,    evidence: ['Cttee referral Jan 2026'], pct: 0.15 },
  { id: 'p-6', title: 'Annual climate cost disclosure',             stage: 'Introduced', made: '2024-10-22', segment: 'Climate-first',    owner: 'Environment', receipts: 3, cost: 'admin',  status: 'on-track', linkedBill: 'b-m17', evidence: ['Bill M-17 · 1st reading'], pct: 0.25 },
  { id: 'p-7', title: 'Open the Victoria Dr bike network',          stage: 'Progress',   made: '2024-11-03', segment: 'Commuters',         owner: 'Transport',   receipts: 2, cost: '$48M',   status: 'on-track', linkedBill: null,    evidence: ['MoU w/ City'], pct: 0.45 },
  { id: 'p-8', title: 'Restore bus 134 frequency',                  stage: 'Kept',       made: '2024-06-14', segment: 'Chestnut Hill',    owner: 'Transit',     receipts: 3, cost: '$4M',    status: 'kept',      linkedBill: null,    evidence: ['TransLink service plan'], pct: 1.00 },
  { id: 'p-9', title: 'Double constituency office hours',           stage: 'Kept',       made: '2024-06-14', segment: 'Riding-wide',      owner: 'Own',         receipts: 1, cost: 'ops',    status: 'kept',      linkedBill: null,    evidence: ['Office schedule Oct 2024'], pct: 1.00 },
  { id: 'p-10',title: 'No new carbon exemptions',                   stage: 'Holding',    made: '2024-12-01', segment: 'Climate-first',    owner: 'Environment', receipts: 1, cost: '—',      status: 'at-risk',   linkedBill: null,    evidence: ['Public statement Mar 2026'], pct: 0.30 },
  { id: 'p-11',title: 'Office in every neighbourhood',              stage: 'Kept',       made: '2024-06-14', segment: 'Riding-wide',      owner: 'Own',         receipts: 1, cost: 'ops',    status: 'kept',      linkedBill: null,    evidence: ['4 satellite offices live'], pct: 1.00 },
];

// ═══ COMMUNITY · weekly office calendar ═══
const CV_OFFICE_WEEK = [
  { id: 'cc-1', day: 'Mon', date: 'Mar 9',  time: '14:00', what: 'Office hours · walk-in',           where: 'Main St',     kind: 'office', booked: 9,  capacity: 16 },
  { id: 'cc-2', day: 'Tue', date: 'Mar 10', time: '18:30', what: 'Town hall · Chestnut Hill transit',where: 'Comm centre', kind: 'town',   booked: 114, capacity: 180 },
  { id: 'cc-3', day: 'Wed', date: 'Mar 11', time: '12:00', what: 'Seniors mobile surgery',           where: 'Plaza 500',   kind: 'surg',   booked: 14, capacity: 20 },
  { id: 'cc-4', day: 'Thu', date: 'Mar 12', time: '09:00', what: 'School visit · Lord Byng',         where: 'Lord Byng',   kind: 'visit',  booked: 1,  capacity: 1 },
  { id: 'cc-5', day: 'Fri', date: 'Mar 13', time: '14:00', what: 'Ribbon cut · Bus 134 restoration', where: 'Bus 134 stop', kind: 'public', booked: 40, capacity: 80 },
  { id: 'cc-6', day: 'Sat', date: 'Mar 14', time: '10:00', what: 'Mobile office · Eastbridge',       where: 'Library',     kind: 'surg',   booked: 7,  capacity: 20 },
  { id: 'cc-7', day: 'Sun', date: 'Mar 15', time: '—',     what: 'Dark day',                          where: '—',           kind: 'off',    booked: 0,  capacity: 0 },
];

// ═══ CORRESPONDENCE ═══
const CV_LETTERS = [
  { id: 'co-1', at: '08:42', dir: 'in',  who: 'Eastside Housing Coalition', subj: 'Request · tenant caucus endorsement', channel: 'letter', status: 'triaged',       owner: 'Chief of staff', priority: 'med' },
  { id: 'co-2', at: '08:15', dir: 'in',  who: 'Min. of Transport',          subj: 'Re: letter 2026-02-14 (bus 134)',     channel: 'letter', status: 'reply-drafted', owner: 'L. Okafor',      priority: 'med' },
  { id: 'co-3', at: '07:58', dir: 'out', who: 'AG of BC',                   subj: 'On ICBC fairness (supply)',           channel: 'letter', status: 'signed · sent', owner: 'Member',         priority: 'high' },
  { id: 'co-4', at: '07:42', dir: 'in',  who: 'BC Nurses Union',            subj: 'Supporting Bill M-22',                 channel: 'email',  status: 'triaged',       owner: 'S. Medina',      priority: 'med' },
  { id: 'co-5', at: '07:20', dir: 'out', who: 'Marisol Choi',                subj: 'Ack · disability review',               channel: 'email',  status: 'sent',          owner: 'L. Okafor',      priority: 'med' },
  { id: 'co-6', at: '06:58', dir: 'in',  who: 'Trustee Patel',               subj: 'Catchment boundary request',           channel: 'email',  status: 'new',           owner: null,             priority: 'low' },
  { id: 'co-7', at: '06:15', dir: 'in',  who: 'Premier\u2019s office',       subj: 'Whip · Bill 14 2nd reading',           channel: 'letter', status: 'ack',           owner: 'Member',         priority: 'high' },
  { id: 'co-8', at: 'yday',  dir: 'out', who: 'Mayor of Vancouver',          subj: 'Victoria Dr bike network',             channel: 'letter', status: 'sent',          owner: 'Member',         priority: 'med' },
  { id: 'co-9', at: 'yday',  dir: 'in',  who: 'Min. of Health',              subj: 'Re: Pharmacare drug coverage',         channel: 'letter', status: 'triaged',       owner: 'L. Okafor',      priority: 'med' },
  { id: 'co-10', at: '2 days',dir: 'in',  who: '47 constituents',            subj: 'Form letter campaign · opposing Bill 18', channel: 'email', status: 'bulk · ack',  owner: 'A. Park',        priority: 'low' },
];

// ═══ STAFF ═══
const CV_STAFF = [
  { id: 's-cos',  name: 'Lena Okafor',   role: 'Chief of Staff',       location: 'Victoria',  on: true,  caseload: 12, seniority: '7y', email: 'l.okafor@leg.bc.ca' },
  { id: 's-com',  name: 'Sara Medina',   role: 'Community Liaison',    location: 'Vancouver', on: true,  caseload: 14, seniority: '4y', email: 's.medina@leg.bc.ca' },
  { id: 's-pol',  name: 'Arjun Park',    role: 'Policy Advisor',       location: 'Victoria',  on: true,  caseload: 8,  seniority: '3y', email: 'a.park@leg.bc.ca' },
  { id: 's-case', name: 'Moira Sandhu',  role: 'Senior Caseworker',    location: 'Vancouver', on: false, caseload: 13, seniority: '9y', email: 'm.sandhu@leg.bc.ca' },
  { id: 's-press',name: 'Devon Brock',   role: 'Press & Comms',        location: 'Hybrid',    on: true,  caseload: 0,  seniority: '5y', email: 'd.brock@leg.bc.ca' },
];

// ═══ RIDING ALLOWANCE ═══
const CV_SPEND = [
  { cat: 'Office rent',           used: 18_200, budget: 28_800 },
  { cat: 'Staff support',         used: 22_400, budget: 38_000 },
  { cat: 'Constituent outreach',  used: 9_210,  budget: 18_000 },
  { cat: 'Travel · in-riding',    used: 4_180,  budget: 8_400 },
  { cat: 'Translation services',  used: 2_900,  budget: 7_000 },
  { cat: 'Accessibility',         used: 1_840,  budget: 5_000 },
  { cat: 'Printing & mailing',    used: 3_410,  budget: 9_800 },
];

// ═══ INSIGHTS ═══
const CV_TRENDS = [
  { k: 'Housing',     case: 14, canvass: 0.31, survey: 0.64, delta: +0.12, note: 'Eviction cases spiking · Chestnut Hill' },
  { k: 'Transit',     case: 4,  canvass: 0.22, survey: 0.58, delta: +0.18, note: 'Bus 134 resolved · transit promise next' },
  { k: 'Health',      case: 9,  canvass: 0.14, survey: 0.42, delta: -0.04, note: 'Pharmacare denials steady' },
  { k: 'Affordability',case: 6, canvass: 0.41, survey: 0.71, delta: +0.08, note: 'Cross-issue · food, rent, childcare' },
  { k: 'Climate',     case: 1,  canvass: 0.18, survey: 0.38, delta: -0.02, note: 'Low casework · medium canvass' },
  { k: 'Childcare',   case: 2,  canvass: 0.12, survey: 0.36, delta: +0.05, note: '$10/day signal strong' },
];

export { CV_MEMBER, CV_ORDER_TODAY, CV_BILLS, CV_CASES, CV_CASE_CATS, CV_CASE_PIPE_STAGES, CV_VOTES, CV_MOTIONS, CV_SPEECHES, CV_COMMITTEES, CV_HEARINGS, CV_PROMISES, CV_OFFICE_WEEK, CV_LETTERS, CV_STAFF, CV_SPEND, CV_TRENDS };
