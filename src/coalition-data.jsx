// Mandate 2.0 — Coalition data
//
// Synthetic BC-Canadian campaign sample data. Endorsement ledger, org files,
// asks pipeline, and comms log are populated with clearly-fictional records.
// Ops / events / relationship graph stay empty (no live seed bucket for them).

export const COA_KPIS = {
  committed: { label:'COMMITTED ORGS',     value:'—', delta:'', sub:'', tone:'flat' },
  public:    { label:'PUBLIC ENDORSEMENTS',value:'—', delta:'', sub:'', tone:'flat' },
  reach:     { label:'COMBINED REACH',     value:'—', delta:'', sub:'', tone:'flat' },
  asks:      { label:'ASKS OPEN',          value:'—', delta:'', sub:'', tone:'flat' },
  ops:       { label:'JOINT OPS',          value:'—', delta:'', sub:'', tone:'flat' },
  events:    { label:'CO-HOSTED',          value:'—', delta:'', sub:'', tone:'flat' },
};

export const COA_LEDGER = [
  {
    id:'E-01', slug:'bcfl', org:'BC Federation of Labour', sector:'Labour federation',
    status:'public', members:500000, reach:847000, money:25000, champion:'Priya Sandhu',
    release:'2026-04-22 09:00',
    strategy:'Anchor endorsement. Their public backing unlocks affiliated unions and provides the field volunteer base for the GOTV push.',
    note:'Strongest tie in the network — most other labour orgs route through BCFL.',
    risks:[{ kind:'message', text:'Wants explicit language on contracting-out before the next leaflet.' }],
  },
  {
    id:'E-02', slug:'cupe', org:'CUPE Local 1004', sector:'Public sector union',
    status:'committed', members:8200, reach:21000, money:5000, champion:'Dev Tanaka',
    release:'2026-05-06 12:00',
    strategy:'Committed verbally; release timed to the parks-and-rec funding announcement.',
    note:'Members concentrated in the riding — high canvass value.',
  },
  {
    id:'E-03', slug:'vdlc', org:'Vancouver & District Labour Council', sector:'Labour council',
    status:'committed', members:60000, reach:95000, money:7500, champion:'Priya Sandhu',
    strategy:'Board has voted to endorse; awaiting a joint photo op to publicise.',
  },
  {
    id:'E-04', slug:'tenants', org:'Mount Pleasant Tenants Union', sector:'Housing / tenants',
    status:'warm', members:1400, reach:6200, money:0, champion:'Maya Rios',
    strategy:'Aligned on rent stabilization; need to deliver on the renter-protection ask to convert to committed.',
    note:'Will not formally endorse but will mobilise members for the town hall.',
    risks:[{ kind:'caution', text:'Some members distrust all electoral candidates — keep asks concrete.' }],
  },
  {
    id:'E-05', slug:'bia', org:'Mount Pleasant BIA', sector:'Business / small biz',
    status:'prospect', members:320, reach:14000, money:0, champion:'Dev Tanaka',
    strategy:'Cool but reachable. Lead with small-business permitting and street-safety wins.',
  },
  {
    id:'E-06', slug:'devcorp', org:'Skyline Development Corp', sector:'Real estate / development',
    status:'hostile', members:0, reach:3400, money:0, champion:'—',
    strategy:'Opposed to the below-market housing mandate. No ask; monitor for opposition messaging.',
    risks:[{ kind:'oppo', text:'Funding a competing candidate; expect attack mailers on the housing plan.' }],
  },
];

export const COA_ORGS = {
  bcfl: {
    id:'E-01', org:'BC Federation of Labour', sector:'Labour federation',
    status:'public', members:500000, reach:847000, money:25000, champion:'Priya Sandhu',
    strategy:'Anchor endorsement; unlocks affiliated unions and the field volunteer base.',
    founded:1910, hq:'Burnaby, BC', web:'bcfed.ca', affiliates:'500+ locals',
    contacts:[
      { name:'Priya Sandhu', title:'Secretary-Treasurer', tier:'principal' },
      { name:'Marcus Bell',  title:'Political Director',   tier:'staff' },
    ],
    history:[
      { date:'2026-04-22', kind:'event',   text:'Public endorsement at the Wise Hall rally.' },
      { date:'2026-04-10', kind:'meeting', text:'Sat down with the political committee on contracting-out language.' },
      { date:'2026-03-28', kind:'call',    text:'Intro call with Secretary-Treasurer.' },
    ],
    asks:[
      { id:'A-01', text:'Provide 40 GOTV volunteers for the final weekend.', stage:'verbal', value:'high' },
      { id:'A-04', text:'Co-sign the housing op-ed in The Tyee.',           stage:'done',   value:'med'  },
    ],
    affiliated:['cupe','vdlc'],
  },
  cupe: {
    id:'E-02', org:'CUPE Local 1004', sector:'Public sector union',
    status:'committed', members:8200, reach:21000, money:5000, champion:'Dev Tanaka',
    strategy:'Committed; release timed to the parks-and-rec funding announcement.',
    founded:1963, hq:'Vancouver, BC', web:'cupe1004.ca', affiliates:'CUPE BC',
    contacts:[
      { name:'Janet Okafor', title:'President', tier:'principal' },
    ],
    history:[
      { date:'2026-05-01', kind:'call',  text:'Confirmed endorsement vote passed at the membership meeting.' },
      { date:'2026-04-18', kind:'email', text:'Sent the candidate questionnaire response.' },
    ],
    asks:[
      { id:'A-02', text:'Endorsement quote for the field leaflet.', stage:'verbal', value:'med' },
    ],
    affiliated:['bcfl'],
  },
  tenants: {
    id:'E-04', org:'Mount Pleasant Tenants Union', sector:'Housing / tenants',
    status:'warm', members:1400, reach:6200, money:0, champion:'Maya Rios',
    strategy:'Aligned on rent stabilization; deliver the renter-protection ask to convert.',
    founded:2019, hq:'Mount Pleasant, Vancouver', web:'mptenants.org',
    contacts:[
      { name:'Sam Ferreira', title:'Organizer', tier:'principal' },
      { name:'Lena Kovac',   title:'Steering committee', tier:'volunteer' },
    ],
    history:[
      { date:'2026-04-15', kind:'meeting', text:'Strategy session on the rent stabilization town hall.' },
      { date:'2026-03-30', kind:'event',   text:'Joined their tenant clinic to listen, not pitch.' },
    ],
    asks:[
      { id:'A-03', text:'Turn out 50 members for the rent control town hall.', stage:'discussion', value:'high' },
    ],
    affiliated:[],
  },
};

export const COA_ASKS_STAGES = ['Queued','In discussion','Verbal yes','Delivered','Lost'];

export const COA_ASKS = [
  { id:'A-01', org:'BC Federation of Labour', text:'Provide 40 GOTV volunteers for the final weekend.', notes:'Coordinated via the political director.', champion:'Priya Sandhu', value:'high', stage:2, due:'2026-05-30', heat:true },
  { id:'A-02', org:'CUPE Local 1004',          text:'Endorsement quote for the field leaflet.',         notes:'President drafting copy.',              champion:'Dev Tanaka',  value:'med',  stage:2, due:'2026-05-12' },
  { id:'A-03', org:'Mount Pleasant Tenants Union', text:'Turn out 50 members for the rent control town hall.', notes:'Tied to the renter-protection ask.', champion:'Maya Rios', value:'high', stage:1, due:'2026-05-08' },
  { id:'A-04', org:'BC Federation of Labour',  text:'Co-sign the housing op-ed in The Tyee.',           notes:'',                                     champion:'Priya Sandhu', value:'med',  stage:3, due:'2026-04-20', delivered:'2026-04-22' },
  { id:'A-05', org:'Mount Pleasant BIA',       text:'Host a small-business roundtable.',                notes:'Cool reception; revisit after permitting win.', champion:'Dev Tanaka', value:'low', stage:0, due:'2026-06-10' },
];

export const COA_OPS = [];

export const COA_COMMS = [
  { d:'2026-05-06', t:'09:15', kind:'call',    org:'BC Federation of Labour',     what:'Confirmed 40 GOTV volunteers for the final weekend.', who:'Priya Sandhu', dur:'18m' },
  { d:'2026-05-06', t:'14:40', kind:'email',   org:'CUPE Local 1004',             what:'Sent endorsement quote draft for sign-off.',          who:'Dev Tanaka',   dur:'—'   },
  { d:'2026-05-05', t:'11:00', kind:'meeting', org:'Mount Pleasant Tenants Union',what:'Town hall logistics + renter-protection ask.',        who:'Maya Rios',    dur:'45m' },
  { d:'2026-05-05', t:'16:20', kind:'event',   org:'Vancouver & District Labour Council', what:'Spoke at the delegates meeting.',             who:'Priya Sandhu', dur:'30m' },
  { d:'2026-05-04', t:'10:30', kind:'call',    org:'Mount Pleasant BIA',          what:'Pitched a small-business roundtable; lukewarm.',      who:'Dev Tanaka',   dur:'12m' },
];

export const COA_EVENTS = [];
export const COA_GRAPH = { nodes: [], edges: [] };
