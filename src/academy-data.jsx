// Academy 2.0 — data

const ACAD_FACULTY = [
  { id:'f-sandhu', name:'Premier Sandhu', title:'Mandate · Premier of British Columbia', bio:'Two-term mayor of Vancouver before provincial leadership. Author of "The Quiet Mandate" (2024).', courses: 4, students: 1840 },
  { id:'f-singh',  name:'Dr. Renée Singh', title:'Chief Economist · Mandate Policy Bureau', bio:'Former IMF senior advisor. Specialty: housing economics, public finance.', courses: 3, students: 920 },
  { id:'f-lin',    name:'Marcus Lin', title:'Field Director · Pacific Region', bio:'Veteran of seven federal & provincial campaigns. Architect of the 2024 turnout model.', courses: 6, students: 3120 },
  { id:'f-okafor', name:'Priya Okafor', title:'Comms Director · Mandate', bio:'Award-winning broadcast journalist (CBC, 12 yrs) before joining Mandate. Master of the cold doorstep.', courses: 5, students: 2240 },
  { id:'f-cohn',   name:'Mike Cohn', title:'Senior Organizer · Mount Pleasant', bio:'Twenty-year community organizer. Wrote the canvasser handbook.', courses: 8, students: 4980 },
  { id:'f-romero', name:'Marisol Romero', title:'Volunteer Coordinator · Burnaby', bio:'Organizes the largest student volunteer corps in the province.', courses: 2, students: 540 },
];

const ACAD_CATEGORIES = ['Field & Canvass','Policy & Briefings','Communications','Compliance & Ethics','Leadership','Digital Tools'];

const ACAD_COURSES = [
  // Featured
  { id:'c-doorstep', cat:'Field & Canvass', title:'The Doorstep Conversation', sub:'Twelve techniques for the cold door, from a man who has knocked 11,000 of them.',
    instructor:'Mike Cohn', instructorId:'f-cohn',
    duration:'4h 12m', chapters:9, level:'Foundational', students:1842, rating:4.9,
    progress:0.32, gradient:'linear-gradient(135deg, #2b251c 0%, #4a3d2e 60%, #14110d 100%)',
    featured:true, required:true,
    tagline:'A Masterclass in the original political technology — talking to a stranger.',
    chapterList:[
      { n:1, t:'Why we still knock', d:'12:18', done:true, sub:'Origins · the moral economy of the door' },
      { n:2, t:'The first six seconds', d:'18:42', done:true, sub:'Posture, distance, opening line' },
      { n:3, t:'Listening as persuasion', d:'24:06', done:true, sub:'Three questions, one answer' },
      { n:4, t:'The hard door', d:'21:30', now:true, sub:'When they don\'t want to talk' },
      { n:5, t:'Issue, story, ask', d:'28:14', sub:'The arc of a 90-second pitch' },
      { n:6, t:'Reading the porch', d:'15:48', sub:'Signs, signage, the dog' },
      { n:7, t:'When you disagree', d:'22:02', sub:'Holding ground without losing them' },
      { n:8, t:'The voter ID call', d:'19:54', sub:'After the door — recording the lift' },
      { n:9, t:'Walking off', d:'14:20', sub:'Closing well — and the next door' },
    ]
  },
  { id:'c-policy-housing', cat:'Policy & Briefings', title:'Housing · The Mandate', sub:'A 90-minute economist\'s tour of the housing crisis and our policy.', instructor:'Dr. Renée Singh', instructorId:'f-singh', duration:'1h 32m', chapters:6, level:'Core', students:920, rating:4.8, progress:0.0, gradient:'linear-gradient(135deg, #1f3a2e 0%, #0a1610 100%)', required:true },
  { id:'c-budget',   cat:'Policy & Briefings', title:'Reading a Provincial Budget', sub:'Line items, votes, contingencies — what to look for in 280 pages.', instructor:'Dr. Renée Singh', instructorId:'f-singh', duration:'2h 18m', chapters:7, level:'Intermediate', students:680, rating:4.7, progress:0.0, gradient:'linear-gradient(135deg, #1a1a2e 0%, #0a0a14 100%)' },
  { id:'c-comms',    cat:'Communications', title:'On Camera, Under Pressure', sub:'The 11-second rule. Bridging. Refusing the false premise without seeming to.', instructor:'Priya Okafor', instructorId:'f-okafor', duration:'3h 48m', chapters:8, level:'Advanced', students:1240, rating:4.9, progress:0.62, gradient:'linear-gradient(135deg, #2b1f1a 0%, #14110d 100%)' },
  { id:'c-message',  cat:'Communications', title:'Message Discipline', sub:'How a campaign of 4,000 volunteers says one coherent thing.', instructor:'Priya Okafor', instructorId:'f-okafor', duration:'2h 04m', chapters:6, level:'Core', students:980, rating:4.7, progress:1.0, completed:true, gradient:'linear-gradient(135deg, #2e1f2b 0%, #14110d 100%)' },
  { id:'c-elxa',     cat:'Compliance & Ethics', title:'Elections BC, Plainly', sub:'Contribution limits, expense periods, what to file when. With a section lawyer.', instructor:'Premier Sandhu', instructorId:'f-sandhu', duration:'1h 48m', chapters:5, level:'Required', students:2400, rating:4.6, progress:1.0, completed:true, required:true, gradient:'linear-gradient(135deg, #1c2b1f 0%, #0a140a 100%)' },
  { id:'c-mobilize', cat:'Field & Canvass', title:'Mobilization Math', sub:'Universe, contact rate, ID rate, lift, drop-off, turnout. Building the model.', instructor:'Marcus Lin', instructorId:'f-lin', duration:'2h 36m', chapters:7, level:'Advanced', students:540, rating:4.9, progress:0.0, gradient:'linear-gradient(135deg, #14252e 0%, #0a1014 100%)' },
  { id:'c-gotv',     cat:'Field & Canvass', title:'GOTV — The Last 96 Hours', sub:'How a field operation collapses time in the final four days.', instructor:'Marcus Lin', instructorId:'f-lin', duration:'3h 12m', chapters:8, level:'Advanced', students:780, rating:4.8, progress:0.0, gradient:'linear-gradient(135deg, #2e1414 0%, #140a0a 100%)' },
  { id:'c-leader',   cat:'Leadership', title:'Running a Hub', sub:'Chairs of canvass hubs — daily rhythm, captain handoffs, escalation.', instructor:'Marisol Romero', instructorId:'f-romero', duration:'1h 22m', chapters:5, level:'Intermediate', students:340, rating:4.7, progress:0.0, gradient:'linear-gradient(135deg, #2b1f14 0%, #14110d 100%)' },
  { id:'c-tools',    cat:'Digital Tools', title:'The Mandate Stack · A Tour', sub:'Ground, Command, Beacon — what you need on Day 1.', instructor:'Mike Cohn', instructorId:'f-cohn', duration:'58m', chapters:4, level:'Onboarding', students:4220, rating:4.5, progress:0.75, required:true, gradient:'linear-gradient(135deg, #1c1c1c 0%, #0a0a0a 100%)' },
];

const ACAD_ARTICLES = [
  { id:'a-doorstep-grammar', kicker:'Field · Briefing №14', title:'The Grammar of the Doorstep',
    deck:'Why the first six seconds matter more than the next six minutes — and what twenty years of canvass tape teach us.',
    author:'Mike Cohn', date:'21 Apr · 14 min read', lead:true,
    pull:'A door is not a poll. It is a conversation, and the rules of conversation predate the rules of polling by ten thousand years.' },
  { id:'a-housing-numbers', kicker:'Policy · Brief',  title:'The Numbers Behind The Mandate · Housing',
    deck:'Three charts every volunteer should be able to draw on a napkin.',
    author:'Dr. Renée Singh', date:'19 Apr · 8 min read' },
  { id:'a-rural', kicker:'Field · Field notes', title:'What the Interior Heard',
    deck:'Notes from four days canvassing the Cariboo — and a warning about our message.',
    author:'Marcus Lin', date:'17 Apr · 11 min read' },
  { id:'a-camera', kicker:'Comms · Practical', title:'Eleven Seconds, And You',
    deck:'A short, practical guide to local TV from someone who used to run it.',
    author:'Priya Okafor', date:'15 Apr · 6 min read' },
  { id:'a-mandate', kicker:'Editorial', title:'On The Word "Mandate"',
    deck:'A short essay, by the Premier, on why we chose this word for the second term.',
    author:'Premier Sandhu', date:'12 Apr · 9 min read' },
];

const ACAD_TRANSCRIPT = [
  { ts:'18:42', text:'You\'re going to get the hard door. You will. Probably this afternoon. The trick — and it\'s the only trick — is to remember that the hard door is not about you.' },
  { ts:'19:08', text:'The person on the other side has had a day. They were promised something by someone like you, two years ago, six years ago, and it didn\'t happen. So now you\'re standing on their porch and you are paying interest on a debt you didn\'t take out.' },
  { ts:'19:36', text:'Your job is not to argue with them. Your job is not to convert them. Your job, in the first thirty seconds, is to make the cost of being civil to you lower than the cost of being rude. That\'s it. That\'s the whole game.', now:true },
  { ts:'20:14', text:'Here are the four moves. One: name yourself plainly. Not the campaign. You. "Hi, I\'m Mike, I live three blocks over." Now they know two things: you are a person, and you are a neighbour.' },
  { ts:'20:42', pull:true, text:'The hard door is not a referendum on your candidate. It is a referendum on whether you are worth the next thirty seconds of their life.' },
  { ts:'21:08', text:'Two: ask permission to be there. "Have you got a minute?" — and mean it. If they say no, you say "thanks for opening the door" and you go. You go. The next house is more valuable than this one becoming worse.' },
  { ts:'21:36', text:'Three: ask a question first. Not "what do you think of the Premier." Not "are you voting." Ask: "what\'s the thing on your mind, in this neighbourhood?" Then shut up. Take notes. Listen for ninety seconds before you say a single thing about us.' },
];

const ACAD_PATH_SCHED = [
  { d:29, mo:'APR', w:'GOTV captain training · Cohort B', s:'Live · Marcus Lin', t:'7 → 8:30 PM', tag:'live' },
  { d:30, mo:'APR', w:'Compliance refresh · Q2', s:'Self-paced · due Friday', t:'1h 48m', tag:'due' },
  { d: 2, mo:'MAY', w:'Doorstep clinic — Mount Pleasant',  s:'In person · Strathcona Hall', t:'10 AM', tag:'in-person' },
  { d: 5, mo:'MAY', w:'Office hours · Premier Sandhu',     s:'Live Q&A · open to all',     t:'4 → 4:45 PM', tag:'live' },
];

const ACAD_PATH_CERTS = [
  { id:'cert-elxa',     name:'Elections BC · Compliance',     date:'Issued 14 Mar 2026', earned:true },
  { id:'cert-onboard',  name:'Mandate · Volunteer Onboarding',date:'Issued 02 Mar 2026', earned:true },
  { id:'cert-message',  name:'Message Discipline',            date:'Issued 18 Apr 2026', earned:true },
  { id:'cert-canvass',  name:'Senior Canvasser',              date:'Locked · 3 of 5 modules', earned:false },
  { id:'cert-captain',  name:'Hub Captain',                   date:'Locked · prereq pending', earned:false },
  { id:'cert-trainer',  name:'Faculty / Trainer',             date:'Locked · invite-only',    earned:false },
];

export { ACAD_FACULTY, ACAD_CATEGORIES, ACAD_COURSES, ACAD_ARTICLES, ACAD_TRANSCRIPT, ACAD_PATH_SCHED, ACAD_PATH_CERTS };
