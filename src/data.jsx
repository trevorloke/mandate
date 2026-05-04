// Mandate 2.0 — Workspace data
// The "workspace" = whichever deployment (candidate/party/race) Mandate is serving.
// Everything that follows is one worked example. Product is multi-tenant by design.

export const WORKSPACE = {
  kind:   'PROVINCIAL · MLA',
  name:   'Meridian West — Assembly',
  candidate: 'Amara Tanaka',
  party:   'Meridian Forward',
  phase:   'Persuasion',
  daysToVote: 127,
  livePulse: '18 on-canvass · 3 donations/min',
  tz: 'PT',
};

// ── Pillar metrics (the four that roll up to the Mandate Index)
// Each pillar has a formula, a current value, a 14-point spark, and a delta.

export const PILLARS = [
  {
    id: 'persuasion',
    name: 'Persuasion',
    formula: 'ID rate × support swing × universe coverage',
    value: 0.612,
    target: 0.700,
    delta: +0.034,   // vs 7d ago
    spark: [0.548,0.552,0.561,0.555,0.570,0.578,0.574,0.584,0.591,0.598,0.594,0.603,0.608,0.612],
    breakdown: [
      { k: 'ID rate',           v: '41.2%', detail: 'Supporters identified / universe' },
      { k: 'Support swing',     v: '+4.8 pp', detail: 'Us vs UP, 14-day rolling' },
      { k: 'Universe coverage', v: '68%', detail: 'Persuasion universe touched' },
    ],
    sourceModule: 'ground',
  },
  {
    id: 'field',
    name: 'Field trend',
    formula: 'Doors/day × contact rate × support drift',
    value: 0.714,
    target: 0.800,
    delta: +0.012,
    spark: [0.660,0.670,0.682,0.676,0.688,0.694,0.700,0.692,0.704,0.709,0.711,0.708,0.712,0.714],
    breakdown: [
      { k: 'Doors/day',    v: '2,184', detail: '14-day avg; +12% w/w' },
      { k: 'Contact rate', v: '31.4%', detail: 'One-on-one contacts / doors' },
      { k: 'Support drift',v: '+0.6pp', detail: 'Support among recontacted' },
    ],
    sourceModule: 'ground',
  },
  {
    id: 'money',
    name: 'Money',
    formula: 'Cash runway × cost-per-persuaded × burn vs plan',
    value: 0.548,
    target: 0.650,
    delta: -0.021,
    spark: [0.590,0.586,0.580,0.582,0.574,0.570,0.568,0.562,0.564,0.558,0.556,0.552,0.550,0.548],
    breakdown: [
      { k: 'Runway',        v: '87 days', detail: 'At current burn — 40d short of E-day' },
      { k: 'CPP',           v: '$7.42',   detail: 'Cost per persuaded voter, 14d' },
      { k: 'Burn vs plan',  v: '+6.2%',   detail: 'Over — field overtime' },
    ],
    sourceModule: 'ledger',
    alert: 'Runway alert',
  },
  {
    id: 'mobilization',
    name: 'Mobilization',
    formula: 'Confirmed supporters × GOTV readiness × shift fill',
    value: 0.483,
    target: 0.750,   // target climbs as E-day nears
    delta: +0.028,
    spark: [0.418,0.422,0.425,0.430,0.436,0.442,0.448,0.453,0.461,0.466,0.470,0.474,0.478,0.483],
    breakdown: [
      { k: 'Confirmed',       v: '12,840', detail: 'Hard IDs (support 1+2)' },
      { k: 'GOTV readiness',  v: '62%',    detail: 'Transportation + reminder opt-in' },
      { k: 'Shift fill',      v: '78%',    detail: 'Next 14 days — 286/368 slots' },
    ],
    sourceModule: 'ground',
  },
];

// ── The Mandate Index: a weighted composite
export const INDEX = {
  value: 0.592,          // weighted avg of pillars
  target: 0.725,
  delta: +0.013,
  band: 'Competitive',   // also: Trailing, Competitive, Favoured, Lock
  history: [0.522,0.530,0.528,0.538,0.544,0.552,0.558,0.564,0.569,0.573,0.577,0.582,0.586,0.592],
};

// ── Today's stream — cross-module chronological (like a Slack summary)
export const TODAY = [
  { t: '08:14', mod: 'ground',     head: 'Universe 31-B locked for tonight',           meta: '1,420 doors · 12 canvassers · Metrotown' },
  { t: '08:02', mod: 'opposition', head: 'Vance quote in Sun, A4',                     meta: 'Housing: "Market will sort itself out"',       urgent: true },
  { t: '07:58', mod: 'raise',      head: '$12,400 overnight',                          meta: '97 gifts · 3 > $500 · online' },
  { t: '07:41', mod: 'civic',      head: 'Bill 14 second reading — 14:30',             meta: 'Caucus whip: hard yes; Wong soft no' },
  { t: '07:30', mod: 'coalition',  head: 'BCFL endorsement letter received',           meta: 'S. Nkomo signed; release window 07:50' },
  { t: '07:15', mod: 'beacon',     head: '3 posts queued for 09:00 push',              meta: 'Housing counter · Metrotown rally · OpEd plug' },
  { t: '07:00', mod: 'events',     head: 'Metrotown rally — 412 RSVPs',                meta: 'Up 47 overnight · venue cap 600 · need ushers' },
  { t: '06:45', mod: 'ledger',     head: 'Q2 filing — reconciled to bank',             meta: '$847.20 variance resolved · Meals #3102' },
];

// ── The ten modules — each has a headline fact for Home
export const MOD_CARDS = [
  { k:'ground',     head:'2,184 doors', sub:'yesterday',          meta:'31.4% contact · +0.6pp support',                spark:[1700,1820,1910,1880,2020,2105,2184] },
  { k:'beacon',     head:'412k reach',  sub:'rolling 24h',        meta:'8 queued · 2 pending legal · 1 flagged',         spark:[280,300,355,340,380,395,412] },
  { k:'raise',      head:'$47,820',    sub:'last 7 days',         meta:'318 donors · $146 avg · 3 majors in pipeline',    spark:[4200,5800,6900,7400,8200,7600,8400] },
  { k:'ledger',     head:'$214,630',   sub:'cash on hand',        meta:'87-day runway · Q2 filing ready',                 spark:[260,254,248,241,235,228,214] },
  { k:'coalition',  head:'14 of 22',   sub:'orgs endorsed',       meta:'BCFL signed today · 3 warm · 1 hostile',         spark:[9,10,11,12,13,13,14] },
  { k:'opposition', head:'6 claims',   sub:'to answer today',     meta:'1 high · 2 medium · 3 low · 2m avg response',     spark:[3,5,4,6,5,7,6], alert:true },
  { k:'site',       head:'18,420 UVs', sub:'this week',           meta:'Donate CR 3.8% · Volunteer CR 2.1% · 2 A/B live', spark:[2100,2350,2480,2620,2580,2840,2920] },
  { k:'events',     head:'7 events',   sub:'next 14 days',        meta:'1,840 RSVPs · 286 shifts · 78% filled',          spark:[3,4,5,5,6,7,7] },
  { k:'civic',      head:'Bill 14',    sub:'second reading 14:30',meta:'42 casework open · 4 promises due',               spark:[38,39,41,42,42,41,42] },
  { k:'academy',    head:'4 courses',  sub:'in progress',         meta:'8/14 lessons · 2 assignments due · 3 graded',     spark:[2,3,4,6,7,7,8] },
];

// ── Conductor asks (cross-module)
export const CONDUCTOR = [
  { id:'c1', window:'NOW',  mod:'opposition', ask:'Approve Beacon response to Vance housing quote',
    body:'Draft ready · 34 words · Housing · by 09:15 to beat cycle',
    action:'Approve & queue' },
  { id:'c2', window:'NOW',  mod:'civic', ask:'Bill 14 second reading — confirm attendance',
    body:'Whip: hard yes. Floor vote 14:30. Speech slot available at 13:50.',
    action:'Confirm' },
  { id:'c3', window:'NOW',  mod:'raise', ask:'Call M. Cheung — $5k major, soft-committed',
    body:'Best call window 11:00–11:30 · prep card in Raise · Conductor will call',
    action:'Call now' },
  { id:'c4', window:'TODAY', mod:'ground', ask:'Metrotown canvass — 12 confirmed, 8 slots to fill',
    body:'Shift 17:00–20:00 · Universe 31-B · lit-drop mode',
    action:'Fill slots' },
  { id:'c5', window:'TODAY', mod:'coalition', ask:'BCFL endorsement release — 07:50',
    body:'Press list queued · Beacon pre-draft · Ledger not required',
    action:'Schedule' },
  { id:'c6', window:'WEEK',  mod:'ledger', ask:'Q2 filing signature',
    body:'Reconciled · variance resolved · waiting on candidate signature',
    action:'Review' },
  { id:'c7', window:'WEEK',  mod:'site', ask:'A/B test on donate page reached significance',
    body:'Variant B +14.2% CR · p=0.03 · ready to promote to control',
    action:'Promote' },
  { id:'c8', window:'WEEK',  mod:'events', ask:'Venue contract — Metrotown Community Hall',
    body:'Sept 14 rally · $3,200 · legal reviewed · signature pending',
    action:'Sign' },
];
