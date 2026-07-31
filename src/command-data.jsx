// Mandate 2.0 — Command Center data
//
// Synthetic BC-Canadian campaign war-room sample data. CMD_GROUPS holds the
// channel sidebar (group → items), CMD_MESSAGES the #war-room stream, and
// CMD_THREAD the replies to message m1. CMD_WORKSPACES / CMD_SLASH /
// CMD_MEMBERS_IN_ROOM stay empty (no live seed bucket drives them).
//
// seed.js flattens CMD_GROUPS to per-item channel records
// ({ ...item, group: label }); command.jsx reconstructs the groups from the
// live channel records' `group` field, and falls back to this group shape.

const CMD_WORKSPACES = [];

const CMD_GROUPS = [
  {
    id:'g-channels', label:'CAMPAIGN CHANNELS',
    items:[
      { id:'c-warroom', type:'ch', name:'war-room',   priv:false, urgent:true,  unread:6 },
      { id:'c-field',   type:'ch', name:'field-ops',  priv:false, unread:2 },
      { id:'c-comms',   type:'ch', name:'comms',      priv:false, unread:0 },
      { id:'c-finance', type:'ch', name:'finance',    priv:true,  unread:1 },
    ],
  },
  {
    id:'g-dms', label:'DIRECT MESSAGES',
    items:[
      { id:'d-maya',  type:'dm', name:'Maya Rios',    avatar:'MR', role:'mla', candidate:true, unread:3 },
      { id:'d-priya', type:'dm', name:'Priya Sandhu', avatar:'PS', unread:0 },
      { id:'d-dev',   type:'dm', name:'Dev Tanaka',   avatar:'DT', unread:1 },
    ],
  },
  {
    id:'g-huddles', label:'HUDDLES',
    items:[
      { id:'h-rapid', type:'huddle', name:'Rapid response', live:true,  count:'4' },
      { id:'h-debate',type:'huddle', name:'Debate prep',    live:false, count:'0' },
    ],
  },
];

const CMD_MESSAGES = [
  {
    id:'m1', avatar:'MR', who:'Maya Rios', mla:true, role:'candidate', t:'07:42',
    text:'Morning war room. Skyline Corp is pushing the "4,000 homes is fantasy" line again. I want our rebuttal thread out before the 9am radio hit. /rebuttal',
    mentions:['Dev','Priya'], reactions:[['🔥',5],['💯',3]], thread:3,
  },
  {
    id:'m2', avatar:'PS', who:'Priya Sandhu', role:'comms director', t:'07:45',
    text:'On it. Pulling the zoning numbers now. The math is public — I will link the city report. /facts',
    reactions:[['👍',2]],
  },
  {
    id:'m3', avatar:'DT', who:'Dev Tanaka', role:'field director', t:'07:51',
    text:'Field note: Fraser St canvass last night, cost of living is THE issue on every block. Quick poll for messaging:',
    poll:{ q:'Lead message for the rebuttal thread?', options:[{ t:'Housing math / zoning', v:11 },{ t:'Cost of living', v:18 },{ t:'Childcare', v:6 }], total:35 },
  },
  {
    id:'m4', avatar:'BOT', who:'Mandate Bot', bot:true, role:'', t:'07:53',
    text:'Reminder: CBC Early Edition hit at 09:05. Talking points doc is pinned.',
    card:{ title:'Radio hit — CBC Early Edition', meta:'09:05 · 4 min segment', status:'CONFIRMED' },
  },
  {
    id:'m5', avatar:'PS', who:'Priya Sandhu', role:'comms director', t:'08:04',
    text:'Rebuttal draft in the doc. @Maya can you sign off? Going with the cost-of-living frame per the poll.',
    mentions:['Maya'],
    attach:{ kind:'link-preview', title:'Rebuttal thread — DRAFT v3', src:'docs.mandate', ts:'2m' },
  },
  {
    id:'m6', avatar:'DT', who:'Dev Tanaka', role:'field director', t:'08:09',
    text:'Saturday canvass is at 60 RSVPs. Need 15 more for full block coverage. Sharing the sign-up in #field-ops.',
    reactions:[['🙌',4]],
  },
];

const CMD_THREAD = [
  { id:'t1', avatar:'PS', who:'Priya Sandhu', t:'07:46', text:'Thread structure: post 1 the claim, post 2 the city zoning report, post 3 the build timeline.' },
  { id:'t2', avatar:'DT', who:'Dev Tanaka',  t:'07:49', text:'Add a fourth with a renter quote from the town hall? Humanises it.' },
  { id:'t3', avatar:'MR', who:'Maya Rios', mla:true, t:'07:55', text:'Yes to the renter quote. Keep it to four posts, ship by 8:45.' },
];

const CMD_MEMBERS_IN_ROOM = [];
const CMD_SLASH = [];

export { CMD_WORKSPACES, CMD_GROUPS, CMD_MESSAGES, CMD_THREAD, CMD_MEMBERS_IN_ROOM, CMD_SLASH };
