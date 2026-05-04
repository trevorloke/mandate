// Mandate 2.0 — Coalition data
// 14-of-22 endorsement ledger + directory + graph + ops + asks + comms + events

export const COA_KPIS = {
  committed: { label:'COMMITTED ORGS',     value:'14 / 22', delta:'+3 this month', sub:'4 warm · 1 hostile · 3 prospect',     tone:'good' },
  public:    { label:'PUBLIC ENDORSEMENTS', value:'9',       delta:'BCFL today',     sub:'5 unannounced · holding for press',   tone:'good' },
  reach:     { label:'COMBINED REACH',     value:'847k',    delta:'members · followers', sub:'media multiplier 2.4×',          tone:'flat' },
  asks:      { label:'ASKS OPEN',          value:'18',      delta:'6 due ≤ 14d',    sub:'ask board · 4 stages',                tone:'flat' },
  ops:       { label:'JOINT OPS',          value:'7 active',delta:'2 launching wk',  sub:'rallies · briefs · co-pubs',         tone:'flat' },
  events:    { label:'CO-HOSTED',          value:'11 / Q2', delta:'+4 confirmed',    sub:'9 confirmed · 2 holding venue',      tone:'good' },
};

/* ── Endorsement ledger ─────────────────────────── */
export const COA_LEDGER = [
  // Public — 9
  { id:'EN-001', org:'BC Federation of Labour',          slug:'bcfl',
    status:'public', date:'2026-04-22', release:'2026-04-22 09:00',
    sector:'Labour', members:550000, reach:1200000, money:0,
    champion:'M.R.', strategy:'Joint press at Mountain View Local · BCFL banner', risks:[],
    note:'Brought 4 affiliates with them. Tone-set the labour endorsement run.' },
  { id:'EN-002', org:'BC Nurses\' Union',                slug:'bcnu',
    status:'public', date:'2026-04-19', release:'2026-04-19 11:00',
    sector:'Labour · Health', members:48000, reach:96000, money:5000,
    champion:'J.K.', strategy:'Solo release · healthcare-focused stack', risks:[] },
  { id:'EN-003', org:'Hospital Employees\' Union',        slug:'heu',
    status:'public', date:'2026-04-19', release:'2026-04-19 11:00',
    sector:'Labour · Health', members:51000, reach:88000, money:5000,
    champion:'J.K.', strategy:'Co-released with BCNU', risks:[] },
  { id:'EN-004', org:'BC Teachers\' Federation',          slug:'bctf',
    status:'public', date:'2026-04-15', release:'2026-04-15 08:00',
    sector:'Labour · Education', members:46000, reach:120000, money:0,
    champion:'M.R.', strategy:'Education week tie-in', risks:[] },
  { id:'EN-005', org:'Sikh Council of BC',                slug:'sikh-council',
    status:'public', date:'2026-04-11', release:'2026-04-11 14:00',
    sector:'Faith · Community', members:18000, reach:62000, money:8500,
    champion:'P.S.', strategy:'Vaisakhi-tied · Punjabi-language release', risks:[] },
  { id:'EN-006', org:'Vancouver & District Labour Council', slug:'vdlc',
    status:'public', date:'2026-04-09', release:'2026-04-09 09:00',
    sector:'Labour', members:60000, reach:88000, money:0,
    champion:'M.R.', strategy:'Pre-BCFL set-up endorsement', risks:[] },
  { id:'EN-007', org:'United Way Lower Mainland',         slug:'unitedway',
    status:'public', date:'2026-04-02', release:'2026-04-02 10:00',
    sector:'Civic', members:0, reach:140000, money:0,
    champion:'L.T.', strategy:'Operations leader endorsement (not org-wide)',
    risks:[{kind:'partial', text:'Personal, not institutional. Footnote in copy.'}] },
  { id:'EN-008', org:'Greater Vancouver Food Bank',       slug:'gvfb',
    status:'public', date:'2026-03-28', release:'2026-03-28 12:00',
    sector:'Civic', members:0, reach:78000, money:0,
    champion:'L.T.', strategy:'Co-presser with food drive launch', risks:[] },
  { id:'EN-009', org:'Burnaby Heights BIA',               slug:'bhbia',
    status:'public', date:'2026-03-22', release:'2026-03-22 16:00',
    sector:'Business · Local', members:240, reach:18000, money:2500,
    champion:'J.K.', strategy:'Heights walking tour', risks:[] },

  // Committed unannounced — 5
  { id:'EN-010', org:'Construction & Specialized Workers Local 1611', slug:'csw-1611',
    status:'committed', date:'2026-04-21', release:'2026-04-26 09:00',
    sector:'Labour · Trades', members:8200, reach:14000, money:10000,
    champion:'D.C.', strategy:'Holding for housing-policy day · joint with carpenters', risks:[] },
  { id:'EN-011', org:'Carpenters Union Local 1995',       slug:'carp-1995',
    status:'committed', date:'2026-04-21', release:'2026-04-26 09:00',
    sector:'Labour · Trades', members:5400, reach:9000, money:7500,
    champion:'D.C.', strategy:'Joint with CSW-1611 on housing day', risks:[] },
  { id:'EN-012', org:'BC Government Employees Union',     slug:'bcgeu',
    status:'committed', date:'2026-04-20', release:'2026-05-01 10:00',
    sector:'Labour · Public', members:90000, reach:140000, money:0,
    champion:'M.R.', strategy:'Holding for May Day press cluster',
    risks:[{kind:'leak', text:'Internal vote leaked to Twitter — handle softly'}] },
  { id:'EN-013', org:'Filipino Canadian Cultural Society', slug:'fccs',
    status:'committed', date:'2026-04-17', release:'2026-04-29 18:00',
    sector:'Faith · Community', members:3200, reach:11000, money:0,
    champion:'P.S.', strategy:'Tied to community gala invitation', risks:[] },
  { id:'EN-014', org:'BC Chiropractic Association',       slug:'bcca',
    status:'committed', date:'2026-04-14', release:'2026-04-30 09:00',
    sector:'Professional · Health', members:1100, reach:6500, money:3000,
    champion:'L.T.', strategy:'Quiet release · low-priority placement',
    risks:[{kind:'low-value', text:'Skip if news cycle is busy that day'}] },

  // Warm — 4
  { id:'EN-015', org:'BC Federation of Students',         slug:'bcfs',
    status:'warm', date:null, release:null,
    sector:'Education', members:170000, reach:240000, money:0,
    champion:'A.K.', strategy:'Tuition-freeze framing · need exec board mtg',
    risks:[{kind:'process', text:'Endorsement requires student vote — 30-day cycle'}] },
  { id:'EN-016', org:'Better Environment Coalition',      slug:'bec',
    status:'warm', date:null, release:null,
    sector:'Environment', members:8400, reach:32000, money:0,
    champion:'A.K.', strategy:'Climate-housing nexus · 2nd meeting Tue',
    risks:[{kind:'conflict', text:'Also courting Vance. Decision Apr 30.'}] },
  { id:'EN-017', org:'Pacific Coast Multicultural Society', slug:'pcms',
    status:'warm', date:null, release:null,
    sector:'Faith · Community', members:4200, reach:18000, money:0,
    champion:'P.S.', strategy:'Cultural-festival co-host as bridge', risks:[] },
  { id:'EN-018', org:'Small Business BC',                  slug:'sbbc',
    status:'warm', date:null, release:null,
    sector:'Business', members:12000, reach:48000, money:0,
    champion:'J.K.', strategy:'Tax-policy white paper meeting Apr 28',
    risks:[{kind:'tone', text:'Need to soften rhetoric on big-biz to retain SBBC'}] },

  // Prospect — 3
  { id:'EN-019', org:'Tenants Resource Advisory Centre',  slug:'trac',
    status:'prospect', date:null, release:null,
    sector:'Housing', members:0, reach:14000, money:0,
    champion:'A.K.', strategy:'No contact yet — outreach Apr 25',
    risks:[{kind:'unknown', text:'Have not engaged with electoral politics before'}] },
  { id:'EN-020', org:'Burnaby Board of Trade',             slug:'bbot',
    status:'prospect', date:null, release:null,
    sector:'Business · Local', members:550, reach:22000, money:0,
    champion:'J.K.', strategy:'Member-survey first · then ask',
    risks:[{kind:'partisan-history', text:'Endorsed Liberal in 2021'}] },
  { id:'EN-021', org:'Burnaby Public Library Friends',     slug:'bplf',
    status:'prospect', date:null, release:null,
    sector:'Civic', members:380, reach:4200, money:0,
    champion:'L.T.', strategy:'Library funding angle · low-stakes test', risks:[] },

  // Hostile — 1
  { id:'EN-022', org:'BC Real Estate Association',         slug:'brea',
    status:'hostile', date:null, release:null,
    sector:'Business', members:24000, reach:88000, money:0,
    champion:'—', strategy:'Endorsed Vance — track only · prep counter-frame',
    risks:[{kind:'opposition', text:'Public Vance endorsement Apr 03'}] },
];

/* ── Org directory (extra detail per org) ────────── */
export const COA_ORGS = {
  bcfl: {
    name:'BC Federation of Labour',
    short:'BCFL',
    type:'Labour federation',
    founded:1910,
    hq:'4279 Canada Way, Burnaby',
    web:'bcfed.ca',
    members:550000, affiliates:34, reach:1200000,
    leader:{ name:'Sussanne Skidmore', title:'President', email:'president@bcfed.ca' },
    contacts:[
      { name:'Sussanne Skidmore', title:'President', tier:'principal' },
      { name:'Hermender Singh Kailley', title:'Sec-Treasurer', tier:'principal' },
      { name:'Alia Karim', title:'Director, Political Action', tier:'staff' },
      { name:'Tom Lewis', title:'Comms', tier:'staff' },
    ],
    affiliated:['bcnu','heu','bctf','vdlc','csw-1611','carp-1995','bcgeu'],
    history:[
      { date:'2026-04-22', kind:'endorsed', text:'Public endorsement at Mountain View Local · 09:00 banner-front' },
      { date:'2026-04-18', kind:'meeting',  text:'Sussanne + candidate — final terms · 1hr · BCFL board room' },
      { date:'2026-04-11', kind:'call',     text:'M.R. ↔ Sussanne · committed verbally · awaiting executive sign' },
      { date:'2026-04-04', kind:'meeting',  text:'Coalition presentation to BCFL exec · 8 of 11 in favour' },
      { date:'2026-03-21', kind:'first-touch', text:'Initial outreach via Hermender' },
    ],
    asks:[
      { id:'A-101', text:'Public endorsement', stage:'won', value:'high' },
      { id:'A-102', text:'$50k contribution to ad reserve', stage:'in-discussion', value:'high' },
      { id:'A-103', text:'Co-host May Day rally', stage:'in-discussion', value:'med' },
      { id:'A-104', text:'Member-call list (opt-in)', stage:'queued', value:'med' },
    ],
  },
};

/* ── Asks pipeline ─────────────────────────────── */
export const COA_ASKS_STAGES = ['Queued','In discussion','Verbal yes','Delivered','Lost'];

export const COA_ASKS = [
  // Queued
  { id:'A-201', org:'BCFL', slug:'bcfl', text:'Member-call list (opt-in)', stage:0, due:'2026-05-10', value:'med', champion:'M.R.', notes:'Privacy review pending' },
  { id:'A-202', org:'BCNU', slug:'bcnu', text:'Hospital ward visits — 4 sites', stage:0, due:'2026-05-08', value:'high', champion:'J.K.' },
  { id:'A-203', org:'BCTF', slug:'bctf', text:'Teacher-volunteer phone bank shifts', stage:0, due:'2026-04-30', value:'high', champion:'A.K.' },
  { id:'A-204', org:'BHBIA', slug:'bhbia', text:'Heights door-knock route map', stage:0, due:'2026-05-02', value:'med', champion:'J.K.' },

  // In discussion
  { id:'A-205', org:'BCFL', slug:'bcfl', text:'$50k contribution to ad reserve', stage:1, due:'2026-04-30', value:'high', champion:'M.R.', notes:'Sussanne yes — exec votes Mon', heat:true },
  { id:'A-206', org:'HEU',  slug:'heu', text:'Co-pub: care-economy white paper', stage:1, due:'2026-05-15', value:'med', champion:'J.K.' },
  { id:'A-207', org:'BCFS', slug:'bcfs', text:'Endorsement vote scheduling', stage:1, due:'2026-05-20', value:'high', champion:'A.K.', notes:'Need exec board mtg first' },
  { id:'A-208', org:'BEC',  slug:'bec',  text:'Climate-housing co-platform', stage:1, due:'2026-04-30', value:'high', champion:'A.K.', notes:'Vance also asking', heat:true },
  { id:'A-209', org:'CSW-1611', slug:'csw-1611', text:'Joint housing-day rally lead', stage:1, due:'2026-04-26', value:'high', champion:'D.C.' },
  { id:'A-210', org:'SBBC', slug:'sbbc', text:'Tax-policy white paper feedback', stage:1, due:'2026-04-28', value:'med', champion:'J.K.' },

  // Verbal yes
  { id:'A-211', org:'BCFL', slug:'bcfl', text:'Co-host May Day rally', stage:2, due:'2026-05-01', value:'med', champion:'M.R.' },
  { id:'A-212', org:'BCNU', slug:'bcnu', text:'Joint statement on ER staffing', stage:2, due:'2026-04-29', value:'med', champion:'J.K.', heat:true },
  { id:'A-213', org:'Sikh Council', slug:'sikh-council', text:'Vaisakhi parade marching contingent', stage:2, due:'2026-04-27', value:'med', champion:'P.S.' },
  { id:'A-214', org:'GVFB', slug:'gvfb', text:'Food drive volunteer day', stage:2, due:'2026-05-04', value:'low', champion:'L.T.' },
  { id:'A-215', org:'FCCS', slug:'fccs', text:'Community gala speaking slot', stage:2, due:'2026-04-29', value:'med', champion:'P.S.' },

  // Delivered
  { id:'A-216', org:'BCFL', slug:'bcfl', text:'Public endorsement', stage:3, due:'2026-04-22', value:'high', champion:'M.R.', delivered:'2026-04-22' },
  { id:'A-217', org:'BCTF', slug:'bctf', text:'Education-week press joint', stage:3, due:'2026-04-15', value:'med', champion:'M.R.', delivered:'2026-04-15' },
  { id:'A-218', org:'VDLC', slug:'vdlc', text:'Pre-BCFL endorsement', stage:3, due:'2026-04-09', value:'med', champion:'M.R.', delivered:'2026-04-09' },

  // Lost
  { id:'A-219', org:'BBOT', slug:'bbot', text:'Q1 candidate-survey participation', stage:4, due:'2026-03-30', value:'low', champion:'J.K.', notes:'Did not respond before deadline' },
];

/* ── Joint ops ─────────────────────────────────── */
export const COA_OPS = [
  { id:'OP-01', name:'May Day Rally — Mountain View', date:'2026-05-01', stage:'launching',
    leads:['BCFL','BCNU','HEU','VDLC','BCGEU'], my_role:'Co-headliner',
    venue:'Mountain View Park · Burnaby', expected:1500,
    assets:['Stage','Sound','Banner — joint','Press riser'],
    progress:78, owner:'M.R.',
    note:'Confirmed venue · permit Apr 25 · BCGEU will release endorsement same morning' },
  { id:'OP-02', name:'Housing Policy Day — joint trades release', date:'2026-04-26', stage:'launching',
    leads:['CSW-1611','Carpenters 1995'], my_role:'Co-author',
    venue:'Construction Plaza site visit · Burnaby', expected:200,
    assets:['Site walk','Press release','Trades-led op-ed'],
    progress:88, owner:'D.C.',
    note:'Press release final · awaiting both unions countersign' },
  { id:'OP-03', name:'Care Economy White Paper', date:'2026-05-15', stage:'in-progress',
    leads:['BCNU','HEU'], my_role:'Co-publisher',
    venue:'Joint document · web', expected:0,
    assets:['Long-form','Data appendix','Press kit'],
    progress:42, owner:'J.K.',
    note:'Draft 2 with BCNU policy · HEU comments by Wed' },
  { id:'OP-04', name:'Vaisakhi Parade Contingent', date:'2026-04-27', stage:'imminent',
    leads:['Sikh Council','FCCS'], my_role:'Marching guest',
    venue:'Surrey · Newton Sikh temple route', expected:200000,
    assets:['Branded jackets','Volunteers (24)','Punjabi-language palm cards'],
    progress:95, owner:'P.S.',
    note:'Volunteer count locked · jackets delivered · palm cards Mon' },
  { id:'OP-05', name:'Education Week Co-event', date:'2026-04-15', stage:'done',
    leads:['BCTF'], my_role:'Co-host',
    venue:'BCIT lecture hall', expected:280,
    assets:['Panel format','Joint statement'],
    progress:100, owner:'M.R.',
    note:'Done — 312 attended · 2 press hits · BCTF social bumped 14k impressions',
    metrics:{ attended:312, hits:2, impressions:14000 } },
  { id:'OP-06', name:'Heights Walking Tour', date:'2026-03-22', stage:'done',
    leads:['BHBIA'], my_role:'Lead',
    venue:'Burnaby Heights · Hastings strip', expected:80,
    assets:['Route map','Merchant pre-brief'],
    progress:100, owner:'J.K.',
    metrics:{ attended:64, hits:1, impressions:3200 } },
  { id:'OP-07', name:'Food Drive Co-host', date:'2026-03-28', stage:'done',
    leads:['GVFB','UnitedWay'], my_role:'Volunteer-night host',
    venue:'GVFB Burnaby warehouse', expected:60,
    assets:['Branded T-shirts','Volunteer comp'],
    progress:100, owner:'L.T.',
    metrics:{ attended:72, hits:1, impressions:8000 } },
];

/* ── Comms log ─────────────────────────────────── */
export const COA_COMMS = [
  { d:'04-22', t:'09:00', kind:'event',   org:'BCFL',           who:'M.R.', what:'Mountain View Local — public endorsement event', dur:'90m' },
  { d:'04-21', t:'15:30', kind:'meeting', org:'CSW-1611',       who:'D.C.', what:'Hosting commitment + housing-day prep', dur:'45m' },
  { d:'04-21', t:'13:00', kind:'call',    org:'Carpenters 1995',who:'D.C.', what:'Confirm joint release with CSW-1611', dur:'18m' },
  { d:'04-21', t:'10:15', kind:'email',   org:'BCGEU',          who:'M.R.', what:'May Day timing — locked in 10:00 release', dur:'—' },
  { d:'04-20', t:'16:45', kind:'meeting', org:'BCFL',           who:'M.R.', what:'Final terms with Sussanne — 50k ad ask raised', dur:'60m' },
  { d:'04-20', t:'11:00', kind:'call',    org:'BEC',            who:'A.K.', what:'2nd meeting · climate-housing nexus', dur:'30m' },
  { d:'04-19', t:'11:00', kind:'event',   org:'BCNU + HEU',     who:'J.K.', what:'Joint health endorsement release', dur:'45m' },
  { d:'04-19', t:'08:30', kind:'call',    org:'Sussanne (BCFL)',who:'M.R.', what:'Day-before walk-through · banner placement', dur:'12m' },
  { d:'04-18', t:'14:00', kind:'meeting', org:'BCFL',           who:'M.R.', what:'Board room · 8/11 in favour', dur:'90m' },
  { d:'04-18', t:'10:00', kind:'email',   org:'SBBC',           who:'J.K.', what:'Sent tax-policy white paper draft 2', dur:'—' },
  { d:'04-17', t:'17:30', kind:'call',    org:'FCCS',           who:'P.S.', what:'Gala speaking slot confirmed', dur:'14m' },
  { d:'04-17', t:'09:30', kind:'meeting', org:'TRAC',           who:'A.K.', what:'First introduction · electoral context', dur:'45m' },
  { d:'04-16', t:'12:00', kind:'call',    org:'BCTF',           who:'M.R.', what:'Post-event debrief · phone bank shift ask', dur:'22m' },
  { d:'04-15', t:'08:00', kind:'event',   org:'BCTF',           who:'M.R.', what:'Education-week joint announcement', dur:'60m' },
  { d:'04-14', t:'14:00', kind:'meeting', org:'BCCA',           who:'L.T.', what:'Endorsement commit · low-priority release', dur:'30m' },
  { d:'04-14', t:'10:00', kind:'email',   org:'BREA',           who:'—',    what:'BREA endorsed Vance · noted (no reply)', dur:'—' },
  { d:'04-12', t:'15:00', kind:'call',    org:'BCFS',           who:'A.K.', what:'Process briefing · 30-day vote cycle', dur:'25m' },
  { d:'04-11', t:'14:00', kind:'event',   org:'Sikh Council',   who:'P.S.', what:'Vaisakhi-tied endorsement release', dur:'60m' },
];

/* ── Events co-hosting ─────────────────────────── */
export const COA_EVENTS = [
  { id:'EV-01', date:'2026-04-22', name:'BCFL Mountain View Endorsement', orgs:['BCFL'], stage:'done', attended:240, role:'co-headliner' },
  { id:'EV-02', date:'2026-04-26', name:'Housing Policy Day — Trades',    orgs:['CSW-1611','Carpenters 1995'], stage:'confirmed', attended:200, role:'co-author' },
  { id:'EV-03', date:'2026-04-27', name:'Vaisakhi Parade Contingent',     orgs:['Sikh Council'], stage:'confirmed', attended:200000, role:'guest' },
  { id:'EV-04', date:'2026-04-29', name:'FCCS Community Gala',            orgs:['FCCS'], stage:'confirmed', attended:340, role:'speaker' },
  { id:'EV-05', date:'2026-05-01', name:'May Day Rally',                  orgs:['BCFL','BCNU','HEU','VDLC','BCGEU'], stage:'confirmed', attended:1500, role:'co-headliner' },
  { id:'EV-06', date:'2026-05-04', name:'GVFB Food Drive Volunteer Day',  orgs:['GVFB'], stage:'confirmed', attended:60, role:'host' },
  { id:'EV-07', date:'2026-05-08', name:'BCNU Hospital Ward Visits',      orgs:['BCNU'], stage:'holding', attended:0, role:'guest' },
  { id:'EV-08', date:'2026-05-12', name:'BCTF Phone-bank Launch',         orgs:['BCTF'], stage:'confirmed', attended:80, role:'host' },
  { id:'EV-09', date:'2026-05-15', name:'Care Economy White Paper Launch',orgs:['BCNU','HEU'], stage:'confirmed', attended:120, role:'co-publisher' },
  { id:'EV-10', date:'2026-05-19', name:'BCGEU May-Day Cluster Press',    orgs:['BCGEU'], stage:'holding', attended:0, role:'speaker' },
  { id:'EV-11', date:'2026-05-22', name:'SBBC Tax Roundtable',            orgs:['SBBC'], stage:'tentative', attended:40, role:'invited' },
];

/* ── Force graph: nodes + edges (precomputed positions) ─ */
export const COA_GRAPH = {
  nodes: [
    // candidate at center
    { id:'cand', kind:'cand', label:'Meridian West', x:500, y:280, r:32 },

    // public orgs (inner ring)
    { id:'bcfl',   kind:'org-public', label:'BCFL',          x:280, y:160, r:24 },
    { id:'bcnu',   kind:'org-public', label:'BCNU',          x:680, y:140, r:18 },
    { id:'heu',    kind:'org-public', label:'HEU',           x:760, y:200, r:18 },
    { id:'bctf',   kind:'org-public', label:'BCTF',          x:760, y:340, r:20 },
    { id:'sikh',   kind:'org-public', label:'Sikh Council',  x:680, y:420, r:16 },
    { id:'vdlc',   kind:'org-public', label:'VDLC',          x:340, y:90,  r:18 },
    { id:'unitedw',kind:'org-public', label:'United Way',    x:240, y:380, r:16 },
    { id:'gvfb',   kind:'org-public', label:'GV Food Bank',  x:340, y:450, r:14 },
    { id:'bhbia',  kind:'org-public', label:'BHBIA',         x:520, y:480, r:12 },

    // committed (mid ring)
    { id:'csw',     kind:'org-committed', label:'CSW-1611',  x:160, y:230, r:14 },
    { id:'carp',    kind:'org-committed', label:'Carp.1995', x:120, y:300, r:13 },
    { id:'bcgeu',   kind:'org-committed', label:'BCGEU',     x:170, y:400, r:20 },
    { id:'fccs',    kind:'org-committed', label:'FCCS',      x:600, y:500, r:13 },
    { id:'bcca',    kind:'org-committed', label:'BCCA',      x:850, y:280, r:11 },

    // warm (outer ring)
    { id:'bcfs',    kind:'org-warm',  label:'BCFS',          x:90,  y:170, r:18 },
    { id:'bec',     kind:'org-warm',  label:'BEC',           x:90,  y:350, r:14 },
    { id:'pcms',    kind:'org-warm',  label:'PCMS',          x:880, y:120, r:13 },
    { id:'sbbc',    kind:'org-warm',  label:'SBBC',          x:900, y:380, r:14 },

    // prospect
    { id:'trac',    kind:'org-prospect', label:'TRAC',       x:180, y:520, r:11 },
    { id:'bbot',    kind:'org-prospect', label:'BBoT',       x:780, y:500, r:12 },
    { id:'bplf',    kind:'org-prospect', label:'BPLF',       x:880, y:460, r:10 },

    // hostile
    { id:'brea',    kind:'org-hostile', label:'BREA',        x:920, y:240, r:14 },

    // people (champions / contacts)
    { id:'p-suss',  kind:'person', label:'Sussanne S.',  x:380, y:130, r:7 },
    { id:'p-herm',  kind:'person', label:'Hermender K.', x:240, y:120, r:6 },
    { id:'p-alia',  kind:'person', label:'Alia K.',      x:160, y:180, r:6 },
    { id:'p-mr',    kind:'person', label:'M.R. (us)',    x:440, y:230, r:8 },
    { id:'p-jk',    kind:'person', label:'J.K. (us)',    x:560, y:240, r:8 },
    { id:'p-ak',    kind:'person', label:'A.K. (us)',    x:440, y:330, r:8 },
    { id:'p-ps',    kind:'person', label:'P.S. (us)',    x:560, y:330, r:8 },

    // contested edge — Vance also pulling BEC
    { id:'opp',     kind:'opp', label:'Vance',           x:60,  y:90,  r:14 },
  ],
  edges: [
    // candidate → public orgs (strong)
    ['cand','bcfl','strong'], ['cand','bcnu','strong'], ['cand','heu','strong'],
    ['cand','bctf','strong'], ['cand','sikh','strong'], ['cand','vdlc','strong'],
    ['cand','unitedw','strong'], ['cand','gvfb','strong'], ['cand','bhbia','strong'],

    // candidate → committed (med)
    ['cand','csw','med'], ['cand','carp','med'], ['cand','bcgeu','med'],
    ['cand','fccs','med'], ['cand','bcca','med'],

    // candidate → warm (weak)
    ['cand','bcfs','weak'], ['cand','bec','weak'], ['cand','pcms','weak'], ['cand','sbbc','weak'],

    // candidate → prospect (dotted)
    ['cand','trac','prospect'], ['cand','bbot','prospect'], ['cand','bplf','prospect'],

    // hostile (red)
    ['cand','brea','hostile'], ['brea','opp','strong'], ['bec','opp','contested'],

    // affiliations between orgs
    ['bcfl','bcnu','affil'], ['bcfl','heu','affil'], ['bcfl','bctf','affil'],
    ['bcfl','vdlc','affil'], ['bcfl','csw','affil'], ['bcfl','carp','affil'],
    ['bcfl','bcgeu','affil'],
    ['sikh','fccs','affil'], ['sikh','pcms','affil'],
    ['unitedw','gvfb','affil'],

    // people connections
    ['bcfl','p-suss','contact'], ['bcfl','p-herm','contact'], ['bcfl','p-alia','contact'],
    ['cand','p-mr','self'], ['cand','p-jk','self'], ['cand','p-ak','self'], ['cand','p-ps','self'],
    ['p-mr','p-suss','warm'],
    ['p-mr','bcfl','owns'], ['p-jk','bcnu','owns'], ['p-jk','heu','owns'], ['p-ak','bcfs','owns'],
    ['p-ps','sikh','owns'], ['p-ps','fccs','owns'], ['p-ps','pcms','owns'],
  ],
};
