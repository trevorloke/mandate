// Mandate 2.0 — Raise (fundraising / moves management)

const RAISE_KPIS = {
  ytd:        { label: 'Raised YTD',         value: '$1.42M', delta: '+18.4%', tone: 'good',  sub: 'vs same period last cycle' },
  pipeline:   { label: 'Active pipeline',    value: '$486K',  delta: '52 prospects', tone: 'flat', sub: 'next 90 days' },
  averagegift:{ label: 'Average gift',       value: '$214',   delta: '+$22',   tone: 'good',  sub: '4,213 donors' },
  retention:  { label: '12-mo retention',    value: '67.4%',  delta: '+3.1pt', tone: 'good',  sub: 'recurring + lapsed-recovered' },
  burn:       { label: 'Cash on hand',       value: '$614K',  delta: '11 weeks runway', tone: 'flat', sub: 'against forecast burn' },
  pledgesdue: { label: 'Pledges due',        value: '$84K',   delta: '12 outstanding', tone: 'warn',  sub: '7 over 30 days' },
};

// Moves management — donor pipeline in stages.
const RAISE_STAGES = [
  { id: 'identify',   name: 'Identify',     count: 18, value: '$0',     hint: 'Wealth + capacity screened' },
  { id: 'qualify',    name: 'Qualify',      count: 11, value: '$72K',   hint: 'Confirmed interest' },
  { id: 'cultivate',  name: 'Cultivate',    count:  8, value: '$184K',  hint: 'In motion · briefings, dinners' },
  { id: 'solicit',    name: 'Solicit',      count:  6, value: '$160K',  hint: 'Ask scheduled' },
  { id: 'steward',    name: 'Steward',      count:  9, value: '$70K',   hint: 'Closed · keep warm' },
];

// Major donor prospects (the deep pipeline)
const RAISE_PROSPECTS = [
  { id: 'p-aoki',    name: 'Mira Aoki',          stage: 'cultivate',  capacity: '$25K',  ask: '$15K',  next: 'Coffee · Apr 28', officer: 'Marcus Reilly', score: 94, tags: ['climate','tech'],     last: 'Hosted Apr 14',     warmth: 'hot', notes: 'Met at Climate Fwd panel; signaled interest in caucus dinner' },
  { id: 'p-tran',    name: 'Daniel Tran',        stage: 'solicit',    capacity: '$50K',  ask: '$25K',  next: 'Solicit · Apr 30', officer: 'Marcus Reilly', score: 91, tags: ['founder','PAC-eligible'], last: 'Phone Apr 19',     warmth: 'hot', notes: 'Asked for ROI memo; sent. Pending response.' },
  { id: 'p-bal',     name: 'Sara Balasubramanian', stage: 'qualify', capacity: '$10K',  ask: '$5K',   next: 'Discovery · May 02', officer: 'Lila Howe',      score: 78, tags: ['lawyer','rookie'],   last: 'Email Apr 20',     warmth: 'warm', notes: 'Referred by D. Ng. Has not given before.' },
  { id: 'p-okafor',  name: 'Femi Okafor',        stage: 'cultivate',  capacity: '$15K',  ask: '$10K',  next: 'Site visit · May 04', officer: 'Marcus Reilly', score: 86, tags: ['housing','board'],  last: 'Lunch Apr 11',     warmth: 'hot', notes: 'Attending Housing Town Hall; assigned candidate dinner' },
  { id: 'p-carmen',  name: 'Carmen Liu',         stage: 'solicit',    capacity: '$8K',   ask: '$5K',   next: 'Ask · Apr 27',      officer: 'Lila Howe',      score: 82, tags: ['recurring','board'], last: 'Coffee Apr 21',    warmth: 'hot', notes: 'Past donor at $2K. Ready to upgrade.' },
  { id: 'p-rodman',  name: 'Hank Rodman',        stage: 'identify',   capacity: '$20K',  ask: '—',     next: 'Research',          officer: '—',              score: 71, tags: ['lapsed-08'],         last: 'Last gave 2008',   warmth: 'cold', notes: 'Surfaced via wealth screen. Old donor, dormant.' },
  { id: 'p-singh',   name: 'Priya Singh',        stage: 'steward',    capacity: '$5K',   ask: 'Closed', next: 'Thank-you call',    officer: 'Lila Howe',      score: 68, tags: ['monthly'],            last: 'Apr 22 gift $5K',  warmth: 'warm', notes: 'Closed at full ask. Wants to host house party.' },
  { id: 'p-chen',    name: 'Wendy Chen',         stage: 'qualify',    capacity: '$30K',  ask: '$15K',  next: 'Briefing · May 06', officer: 'Marcus Reilly', score: 88, tags: ['tech','first-time'], last: 'Intro Apr 18',     warmth: 'warm', notes: 'Tech CEO, first political gift. Cautious but interested.' },
];

// Donor file — small donors / recurring (the broad base)
const RAISE_DONORS = [
  { id: 'd-001', name: 'Anika Patel',     gift: 50,   freq: 'Monthly',   ltv: 600,   first: '2025-01',  last: '2026-04-22', list: 'Climate · 2024' },
  { id: 'd-002', name: 'Jordan Marsh',    gift: 25,   freq: 'Monthly',   ltv: 300,   first: '2025-03',  last: '2026-04-22', list: 'Doorstep · 2025' },
  { id: 'd-003', name: 'Elena Costa',     gift: 250,  freq: 'One-time',  ltv: 250,   first: '2026-04',  last: '2026-04-21', list: 'Email · 2026 launch' },
  { id: 'd-004', name: 'Theo Nakamura',   gift: 100,  freq: 'Quarterly', ltv: 800,   first: '2024-09',  last: '2026-04-19', list: 'Ride-along · 2024' },
  { id: 'd-005', name: 'Marisol Vega',    gift: 1000, freq: 'One-time',  ltv: 2500,  first: '2024-11',  last: '2026-04-15', list: 'Major giving' },
  { id: 'd-006', name: 'Ben Iverson',     gift: 50,   freq: 'Monthly',   ltv: 450,   first: '2025-06',  last: '2026-04-22', list: 'Town hall · 2025' },
  { id: 'd-007', name: 'Lin Wang',        gift: 500,  freq: 'Annual',    ltv: 2000,  first: '2022-10',  last: '2026-04-08', list: 'Major giving' },
  { id: 'd-008', name: 'Rashid Karim',    gift: 25,   freq: 'One-time',  ltv: 25,    first: '2026-04',  last: '2026-04-22', list: 'Email · 2026 launch' },
  { id: 'd-009', name: 'Greta Olsen',     gift: 250,  freq: 'Quarterly', ltv: 2750,  first: '2022-01',  last: '2026-04-01', list: 'Climate · 2024' },
  { id: 'd-010', name: 'Tomás Reyes',     gift: 100,  freq: 'Monthly',   ltv: 1200,  first: '2024-03',  last: '2026-04-22', list: 'Ride-along · 2024' },
];

// Activity feed — moves management story
const RAISE_FEED = [
  { id: 'f-1', t: '08:42', who: 'Marcus Reilly', verb: 'logged a meeting',  obj: 'Coffee with Mira Aoki', tone: 'note',   detail: 'Hot. Asking $15K. Wants the climate caucus dinner invite — confirmed.' },
  { id: 'f-2', t: '08:31', who: 'Lila Howe',     verb: 'moved',             obj: 'Carmen Liu → Solicit',  tone: 'stage',  detail: 'Past $2K donor. Ready to upgrade. Ask scheduled tomorrow.' },
  { id: 'f-3', t: '08:14', who: 'System',        verb: 'matched gift',      obj: '$5,000 from Priya Singh', tone: 'gift', detail: 'Closed at full ask. Pledge marked complete.' },
  { id: 'f-4', t: '07:58', who: 'Marcus Reilly', verb: 'sent ROI memo',     obj: 'to Daniel Tran',         tone: 'note',  detail: 'Custom 2-pager on housing infrastructure. Awaiting reply.' },
  { id: 'f-5', t: '07:30', who: 'System',        verb: 'wealth screened',   obj: '18 new prospects',      tone: 'screen', detail: 'Imported from Climate Fwd attendee list. 6 high-capacity flagged.' },
  { id: 'f-6', t: 'Yest.', who: 'Marcus Reilly', verb: 'hosted',            obj: 'Donor brunch · 12 attended', tone: 'event', detail: '$32K raised in room. 3 new prospects to qualify.' },
  { id: 'f-7', t: 'Yest.', who: 'Lila Howe',     verb: 'received pledge',   obj: '$15K from Femi Okafor',  tone: 'gift',  detail: 'Pledge form signed. Payment in 30 days.' },
];

// Stories — the narrative engine. Donors give to people, not budgets.
const RAISE_STORIES = [
  { id: 's-housing', title: 'The Bridge Park Tenants', slug: 'bridge-park', donors: 47, raised: '$28,400', issue: 'Housing', updated: 'Apr 18',
    excerpt: '142 households facing renoviction. Marcus walked the building and sat with three families. The MLA filed an order paper question and is drafting Bill 22 protections.',
    img: 'A tenement walkway, late afternoon light through chain-link.' },
  { id: 's-transit', title: '14 Minutes Late, Every Morning', slug: '14-minutes', donors: 31, raised: '$14,200', issue: 'Transit', updated: 'Apr 12',
    excerpt: 'A nurse at St. Vincent\'s told Marcus she\'s been late 3 of 5 days a week for two months. The 99 B-Line skipped her stop 14 times in March.',
    img: 'A figure waiting at a bus stop in the rain.' },
  { id: 's-academy', title: 'After the Bell at Cypress', slug: 'cypress-after', donors: 22, raised: '$9,800', issue: 'Education', updated: 'Apr 04',
    excerpt: 'Cypress Elementary lost its after-school program in the cuts. 60 kids without childcare from 3pm. Marcus is pushing for $4M restoration in supplementary estimates.',
    img: 'Schoolyard at dusk, a light still on in one classroom.' },
];

// Listening — what donors are actually saying
const RAISE_PULSE = [
  { id: 'pl-1', who: 'Mira Aoki',      via: 'text',  t: '2h',  msg: 'The climate dinner — when?',                   tone: 'warm' },
  { id: 'pl-2', who: 'Daniel Tran',    via: 'email', t: '4h',  msg: 'Reading the memo. Will reply tomorrow.',       tone: 'flat' },
  { id: 'pl-3', who: 'Wendy Chen',     via: 'event', t: '1d',  msg: 'RSVP\'d to the launch reception',              tone: 'warm' },
  { id: 'pl-4', who: 'Hank Rodman',    via: 'flag',  t: '3d',  msg: 'Wealth screen flagged: $20M+ AUM',             tone: 'cold' },
  { id: 'pl-5', who: 'Carmen Liu',     via: 'text',  t: '4d',  msg: 'Yes — let\'s do the ask Saturday.',            tone: 'warm' },
];

// Compliance / Elections BC strip
const RAISE_COMPLIANCE = {
  cycleCap:    '$1,400 / individual / yr',
  flagged:     2,
  flaggedNote: '2 contributions need source verification before deposit',
  filing:      'Q2 filing due Jun 30 · 64 days',
  audited:     'Reconciled through Apr 22',
};

// Today's moves — the prompt block. The next 5 actions, ranked.
const RAISE_TODAY = [
  { id: 't-1', day: 'TODAY', date: '14:00', verb: 'ASK',    verbCls: 'ask',    name: 'Carmen Liu',    hint: 'Past $2K donor. Ready to upgrade to $5K. Bring the housing one-pager.', cap: '$8K', ask: '$5K', officer: 'LH' },
  { id: 't-2', day: 'TODAY', date: '17:30', verb: 'COFFEE', verbCls: 'coffee', name: 'Mira Aoki',     hint: 'Confirm climate caucus dinner invite. She\'s asked twice — close it.', cap: '$25K', ask: '$15K', officer: 'MR' },
  { id: 't-3', day: 'WED',   date: 'Apr 30', verb: 'ASK',    verbCls: 'ask',    name: 'Daniel Tran',   hint: 'Sent the ROI memo Mon. Follow up if no reply by EOD Tue.', cap: '$50K', ask: '$25K', officer: 'MR' },
  { id: 't-4', day: 'THU',   date: 'May 02', verb: 'BRIEF',  verbCls: 'brief',  name: 'Sara Bal.',     hint: 'Discovery call. New prospect from D. Ng. Listen, don\'t pitch.', cap: '$10K', ask: '$5K', officer: 'LH' },
  { id: 't-5', day: 'FRI',   date: 'May 03', verb: 'THANK',  verbCls: 'thank',  name: 'Priya Singh',   hint: 'Closed at full ask. Personal call from MR + handwritten card.', cap: '—', ask: 'Done', officer: 'LH' },
];

// Gift mix breakdown
const RAISE_GIFTMIX = [
  { id: 'major',     lbl: 'Major ($1K+)',    pct: 38, amt: '$540K',  color: '#0d4f3c' },
  { id: 'mid',       lbl: 'Mid ($100–999)',  pct: 28, amt: '$398K',  color: '#3d7a5e' },
  { id: 'recurring', lbl: 'Recurring',       pct: 22, amt: '$312K',  color: '#6b9d82' },
  { id: 'small',     lbl: 'Small (<$100)',   pct: 12, amt: '$170K',  color: '#a9c4b4' },
];

// Prospect detail (sample — keyed by prospect id)
const RAISE_PROSPECT_DETAIL = {
  'p-aoki': {
    wealthScore: 'A · $25M+ AUM',
    affil: 'Climate Forward · TechBC · WomenCEO',
    history: [
      { d: '2026-04-14', a: 'Hosted at donor brunch',     n: '—' },
      { d: '2025-11-08', a: 'Gift · Climate Forward',      n: '$5,000' },
      { d: '2025-06-02', a: 'Attended ride-along event',   n: '—' },
      { d: '2024-10-21', a: 'Gift · launch fundraiser',    n: '$2,500' },
      { d: '2023-03-14', a: 'First contact · panel',       n: '—' },
    ],
    given: '$7,500',
    asks: 4,
    closed: 2,
  },
};

export {
  RAISE_KPIS, RAISE_STAGES, RAISE_PROSPECTS, RAISE_DONORS,
  RAISE_FEED, RAISE_STORIES, RAISE_PULSE, RAISE_COMPLIANCE,
  RAISE_TODAY, RAISE_GIFTMIX, RAISE_PROSPECT_DETAIL,
};
