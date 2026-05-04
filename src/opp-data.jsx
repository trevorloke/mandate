// Opposition 2.0 — investigative dossier desk.
// Object model: Targets · Claims · Evidence · Leads · Rebuttals · Monitors · Surrogates · Press

// ═══ TARGETS — opposition figures we research ═══
const OP_TARGETS = [
  {
    id: 'tg-vance', name: 'Brett Vance', party: 'Forward Coalition', role: 'Leader of the Opposition',
    riding: 'Crestview-Heights', threat: 'critical',
    photo: 'BV',
    portfolio: ['Finance', 'Public Safety'],
    voteShare2024: 0.41, headToHead: -0.03,
    dossierStatus: 'live', evidenceCount: 47, claimsTracked: 18, openLeads: 4,
    note: 'Primary opponent. Hawk on policing. Money trail thin in 2018-22.',
    weaknesses: ['developer ties', 'caucus discipline', 'insurance vote 2022'],
    strengths: ['polished media', 'rural base', 'fiscal credibility'],
    cohort: ['MN Caucus', 'Westgrove Lobby', 'Pacific Coast Realty PAC'],
    lastSeen: '2026-03-10',
    ourStandingsVs: { name: 47, recall: 71, fav: -8 },
  },
  {
    id: 'tg-rosso', name: 'Maria Rosso', party: 'Forward Coalition', role: 'Deputy Leader · Finance Critic',
    riding: 'Northshore', threat: 'high', photo: 'MR',
    portfolio: ['Finance', 'Crown Corps'],
    voteShare2024: 0.38, headToHead: -0.06,
    dossierStatus: 'live', evidenceCount: 31, claimsTracked: 11, openLeads: 2,
    note: 'Sharp on numbers, weaker on housing. Family stake in Northshore Mining.',
    weaknesses: ['conflict of interest', 'housing voting record'],
    strengths: ['debate prep', 'media training'],
    cohort: ['Northshore Mining', 'BC Chamber'],
    lastSeen: '2026-03-09',
    ourStandingsVs: { name: 28, recall: 49, fav: +2 },
  },
  {
    id: 'tg-okeefe', name: 'Tom O\u2019Keefe', party: 'Forward Coalition', role: 'Housing Critic',
    riding: 'Eastbridge', threat: 'medium', photo: 'TO',
    portfolio: ['Housing', 'Municipal Affairs'],
    voteShare2024: 0.34, headToHead: +0.02,
    dossierStatus: 'live', evidenceCount: 22, claimsTracked: 9, openLeads: 3,
    note: 'Talks renter populism, votes landlord. Three contradictions on record.',
    weaknesses: ['contradictory voting record', 'developer donations'],
    strengths: ['working-class affect', 'name recognition local'],
    cohort: ['BC Apartment Owners Assn', 'Eastbridge Realtors'],
    lastSeen: '2026-03-08',
    ourStandingsVs: { name: 18, recall: 31, fav: +5 },
  },
  {
    id: 'tg-laing', name: 'Susan Laing', party: 'Forward Coalition', role: 'Health Critic',
    riding: 'Maple Ridge', threat: 'medium', photo: 'SL',
    portfolio: ['Health', 'Mental Health'],
    voteShare2024: 0.36, headToHead: -0.01,
    dossierStatus: 'monitoring', evidenceCount: 9, claimsTracked: 5, openLeads: 1,
    note: 'Former hospital admin. Credible on health. Soft on policy details.',
    weaknesses: ['hospital privatization vote 2019'],
    strengths: ['professional credentials'],
    cohort: ['Pacific Health Group', 'Catholic Health Alliance'],
    lastSeen: '2026-03-07',
    ourStandingsVs: { name: 12, recall: 19, fav: +3 },
  },
  {
    id: 'tg-3p-grin',  name: 'Dan Grinnell',  party: 'BC United',          role: 'Leader',     riding: 'Vancouver-Pt Grey', threat: 'low',    photo: 'DG', portfolio: ['general'], voteShare2024: 0.07, headToHead: 0, dossierStatus: 'monitoring', evidenceCount: 4, claimsTracked: 3, openLeads: 0, note: 'Spoiler risk in suburbs.', weaknesses: [], strengths: [], cohort: [], lastSeen: '2026-03-06', ourStandingsVs: { name: 6, recall: 8, fav: 0 } },
  {
    id: 'tg-3p-singh', name: 'Devinder Singh', party: 'Greens',             role: 'Leader',     riding: 'Saanich North',     threat: 'low',    photo: 'DS', portfolio: ['climate'], voteShare2024: 0.09, headToHead: 0, dossierStatus: 'monitoring', evidenceCount: 5, claimsTracked: 2, openLeads: 0, note: 'Aligned on climate; spoiler in 4 ridings.', weaknesses: [], strengths: [], cohort: [], lastSeen: '2026-03-05', ourStandingsVs: { name: 9, recall: 14, fav: +1 } },
];

// ═══ CLAIMS — every public statement worth tracking, with our verdict ═══
const OP_CLAIMS = [
  { id: 'cl-1',  target: 'tg-vance',  date: '2026-03-10', venue: 'Question Period',     channel: 'chamber',
    quote: 'The government has added forty thousand new bureaucrats since 2024.',
    topic: 'civil-service', subject: 'public-sector', verdict: 'false', evidenceIds: ['ev-1','ev-2'],
    rebuttalId: 'rb-1', visibility: 'high', clipMin: '00:14', heat: 0.82 },
  { id: 'cl-2',  target: 'tg-vance',  date: '2026-03-09', venue: 'Global BC',            channel: 'tv',
    quote: 'Crime has doubled in our cities under this government.',
    topic: 'public-safety', subject: 'crime', verdict: 'misleading', evidenceIds: ['ev-3','ev-4','ev-5'],
    rebuttalId: 'rb-2', visibility: 'high', clipMin: '02:48', heat: 0.74 },
  { id: 'cl-3',  target: 'tg-vance',  date: '2026-03-07', venue: 'Op-ed · Sun',          channel: 'print',
    quote: 'Bill 14 will hike fares by 38% on working families.',
    topic: 'transit', subject: 'bill-14', verdict: 'false', evidenceIds: ['ev-6','ev-7'],
    rebuttalId: 'rb-3', visibility: 'medium', clipMin: null, heat: 0.55 },
  { id: 'cl-4',  target: 'tg-vance',  date: '2026-03-04', venue: 'Town Hall · Surrey',   channel: 'event',
    quote: 'My party has always supported renters. Always.',
    topic: 'housing', subject: 'rentals', verdict: 'contradicted-self', evidenceIds: ['ev-8','ev-9','ev-10'],
    rebuttalId: 'rb-4', visibility: 'low', clipMin: '11:32', heat: 0.66 },
  { id: 'cl-5',  target: 'tg-rosso',  date: '2026-03-09', venue: 'Estimates · Finance',  channel: 'chamber',
    quote: 'The minister has cooked the books on the carbon receipt.',
    topic: 'climate', subject: 'carbon-rebate', verdict: 'false', evidenceIds: ['ev-11','ev-12'],
    rebuttalId: 'rb-5', visibility: 'medium', clipMin: '04:11', heat: 0.48 },
  { id: 'cl-6',  target: 'tg-rosso',  date: '2026-03-05', venue: 'CBC Radio',            channel: 'radio',
    quote: 'I have no investment, direct or indirect, in any extraction company.',
    topic: 'ethics', subject: 'conflict', verdict: 'contradicted-record', evidenceIds: ['ev-13','ev-14'],
    rebuttalId: 'rb-6', visibility: 'high', clipMin: '08:22', heat: 0.91 },
  { id: 'cl-7',  target: 'tg-okeefe', date: '2026-03-08', venue: 'Twitter',              channel: 'social',
    quote: 'I have never accepted a dollar from developer interests.',
    topic: 'ethics', subject: 'donations', verdict: 'false', evidenceIds: ['ev-15','ev-16'],
    rebuttalId: 'rb-7', visibility: 'medium', clipMin: null, heat: 0.62 },
  { id: 'cl-8',  target: 'tg-okeefe', date: '2026-03-02', venue: 'Riding Q&A',           channel: 'event',
    quote: 'Eastbridge needs more rental supply, not regulations.',
    topic: 'housing', subject: 'rentals', verdict: 'arguable', evidenceIds: ['ev-17'],
    rebuttalId: 'rb-8', visibility: 'low', clipMin: null, heat: 0.21 },
  { id: 'cl-9',  target: 'tg-laing',  date: '2026-03-06', venue: 'Health Cttee',         channel: 'committee',
    quote: 'ER wait times are the worst in Canadian history.',
    topic: 'health', subject: 'er-times', verdict: 'misleading', evidenceIds: ['ev-18','ev-19'],
    rebuttalId: 'rb-9', visibility: 'medium', clipMin: '00:42', heat: 0.39 },
  { id: 'cl-10', target: 'tg-vance',  date: '2026-02-28', venue: 'Caucus pres',           channel: 'leak',
    quote: 'We could finish them off in the suburbs by July.',
    topic: 'strategy', subject: 'campaign', verdict: 'true · damaging', evidenceIds: ['ev-20'],
    rebuttalId: null, visibility: 'high', clipMin: null, heat: 0.88 },
  { id: 'cl-11', target: 'tg-vance',  date: '2026-02-22', venue: 'Editorial board',       channel: 'print',
    quote: 'I would never work with the Greens.',
    topic: 'coalition', subject: 'positioning', verdict: 'contradicted-self', evidenceIds: ['ev-21','ev-22'],
    rebuttalId: 'rb-10', visibility: 'low', clipMin: null, heat: 0.34 },
  { id: 'cl-12', target: 'tg-rosso',  date: '2026-02-19', venue: 'Industry breakfast',    channel: 'event',
    quote: 'The carbon tax is killing every farmer in this province.',
    topic: 'climate', subject: 'carbon-tax', verdict: 'misleading', evidenceIds: ['ev-23'],
    rebuttalId: 'rb-11', visibility: 'low', clipMin: null, heat: 0.27 },
];

// ═══ EVIDENCE — sourced documents/clips with strength ratings ═══
const OP_EVIDENCE = [
  { id: 'ev-1',  kind: 'gov-data',   title: 'BC Public Service Agency · headcount Q4 2024 → Q4 2025', source: 'BCPSA Annual Report', date: '2026-01-15', strength: 'A',  vault: 'public', linked: ['cl-1'],         summary: 'Net change +2,840 FTE, not 40,000.' },
  { id: 'ev-2',  kind: 'press',      title: 'Globe & Mail fact-check · Vance hiring claim',           source: 'Globe & Mail',         date: '2026-03-10', strength: 'B+', vault: 'public', linked: ['cl-1'],         summary: 'Independent fact-check rates claim FALSE.' },
  { id: 'ev-3',  kind: 'gov-data',   title: 'StatsCan crime severity index · 2018 vs 2025',           source: 'Statistics Canada',    date: '2026-02-01', strength: 'A',  vault: 'public', linked: ['cl-2'],         summary: 'CSI down 4% provincial, up 11% violent. NOT doubled.' },
  { id: 'ev-4',  kind: 'press',      title: 'BC Crime Stoppers report 2025',                          source: 'BC Crime Stoppers',    date: '2025-12-12', strength: 'B',  vault: 'public', linked: ['cl-2'],         summary: 'Property crime up, persons crime mixed. \u201CDoubled\u201D not supported.' },
  { id: 'ev-5',  kind: 'video',      title: 'Vance \u201Cdoubled\u201D clip · Global BC',             source: 'Global BC archive',    date: '2026-03-09', strength: 'A',  vault: 'public', linked: ['cl-2'],         summary: 'On-camera quote, timestamped 02:48. Auto-clipped.' },
  { id: 'ev-6',  kind: 'gov-doc',    title: 'Bill 14 fare schedule · explanatory note',               source: 'Hansard · BC Leg.',    date: '2026-02-12', strength: 'A',  vault: 'public', linked: ['cl-3'],         summary: 'Bill freezes fare-cap at CPI+0. Cannot produce a 38% hike.' },
  { id: 'ev-7',  kind: 'expert',     title: 'TransLink memo on fare modelling',                       source: 'TransLink (FOI)',      date: '2026-01-29', strength: 'A',  vault: 'foi-cleared', linked: ['cl-3'],   summary: 'Modelling confirms <2% nominal change for working families.' },
  { id: 'ev-8',  kind: 'voting',     title: 'Vance vote · Bill 21 (rent cap) · 2nd reading 2024',     source: 'Hansard',              date: '2024-11-04', strength: 'A',  vault: 'public', linked: ['cl-4','cl-11'], summary: 'Voted NAY. Spoke against tenant protection.' },
  { id: 'ev-9',  kind: 'voting',     title: 'Vance vote · Bill M-22 (seniors freeze) 2026',           source: 'Hansard',              date: '2026-03-07', strength: 'A',  vault: 'public', linked: ['cl-4'],         summary: 'Voted NAY on senior rent freeze.' },
  { id: 'ev-10', kind: 'video',      title: 'Vance interview 2019 · \u201Crent control kills supply\u201D', source: 'CKNW archive',  date: '2019-08-22', strength: 'B+', vault: 'public', linked: ['cl-4'],         summary: 'Self-contradiction · pre-2024 statement.' },
  { id: 'ev-11', kind: 'gov-data',   title: 'Carbon rebate disbursement · CRA Q4 2025',               source: 'CRA',                  date: '2026-01-19', strength: 'A',  vault: 'public', linked: ['cl-5'],         summary: 'Disbursements match budget 1.0006:1. No \u201Ccooking\u201D.' },
  { id: 'ev-12', kind: 'expert',     title: 'AG of BC · audit of carbon program',                     source: 'Auditor General BC',   date: '2025-11-08', strength: 'A',  vault: 'public', linked: ['cl-5'],         summary: 'AG: program accounting unqualified. Clean.' },
  { id: 'ev-13', kind: 'document',   title: 'Rosso family trust · Northshore Mining holding',         source: 'Land Title Office',    date: '2025-09-01', strength: 'A',  vault: 'restricted', linked: ['cl-6'],   summary: 'Indirect 6.4% interest via family trust.' },
  { id: 'ev-14', kind: 'press',      title: 'The Tyee · Rosso disclosures',                           source: 'The Tyee',             date: '2025-10-21', strength: 'B',  vault: 'public', linked: ['cl-6'],         summary: 'Reporting flags incomplete disclosure form.' },
  { id: 'ev-15', kind: 'finance',    title: 'Elections BC · O\u2019Keefe contributions register',    source: 'Elections BC',         date: '2026-01-31', strength: 'A',  vault: 'public', linked: ['cl-7'],         summary: '$14,200 from 4 named developers across 2022-25.' },
  { id: 'ev-16', kind: 'press',      title: 'Times Colonist · O\u2019Keefe donor profile',           source: 'Times Colonist',       date: '2026-02-04', strength: 'B+', vault: 'public', linked: ['cl-7'],         summary: 'Profile names BC Apartment Owners contributions.' },
  { id: 'ev-17', kind: 'expert',     title: 'UBC housing supply paper',                                source: 'UBC SCARP',            date: '2024-06-18', strength: 'B+', vault: 'public', linked: ['cl-8'],         summary: 'Mixed evidence. Counter-arg cites elasticity.' },
  { id: 'ev-18', kind: 'gov-data',   title: 'CIHI ER wait times · BC vs national 2025',               source: 'CIHI',                 date: '2026-02-12', strength: 'A',  vault: 'public', linked: ['cl-9'],         summary: 'BC median ER wait 3.4h. National median 3.1h. Worst NF 4.8h.' },
  { id: 'ev-19', kind: 'expert',     title: 'BC Nurses Union briefing',                                source: 'BCNU',                 date: '2026-02-20', strength: 'B',  vault: 'public', linked: ['cl-9'],         summary: 'Acknowledges pressure but disputes \u201Cworst\u201D framing.' },
  { id: 'ev-20', kind: 'leak',       title: 'Caucus presentation · slide 7 · suburban strategy',      source: 'Confidential source',  date: '2026-02-28', strength: 'C+', vault: 'restricted', linked: ['cl-10'],   summary: 'Leaked deck. Source verified by 2 corroborators.' },
  { id: 'ev-21', kind: 'video',      title: 'Vance · Greens \u201Cnever\u201D · editorial board',     source: 'Sun editorial board',  date: '2026-02-22', strength: 'A',  vault: 'public', linked: ['cl-11'],        summary: 'On-record never-collaborate quote.' },
  { id: 'ev-22', kind: 'video',      title: 'Vance · 2017 coalition feeler quote',                    source: 'Hansard archive',      date: '2017-09-14', strength: 'B+', vault: 'public', linked: ['cl-11'],        summary: 'Self-contradiction · earlier era.' },
  { id: 'ev-23', kind: 'gov-data',   title: 'BC Ag Stats · farm income 2018-2025',                    source: 'BC Ministry of Ag',    date: '2026-02-08', strength: 'A',  vault: 'public', linked: ['cl-12'],        summary: 'Farm income up nominally and real terms.' },
];

// ═══ LEADS — open investigative threads ═══
const OP_LEADS = [
  { id: 'ld-1', priority: 'A', target: 'tg-vance',  topic: 'Pacific Coast Realty PAC \u2192 leadership campaign',  status: 'investigating',  owner: 'Devon Brock',   discovered: '2026-03-08', age: 3,  source: 'tip',         confidence: 0.7, redactions: 1, sublead: 4, note: 'Anonymous tip · 3 named donations route through shell.', vault: 'restricted' },
  { id: 'ld-2', priority: 'A', target: 'tg-rosso',  topic: 'Family trust holdings · disclosure gap',              status: 'evidence-secured', owner: 'Lena Okafor',   discovered: '2025-09-01', age: 192, source: 'public',      confidence: 0.95, redactions: 0, sublead: 0, note: 'Strong file. AG referral drafted.', vault: 'public' },
  { id: 'ld-3', priority: 'B', target: 'tg-vance',  topic: 'Crestview-Heights real-estate listings',              status: 'verifying',        owner: 'Arjun Park',    discovered: '2026-02-22', age: 17, source: 'foi',         confidence: 0.55, redactions: 2, sublead: 1, note: 'FOI returned partial. Resubmit filed Mar 9.', vault: 'foi-cleared' },
  { id: 'ld-4', priority: 'B', target: 'tg-okeefe', topic: 'Eastbridge town hall · footage',                      status: 'collecting',       owner: 'Sara Medina',   discovered: '2026-03-02', age: 9,  source: 'public',      confidence: 0.4,  redactions: 0, sublead: 2, note: 'Video off-the-record. Need on-record quote.', vault: 'public' },
  { id: 'ld-5', priority: 'A', target: 'tg-vance',  topic: 'Suburban strategy memo · slide 7 leak',                status: 'corroborating',    owner: 'Devon Brock',   discovered: '2026-02-28', age: 11, source: 'leak',        confidence: 0.7, redactions: 3, sublead: 3, note: 'One corroborator, need second. Legal reviewing.', vault: 'restricted' },
  { id: 'ld-6', priority: 'C', target: 'tg-okeefe', topic: 'Riding office contractor irregularity',               status: 'cold',            owner: '—',             discovered: '2025-12-04', age: 97, source: 'public',      confidence: 0.2,  redactions: 0, sublead: 0, note: 'Stalled. No new info in 90 days.', vault: 'public' },
  { id: 'ld-7', priority: 'B', target: 'tg-vance',  topic: 'Pacific Northwest Resources board membership',        status: 'investigating',    owner: 'Lena Okafor',   discovered: '2026-01-19', age: 51, source: 'public',      confidence: 0.6,  redactions: 0, sublead: 1, note: 'Sat on board until 2023. Filed disclosure unclear.', vault: 'public' },
  { id: 'ld-8', priority: 'A', target: 'tg-rosso',  topic: 'Northshore Mining \u2192 Forward Coalition donations', status: 'evidence-secured', owner: 'Devon Brock',   discovered: '2026-02-14', age: 25, source: 'public',      confidence: 0.85, redactions: 0, sublead: 2, note: 'Live · two donations Q1 2026. Press hold until Friday.', vault: 'restricted' },
  { id: 'ld-9', priority: 'C', target: 'tg-laing',  topic: 'Pacific Health Group consulting fees',                status: 'cold',             owner: '—',             discovered: '2025-08-22', age: 201, source: 'public',     confidence: 0.25, redactions: 0, sublead: 0, note: 'Public filings clean. Park lead unless surfaced.', vault: 'public' },
];

const OP_LEAD_STAGES = [
  { k: 'cold',              label: 'COLD' },
  { k: 'collecting',        label: 'COLLECTING' },
  { k: 'verifying',         label: 'VERIFYING' },
  { k: 'investigating',     label: 'INVESTIGATING' },
  { k: 'corroborating',     label: 'CORROBORATING' },
  { k: 'evidence-secured',  label: 'EVIDENCE SECURED' },
];

// ═══ REBUTTALS — drafted/published responses ═══
const OP_REBUTTALS = [
  { id: 'rb-1',  claim: 'cl-1',  status: 'published', authoredBy: 'Devon Brock',  reviewedBy: 'L. Okafor',   draftedAt: '2026-03-10 10:14', publishedAt: '2026-03-10 11:02', wordCount: 240, surface: ['twitter','press-release'], headline: 'Vance\u2019s 40,000 figure: not even close.',   pickup: 14, evidenceIds: ['ev-1','ev-2'] },
  { id: 'rb-2',  claim: 'cl-2',  status: 'published', authoredBy: 'Devon Brock',  reviewedBy: 'L. Okafor',   draftedAt: '2026-03-09 18:32', publishedAt: '2026-03-09 20:01', wordCount: 380, surface: ['twitter','press-release','email'], headline: 'Crime didn\u2019t double. Here\u2019s the data.', pickup: 22, evidenceIds: ['ev-3','ev-4','ev-5'] },
  { id: 'rb-3',  claim: 'cl-3',  status: 'in-review', authoredBy: 'Arjun Park',   reviewedBy: null,          draftedAt: '2026-03-08 09:18', publishedAt: null,                wordCount: 290, surface: ['press-release'], headline: 'Bill 14 keeps fares flat.',                       pickup: 0, evidenceIds: ['ev-6','ev-7'] },
  { id: 'rb-4',  claim: 'cl-4',  status: 'drafted',  authoredBy: 'Arjun Park',   reviewedBy: null,          draftedAt: '2026-03-05 16:11', publishedAt: null,                wordCount: 410, surface: ['surrogate-brief','threadable'], headline: 'Vance\u2019s record vs. his rhetoric on renters.', pickup: 0, evidenceIds: ['ev-8','ev-9','ev-10'] },
  { id: 'rb-5',  claim: 'cl-5',  status: 'published', authoredBy: 'Lena Okafor', reviewedBy: 'Member',      draftedAt: '2026-03-09 11:42', publishedAt: '2026-03-09 14:00', wordCount: 220, surface: ['press-release','floor-statement'], headline: 'AG-cleared. The numbers stand.',         pickup: 9, evidenceIds: ['ev-11','ev-12'] },
  { id: 'rb-6',  claim: 'cl-6',  status: 'published', authoredBy: 'Devon Brock', reviewedBy: 'L. Okafor',   draftedAt: '2026-03-05 17:00', publishedAt: '2026-03-05 19:45', wordCount: 510, surface: ['press-release','exclusive'], headline: 'Rosso disclosure gap, in records.',          pickup: 31, evidenceIds: ['ev-13','ev-14'] },
  { id: 'rb-7',  claim: 'cl-7',  status: 'in-review', authoredBy: 'Devon Brock', reviewedBy: null,          draftedAt: '2026-03-08 12:30', publishedAt: null,                wordCount: 300, surface: ['twitter','press-release'], headline: 'Receipts: O\u2019Keefe\u2019s developer money.',  pickup: 0, evidenceIds: ['ev-15','ev-16'] },
  { id: 'rb-8',  claim: 'cl-8',  status: 'spike',    authoredBy: 'Sara Medina',  reviewedBy: 'L. Okafor',   draftedAt: '2026-03-03 11:08', publishedAt: null,                wordCount: 0,   surface: [], headline: '(spiked · weak signal)',                                                  pickup: 0, evidenceIds: [] },
  { id: 'rb-9',  claim: 'cl-9',  status: 'published', authoredBy: 'Arjun Park',  reviewedBy: 'L. Okafor',   draftedAt: '2026-03-06 13:20', publishedAt: '2026-03-06 15:32', wordCount: 270, surface: ['press-release','threadable'], headline: 'BC ER waits, in context.',                  pickup: 6, evidenceIds: ['ev-18','ev-19'] },
  { id: 'rb-10', claim: 'cl-11', status: 'in-review', authoredBy: 'Devon Brock', reviewedBy: null,          draftedAt: '2026-03-09 10:14', publishedAt: null,                wordCount: 180, surface: ['twitter'], headline: 'Vance \u201Cnever\u201D file: receipts.',                       pickup: 0, evidenceIds: ['ev-21','ev-22'] },
  { id: 'rb-11', claim: 'cl-12', status: 'drafted',  authoredBy: 'Arjun Park',   reviewedBy: null,          draftedAt: '2026-03-01 09:48', publishedAt: null,                wordCount: 240, surface: ['press-release'], headline: 'BC farm income, by the numbers.',                                pickup: 0, evidenceIds: ['ev-23'] },
];

// ═══ MONITORS — live signals we're watching ═══
const OP_MONITORS = [
  { id: 'mn-1', label: 'Vance · @brettvance',         kind: 'twitter',   spike: true,  newClaims: 3, last: '14m',  baseline: 0.4, current: 1.2, threshold: 0.8, note: 'Surge after QP clip. 3 new claims to triage.' },
  { id: 'mn-2', label: 'Vance · public schedule',     kind: 'cal',       spike: false, newClaims: 0, last: '2h',   baseline: 1.0, current: 0.9, threshold: 1.5, note: 'Routine. Town hall Sat in Crestview.' },
  { id: 'mn-3', label: 'Forward Coalition · press',   kind: 'press-rss', spike: true,  newClaims: 2, last: '38m',  baseline: 0.8, current: 1.6, threshold: 1.2, note: 'Two release · housing + transit.' },
  { id: 'mn-4', label: 'Rosso · radio',                kind: 'broadcast',spike: false, newClaims: 0, last: '6h',   baseline: 0.3, current: 0.2, threshold: 0.6, note: 'Quiet.' },
  { id: 'mn-5', label: 'O\u2019Keefe · Twitter',      kind: 'twitter',   spike: false, newClaims: 1, last: '4h',   baseline: 0.5, current: 0.6, threshold: 0.9, note: 'One new claim, low heat.' },
  { id: 'mn-6', label: 'Forward Coalition donations', kind: 'finance',   spike: true,  newClaims: 0, last: '1d',   baseline: 0.7, current: 1.4, threshold: 1.0, note: 'Q1 inflows up 2x. Worth a deeper look.' },
  { id: 'mn-7', label: 'Surrogates · op-eds',         kind: 'press-rss', spike: false, newClaims: 1, last: '12h',  baseline: 0.4, current: 0.5, threshold: 0.7, note: '1 surrogate op-ed in Sun.' },
  { id: 'mn-8', label: 'Caucus leaks',                kind: 'humint',    spike: false, newClaims: 0, last: '5d',   baseline: 0.1, current: 0.0, threshold: 0.3, note: 'No new chatter since suburban memo.' },
];

// ═══ SURROGATES & SOURCES (knowledge graph stub) ═══
const OP_SOURCES = [
  { id: 'src-1', name: 'Confidential · "Owl"',  trust: 'A',  contact: 'L. Okafor',  topics: ['vance','strategy'], lastContact: '2026-02-28', notes: 'Senior ex-staffer. Verify-only.' },
  { id: 'src-2', name: 'Globe & Mail (Sara P.)', trust: 'B+', contact: 'D. Brock',   topics: ['ethics'],          lastContact: '2026-03-09', notes: 'Off-record only.' },
  { id: 'src-3', name: 'Elections BC database',  trust: 'A',  contact: 'public',     topics: ['finance'],          lastContact: '2026-03-10', notes: 'Cron-pulled nightly.' },
  { id: 'src-4', name: 'BC Apt Owners (leak)',   trust: 'C+', contact: 'D. Brock',   topics: ['housing'],          lastContact: '2026-02-12', notes: 'Single source. Treat with care.' },
  { id: 'src-5', name: 'AG of BC · public',      trust: 'A',  contact: 'public',     topics: ['fiscal'],           lastContact: '2025-11-08', notes: 'Open record.' },
];

export { OP_TARGETS, OP_CLAIMS, OP_EVIDENCE, OP_LEADS, OP_LEAD_STAGES, OP_REBUTTALS, OP_MONITORS, OP_SOURCES };
