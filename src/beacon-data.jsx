// Mandate 2.0 — Beacon data
//
// Synthetic BC-Canadian campaign sample data. Clearly fictional accounts,
// posts, and listening mentions for a provincial campaign demo. BEACON_DAYS
// keeps a generic Mon–Sun structure (calendar grid config).

const BEACON_ACCOUNTS = [
  { id:'acct-x',   platform:'x',    handle:'@RioForMtPleasant', name:'Maya Rios · Mount Pleasant', followers:18420, verified:true,  active:true },
  { id:'acct-ig',  platform:'ig',   handle:'@rio.mountpleasant', name:'Rio for Mount Pleasant',     followers:9240,  verified:false, active:true },
  { id:'acct-fb',  platform:'fb',   handle:'/RioMountPleasant',  name:'Maya Rios Campaign',          followers:12750, verified:false, active:true },
  { id:'acct-li',  platform:'li',   handle:'maya-rios-bc',       name:'Maya Rios',                    followers:3110,  verified:false, active:true },
  { id:'acct-bs',  platform:'x',    handle:'@rio.bsky.social',   name:'Maya Rios (Bluesky)',          followers:2480,  verified:false, active:true },
];

const BEACON_DAYS = [
  { key:'mon', label:'MON', date:'' },
  { key:'tue', label:'TUE', date:'' },
  { key:'wed', label:'WED', date:'' },
  { key:'thu', label:'THU', date:'' },
  { key:'fri', label:'FRI', date:'' },
  { key:'sat', label:'SAT', date:'' },
  { key:'sun', label:'SUN', date:'' },
];

const BEACON_POSTS = [
  {
    id:'p1', platform:'x', day:'mon', slot:'07:30',
    status:'SCHEDULED', headline:'Rent stabilization town hall',
    body:'Mount Pleasant deserves rents people can actually plan their lives around. Join us Thursday at the Wise Hall — doors 6:30pm. #bcpoli #yvr',
    author:'Maya Rios', signoff:'approved · comms',
    stats:{ imp:'14.2k', eng:'3.1%' },
  },
  {
    id:'p2', platform:'ig', day:'mon', slot:'12:00',
    status:'DRAFT', headline:'Childcare reel — $10/day update',
    body:'Behind the scenes at Little Mountain Childcare. Real families, real waitlists. Full reel dropping noon.',
    author:'Dev Tanaka', signoff:'needs creative sign-off',
  },
  {
    id:'p3', platform:'fb', day:'tue', slot:'09:15',
    status:'SCHEDULED', headline:'Transit petition push',
    body:'The 99 B-Line is bursting at the seams. Sign the petition for express service to Commercial-Broadway. Link in bio.',
    author:'Maya Rios', signoff:'approved · comms',
    boost:{ spend:'$240', state:'ACTIVE' },
  },
  {
    id:'p4', platform:'li', day:'tue', slot:'14:00',
    status:'DRAFT', headline:'Endorsement: BC Federation of Labour',
    body:'Proud to be endorsed by the BC Federation of Labour. Working families built this neighbourhood and we are fighting for them.',
    author:'Priya Sandhu', signoff:'needs legal review',
  },
  {
    id:'p5', platform:'x', day:'wed', slot:'08:00',
    status:'LIVE', headline:'Affordable housing op-ed live in The Tyee',
    body:'My op-ed on missing-middle housing is up in @TheTyee today. We can build neighbourhoods, not just towers. Read + share. #bcpoli',
    author:'Maya Rios', signoff:'approved · comms',
    stats:{ imp:'22.7k', eng:'4.6%' },
  },
  {
    id:'p6', platform:'ig', day:'thu', slot:'17:30',
    status:'HOLD', headline:'Doorstep clip — Fraser St',
    body:'Knocked 80 doors on Fraser today. The number one issue? Cost of living. Every single block.',
    author:'Dev Tanaka', signoff:'hold · pending resident consent',
  },
  {
    id:'p7', platform:'fb', day:'fri', slot:'11:00',
    status:'SCHEDULED', headline:'Volunteer canvass — Saturday',
    body:'We are out in force Saturday morning. Coffee, clipboards, and good company. RSVP and bring a friend. 10am, campaign office.',
    author:'Priya Sandhu', signoff:'approved · field',
  },
  {
    id:'p8', platform:'x', day:'fri', slot:'16:45',
    status:'DRAFT', headline:'Rapid response — opponent housing claim',
    body:'Setting the record straight: our plan adds 4,000 below-market homes over 4 years. The math is public. Thread 👇',
    author:'Maya Rios', signoff:'needs sign-off · war room',
    urgent:true,
  },
];

const BEACON_LISTENING = [
  { id:'m1', platform:'x',   author:'@vanhousingnow', name:'Vancouver Housing Now', text:'Rios for Mount Pleasant actually showed up to the rent control town hall. Refreshing. #bcpoli', sentiment:0.7,  reach:'8.4k', time:'12m' },
  { id:'m2', platform:'news',author:'The Tyee',        name:'The Tyee',             text:'Op-ed: Why missing-middle housing is the fight Mount Pleasant can win — by Maya Rios.',        sentiment:0.4,  reach:'31k',  time:'1h'  },
  { id:'m3', platform:'x',   author:'@fraserstdad',    name:'Fraser St Dad',        text:'Got a knock from the Rio campaign. Polite, but $10/day childcare promises feel optimistic.',   sentiment:0.1,  reach:'620',  time:'2h'  },
  { id:'m4', platform:'fb',  author:'Mount Pleasant Community Group', name:'MP Community Group', text:'Mixed feelings on the transit petition — the 99 is a mess but is express service realistic?', sentiment:-0.2, reach:'2.1k', time:'3h'  },
  { id:'m5', platform:'x',   author:'@bcgrowthwatch',  name:'BC Growth Watch',      text:'Another candidate promising 4,000 homes. We have heard this before. Show us the zoning.',       sentiment:-0.5, reach:'4.7k', time:'5h'  },
  { id:'m6', platform:'ig',  author:'@littlemtnparent',name:'Little Mountain Parent', text:'The childcare reel made me tear up. Finally someone talking about the waitlist crisis. 💚',     sentiment:0.8,  reach:'1.3k', time:'6h'  },
];

const BEACON_APPROVALS = [];
const BEACON_METRICS = [];

export { BEACON_ACCOUNTS, BEACON_DAYS, BEACON_POSTS, BEACON_LISTENING, BEACON_APPROVALS, BEACON_METRICS };
