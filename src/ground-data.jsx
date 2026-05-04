// Mandate 2.0 — Ground data + vocabulary
// Universe = a sentence of tokens. Voters, turfs, canvassers, shifts, scripts.

const GROUND_VOCAB = {
  // Each filter token is a readable pill in the universe sentence.
  filters: {
    universe:  { label: 'Universe',       kind: 'enum',   options: ['31-B Metrotown East','33-A Hillcrest','42-C Fairview','all of Meridian West'] },
    tenure:    { label: 'tenure',         kind: 'enum',   options: ['renters','owners','mixed','unknown'] },
    support:   { label: 'support',        kind: 'range',  hint: '0.0 – 1.0', options: ['≥ 0.7 (firm)','≥ 0.5 (lean)','0.3 – 0.7 (persuadable)','≤ 0.3 (unfriendly)','unknown'] },
    ballots:   { label: 'ballot history', kind: 'enum',   options: ['voted 0 of 6','voted 1–2 of 6','voted 3–4 of 6','voted 5–6 of 6','any'] },
    issue:     { label: 'issue',          kind: 'enum',   options: ['housing','transit','climate','childcare','public safety','cost of living','any'] },
    contact:   { label: 'last contact',   kind: 'enum',   options: ['never','> 90 days','30–90 days','< 30 days'] },
    age:       { label: 'age band',       kind: 'enum',   options: ['18–29','30–44','45–59','60+','any'] },
    language:  { label: 'language',       kind: 'enum',   options: ['English','Cantonese','Mandarin','Tagalog','Punjabi','any'] },
  },
};

// Default sentence shown on load
const UNIVERSE_DEFAULT = [
  { key: 'universe', val: '31-B Metrotown East' },
  { key: 'tenure',   val: 'renters' },
  { key: 'support',  val: '0.3 – 0.7 (persuadable)' },
  { key: 'ballots',  val: 'voted 1–2 of 6' },
];

// ── Polling districts for the map — 24 polygons with support data + turf assignments
// Coordinates are in a 1200×760 artboard, hand-drawn style (irregular polygons).
const PDS = [
  { id:'PD-001', name:'Hillcrest North',     support:0.68, turnout:0.71, doors:380,  knocked:210, points:'80,80 240,60 300,140 220,220 60,200' },
  { id:'PD-002', name:'Hillcrest South',     support:0.61, turnout:0.66, doors:420,  knocked:180, points:'60,200 220,220 260,320 180,380 40,340' },
  { id:'PD-003', name:'Fairview West',       support:0.54, turnout:0.63, doors:460,  knocked:140, points:'300,140 450,120 490,260 380,300 260,320 220,220' },
  { id:'PD-004', name:'Fairview East',       support:0.49, turnout:0.58, doors:510,  knocked:160, points:'450,120 600,90 660,230 500,280 490,260' },
  { id:'PD-005', name:'Waterfront',          support:0.42, turnout:0.48, doors:620,  knocked:90,  points:'40,340 180,380 220,480 60,520' },
  { id:'PD-006', name:'Napier East',         support:0.58, turnout:0.55, doors:580,  knocked:380, points:'180,380 380,420 400,500 260,540 220,480' },
  { id:'PD-007', name:'Napier West',         support:0.62, turnout:0.59, doors:540,  knocked:340, points:'260,540 400,500 440,600 320,640' },
  { id:'PD-008', name:'Metrotown North',     support:0.71, turnout:0.74, doors:710,  knocked:420, points:'380,300 500,280 560,400 440,440' },
  { id:'PD-009', name:'Metrotown East  31-B',support:0.61, turnout:0.62, doors:1420, knocked:1080,points:'500,280 660,230 740,360 620,420 560,400', target:true },
  { id:'PD-010', name:'Metrotown South',     support:0.55, turnout:0.58, doors:820,  knocked:360, points:'560,400 620,420 660,520 500,540 440,440' },
  { id:'PD-011', name:'Collingwood',         support:0.48, turnout:0.52, doors:630,  knocked:280, points:'620,420 740,360 840,460 720,540 660,520' },
  { id:'PD-012', name:'Joyce Station',       support:0.46, turnout:0.51, doors:580,  knocked:220, points:'740,360 860,340 940,440 840,460' },
  { id:'PD-013', name:'Renfrew',             support:0.51, turnout:0.56, doors:670,  knocked:300, points:'660,230 820,210 860,340 740,360' },
  { id:'PD-014', name:'Renfrew Heights',     support:0.53, turnout:0.59, doors:540,  knocked:310, points:'820,210 960,180 1020,300 860,340' },
  { id:'PD-015', name:'Trout Lake',          support:0.64, turnout:0.68, doors:490,  knocked:360, points:'600,90 760,70 820,210 660,230' },
  { id:'PD-016', name:'Cedar Cottage',       support:0.58, turnout:0.62, doors:510,  knocked:280, points:'760,70 920,90 960,180 820,210' },
  { id:'PD-017', name:'Kensington',          support:0.56, turnout:0.60, doors:470,  knocked:240, points:'920,90 1060,120 1100,220 1020,300 960,180' },
  { id:'PD-018', name:'Nanaimo',             support:0.49, turnout:0.53, doors:540,  knocked:190, points:'1020,300 1100,220 1140,360 1040,420' },
  { id:'PD-019', name:'Victoria Drive',      support:0.47, turnout:0.51, doors:600,  knocked:170, points:'940,440 1040,420 1140,360 1160,500 1020,540' },
  { id:'PD-020', name:'Killarney',           support:0.44, turnout:0.49, doors:560,  knocked:140, points:'840,460 940,440 1020,540 900,580 720,540' },
  { id:'PD-021', name:'Riverside',           support:0.39, turnout:0.44, doors:620,  knocked:110, points:'720,540 900,580 860,680 660,700 660,640' },
  { id:'PD-022', name:'River South',         support:0.41, turnout:0.46, doors:580,  knocked:130, points:'440,600 660,640 660,700 500,720 320,680' },
  { id:'PD-023', name:'South Slope',         support:0.38, turnout:0.43, doors:510,  knocked:90,  points:'320,680 500,720 440,780 220,740' },
  { id:'PD-024', name:'Industrial',          support:0.36, turnout:0.42, doors:340,  knocked:60,  points:'60,520 220,480 220,740 80,700' },
];

// Rivers — just one big river polyline
const RIVER = 'M 20,560 Q 200,580 360,540 Q 520,500 680,560 Q 880,620 1080,600 Q 1180,590 1200,580';

// Parks / landmarks as illustrated markers
const LANDMARKS = [
  { k:'park',     x: 440, y: 460, name:'Central Park' },
  { k:'station',  x: 540, y: 340, name:'Metrotown Stn' },
  { k:'station',  x: 960, y: 380, name:'Joyce Stn' },
  { k:'rally',    x: 520, y: 330, name:'Metrotown Sq' },
  { k:'office',   x: 620, y: 300, name:'Campaign HQ' },
  { k:'school',   x: 300, y: 260, name:'Fairview HS' },
];

// ── Voters in the current universe (a sample of ~60; renderlist shows first 18)
const VOTERS = (() => {
  const firsts = ['Jun','Priya','Marcus','Aisha','Daniel','Mei','Kofi','Elena','Samir','Leila','Tomas','Ngozi','Chen','Ana','Youssef','Sofia','Raj','Amelia','Haruki','Fatou','Ivan','Nadia','Owen','Yasmin','Khalid','Lena','Bruno','Camila','Diego','Farah','Grace','Henri','Isla','Jonah','Kai','Lucia','Mateo','Nora','Omar','Pia'];
  const lasts  = ['Nakamura','Okafor','Hale','Patel','Singh','Wong','Delgado','Kovacs','Thompson','Garcia','Santos','Reyes','Park','Lee','Tran','Rahman','Gonzalez','Brown','Schmidt','Morgan','Dubois','Costa','Rossi','Jakobsen','Muller','Silva','Chen','Ahmed','Romero','Yamamoto','Kaur','Hassan','Riaz','Marchetti','Olsen','Kowalski','Fitzgerald','Bennett','Hoang','Alvarez'];
  const apts = ['Apt 412','Apt 203','Apt 506','Apt 108','Apt 611','Apt 802'];
  const streets = ['Napier St','Victoria Dr','Kingsway','Broadway E','Commercial Dr','Fraser St','Main St','Joyce St','Renfrew St','Knight St'];
  const issues = ['housing','transit','climate','childcare','public safety','cost of living'];
  const langs = ['English','English','English','Cantonese','Mandarin','Tagalog','Punjabi','English','English','English'];
  const out = [];
  for (let i = 0; i < 60; i++) {
    const supp = +(0.3 + Math.random()*0.4).toFixed(2);
    const bal  = Math.floor(Math.random()*7);
    out.push({
      id: `V-${String(1000+i)}`,
      first: firsts[i % firsts.length],
      last:  lasts[(i*7) % lasts.length],
      age: 22 + Math.floor(Math.random()*55),
      addr: `${apts[i % apts.length]} ${420 + i*4} ${streets[i % streets.length]}`,
      tenure: Math.random() > 0.4 ? 'renter' : 'owner',
      pd: PDS[(i * 5) % PDS.length].id,
      support: supp,
      ballots: `${bal}/6`,
      issue: issues[i % issues.length],
      lang: langs[i % langs.length],
      lastContact: i % 7 === 0 ? 'never' : `${1 + (i*3) % 90}d ago`,
      tags: [
        Math.random() > 0.7 ? 'volunteered before' : null,
        Math.random() > 0.85 ? 'donor' : null,
        Math.random() > 0.9 ? 'refused' : null,
      ].filter(Boolean),
      household: 1 + Math.floor(Math.random() * 3),
    });
  }
  // Put Nakamura first, deterministic
  out[0] = {
    id:'V-1000', first:'Jun', last:'Nakamura', age:44,
    addr:'Apt 412, 1840 Napier St', tenure:'renter', pd:'PD-009',
    support:0.78, ballots:'2/6', issue:'housing', lang:'English',
    lastContact:'2d ago', tags:['rent increase filed','recontact OK'], household:2,
  };
  return out;
})();

// ── Canvassers live on the map + shifts
const CANVASSERS = [
  { id:'c1', name:'Ben O.',     x: 520, y: 335, status:'knocking',  mode:'door-knock' },
  { id:'c2', name:'Ravi K.',    x: 580, y: 370, status:'knocking',  mode:'door-knock' },
  { id:'c3', name:'Sara T.',    x: 440, y: 500, status:'done',      mode:'door-lit' },
  { id:'c4', name:'Mei H.',     x: 680, y: 300, status:'knocking',  mode:'door-knock' },
  { id:'c5', name:'Devon L.',   x: 340, y: 290, status:'refused',   mode:'door-knock' },
  { id:'c6', name:'Priya S.',   x: 720, y: 430, status:'knocking',  mode:'door-petition' },
  { id:'c7', name:'Iris W.',    x: 620, y: 560, status:'knocking',  mode:'door-knock' },
  { id:'c8', name:'Tomas R.',   x: 280, y: 420, status:'done',      mode:'door-lit' },
  { id:'c9', name:'Ana G.',     x: 800, y: 490, status:'knocking',  mode:'door-knock' },
  { id:'c10',name:'Kofi A.',    x: 540, y: 330, status:'on-break',  mode:'street' },
  { id:'c11',name:'Lena P.',    x: 960, y: 320, status:'knocking',  mode:'door-knock' },
  { id:'c12',name:'Youssef M.', x: 420, y: 460, status:'knocking',  mode:'street' },
];

// ── Shifts
const SHIFTS = [
  { id:'s1', day:'Tonight',    time:'17:00–20:00', pd:'PD-009', mode:'door-knock',   filled:12, cap:20, lead:'Ben O.' },
  { id:'s2', day:'Tonight',    time:'18:00–21:00', pd:'PD-008', mode:'door-lit',     filled: 6, cap: 8, lead:'Sara T.' },
  { id:'s3', day:'Tomorrow',   time:'10:00–13:00', pd:'PD-015', mode:'street',       filled: 4, cap: 6, lead:'Kofi A.', venue:'Trout Lake farmer\'s mkt' },
  { id:'s4', day:'Tomorrow',   time:'14:00–17:00', pd:'PD-009', mode:'door-petition',filled: 3, cap: 8, lead:'Priya S.', issue:'Bill 14 support' },
  { id:'s5', day:'Saturday',   time:'11:00–14:00', pd:'PD-010', mode:'door-knock',   filled: 9, cap:16, lead:'Iris W.' },
  { id:'s6', day:'Saturday',   time:'15:00–18:00', pd:'PD-003', mode:'phone-id',     filled:14, cap:20, lead:'HQ phone bank' },
];

// ── Scripts: look like dramatic scripts, not forms
const SCRIPTS = [
  {
    id:'sc-bill14',
    title:'Bill 14 · Rent Cap · Persuasion',
    mode:'door-knock',
    issue:'housing',
    author:'Maria Chen, Comms',
    updated:'v4.2 · today',
    scenes: [
      {
        direction:'KNOCK. Step back one pace. Natural smile.',
        lines: [
          { who:'CANVASSER', text:'Hi, I\'m {{name}}, a volunteer for Marcus Hale. Do you have a minute?' },
          { who:'VOTER', text:'(if NO) Thank you anyway — have a good evening.', branch:'exit' },
        ],
      },
      {
        direction:'If door stays open. Keep it to two minutes.',
        lines: [
          { who:'CANVASSER', text:'Marcus is sponsoring Bill 14 — it caps rent increases at the rate of inflation. Is rent something that affects you or people you know?' },
          { who:'VOTER', text:'(listen)', hint:'Mirror back. Note the issue. Avoid debate.' },
        ],
      },
      {
        direction:'The ask — only if tone is warm.',
        lines: [
          { who:'CANVASSER', text:'Marcus\'s speaking on the floor tomorrow at 13:50. Can we count on you to call your MLA if it\'s in the news? We\'ll text you if it matters.' },
          { who:'SYSTEM', capture:['support','issue','recontact OK','phone opt-in'] },
        ],
      },
    ],
  },
  {
    id:'sc-id',
    title:'Cold ID — no script, 20 seconds',
    mode:'door-knock',
    issue:'any',
    author:'Field team',
    updated:'v2.0',
    scenes: [
      {
        direction:'Quick support read. No persuasion.',
        lines: [
          { who:'CANVASSER', text:'Hi, we\'re talking to neighbours about the election. On a scale of 1 to 5, where 1 is definitely Hale and 5 is definitely not, where would you place yourself?' },
          { who:'SYSTEM', capture:['support 1–5','primary issue'] },
        ],
      },
    ],
  },
  {
    id:'sc-petition',
    title:'Petition — Save Our Rent Cap',
    mode:'door-petition',
    issue:'housing',
    author:'Coalition',
    updated:'v1.1',
    scenes: [
      {
        direction:'One-ask. Signature device in hand.',
        lines: [
          { who:'CANVASSER', text:'We\'re asking every door to sign the petition for a rent cap — Bill 14. Takes ten seconds. Would you add your name?' },
          { who:'SYSTEM', capture:['signature','email','postcode'] },
        ],
      },
    ],
  },
  {
    id:'sc-street',
    title:'Street — Community Fair inbound',
    mode:'street',
    issue:'any',
    author:'Volunteer lead',
    updated:'v1.0',
    scenes: [
      {
        direction:'They walked up. Don\'t pitch — ask.',
        lines: [
          { who:'CANVASSER', text:'Hi — what brought you over? Anything on your mind about the riding?' },
          { who:'SYSTEM', capture:['name','email','primary issue','support 1–5 (optional)'] },
        ],
      },
    ],
  },
];

// ── Mode taxonomy (new per user feedback)
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
