// Mandate 2.0 — Command Center data
// Slack/Discord/WhatsApp hybrid. Channels, DMs, voice notes, threads, slash, huddles.

const CMD_WORKSPACES = [
  { id:'mw', name:'Meridian West', tag:'MW', color:'#b8334a' },
  { id:'bc', name:'BC Caucus',     tag:'BC', color:'#1e3a5f' },
  { id:'cf', name:'Coalition Forum', tag:'CF', color:'#5a4a8a' },
];

const CMD_GROUPS = [
  { id:'g1', label:'Command', items:[
    { id:'c-warroom',    type:'ch', name:'war-room',        unread: 12, urgent: true,  tag:'🔴' },
    { id:'c-daily',      type:'ch', name:'daily-brief',     unread: 3 },
    { id:'c-leadership', type:'ch', name:'leadership',      priv:true },
  ]},
  { id:'g2', label:'Ops', items:[
    { id:'c-field',      type:'ch', name:'field',           unread: 24, tag:'G' },
    { id:'c-ground',     type:'ch', name:'ground-desk',     unread: 2 },
    { id:'c-events',     type:'ch', name:'events',          unread: 0 },
    { id:'c-raise',      type:'ch', name:'raise',           unread: 1 },
    { id:'c-ledger',     type:'ch', name:'ledger-flags',    unread: 0 },
  ]},
  { id:'g3', label:'Voice & Press', items:[
    { id:'c-beacon',     type:'ch', name:'beacon',          unread: 5, urgent: true },
    { id:'c-rapid',      type:'ch', name:'rapid-response',  unread: 2 },
    { id:'c-opposition', type:'ch', name:'opposition',      unread: 0 },
  ]},
  { id:'g4', label:'DMs', items:[
    { id:'d-maria',  type:'dm', name:'Maria Chen',   unread: 2, avatar:'MC', active:true },
    { id:'d-ben',    type:'dm', name:'Ben Okafor',   unread: 0, avatar:'BO' },
    { id:'d-dex',    type:'dm', name:'Dex Thompson', unread: 4, avatar:'DT' },
    { id:'d-priya',  type:'dm', name:'Priya Shah',   unread: 0, avatar:'PS' },
  ]},
  { id:'g5', label:'Huddles', items:[
    { id:'h1', type:'huddle', name:'War room live', count:6, live:true },
    { id:'h2', type:'huddle', name:'Rapid response', count:0 },
  ]},
];

// ── Messages in #war-room — a rich chronological feed with types
const CMD_MESSAGES = [
  { id:'m1', t:'08:02', who:'Dex Thompson', avatar:'DT', role:'Comms Director',
    text:'Sun, A4, Vance on housing. Paywalled link in thread.',
    reactions:[['🔥',3],['👀',5]], thread:4,
    attach:{ kind:'link-preview', title:'"Market will sort itself out," Vance says on housing', src:'vancouversun.com', ts:'5m'},
  },
  { id:'m2', t:'08:04', who:'Maria Chen', avatar:'MC', role:'Campaign Manager',
    text:'@Dex — pulling quotes now. @Ben standby on field push.',
    mentions:['Dex','Ben'], reactions:[['✅',2]], thread:0,
  },
  { id:'m3', t:'08:06', who:'Ben Okafor', avatar:'BO', role:'Field Director',
    text:'Standing by. Universe 31-B active tonight, 12/20 filled. Can pivot script on 15 min notice.',
    reactions:[], thread:1,
  },
  { id:'m4', t:'08:08', who:'CONDUCTOR', bot:true, avatar:'C', role:'Bot',
    text:'/linked Vance quote → Opposition/dossier#v-2026-04-12 · added to Rapid Response queue',
    kind:'bot',
  },
  { id:'m5', t:'08:11', who:'Maria Chen', avatar:'MC', role:'Campaign Manager',
    text:'📎 Voice note 0:22',
    kind:'voice',
    voice:{ duration:'0:22', waveform:[3,5,8,4,6,9,12,8,5,3,6,10,14,12,9,7,5,4,3,6,8,5,3], transcript:'"Quick thought on framing — don\'t debate his words, reframe. \'Vance says market, we say neighbours.\' Pin that." '},
    reactions:[['💡',4],['🔥',2]],
  },
  { id:'m6', t:'08:14', who:'CONDUCTOR', bot:true, avatar:'C', role:'Bot',
    text:'/poll — Preferred framing for response? (3 hr)',
    kind:'poll',
    poll:{ q:'Which framing leads the response?', options:[
      { t:'Market vs. neighbours', v: 11 },
      { t:'What his kids will pay in rent', v: 7 },
      { t:'Numbers rebuttal (bylines)', v: 3 },
    ], total: 21 },
  },
  { id:'m7', t:'08:22', who:'Dex Thompson', avatar:'DT', role:'Comms Director',
    text:'Going with \'neighbours.\' Draft release in 20 min. @Maria sign-off before 9:00?',
    mentions:['Maria'], reactions:[['⏱',1]], thread:2,
  },
  { id:'m8', t:'08:25', who:'Maria Chen', avatar:'MC', role:'Campaign Manager',
    text:'On it. Also — Marcus should see this before Question Period prep at 12:30.',
    reactions:[['✅',3]], thread:0,
  },
  { id:'m9', t:'08:31', who:'Priya Shah', avatar:'PS', role:'Digital Lead',
    text:'Boost plan ready. Holding until release lands. 4 creatives queued, $2,400 authorized.',
    kind:'card',
    card:{ title:'Beacon boost — Vance response', meta:'4 creatives · $2,400 · holding', status:'QUEUED' },
    reactions:[['👍',2]],
  },
  { id:'m10', t:'08:40', who:'Ben Okafor', avatar:'BO', role:'Field Director',
    text:'Canvassers tonight: script addendum ready. 2 lines at the top reframing Vance. 30 sec to teach.',
    attach:{ kind:'file', name:'Script v4.2 — addendum.pdf', size:'48 KB' },
    reactions:[['🙏',1]],
  },
  { id:'m11', t:'08:52', who:'CONDUCTOR', bot:true, avatar:'C', role:'Bot',
    text:'/disappearing — This message visible for 24h. House count updated: 46 hard yes · 2 soft · 0 nay.',
    kind:'bot',
    disappearing:true,
  },
  { id:'m12', t:'09:01', who:'Marcus Hale', avatar:'MH', role:'MLA', mla:true,
    text:'Saw the voice note. Love \'neighbours.\' Can I get the draft 15 min before QP prep please. Also — thank you all for being on this by 8am.',
    reactions:[['❤️',8],['🫡',5]], thread:0,
  },
];

const CMD_THREAD = [
  { id:'t1', t:'08:03', who:'Priya Shah', avatar:'PS', text:'Grabbed a screenshot in case they edit the headline.' },
  { id:'t2', t:'08:05', who:'Dex Thompson', avatar:'DT', text:'Paywall is light — archive.today mirror here: archive.today/xK9q' },
  { id:'t3', t:'08:07', who:'Maria Chen', avatar:'MC', text:'Rapid-response in 20. Standing this up formally.' },
  { id:'t4', t:'08:10', who:'Ben Okafor', avatar:'BO', text:'Pulling the persuadable list — ~340 households.' },
];

const CMD_MEMBERS_IN_ROOM = [
  { name:'Dex Thompson', avatar:'DT', role:'Comms' },
  { name:'Maria Chen', avatar:'MC', role:'Manager' },
  { name:'Ben Okafor', avatar:'BO', role:'Field' },
  { name:'Priya Shah', avatar:'PS', role:'Digital' },
  { name:'Marcus Hale', avatar:'MH', role:'MLA', mla:true },
  { name:'Conductor', avatar:'C', role:'Bot', bot:true },
];

const CMD_SLASH = [
  { cmd:'/poll',         desc:'start a poll in this channel' },
  { cmd:'/disappearing', desc:'send a message that vanishes in 24h' },
  { cmd:'/huddle',       desc:'start a voice huddle' },
  { cmd:'/linked',       desc:'cross-link to another module' },
  { cmd:'/summary',      desc:'AI summary of last N messages' },
  { cmd:'/remind',       desc:'remind me about a message' },
  { cmd:'/file',         desc:'attach a file' },
  { cmd:'/shift',        desc:'broadcast to a shift (Field)' },
];

export { CMD_WORKSPACES, CMD_GROUPS, CMD_MESSAGES, CMD_THREAD, CMD_MEMBERS_IN_ROOM, CMD_SLASH };
