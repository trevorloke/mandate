// Mandate 2.0 — Beacon · extra data for Queue / Listening / Performance / Boost / Press

// ── Listening (full): tracked terms, news outlets, share of voice over time
const BEACON_TRACKED_TERMS = [
  { term: '"Marcus Hale"',           mentions: 412, delta: '+34%', sentiment: 0.62, color: '#0d4f3c' },
  { term: '"Meridian West"',         mentions: 287, delta: '+12%', sentiment: 0.41, color: '#3d7a5e' },
  { term: '#housingcrisis',          mentions: 1840, delta: '+184%', sentiment: 0.48, color: '#b94a3a' },
  { term: '"Bill X-14"',             mentions: 96,  delta: '+4%',  sentiment: 0.18, color: '#6b9d82' },
  { term: '"Vance" + "market"',      mentions: 624, delta: '+340%', sentiment: -0.42, color: '#b94a3a' },
  { term: '"rent" + "BC"',           mentions: 412, delta: '+22%',  sentiment: -0.18, color: '#a9c4b4' },
  { term: '@MarcusHale_MLA',         mentions: 138, delta: '+58%',  sentiment: 0.71, color: '#0d4f3c' },
  { term: '"climate caucus"',        mentions: 47,  delta: '+8%',   sentiment: 0.32, color: '#3d7a5e' },
];

// Hour-by-hour mention volume (last 24h)
const BEACON_MENTION_TIMELINE = [
  3, 2, 1, 1, 0, 1, 4, 14, 38, 62, 48, 41, 52, 67, 84, 62, 48, 41, 38, 32, 24, 18, 12, 8,
];

// Top news/social authors
const BEACON_AUTHORS = [
  { name: 'The Tyee',          handle: 'thetyee.ca',         reach: '44K',  posts: 3, sentiment: 0.6,  kind: 'news' },
  { name: 'Vancouver Sun',     handle: 'vancouversun.com',   reach: '112K', posts: 2, sentiment: -0.1, kind: 'news' },
  { name: 'CBC BC',            handle: 'cbc.ca',             reach: '31K',  posts: 4, sentiment: 0.4,  kind: 'news' },
  { name: '@justine_h',        handle: '@justine_h',         reach: '12K',  posts: 1, sentiment: 0.9,  kind: 'x' },
  { name: '@bc_rentwatch',     handle: '@bc_rentwatch',      reach: '6K',   posts: 5, sentiment: 0.2,  kind: 'x' },
  { name: 'Reddit r/vancouver', handle: 'reddit.com/r/vancouver', reach: '18K', posts: 2, sentiment: 0.5, kind: 'reddit' },
  { name: 'CTV Vancouver',     handle: 'bc.ctvnews.ca',      reach: '88K',  posts: 1, sentiment: 0.0,  kind: 'news' },
  { name: '@AnonVanc0uver',    handle: '@AnonVanc0uver',     reach: '800',  posts: 1, sentiment: -0.7, kind: 'x' },
];

// Share-of-voice over last 14d (us vs Vance vs Premier)
const BEACON_SOV_HISTORY = [
  { d: 'Apr 4',  hale: 18, vance: 32, prem: 26 },
  { d: 'Apr 5',  hale: 19, vance: 30, prem: 28 },
  { d: 'Apr 6',  hale: 21, vance: 28, prem: 27 },
  { d: 'Apr 7',  hale: 23, vance: 26, prem: 28 },
  { d: 'Apr 8',  hale: 22, vance: 28, prem: 26 },
  { d: 'Apr 9',  hale: 24, vance: 30, prem: 24 },
  { d: 'Apr 10', hale: 26, vance: 31, prem: 22 },
  { d: 'Apr 11', hale: 25, vance: 30, prem: 24 },
  { d: 'Apr 12', hale: 28, vance: 29, prem: 22 },
  { d: 'Apr 13', hale: 30, vance: 28, prem: 22 },
  { d: 'Apr 14', hale: 34, vance: 28, prem: 21 },
];

// ── Performance (post analytics)
const BEACON_TOP_POSTS = [
  { id: 'tp1', platform: 'x', date: 'Apr 11', headline: '"Different words. Different math." Reframe clip',
    imp: '142K',  eng: '8.2%', shares: 1840, kind: 'video',
    body: 'Vance quote → cut to Marcus at the doorstep with the family of four. 28 seconds.', },
  { id: 'tp2', platform: 'ig', date: 'Apr 09', headline: 'Tamsin · Carousel',
    imp: '88K',  eng: '6.4%', shares: 412,  kind: 'photo',
    body: 'The night-shift nurse with three roommates. 7-frame carousel.', },
  { id: 'tp3', platform: 'fb', date: 'Apr 08', headline: 'Long-form essay · Kids shouldn\'t need 6 roommates',
    imp: '64K',  eng: '4.8%', shares: 1240, kind: 'essay',
    body: '820-word essay from the canvass — top performer of the month on Facebook.', },
  { id: 'tp4', platform: 'x', date: 'Apr 12', headline: 'Rent stats · 2015→2025 thread',
    imp: '54K',  eng: '5.1%', shares: 612,  kind: 'thread',
    body: 'Three charts. 2015 vs 2025 rent growth in Meridian West, Burnaby, NewWest.' },
  { id: 'tp5', platform: 'tt', date: 'Apr 06', headline: 'Doorstep walkthrough · 30s',
    imp: '38K',  eng: '11.2%', shares: 184, kind: 'video',
    body: 'POV doorstep. 28 doors compressed into 30 seconds.' },
];

// Engagement rate over time (per platform)
const BEACON_ENG_OVER_TIME = [
  { d: 'W-7', x: 2.1, ig: 3.4, fb: 1.8, tt: 5.2 },
  { d: 'W-6', x: 2.4, ig: 3.6, fb: 1.6, tt: 5.8 },
  { d: 'W-5', x: 2.8, ig: 3.8, fb: 1.7, tt: 6.4 },
  { d: 'W-4', x: 3.2, ig: 4.1, fb: 2.0, tt: 7.1 },
  { d: 'W-3', x: 3.4, ig: 4.4, fb: 2.2, tt: 7.8 },
  { d: 'W-2', x: 3.8, ig: 4.8, fb: 2.4, tt: 8.4 },
  { d: 'W-1', x: 4.2, ig: 5.2, fb: 2.6, tt: 9.1 },
  { d: 'Now', x: 4.8, ig: 5.6, fb: 2.8, tt: 9.8 },
];

// Audience growth (followers over time, all channels)
const BEACON_AUDIENCE_GROWTH = [
  { d: 'Jan', total: 38400 }, { d: 'Feb', total: 41200 }, { d: 'Mar', total: 45800 },
  { d: 'Apr', total: 51800 },
];

// Best time to post (heatmap: day × 3-hour window)
const BEACON_BEST_TIME = [
  // rows = days (Mon..Sun), cols = 0-3, 3-6, 6-9, 9-12, 12-15, 15-18, 18-21, 21-24
  { d: 'Mon', vals: [0.2, 0.4, 2.1, 3.8, 4.2, 5.1, 7.8, 5.4] },
  { d: 'Tue', vals: [0.2, 0.4, 2.0, 3.4, 4.4, 5.8, 8.2, 6.1] },
  { d: 'Wed', vals: [0.3, 0.4, 1.8, 3.6, 4.6, 5.2, 7.4, 5.8] },
  { d: 'Thu', vals: [0.2, 0.5, 2.2, 4.1, 4.8, 6.2, 8.6, 6.4] },
  { d: 'Fri', vals: [0.2, 0.3, 1.8, 3.2, 4.1, 4.8, 6.4, 5.2] },
  { d: 'Sat', vals: [0.4, 0.6, 1.4, 2.8, 3.8, 4.4, 5.2, 4.1] },
  { d: 'Sun', vals: [0.3, 0.4, 1.6, 3.4, 4.4, 5.0, 7.2, 5.6] },
];

// Content scoring rubric (current week)
const BEACON_CONTENT_SCORE = {
  voice:      { score: 8.4, sub: 'Consistent. "Neighbours, not markets" framing landing.', delta: '+0.6' },
  consistency: { score: 9.1, sub: '18 of 18 scheduled posts shipped on time.', delta: '+0.2' },
  range:      { score: 7.2, sub: 'Heavy on housing. Climate + transit underweighted this week.', delta: '−0.4' },
  resonance:  { score: 8.8, sub: 'Top quartile vs benchmark. Reframe clip outperformed by 3.2x.', delta: '+1.1' },
};

// ── Boost (paid)
const BEACON_BOOSTS = [
  { id: 'b1', post: 'p1', platform: 'x', headline: 'Rapid response · Vance on housing',
    state: 'ACTIVE', spend: 1200, budget: 2000, ctr: 4.2, cpr: 0.084,
    audience: 'Lower mainland · 25-54 · housing-engaged · 184K',
    started: 'Mon 07:00', ends: 'Wed 23:59',
    impressions: 142800, clicks: 5980, conversions: 412, },
  { id: 'b2', post: 'tp1', platform: 'x', headline: '"Different words. Different math." Reframe clip',
    state: 'ACTIVE', spend: 840, budget: 1500, ctr: 6.1, cpr: 0.062,
    audience: 'BC · 18-44 · video-engaged · 248K',
    started: 'Apr 11', ends: 'Apr 25',
    impressions: 88400, clicks: 5390, conversions: 287, },
  { id: 'b3', post: 'tp3', platform: 'fb', headline: 'Long-form essay · Kids shouldn\'t need 6 roommates',
    state: 'ACTIVE', spend: 624, budget: 800, ctr: 3.4, cpr: 0.118,
    audience: 'Meridian West · 28-65 · readers · 64K',
    started: 'Apr 09', ends: 'Apr 23',
    impressions: 56200, clicks: 1910, conversions: 184, },
  { id: 'b4', post: 'p9', platform: 'x', headline: 'Press hit · Tyee op-ed live',
    state: 'PLANNED', spend: 0, budget: 400,
    audience: 'BC · 25-54 · news-engaged · 124K',
    started: '—', ends: '—',
    impressions: 0, clicks: 0, conversions: 0, },
  { id: 'b5', post: 'p16', platform: 'fb', headline: 'Press release · Committee vote',
    state: 'PLANNED', spend: 0, budget: 600,
    audience: 'Riding boundaries · all ages · civic-engaged · 38K',
    started: '—', ends: '—',
    impressions: 0, clicks: 0, conversions: 0, },
];

// Suggested boosts (organic posts performing well, recommend amplifying)
const BEACON_BOOST_SUGGESTIONS = [
  { id: 's1', headline: 'Rent stats · 2015→2025 thread', platform: 'x',
    organic_imp: '54K', organic_eng: '5.1%', why: 'Outperforming median by 2.4x organically. Saturated on org reach.',
    recommend: 800, est_lift: '+38K reach' },
  { id: 's2', headline: 'Doorstep walkthrough · 30s', platform: 'tt',
    organic_imp: '38K', organic_eng: '11.2%', why: 'Highest engagement on TikTok. Audience overlap with mid-funnel.',
    recommend: 600, est_lift: '+62K reach' },
  { id: 's3', headline: 'Tamsin · Carousel', platform: 'ig',
    organic_imp: '88K', organic_eng: '6.4%', why: 'Cross-pollinating to Reels would amplify story arc.',
    recommend: 500, est_lift: '+44K reach' },
];

// ── Press list (journalists / outlets)
const BEACON_PRESS = [
  { id: 'pr1', name: 'Justine Hawthorne', outlet: 'The Tyee',          beat: 'Housing · BC politics',
    relationship: 'strong', last: '2d',  emails: 18, replies: 14, recent: 'Quoted MR in housing tone-deaf piece (Apr 14)',
    pitch_score: 9.2, email: 'j.hawthorne@thetyee.ca' },
  { id: 'pr2', name: 'Daniel Cho',        outlet: 'Vancouver Sun',     beat: 'Provincial politics',
    relationship: 'warm',   last: '6d',  emails: 24, replies: 11, recent: 'Wrote opp piece on Vance quote (Apr 14)',
    pitch_score: 7.4, email: 'dcho@postmedia.com' },
  { id: 'pr3', name: 'Asha Patel',        outlet: 'CBC BC',            beat: 'Affordability',
    relationship: 'strong', last: '1d',  emails: 14, replies: 12, recent: 'Booked MR for Mon Politics Pod segment',
    pitch_score: 9.6, email: 'asha.patel@cbc.ca' },
  { id: 'pr4', name: 'Tom Whitford',      outlet: 'Global News BC',    beat: 'Civic',
    relationship: 'cool',   last: '21d', emails: 9,  replies: 2,  recent: 'No reply on last 3 pitches',
    pitch_score: 4.2, email: 'tom.whitford@globalnews.ca' },
  { id: 'pr5', name: 'Mira Solano',       outlet: 'CTV Vancouver',     beat: 'Lower mainland',
    relationship: 'warm',   last: '4d',  emails: 12, replies: 7,  recent: 'Camera at town hall Apr 12',
    pitch_score: 7.8, email: 'mira.solano@ctv.ca' },
  { id: 'pr6', name: 'Wei Chen',          outlet: 'BIV (Biz In Vancouver)', beat: 'Economy · housing',
    relationship: 'warm',   last: '8d',  emails: 8,  replies: 5,  recent: 'Reading rent-stats thread, asked for raw data',
    pitch_score: 7.2, email: 'wchen@biv.com' },
  { id: 'pr7', name: 'Sam Reilly',        outlet: 'PressProgress',     beat: 'Investigative',
    relationship: 'strong', last: '3d',  emails: 16, replies: 14, recent: 'Working on Vance lobbying angle',
    pitch_score: 9.0, email: 'sam@pressprogress.ca' },
  { id: 'pr8', name: 'Heather Mills',     outlet: 'CKNW',              beat: 'Talk radio',
    relationship: 'cool',   last: '34d', emails: 6,  replies: 1,  recent: 'Pitched 3x — no traction',
    pitch_score: 3.8, email: 'h.mills@cknw.com' },
  { id: 'pr9', name: 'Aaron Kimble',      outlet: 'Capital Daily',     beat: 'Provincial · Victoria-focused',
    relationship: 'warm',   last: '11d', emails: 7,  replies: 4,  recent: 'Possible Bill X-14 explainer collaboration',
    pitch_score: 6.8, email: 'aaron@capitaldaily.ca' },
  { id: 'pr10', name: 'Lila Forbes',      outlet: 'The Breach',         beat: 'Inequality · housing',
    relationship: 'strong', last: '1d',  emails: 11, replies: 10, recent: 'Will run rent stats as their own piece',
    pitch_score: 9.4, email: 'lila@breach.ca' },
  { id: 'pr11', name: 'Jordan Mak',       outlet: 'The Hub',            beat: 'Centre-right policy',
    relationship: 'cool',   last: '18d', emails: 5,  replies: 2,  recent: 'Need to land an oped pitch',
    pitch_score: 4.8, email: 'jmak@thehub.ca' },
  { id: 'pr12', name: 'Priya Singh',      outlet: 'New West Record',    beat: 'Riding-local',
    relationship: 'strong', last: '0d',  emails: 22, replies: 21, recent: 'Daily contact. Always returns calls.',
    pitch_score: 9.8, email: 'p.singh@newwestrecord.ca' },
];

const BEACON_PRESS_OUTLETS = [
  { name: 'Print',     count: 38, sub: 'incl. Tyee, Sun, Province, Globe, Tyee Solutions' },
  { name: 'Broadcast', count: 21, sub: 'CBC, CTV, Global, City, Citytv' },
  { name: 'Radio',     count: 14, sub: 'CBC Radio, CKNW, CFAX, CHQM, City' },
  { name: 'Digital',   count: 64, sub: 'Capital Daily, PressProgress, Breach, Pivot, BIV' },
  { name: 'Riding',    count: 12, sub: 'New West Record, Burnaby Now, Tri-City News' },
  { name: 'National',  count: 35, sub: 'Globe, Star, NatPost, Hub, Macleans' },
];

export {
  BEACON_TRACKED_TERMS, BEACON_MENTION_TIMELINE, BEACON_AUTHORS, BEACON_SOV_HISTORY,
  BEACON_TOP_POSTS, BEACON_ENG_OVER_TIME, BEACON_AUDIENCE_GROWTH, BEACON_BEST_TIME, BEACON_CONTENT_SCORE,
  BEACON_BOOSTS, BEACON_BOOST_SUGGESTIONS,
  BEACON_PRESS, BEACON_PRESS_OUTLETS,
};
