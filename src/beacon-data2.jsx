// Mandate 2.0 — Beacon · extra data for Queue / Listening / Performance / Boost / Press
//
// All analytics blobs (tracked terms, mention timeline, authors, share of
// voice history, top posts, engagement charts, audience growth, best-time
// heatmap, content score, boosted posts, suggestions, press hits, press
// outlets) are empty so the UI stops showing simulated numbers. Pages
// read live entity records via useLiveRecords.

const BEACON_TRACKED_TERMS = [];
const BEACON_MENTION_TIMELINE = [];
const BEACON_AUTHORS = [];
const BEACON_SOV_HISTORY = [];
const BEACON_TOP_POSTS = [];
const BEACON_ENG_OVER_TIME = [];
const BEACON_AUDIENCE_GROWTH = [];
const BEACON_BEST_TIME = [];
const BEACON_CONTENT_SCORE = {};
const BEACON_BOOSTS = [];
const BEACON_BOOST_SUGGESTIONS = [];
const BEACON_PRESS = [];
const BEACON_PRESS_OUTLETS = [];

export {
  BEACON_TRACKED_TERMS, BEACON_MENTION_TIMELINE, BEACON_AUTHORS, BEACON_SOV_HISTORY,
  BEACON_TOP_POSTS, BEACON_ENG_OVER_TIME, BEACON_AUDIENCE_GROWTH, BEACON_BEST_TIME, BEACON_CONTENT_SCORE,
  BEACON_BOOSTS, BEACON_BOOST_SUGGESTIONS,
  BEACON_PRESS, BEACON_PRESS_OUTLETS,
};
