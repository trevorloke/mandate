// Site 2.0 — sample data
// Webflow/NationBuilder feel: pages, CMS collections, experiments, forms, audience, deploys

const SITE_PAGES = [
  { id:'p-home',     route:'/',                 title:'Home',                       template:'Landing · Hero',     status:'published', author:'Priya O.',  updated:'2h ago',  views7d: 18420, conv7d: 3.8, abTest:'hero-cta', size:'1.4 MB', publishedAt:'Apr 24', notes:'Primary entry. Hero swap test live.' },
  { id:'p-platform', route:'/platform',         title:'Platform',                   template:'Long-form',          status:'published', author:'Marcus L.', updated:'1d ago',  views7d:  9120, conv7d: 2.1, abTest:null,        size:'1.1 MB', publishedAt:'Apr 21' },
  { id:'p-donate',   route:'/donate',           title:'Donate',                     template:'Conversion',         status:'published', author:'Priya O.',  updated:'3h ago',  views7d:  6310, conv7d:11.4, abTest:'amount-ladder', size:'820 KB', publishedAt:'Apr 26' },
  { id:'p-vol',      route:'/volunteer',        title:'Volunteer',                  template:'Conversion',         status:'published', author:'Sasha N.',  updated:'5h ago',  views7d:  4870, conv7d: 8.7, abTest:null,        size:'760 KB', publishedAt:'Apr 26' },
  { id:'p-housing',  route:'/issues/housing',   title:'Housing for Working Families',template:'Issue page',         status:'published', author:'Marcus L.', updated:'2d ago',  views7d:  3940, conv7d: 1.9, abTest:null,        size:'1.0 MB', publishedAt:'Apr 19' },
  { id:'p-transit',  route:'/issues/transit',   title:'Transit That Works',         template:'Issue page',         status:'draft',     author:'Marcus L.', updated:'just now',views7d:    12, conv7d: 0.0, abTest:null,        size:'940 KB', publishedAt:'—' },
  { id:'p-careers',  route:'/team',             title:'Meet the Team',              template:'Editorial',          status:'published', author:'Sasha N.',  updated:'4d ago',  views7d:  2210, conv7d: 0.4, abTest:null,        size:'1.2 MB', publishedAt:'Apr 17' },
  { id:'p-press',    route:'/press',            title:'Press Room',                 template:'CMS feed',           status:'published', author:'Priya O.',  updated:'1d ago',  views7d:  1480, conv7d: 0.2, abTest:null,        size:'620 KB', publishedAt:'Apr 21' },
  { id:'p-thanks',   route:'/thanks',           title:'Thank you',                  template:'Receipt',            status:'published', author:'Sasha N.',  updated:'6d ago',  views7d:  3210, conv7d:null, abTest:null,        size:'180 KB', publishedAt:'Apr 15' },
  { id:'p-events',   route:'/events',           title:'Town Halls & Canvasses',     template:'CMS feed',           status:'published', author:'Sasha N.',  updated:'8h ago',  views7d:  2880, conv7d: 5.3, abTest:'card-style',size:'880 KB', publishedAt:'Apr 25' },
  { id:'p-endorse',  route:'/endorsements',     title:'Endorsements',               template:'CMS feed',           status:'published', author:'Priya O.',  updated:'1d ago',  views7d:  1110, conv7d: 0.6, abTest:null,        size:'700 KB', publishedAt:'Apr 22' },
  { id:'p-newpolicy',route:'/issues/childcare', title:'$10/day Childcare',          template:'Issue page',         status:'in-review', author:'Marcus L.', updated:'10m ago', views7d:     0, conv7d: 0.0, abTest:null,        size:'960 KB', publishedAt:'—' },
];

// Builder canvas — stylized layer tree for the Home page
const SITE_LAYER_TREE = [
  { id:'l1', name:'Page · Home',     type:'page',    depth:0, locked:true },
  { id:'l2', name:'Header / Nav',     type:'section', depth:1 },
  { id:'l3', name:'Logo',             type:'image',   depth:2 },
  { id:'l4', name:'Nav Links',        type:'nav',     depth:2 },
  { id:'l5', name:'Hero',             type:'section', depth:1, selected:true },
  { id:'l6', name:'Hero Eyebrow',     type:'text',    depth:2 },
  { id:'l7', name:'Hero Headline',    type:'text',    depth:2, bound:'cms.copy.hero.headline' },
  { id:'l8', name:'Hero Subhead',     type:'text',    depth:2 },
  { id:'l9', name:'CTA Group',        type:'group',   depth:2 },
  { id:'l10',name:'Donate Button',    type:'button',  depth:3, abVariant:'A' },
  { id:'l11',name:'Volunteer Button', type:'button',  depth:3 },
  { id:'l12',name:'Hero Photograph',  type:'image',   depth:2, bound:'cms.assets.hero-photo' },
  { id:'l13',name:'Issues Strip',     type:'section', depth:1 },
  { id:'l14',name:'Issue Cards (CMS)',type:'cms',     depth:2, bound:'cms.issues' },
  { id:'l15',name:'Endorsements',     type:'section', depth:1 },
  { id:'l16',name:'Endorsement Wall', type:'cms',     depth:2, bound:'cms.endorsements' },
  { id:'l17',name:'Footer',           type:'section', depth:1 },
];

// CMS collections
const SITE_COLLECTIONS = [
  { id:'c-issues',       name:'Issues',        items: 14, schema:['title','slug','summary','body','priority','tag','herophoto'], lastEdit:'2h ago',  publishedRefs: 4, draft:1 },
  { id:'c-news',         name:'News',          items: 47, schema:['headline','date','byline','body','category','feature'],       lastEdit:'1h ago',  publishedRefs: 1, draft:3 },
  { id:'c-endorsements', name:'Endorsements',  items: 86, schema:['name','title','org','quote','photo','tier'],                  lastEdit:'4h ago',  publishedRefs: 3, draft:0 },
  { id:'c-events',       name:'Events',        items: 22, schema:['title','date','location','rsvpUrl','cover','status'],         lastEdit:'8h ago',  publishedRefs: 2, draft:1 },
  { id:'c-press',        name:'Press releases',items: 31, schema:['title','date','body','contact'],                              lastEdit:'1d ago',  publishedRefs: 1, draft:2 },
  { id:'c-team',         name:'Team',          items: 18, schema:['name','role','bio','photo','order'],                          lastEdit:'4d ago',  publishedRefs: 1, draft:0 },
  { id:'c-faq',          name:'FAQ',           items: 24, schema:['question','answer','category','order'],                       lastEdit:'2d ago',  publishedRefs: 1, draft:0 },
];

// CMS rows for the "Issues" collection (shown when expanded)
const SITE_CMS_ISSUES = [
  { id:'i-housing',  title:'Housing for working families', slug:'housing',   priority:1, tag:'Affordability', status:'published', updated:'2d',   refs: 3 },
  { id:'i-transit',  title:'Transit that works',           slug:'transit',   priority:2, tag:'Mobility',      status:'draft',     updated:'1h',   refs: 0 },
  { id:'i-childcare',title:'$10/day childcare',            slug:'childcare', priority:3, tag:'Family',        status:'in-review', updated:'10m',  refs: 0 },
  { id:'i-climate',  title:'Climate-ready coastline',      slug:'climate',   priority:4, tag:'Environment',   status:'published', updated:'5d',   refs: 2 },
  { id:'i-jobs',     title:'Good union jobs',              slug:'jobs',      priority:5, tag:'Economy',       status:'published', updated:'1w',   refs: 1 },
  { id:'i-health',   title:'Closer family doctors',        slug:'health',    priority:6, tag:'Health',        status:'published', updated:'2w',   refs: 1 },
];

// A/B Experiments
const SITE_EXPERIMENTS = [
  {
    id:'x-hero',
    name:'Home hero CTA copy',
    page:'/',
    status:'running',
    started:'Apr 21',
    runningDays:6,
    metric:'Donate CTR',
    visitors: 12480,
    confidence: 0.94,
    variants: [
      { name:'A', label:'"Donate now"',           visitors: 6210, conv: 287, rate: 4.62 },
      { name:'B', label:'"Chip in $10"',          visitors: 6270, conv: 358, rate: 5.71 },
    ],
    winner: 'B',
    lift: '+23.6%',
  },
  {
    id:'x-amount',
    name:'Donate amount ladder',
    page:'/donate',
    status:'running',
    started:'Apr 19',
    runningDays:8,
    metric:'Avg. gift',
    visitors: 5840,
    confidence: 0.71,
    variants: [
      { name:'A', label:'$15 / 35 / 75 / 150',    visitors: 2920, conv: 318, rate:10.89, avg:'$42.10' },
      { name:'B', label:'$10 / 25 / 60 / 120',    visitors: 2920, conv: 372, rate:12.74, avg:'$38.40' },
    ],
    winner: null,
    lift: '+17% conv / −9% avg',
  },
  {
    id:'x-events',
    name:'Events card style',
    page:'/events',
    status:'running',
    started:'Apr 23',
    runningDays:4,
    metric:'RSVP click',
    visitors: 2410,
    confidence: 0.62,
    variants: [
      { name:'A', label:'Photo card',             visitors: 1210, conv: 118, rate: 9.75 },
      { name:'B', label:'Editorial card',         visitors: 1200, conv: 142, rate:11.83 },
    ],
    winner: null,
    lift: '+21.3%',
  },
  {
    id:'x-vol-hero',
    name:'Volunteer page hero photo',
    page:'/volunteer',
    status:'won',
    started:'Apr 09',
    runningDays:9,
    metric:'Signup rate',
    visitors: 8120,
    confidence: 0.99,
    variants: [
      { name:'A', label:'Door-knock photo',       visitors: 4060, conv: 318, rate: 7.83 },
      { name:'B', label:'Phone-bank photo',       visitors: 4060, conv: 412, rate:10.15 },
    ],
    winner: 'B',
    lift: '+29.6%',
  },
  {
    id:'x-platform-toc',
    name:'Platform table of contents',
    page:'/platform',
    status:'shipped',
    started:'Apr 02',
    runningDays:14,
    metric:'Scroll depth',
    visitors: 11200,
    confidence: 0.97,
    variants: [
      { name:'A', label:'No TOC',                 visitors: 5600, conv: 1120, rate:20.00 },
      { name:'B', label:'Sticky TOC',             visitors: 5600, conv: 1680, rate:30.00 },
    ],
    winner: 'B',
    lift: '+50.0%',
  },
  {
    id:'x-form-layout',
    name:'Donate form layout',
    page:'/donate',
    status:'paused',
    started:'Apr 15',
    runningDays:3,
    metric:'Form complete',
    visitors: 1820,
    confidence: 0.41,
    variants: [
      { name:'A', label:'Single column',          visitors: 910, conv: 64, rate: 7.03 },
      { name:'B', label:'Two-step wizard',        visitors: 910, conv: 71, rate: 7.80 },
    ],
    winner: null,
    lift: '+10.9% (low conf)',
    pauseReason: 'Step 2 page-error spike',
  },
];

// Forms
const SITE_FORMS = [
  { id:'f-donate',   name:'Donate',           page:'/donate',     fields:['amount','frequency','name','email','postal','card'], submits7d: 720, views7d: 6310, complete: 11.41, completionTime:'01:42', errors: 18 },
  { id:'f-vol',      name:'Volunteer signup', page:'/volunteer',  fields:['name','email','phone','postal','interests','availability'], submits7d: 423, views7d: 4870, complete: 8.69, completionTime:'02:08', errors:  9 },
  { id:'f-newsletter',name:'Newsletter',      page:'site-wide',   fields:['email','postal'],                                    submits7d:1240, views7d:18420, complete: 6.73, completionTime:'00:18', errors:  4 },
  { id:'f-event-rsvp',name:'Event RSVP',      page:'/events/*',   fields:['name','email','event','plus_one'],                   submits7d: 312, views7d: 2880, complete:10.83, completionTime:'00:54', errors:  3 },
  { id:'f-host',     name:'Host an event',    page:'/host',       fields:['name','email','phone','venue','capacity','date'],    submits7d:  47, views7d:  410, complete:11.46, completionTime:'03:21', errors:  5 },
  { id:'f-press',    name:'Press inquiry',    page:'/press',      fields:['outlet','name','email','deadline','question'],       submits7d:  19, views7d:  280, complete: 6.79, completionTime:'02:47', errors:  1 },
];

// Funnel for Donate
const SITE_DONATE_FUNNEL = [
  { step:'Land on /donate',     count: 6310, pct: 100 },
  { step:'Choose amount',       count: 4920, pct:  78 },
  { step:'Begin form',          count: 2480, pct:  39 },
  { step:'Submit card',         count:  840, pct:  13 },
  { step:'Confirm gift',        count:  720, pct:  11.4 },
];

// Audience
const SITE_AUDIENCE = {
  visitors7d:    44210,
  visitors_prev: 31040,
  newPct: 68,
  retPct: 32,
  avgSession: '01:38',
  bounce: 41.2,
  device: { mobile: 64, desktop: 31, tablet: 5 },
  sources: [
    { name:'Direct',          visitors: 11020, share: 24.9, trend:'+12%' },
    { name:'Organic search',  visitors:  9340, share: 21.1, trend:'+8%' },
    { name:'Email blast',     visitors:  7720, share: 17.5, trend:'+22%' },
    { name:'Instagram',       visitors:  6440, share: 14.6, trend:'+18%' },
    { name:'Paid (Meta)',     visitors:  4280, share:  9.7, trend:'+4%' },
    { name:'Referral',        visitors:  2810, share:  6.4, trend:'−3%' },
    { name:'TikTok',          visitors:  1520, share:  3.4, trend:'+42%' },
    { name:'Reddit',          visitors:  1080, share:  2.4, trend:'+11%' },
  ],
  topCountries: [
    { name:'Canada · BC',     visitors: 31040, share: 70.2 },
    { name:'Canada · other',  visitors:  8380, share: 19.0 },
    { name:'United States',   visitors:  3210, share:  7.3 },
    { name:'Other',           visitors:  1580, share:  3.6 },
  ],
  topPages: [
    { route:'/',                    visitors: 18420 },
    { route:'/donate',              visitors:  6310 },
    { route:'/volunteer',           visitors:  4870 },
    { route:'/issues/housing',      visitors:  3940 },
    { route:'/thanks',              visitors:  3210 },
    { route:'/events',              visitors:  2880 },
    { route:'/team',                visitors:  2210 },
  ],
};

// Deploy / version history
const SITE_DEPLOYS = [
  { id:'d-ax912', sha:'ax912d3', when:'2h ago',  by:'priya@', title:'Hero CTA copy test live', branch:'main',   status:'live',     pages: 1, ms: 480 },
  { id:'d-bf7a2', sha:'bf7a2c1', when:'9h ago',  by:'marcus@',title:'Add /issues/transit (draft)', branch:'main',status:'live',     pages: 1, ms: 380 },
  { id:'d-q19a4', sha:'q19a4ee', when:'1d ago',  by:'sasha@', title:'Volunteer hero swap (winner B)', branch:'main',status:'live',  pages: 1, ms: 410 },
  { id:'d-z44b1', sha:'z44b1f0', when:'1d ago',  by:'priya@', title:'Donate amount ladder · v3',  branch:'main', status:'live',     pages: 1, ms: 420 },
  { id:'d-m22c3', sha:'m22c3a8', when:'2d ago',  by:'marcus@',title:'Press releases x4 published', branch:'main',status:'live',     pages: 4, ms: 510 },
  { id:'d-r88d9', sha:'r88d9b7', when:'2d ago',  by:'priya@', title:'Footer policy links',         branch:'main',status:'live',     pages: 7, ms: 620 },
  { id:'d-fail1', sha:'k01x2a9', when:'3d ago',  by:'marcus@',title:'Bulk redirect import',        branch:'main',status:'rolled-back',pages: 9, ms: 980, error:'Broken /issues/* routes' },
  { id:'d-h44e5', sha:'h44e5d2', when:'3d ago',  by:'sasha@', title:'Endorsement wall · 12 new',   branch:'main',status:'live',     pages: 1, ms: 380 },
  { id:'d-e21f6', sha:'e21f6a1', when:'4d ago',  by:'priya@', title:'Site-wide nav redesign',      branch:'main',status:'live',     pages:12, ms: 920 },
];

// Lighthouse / SEO snapshot
const SITE_HEALTH = {
  lighthouse: { perf: 94, a11y: 98, bp: 100, seo: 100 },
  uptime: 99.98,
  ssl: 'A+',
  brokenLinks: 2,
  redirects: 47,
  cdnEdge: '14ms',
  forms404: 0,
};

export { SITE_PAGES, SITE_LAYER_TREE, SITE_COLLECTIONS, SITE_CMS_ISSUES, SITE_EXPERIMENTS, SITE_FORMS, SITE_DONATE_FUNNEL, SITE_AUDIENCE, SITE_DEPLOYS, SITE_HEALTH };