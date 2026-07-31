// Mandate 2.0 — Ground (canvass / field) data
//
// Entity seeds (voters, canvassers, shifts, scripts, PDs) and decorative
// scenery (river path, landmarks) feed the seed pipeline; pages read live
// records via useLiveRecords. GROUND_VOCAB, UNIVERSE_DEFAULT, and MODES are
// configuration vocabularies. Sample records below are synthetic but realistic
// — a fictional BC riding ("Meridian West") for demo/seed purposes.

const GROUND_VOCAB = {
  filters: {
    universe:  { label: 'Universe',       kind: 'enum',   options: [] },
    tenure:    { label: 'tenure',         kind: 'enum',   options: ['renters','owners','mixed','unknown'] },
    support:   { label: 'support',        kind: 'range',  hint: '0.0 – 1.0', options: ['≥ 0.7 (firm)','≥ 0.5 (lean)','0.3 – 0.7 (persuadable)','≤ 0.3 (unfriendly)','unknown'] },
    ballots:   { label: 'ballot history', kind: 'enum',   options: ['voted 0 of 6','voted 1–2 of 6','voted 3–4 of 6','voted 5–6 of 6','any'] },
    issue:     { label: 'issue',          kind: 'enum',   options: ['housing','transit','climate','childcare','public safety','cost of living','any'] },
    contact:   { label: 'last contact',   kind: 'enum',   options: ['never','> 90 days','30–90 days','< 30 days'] },
    age:       { label: 'age band',       kind: 'enum',   options: ['18–29','30–44','45–59','60+','any'] },
    language:  { label: 'language',       kind: 'enum',   options: ['English','any'] },
  },
};

const UNIVERSE_DEFAULT = [
  { key: 'support', val: '0.3 – 0.7 (persuadable)' },
  { key: 'ballots', val: 'voted 3–4 of 6' },
  { key: 'issue',   val: 'housing' },
];

const PDS = [
  { id: 'PD-009', name: 'Trout Lake',    support: 0.62, turnout: 0.58, doors: 1240, knocked: 880, target: true,  points: '180,140 360,120 400,300 300,360 160,320' },
  { id: 'PD-014', name: 'Cedar Flats',   support: 0.41, turnout: 0.47, doors: 1610, knocked: 540, target: true,  points: '420,150 640,140 680,340 480,380 410,300' },
  { id: 'PD-021', name: 'Riverside',     support: 0.55, turnout: 0.51, doors: 980,  knocked: 620, target: true,  points: '300,420 520,400 560,600 360,640 280,540' },
  { id: 'PD-027', name: 'Harbour Mills', support: 0.34, turnout: 0.44, doors: 1430, knocked: 310, target: false, points: '700,180 920,170 960,400 760,440 690,320' },
];

const RIVER = 'M 40 80 C 240 140, 360 60, 540 180 S 820 360, 1000 300 S 1180 420, 1180 520';

const LANDMARKS = [
  { k: 'office',  name: 'Campaign HQ',     x: 320, y: 250 },
  { k: 'park',    name: 'Trout Lake Park', x: 250, y: 400 },
  { k: 'station', name: 'Meridian Stn',    x: 560, y: 300 },
  { k: 'rally',   name: 'Riverside Rally', x: 430, y: 520 },
  { k: 'school',  name: 'Cedar Secondary', x: 600, y: 220 },
];

const VOTERS = [
  { id: 'V-1001', pd: 'PD-009', first: 'Priya',   last: 'Sandhu',   dob: '1986-04-12', household: 4, addr: '212 Maple Crescent', tenure: 'owner',   lang: 'Punjabi',   support: 0.78, ballots: '5/6', issue: 'housing',        lastContact: '4d ago',  phone: '604-555-0112', tags: ['lawn-sign','phone-ok'] },
  { id: 'V-1002', pd: 'PD-009', first: 'Marcus',  last: 'Webb',     dob: '1959-11-03', household: 2, addr: '47 Birchwood Ave',    tenure: 'owner',   lang: 'English',   support: 0.34, ballots: '6/6', issue: 'cost of living', lastContact: '21d ago', phone: '604-555-0143', tags: ['undecided'] },
  { id: 'V-1003', pd: 'PD-014', first: 'Aisha',   last: 'Rahman',   dob: '1998-07-21', household: 3, addr: '880 Cedar Flats Rd',  tenure: 'renter',  lang: 'Arabic',    support: 0.61, ballots: '2/6', issue: 'childcare',      lastContact: 'never',   phone: '778-555-0188', tags: ['new-canadian','childcare'] },
  { id: 'V-1004', pd: 'PD-014', first: 'Daniel',  last: 'Tremblay', dob: '1972-02-09', household: 1, addr: '15 Spruce Lane',      tenure: 'renter',  lang: 'French',    support: 0.49, ballots: '3/6', issue: 'transit',        lastContact: '58d ago', phone: '604-555-0201', tags: ['persuadable'] },
  { id: 'V-1005', pd: 'PD-021', first: 'Mei',     last: 'Chen',     dob: '1991-09-30', household: 5, addr: '603 Riverside Dr',    tenure: 'owner',   lang: 'Mandarin',  support: 0.82, ballots: '4/6', issue: 'public safety',  lastContact: '9d ago',  phone: '778-555-0233', tags: ['volunteer','donor'] },
  { id: 'V-1006', pd: 'PD-021', first: 'James',   last: 'Okafor',   dob: '2004-01-18', household: 4, addr: '29 Willow Court',     tenure: 'renter',  lang: 'English',   support: 0.55, ballots: '0/6', issue: 'climate',        lastContact: 'never',   phone: '604-555-0277', tags: ['first-time','climate'] },
  { id: 'V-1007', pd: 'PD-027', first: 'Sofia',   last: 'Reyes',    dob: '1965-06-25', household: 2, addr: '110 Harbour Mills Way', tenure: 'owner',  lang: 'Spanish',   support: 0.28, ballots: '5/6', issue: 'cost of living', lastContact: '95d ago', phone: '778-555-0319', tags: ['do-not-call'] },
  { id: 'V-1008', pd: 'PD-009', first: 'Liam',    last: 'Murphy',   dob: '1983-12-14', household: 3, addr: '76 Maple Crescent',   tenure: 'owner',   lang: 'English',   support: 0.67, ballots: '4/6', issue: 'housing',        lastContact: '2d ago',  phone: '604-555-0354', tags: ['lawn-sign'] },
];

const CANVASSERS = [
  { id: 'CV-01', name: 'Hana Yoshida',   pd: 'PD-009', status: 'knocking', x: 300, y: 240, doors: 34, lift: 0.21 },
  { id: 'CV-02', name: 'Tariq Aziz',     pd: 'PD-014', status: 'live',     x: 540, y: 260, doors: 28, lift: 0.17 },
  { id: 'CV-03', name: 'Grace Lam',      pd: 'PD-021', status: 'done',     x: 410, y: 500, doors: 41, lift: 0.26 },
  { id: 'CV-04', name: 'Owen Fraser',    pd: 'PD-009', status: 'on-break', x: 260, y: 360, doors: 12, lift: 0.09 },
  { id: 'CV-05', name: 'Noor Haidari',   pd: 'PD-027', status: 'refused',  x: 780, y: 300, doors: 19, lift: 0.04 },
];

const SHIFTS = [
  { id: 'sh-01', pd: 'PD-009', day: 'SAT', date: '2026-06-27', time: '10:00 – 13:00', mode: 'door-knock',    venue: 'Trout Lake Park', issue: 'housing',  captain: 'Hana Yoshida', lead: 'Hana Yoshida', need: 8,  cap: 8,  filled: 6 },
  { id: 'sh-02', pd: 'PD-014', day: 'SAT', date: '2026-06-27', time: '13:00 – 16:00', mode: 'door-petition', venue: 'Cedar Secondary', issue: 'childcare', captain: 'Tariq Aziz',   lead: 'Tariq Aziz',   need: 6,  cap: 6,  filled: 3 },
  { id: 'sh-03', pd: 'PD-021', day: 'SUN', date: '2026-06-28', time: '09:30 – 12:30', mode: 'phone-id',      venue: 'Campaign HQ',     issue: '',         captain: 'Grace Lam',    lead: 'Grace Lam',    need: 10, cap: 10, filled: 9 },
  { id: 'sh-04', pd: 'PD-027', day: 'SUN', date: '2026-06-28', time: '14:00 – 17:00', mode: 'street-event',  venue: 'Harbour Mills Fair', issue: 'transit', captain: 'Noor Haidari', lead: 'Noor Haidari', need: 5,  cap: 5,  filled: 2 },
];

const SCRIPTS = [
  {
    id: 'sc-01',
    title: 'Door knock — Housing ID',
    mode: 'door-knock',
    issue: 'housing',
    author: 'Field Director',
    updated: 'v4.2 · today',
    petition: { title: 'Build homes faster in Meridian West' },
    scenes: [
      {
        direction: 'Knock, step back, smile. Confirm you have the right person.',
        lines: [
          { who: 'CANVASSER', text: "Hi, is this {{name}}? I'm a volunteer with the campaign here in Meridian West." },
          { who: 'VOTER', hint: 'Wait for a reply — let them set the tone.' },
          { who: 'CANVASSER', text: "We're talking to neighbours about housing costs. Is that something on your mind this year?" },
        ],
      },
      {
        direction: 'If they engage, capture a 1–5 support read before you leave.',
        lines: [
          { who: 'CANVASSER', text: 'That really helps. On a scale of 1 to 5, how likely are you to support us on election day?' },
          { who: 'SYSTEM', hint: 'Tap the support score below.', capture: ['support', 'top-issue', 'lawn-sign'] },
          { who: 'CANVASSER', text: 'Thanks so much for your time — have a great evening.' },
        ],
      },
    ],
  },
  {
    id: 'sc-02',
    title: 'Phone ID — Cold support read',
    mode: 'phone-id',
    issue: 'cost of living',
    author: 'Phone Bank Lead',
    updated: 'v2.0 · yesterday',
    scenes: [
      {
        direction: 'Warm tone. They can hear your smile.',
        lines: [
          { who: 'CANVASSER', text: "Hi {{name}}, my name's ___ and I'm a volunteer calling from the campaign — do you have two minutes?" },
          { who: 'VOTER', hint: 'If now is bad, offer to call back and note the time.' },
          { who: 'CANVASSER', text: "We're checking in with voters about the cost of living. How are things feeling for you lately?" },
          { who: 'SYSTEM', hint: 'Log support 1–5 and any issue mentioned.', capture: ['support', 'callback', 'issue'] },
        ],
      },
    ],
  },
];

const MODES = [
  { k:'door', label:'Door',  sub:[
    { k:'door-knock',    label:'Knock',    note:'Residential turf, full script + ID' },
    { k:'door-lit',      label:'Lit drop', note:'No interaction, just dropped' },
    { k:'door-petition', label:'Petition', note:'Issue-scoped, one ask, signature' },
    { k:'door-gotv',     label:'GOTV chase', note:'Election day: voted? ride?' },
  ]},
  { k:'phone', label:'Phone', sub:[
    { k:'phone-id',          label:'ID',          note:'Cold support read' },
    { k:'phone-persuasion',  label:'Persuasion',  note:'Full script, warm list' },
    { k:'phone-gotv',        label:'GOTV chase',  note:'Election day' },
  ]},
  { k:'text', label:'Text', sub:[
    { k:'text-broadcast',    label:'Broadcast',    note:'One-to-many macros' },
    { k:'text-persuasion',   label:'Persuasion',   note:'Threaded, 2-way' },
    { k:'text-gotv',         label:'GOTV chase',   note:'Election day' },
  ]},
  { k:'street', label:'Street', sub:[
    { k:'street-event',      label:'Event booth',  note:'Community fair, inbound' },
    { k:'street-sidewalk',   label:'Sidewalk',     note:'Public table, they come to you' },
  ]},
];

export { GROUND_VOCAB, UNIVERSE_DEFAULT, PDS, RIVER, LANDMARKS, VOTERS, CANVASSERS, SHIFTS, SCRIPTS, MODES };
