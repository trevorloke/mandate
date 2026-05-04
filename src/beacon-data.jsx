// Mandate 2.0 — Beacon data

const BEACON_ACCOUNTS = [
  { id:'x-marcus',   kind:'x',       handle:'@MarcusHale_MLA',  name:'Marcus Hale — MLA',        followers:'14.2K', active:true },
  { id:'ig-marcus',  kind:'ig',      handle:'@marcushale.mla',  name:'Marcus Hale — Instagram',  followers:'6.8K' },
  { id:'fb-marcus',  kind:'fb',      handle:'Marcus Hale',      name:'Marcus Hale — Facebook',   followers:'22.1K' },
  { id:'tt-marcus',  kind:'tt',      handle:'@marcushale.bc',   name:'Marcus Hale — TikTok',     followers:'4.1K' },
  { id:'li-marcus',  kind:'li',      handle:'marcus-hale',      name:'Marcus Hale — LinkedIn',   followers:'3.2K' },
  { id:'x-party',    kind:'x',       handle:'@NewWest_Party',   name:'New Westminster Caucus',   followers:'41.0K' },
  { id:'news',       kind:'news',    handle:'press list',       name:'Press list — 184 outlets', followers:'184 outlets' },
  { id:'yt',         kind:'yt',      handle:'@MarcusHale',      name:'Marcus Hale — YouTube',    followers:'1.4K' },
];

// ── 7-day publishing calendar
const BEACON_DAYS = [
  { key:'mon', label:'MON · Apr 14', date:'04.14', today:true },
  { key:'tue', label:'TUE · Apr 15', date:'04.15' },
  { key:'wed', label:'WED · Apr 16', date:'04.16' },
  { key:'thu', label:'THU · Apr 17', date:'04.17' },
  { key:'fri', label:'FRI · Apr 18', date:'04.18' },
  { key:'sat', label:'SAT · Apr 19', date:'04.19' },
  { key:'sun', label:'SUN · Apr 20', date:'04.20' },
];

// ── Scheduled posts (laid out across week)
const BEACON_POSTS = [
  { id:'p1',  day:'mon', slot:'07:00', platform:'x',  status:'LIVE',      headline:'Rapid response · Vance on housing',
    body:'"Market will sort itself out." Vance\'s words. Ours: it\'s about neighbours, not markets.',
    author:'Dex T.', signoff:'approved', boost:{spend:'$1,200', state:'ACTIVE'}, stats:{imp:'14.2K', eng:'3.1%'}, urgent:true },
  { id:'p2',  day:'mon', slot:'09:15', platform:'ig', status:'LIVE',      headline:'Post · Mt. Pleasant doorstep',
    body:'Photo carousel from Saturday. 340 doors, 89 conversations.', stats:{imp:'8.4K', eng:'5.2%'} },
  { id:'p3',  day:'mon', slot:'12:30', platform:'x',  status:'DRAFT',     headline:'QP response · housing follow-up',
    body:'Thread (4 tweets). Numbers on BC rent increases vs. Vance claim. Charts attached.',
    author:'Maria C.', signoff:'needs-mla', required:true },
  { id:'p4',  day:'mon', slot:'17:00', platform:'fb', status:'SCHEDULED', headline:'Long-form · Kids shouldn\'t need 6 roommates',
    body:'Facebook essay — 820 words. The personal story of Tamsin, 24, nurse at Royal Columbian.',
    author:'Dex T.', signoff:'needs-dex' },
  { id:'p5',  day:'mon', slot:'19:45', platform:'tt', status:'DRAFT',     headline:'30-sec · Reframe clip',
    body:'Vance quote → cut to Marcus at the doorstep. Caption: "Different words. Different math."',
    author:'Priya S.', signoff:'needs-mla' },

  { id:'p6',  day:'tue', slot:'07:30', platform:'x',  status:'SCHEDULED', headline:'Morning · Rent stats thread',
    body:'3-tweet thread on 2015-2025 rent growth in Meridian West. Chart-per-tweet.',
    signoff:'approved' },
  { id:'p7',  day:'tue', slot:'12:00', platform:'li', status:'SCHEDULED', headline:'LinkedIn · Op-ed teaser',
    body:'Linking to op-ed running in Tyee Tuesday afternoon. "Housing is a jobs issue too."' },
  { id:'p8',  day:'tue', slot:'18:00', platform:'ig', status:'SCHEDULED', headline:'Reel · Town hall clips',
    body:'Best 18s from Monday town hall. Three emotional beats, subtitled, no music.',
    signoff:'approved' },

  { id:'p9',  day:'wed', slot:'08:00', platform:'x',  status:'SCHEDULED', headline:'Press hit · Tyee op-ed live',
    body:'Sharing the op-ed with pull quote. Tag @thetyee.',
    boost:{spend:'$400', state:'PLANNED'} },
  { id:'p10', day:'wed', slot:'14:00', platform:'fb', status:'HOLD',      headline:'Bill tracker update',
    body:'Holding until we have clarity on caucus line.', signoff:'legal-hold' },
  { id:'p11', day:'wed', slot:'20:00', platform:'yt', status:'DRAFT',     headline:'YouTube · 6-min townhall recap',
    body:'Editor: Priya. First cut ready by Tuesday night.', signoff:'needs-mla' },

  { id:'p12', day:'thu', slot:'09:00', platform:'x',  status:'SCHEDULED', headline:'Bill X-14 readback',
    body:'If the vote goes as projected — celebration thread. If not — accountability thread (v2 drafted).',
    signoff:'conditional' },
  { id:'p13', day:'thu', slot:'13:15', platform:'ig', status:'SCHEDULED', headline:'Story takeover · Tamsin the nurse',
    body:'24h story run. 11 frames. Approved by subject.', signoff:'approved' },
  { id:'p14', day:'thu', slot:'17:00', platform:'tt', status:'DRAFT',     headline:'60-sec explainer · Bill X-14',
    body:'What it actually does, in plain words. Whiteboard style.', signoff:'needs-mla' },

  { id:'p15', day:'fri', slot:'07:00', platform:'x',  status:'SCHEDULED', headline:'Friday weekly · 3 things',
    body:'Template post. 3 things done, 1 thing learned, 1 ask.', signoff:'approved' },
  { id:'p16', day:'fri', slot:'11:00', platform:'news', status:'SCHEDULED', headline:'Press release · Committee vote',
    body:'Embargoed to Friday 11am. 184 outlets on press list.', signoff:'approved' },

  { id:'p17', day:'sat', slot:'10:00', platform:'ig', status:'SCHEDULED', headline:'Canvass kickoff · Saturday',
    body:'Story series, real-time from Mt. Pleasant canvass. Volunteer permission confirmed.',
    signoff:'approved' },

  { id:'p18', day:'sun', slot:'18:00', platform:'fb', status:'SCHEDULED', headline:'Week in review',
    body:'Sunday evening newsletter cross-post. Facebook essay version.', signoff:'approved' },
];

// ── Listening stream — mentions, keywords, news
const BEACON_LISTENING = [
  { id:'l1', t:'08:47', src:'The Tyee', kind:'news',
    title:'"Vance housing remarks \'tone-deaf\' say tenant groups"',
    quote:'… drew sharp response across the lower mainland, including from @MarcusHale_MLA who called the framing "not a market problem."',
    sentiment:'pos', reach:'44K', url:'thetyee.ca/…' },
  { id:'l2', t:'08:31', src:'@justine_h', kind:'x',
    title:'@justine_h · 8.2K followers',
    quote:'"@MarcusHale_MLA\'s framing here is exactly right. \'Neighbours, not markets.\' This is the line." — 412 RT, 2.1K likes',
    sentiment:'pos', reach:'12K' },
  { id:'l3', t:'08:28', src:'Vancouver Sun', kind:'news',
    title:'Vance: "Market will sort itself out" on housing',
    quote:'Opposition leader comments defending status-quo approach in Monday morning radio interview.',
    sentiment:'neg', reach:'112K', isSource:true },
  { id:'l4', t:'08:24', src:'Reddit r/vancouver', kind:'reddit',
    title:'"Marcus Hale\'s response to Vance quote (screenshot)"',
    quote:'314 upvotes, 82 comments. Top comment: "finally someone answering the actual question."',
    sentiment:'pos', reach:'18K' },
  { id:'l5', t:'08:18', src:'@bc_rentwatch', kind:'x',
    title:'@bc_rentwatch · 3.1K followers',
    quote:'Compiled the last 6 quotes from Vance on housing. The "market" framing comes up in all of them. Thread.',
    sentiment:'neutral', reach:'6K' },
  { id:'l6', t:'08:12', src:'CBC BC', kind:'news',
    title:'Monday Politics Podcast leads with housing spat',
    quote:'48-minute episode. Marcus Hale segment at 14:20. Quote runs clean.',
    sentiment:'pos', reach:'31K', url:'cbc.ca/…' },
  { id:'l7', t:'08:04', src:'@AnonVanc0uver', kind:'x',
    title:'@AnonVanc0uver · 1.2K followers',
    quote:'"Hale is a career politician just like the rest, wake me when he votes differently than his caucus." — 14 RT',
    sentiment:'neg', reach:'800' },
  { id:'l8', t:'07:56', src:'Keyword alert', kind:'alert',
    title:'"Meridian West" mentions ↑ 340% vs. last Monday 8am',
    quote:'Spike correlates with Vance quote. 127 unique authors. Sentiment: 62% pos / 24% neutral / 14% neg.',
    sentiment:'pos' },
];

// ── Approvals queue
const BEACON_APPROVALS = [
  { id:'a1', post:'p3',  platform:'x',  headline:'QP response · housing follow-up',
    requester:'Maria C.', waiting:'8m', required:'MLA sign-off', priority:'urgent' },
  { id:'a2', post:'p5',  platform:'tt', headline:'30-sec · Reframe clip',
    requester:'Priya S.', waiting:'24m', required:'MLA sign-off', priority:'normal' },
  { id:'a3', post:'p11', platform:'yt', headline:'YouTube · 6-min townhall recap',
    requester:'Priya S.', waiting:'2h', required:'MLA sign-off', priority:'normal' },
  { id:'a4', post:'p14', platform:'tt', headline:'60-sec explainer · Bill X-14',
    requester:'Dex T.', waiting:'4h', required:'MLA sign-off', priority:'normal' },
  { id:'a5', post:'p4',  platform:'fb', headline:'Facebook essay · Kids shouldn\'t need 6 roommates',
    requester:'Dex T.', waiting:'1h', required:'Comms director review', priority:'normal' },
];

// ── Top ribbon metrics
const BEACON_METRICS = [
  { key:'sov',      label:'SHARE OF VOICE',     val:'34.2%', delta:'+6.1pt vs. Vance', tone:'pos',
    sub:'Measured across 41 BC outlets + X mentions, rolling 24h.',
    spark:[22,24,21,23,28,30,32,34.2] },
  { key:'sent',     label:'SENTIMENT (24h)',    val:'+62',   delta:'↑ from +48',      tone:'pos',
    sub:'(positive − negative) / total, weighted by reach.',
    spark:[44,48,52,51,55,58,60,62] },
  { key:'reach',    label:'REACH TODAY',        val:'284K',  delta:'across all channels', tone:'neutral',
    sub:'Unique impressions today 00:00 → now.',
    spark:[12,45,88,120,160,210,250,284] },
  { key:'approval', label:'AWAITING APPROVAL',  val:'5',     delta:'1 urgent',         tone:'warn',
    sub:'Posts blocked on sign-off. Oldest item: 4h.',
    spark:[2,3,2,3,4,5,4,5] },
];

export { BEACON_ACCOUNTS, BEACON_DAYS, BEACON_POSTS, BEACON_LISTENING, BEACON_APPROVALS, BEACON_METRICS };
