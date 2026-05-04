// Events 2.0 — sample data
// Town halls, fundraisers, canvasses, debates, GOTV pushes — and the venues/shifts/tickets behind them

const EV_TYPES = {
  townhall:   { label:'Town hall',         tint:'#6b3410' },
  canvass:    { label:'Canvass launch',    tint:'#1e3a5f' },
  fundraiser: { label:'Fundraiser',        tint:'#2a4a3a' },
  debate:     { label:'Debate / forum',    tint:'#8a1414' },
  rally:      { label:'Rally',             tint:'#b8334a' },
  housepty:   { label:'House party',       tint:'#5c4a1f' },
  phonebank:  { label:'Phone bank',        tint:'#1f3e5a' },
  gotv:       { label:'GOTV push',         tint:'#b8334a' },
  internal:   { label:'Staff / training',  tint:'#3f3f3f' },
};

const EV_LIST = [
  { id:'e-th-mtp',     date:'2026-04-28', start:'19:00', end:'21:00', type:'townhall',   title:'Town Hall · Mount Pleasant', subtitle:'Housing & affordability with Mike Cohn',
    venue:'v-strath-h', capacity: 280, rsvped: 244, attended: null,  shifts: 8, shiftsFilled: 7, ticketed:false, host:'Mike Cohn',     priority:'A', cover:'tag:hall', costSofar: 480, budget: 800 },
  { id:'e-can-ne',     date:'2026-04-29', start:'10:00', end:'14:00', type:'canvass',    title:'Saturday canvass · NE riding',subtitle:'Doors with field captains, bagels at 9:30',
    venue:'v-cafe-roar', capacity: 120, rsvped:  88, attended: null, shifts:12, shiftsFilled:10, ticketed:false, host:'Priya Okafor',  priority:'A', cover:'tag:doors', costSofar: 120, budget: 220 },
  { id:'e-fund-gala',  date:'2026-05-02', start:'18:30', end:'22:00', type:'fundraiser', title:'Spring Gala · The Roundhouse',subtitle:'Headline: Premier Sandhu · keynote: Dr. R. Singh',
    venue:'v-roundhouse',capacity: 320, rsvped: 290, attended: null, shifts:14, shiftsFilled:11, ticketed:true,  host:'Marcus L.',     priority:'A', cover:'tag:gala', costSofar:18400, budget:24000 },
  { id:'e-deb-civ',    date:'2026-05-03', start:'19:00', end:'20:30', type:'debate',     title:'Affordability Debate · CKNW',subtitle:'Live broadcast · 90 min · prep at 16:00',
    venue:'v-cknw',     capacity:  90, rsvped:  76, attended: null,  shifts: 4, shiftsFilled: 4, ticketed:false, host:'Sasha N.',      priority:'A', cover:'tag:mic', costSofar: 0,   budget: 200 },
  { id:'e-rally',      date:'2026-05-05', start:'12:00', end:'13:30', type:'rally',      title:'Steps Rally · Vancouver Art Gallery', subtitle:'Coalition speakers, brass band, signage at 11:00',
    venue:'v-vag-steps',capacity: 1500, rsvped: 980, attended: null, shifts:22, shiftsFilled:18, ticketed:false, host:'Priya Okafor',  priority:'A', cover:'tag:rally', costSofar: 2300, budget: 4200 },
  { id:'e-th-rich',    date:'2026-05-06', start:'19:00', end:'21:00', type:'townhall',   title:'Town Hall · Richmond-Steveston', subtitle:'Transit & seniors, Tagalog/English',
    venue:'v-stevhall', capacity: 200, rsvped: 134, attended: null,  shifts: 6, shiftsFilled: 4, ticketed:false, host:'Marcus L.',     priority:'B', cover:'tag:hall', costSofar: 280, budget: 600 },
  { id:'e-housept-mr', date:'2026-05-07', start:'18:00', end:'20:00', type:'housepty',   title:'House party · M. Romero', subtitle:'Mount Pleasant · 1432 Quebec St · 30 cap',
    venue:'v-house-romero', capacity: 30, rsvped: 24, attended: null, shifts: 2, shiftsFilled: 2, ticketed:true,  host:'Marisol Romero',priority:'B', cover:'tag:home', costSofar: 0, budget: 0 },
  { id:'e-pb-ne',      date:'2026-05-07', start:'17:00', end:'21:00', type:'phonebank',  title:'Phone bank · East van office', subtitle:'Auto-dialer · ID + persuasion',
    venue:'v-eastvan',  capacity:  40, rsvped:  31, attended: null,  shifts: 4, shiftsFilled: 3, ticketed:false, host:'Sasha N.',      priority:'B', cover:'tag:phone', costSofar: 60, budget: 120 },
  { id:'e-can-burn',   date:'2026-05-09', start:'10:00', end:'14:00', type:'canvass',    title:'Saturday canvass · Burnaby N.',subtitle:'Pair-walk Brentwood Park, lit drop',
    venue:'v-brent-park', capacity:80, rsvped:  56, attended: null,  shifts: 8, shiftsFilled: 6, ticketed:false, host:'Priya Okafor',  priority:'B', cover:'tag:doors', costSofar:  80, budget: 180 },
  { id:'e-fund-house', date:'2026-05-09', start:'18:00', end:'21:00', type:'fundraiser', title:'House dinner · West End', subtitle:'15 guests · Sandhu attending · target $12k',
    venue:'v-house-cohn', capacity:15, rsvped:  14, attended: null,  shifts: 1, shiftsFilled: 1, ticketed:true,  host:'Mike & Anna',   priority:'A', cover:'tag:home', costSofar: 0, budget: 0 },
  { id:'e-deb-uvc',    date:'2026-05-10', start:'14:00', end:'16:00', type:'debate',     title:'Climate forum · UBC', subtitle:'4-way panel · Q&A · student moderators',
    venue:'v-ubcsub',   capacity: 600, rsvped: 401, attended: null,  shifts: 6, shiftsFilled: 5, ticketed:false, host:'Marcus L.',     priority:'B', cover:'tag:mic', costSofar:  0, budget: 0 },
  { id:'e-th-tri',     date:'2026-05-11', start:'19:00', end:'21:00', type:'townhall',   title:'Town Hall · Tri-Cities', subtitle:'Casework triage clinic also running',
    venue:'v-poco',     capacity: 220, rsvped:  98, attended: null,  shifts: 6, shiftsFilled: 3, ticketed:false, host:'Sasha N.',      priority:'C', cover:'tag:hall', costSofar: 240, budget: 500 },
  { id:'e-gotv-1',     date:'2026-05-12', start:'06:00', end:'20:00', type:'gotv',       title:'E-DAY · GOTV all-call', subtitle:'Doors, rides, day-of comms · 22 stagings',
    venue:'v-multi',    capacity:9999, rsvped: 1840, attended: null, shifts:84, shiftsFilled:62, ticketed:false, host:'Field central', priority:'A', cover:'tag:gotv', costSofar:1240, budget: 8200 },
  // past
  { id:'e-th-past1',   date:'2026-04-21', start:'19:00', end:'21:00', type:'townhall',   title:'Town Hall · Surrey-Newton',subtitle:'Childcare focus · ASL · Punjabi',
    venue:'v-newton',   capacity: 240, rsvped: 218, attended: 192,   shifts: 8, shiftsFilled: 8, ticketed:false, host:'Mike Cohn',    priority:'A', cover:'tag:hall', costSofar: 540, budget: 540 },
  { id:'e-can-past1',  date:'2026-04-19', start:'10:00', end:'14:00', type:'canvass',    title:'Saturday canvass · Hastings-Sunrise', subtitle:'Top-priority precincts, 612 doors',
    venue:'v-east-l',   capacity: 100, rsvped:  84, attended:  76,   shifts:10, shiftsFilled:10, ticketed:false, host:'Priya Okafor',  priority:'A', cover:'tag:doors', costSofar: 110, budget: 110 },
  { id:'e-fund-past1', date:'2026-04-12', start:'18:30', end:'21:00', type:'fundraiser', title:'Friends-of dinner · Kitsilano', subtitle:'24 guests · raised $36,400',
    venue:'v-house-l',  capacity:  30, rsvped:  26, attended:  24,   shifts: 2, shiftsFilled: 2, ticketed:true,  host:'Sandra L.',     priority:'A', cover:'tag:home', costSofar: 0, budget: 0 },
];

// Venues
const EV_VENUES = [
  { id:'v-strath-h',    name:'Strathcona Community Hall',  city:'Vancouver',     cap: 320, kind:'Hall',           contact:'Linda Vu',     phone:'604 555 0144', priorEvents: 11, accessibility:'Step-free · ASL on request', notes:'Reliable. Excellent acoustics. Free street parking after 6.' },
  { id:'v-cafe-roar',   name:'Roar Cafe',                  city:'Burnaby',       cap: 60,  kind:'Café (rented out)',contact:'Owner · Tess', phone:'604 555 0111', priorEvents: 6,  accessibility:'1 step at door', notes:'Coffee included. Pair w/ canvass starts well.' },
  { id:'v-roundhouse',  name:'The Roundhouse',             city:'Vancouver',     cap: 360, kind:'Banquet hall',     contact:'Darius P.',   phone:'604 555 0200', priorEvents: 4,  accessibility:'Full', notes:'Premium. Strict load-in window. AV included.' },
  { id:'v-cknw',        name:'CKNW Studio C',              city:'Vancouver',     cap: 90,  kind:'Studio',           contact:'Producer · J. Lin', phone:'604 555 0188', priorEvents: 3, accessibility:'Full', notes:'Live broadcast. Arrive 90 min early. Dress: dark suit.' },
  { id:'v-vag-steps',   name:'Vancouver Art Gallery Steps',city:'Vancouver',     cap:1500, kind:'Public square',    contact:'Permit · Parks BC', phone:'—',           priorEvents: 2, accessibility:'Step-free', notes:'Permit pending. Sound permit additional.' },
  { id:'v-stevhall',    name:'Steveston Community Hall',   city:'Richmond',      cap: 200, kind:'Hall',             contact:'Manager · Ann', phone:'604 555 0166', priorEvents: 5,  accessibility:'Full', notes:'Tagalog interpreter on retainer.' },
  { id:'v-house-romero',name:'M. Romero residence',        city:'Vancouver',     cap: 30,  kind:'Private home',     contact:'Marisol',      phone:'778 555 0122', priorEvents: 1,  accessibility:'2 steps · narrow entry', notes:'BYO chairs (10).' },
  { id:'v-eastvan',     name:'East Van field office',      city:'Vancouver',     cap: 60,  kind:'Office',           contact:'Marcus L.',    phone:'—',            priorEvents: 22, accessibility:'Full · elevator', notes:'Phone-bank ready. 30 dialer seats.' },
  { id:'v-brent-park',  name:'Brentwood Park (north pavilion)', city:'Burnaby', cap: 80, kind:'Park pavilion',      contact:'Permit · Parks Burnaby', phone:'—',  priorEvents: 0, accessibility:'Step-free', notes:'New venue. Bring banners.' },
  { id:'v-house-cohn',  name:'Cohn residence',             city:'Vancouver',     cap: 20,  kind:'Private home',     contact:'Mike Cohn',    phone:'778 555 0145', priorEvents: 7,  accessibility:'Full', notes:'Top earner. 4 dinners since Feb.' },
  { id:'v-ubcsub',      name:'UBC Student Union Theatre',  city:'Vancouver',     cap: 600, kind:'Theatre',          contact:'AMS bookings', phone:'604 555 0777', priorEvents: 0,  accessibility:'Full', notes:'Student moderators. Lottery for seats.' },
  { id:'v-poco',        name:'Port Coquitlam Rec Centre',  city:'Tri-Cities',    cap: 220, kind:'Hall',             contact:'Manager · Wei', phone:'604 555 0099', priorEvents: 2, accessibility:'Full', notes:'Daycare available 18:30-21:00.' },
  { id:'v-newton',      name:'Newton Cultural Centre',     city:'Surrey',        cap: 280, kind:'Hall',             contact:'M. Sidhu',     phone:'604 555 0055', priorEvents: 8,  accessibility:'Full · ASL', notes:'Punjabi & ASL interpreters confirmed for all events.' },
  { id:'v-east-l',      name:'East Van campaign launch',   city:'Vancouver',     cap: 100, kind:'Office',           contact:'Marcus L.',    phone:'—',            priorEvents: 14, accessibility:'Full', notes:'Standard launchpad.' },
  { id:'v-house-l',     name:'Lewis residence · Kits',     city:'Vancouver',     cap: 30,  kind:'Private home',     contact:'Sandra L.',    phone:'778 555 0133', priorEvents: 5,  accessibility:'Step-free patio', notes:'Spring & fall garden dinners.' },
];

// Shifts (subset, mostly for the upcoming gala + canvass)
const EV_SHIFTS = [
  // Gala
  { id:'s-gala-1', eventId:'e-fund-gala', role:'Greeter / coat check', cap:4, filled:4, start:'17:30', end:'19:30', captain:'A. Singh' },
  { id:'s-gala-2', eventId:'e-fund-gala', role:'Auction runner',       cap:6, filled:5, start:'18:00', end:'21:30', captain:'D. Park' },
  { id:'s-gala-3', eventId:'e-fund-gala', role:'Donor liaison',        cap:2, filled:2, start:'17:00', end:'22:30', captain:'M. Liu' },
  { id:'s-gala-4', eventId:'e-fund-gala', role:'Tech & AV',            cap:2, filled:0, start:'15:00', end:'22:30', captain:null,      flag:'open' },
  // Saturday canvass
  { id:'s-can-1',  eventId:'e-can-ne',    role:'Bagel & coffee setup', cap:2, filled:2, start:'09:00', end:'10:30', captain:'L. Choi' },
  { id:'s-can-2',  eventId:'e-can-ne',    role:'Door pair captain',    cap:8, filled:6, start:'10:00', end:'14:00', captain:'P. Okafor' },
  { id:'s-can-3',  eventId:'e-can-ne',    role:'Lit-drop walker',      cap:6, filled:5, start:'10:00', end:'14:00', captain:'J. Tran' },
  { id:'s-can-4',  eventId:'e-can-ne',    role:'Data entry',           cap:4, filled:3, start:'13:00', end:'16:00', captain:'M. Ferreira' },
  // Town hall MtP
  { id:'s-thmtp-1',eventId:'e-th-mtp',    role:'Door & sign-in',       cap:3, filled:3, start:'18:00', end:'21:30', captain:'R. Patel' },
  { id:'s-thmtp-2',eventId:'e-th-mtp',    role:'Mic runner',           cap:2, filled:2, start:'19:00', end:'21:00', captain:'D. Wong' },
  { id:'s-thmtp-3',eventId:'e-th-mtp',    role:'AV / livestream',      cap:2, filled:1, start:'18:00', end:'21:30', captain:null,      flag:'open' },
  { id:'s-thmtp-4',eventId:'e-th-mtp',    role:'Refreshments',         cap:1, filled:1, start:'18:30', end:'21:30', captain:'I. Chen' },
];

// Tickets (gala detail)
const EV_GALA_TICKETS = [
  { tier:'Patron Table (8)',     price: 8000, sold:  9,  cap: 12,  rev: 72000 },
  { tier:'Sustainer Table (8)',  price: 4500, sold: 14,  cap: 18,  rev: 63000 },
  { tier:'Supporter Seat',       price:  500, sold:108,  cap:140,  rev: 54000 },
  { tier:'Friend Seat',          price:  250, sold: 84,  cap: 90,  rev: 21000 },
  { tier:'Volunteer / press',    price:    0, sold: 22,  cap: 30,  rev:     0 },
];

// Run-of-show for gala
const EV_GALA_ROS = [
  { t:'15:00', what:'Load-in · vendor arrivals' },
  { t:'16:30', what:'AV check · light cues · audio' },
  { t:'17:00', what:'Donor liaison briefing' },
  { t:'17:30', what:'Doors open · greeter shift on' },
  { t:'18:30', what:'Cocktails · roving fundraisers' },
  { t:'19:15', what:'Seating · welcome by chair' },
  { t:'19:30', what:'Premier Sandhu · 12 min' },
  { t:'19:45', what:'Dinner service · 3 courses' },
  { t:'20:30', what:'Live appeal · table-topping' },
  { t:'21:00', what:'Auction · 8 lots' },
  { t:'21:45', what:'Dr. R. Singh keynote · 10 min' },
  { t:'22:00', what:'Doors · debrief in green-room' },
];

// RSVP-over-time series for gala (last 14 days)
const EV_GALA_RSVPS = [
  { d:'-14', n:  4 }, { d:'-13', n:  9 }, { d:'-12', n: 14 }, { d:'-11', n: 22 },
  { d:'-10', n: 31 }, { d:'-9',  n: 44 }, { d:'-8',  n: 58 }, { d:'-7',  n: 78 },
  { d:'-6',  n: 99 }, { d:'-5',  n:128 }, { d:'-4',  n:160 }, { d:'-3',  n:198 },
  { d:'-2',  n:232 }, { d:'-1',  n:265 }, { d:'today', n:290 },
];

// Hosts (distributed events)
const EV_HOSTS = [
  { id:'h-romero', name:'Marisol Romero',  city:'Vancouver',  events:1, raised:    0, rsvps:24, status:'active',  joined:'Mar 12' },
  { id:'h-cohn',   name:'Mike & Anna Cohn',city:'Vancouver',  events:7, raised:248000,rsvps:172,status:'active',  joined:'Sep 04' },
  { id:'h-lewis',  name:'Sandra Lewis',    city:'Vancouver',  events:5, raised: 142000,rsvps:118,status:'active',  joined:'Jun 22' },
  { id:'h-ng',     name:'Jasmine Ng',      city:'Burnaby',    events:2, raised:  18000,rsvps: 42,status:'active',  joined:'Feb 02' },
  { id:'h-deol',   name:'Sukh & Tara Deol',city:'Surrey',     events:3, raised:  64000,rsvps: 88,status:'active',  joined:'Jan 18' },
  { id:'h-okolo',  name:'Adaeze Okolo',    city:'Vancouver',  events:2, raised:  22500,rsvps: 51,status:'active',  joined:'Mar 30' },
  { id:'h-tan',    name:'Daniel Tan',      city:'Richmond',   events:1, raised:   8200,rsvps: 28,status:'pending', joined:'Apr 14' },
  { id:'h-park',   name:'D. Park',         city:'Vancouver',  events:0, raised:      0,rsvps:  0,status:'training',joined:'Apr 22' },
  { id:'h-vu',     name:'Linda Vu',        city:'New Westminster',events:4,raised:31000,rsvps: 64,status:'active', joined:'Nov 11' },
  { id:'h-foster', name:'R. Foster',       city:'Tri-Cities', events:1, raised:   4400,rsvps: 18,status:'active',  joined:'Mar 18' },
];

// KPI summary
const EV_SUMMARY = {
  upcoming14d:    13,
  totalRsvped:   2200,
  ticketRevenue:  210000,
  shiftFillRate:  82,    // %
  hostsActive:    14,
  venuesActive:   9,
  pastWeekAttended:292,
};

export { EV_TYPES, EV_LIST, EV_VENUES, EV_SHIFTS, EV_GALA_TICKETS, EV_GALA_ROS, EV_GALA_RSVPS, EV_HOSTS, EV_SUMMARY };