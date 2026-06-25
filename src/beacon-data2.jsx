// Mandate 2.0 — Beacon · extra data for Queue / Listening / Performance / Boost / Press
//
// Analytics blobs stay empty (the live API surfaces drive those). Only
// BEACON_PRESS_OUTLETS is populated with synthetic BC-press breakdown data
// so the Press tab's "list breakdown" panel renders.

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

const BEACON_PRESS_OUTLETS = [
  { name:'Daily / wire',   count:42, sub:'CBC BC, The Canadian Press, CTV Vancouver' },
  { name:'Independent',    count:28, sub:'The Tyee, Capital Daily, The Narwhal' },
  { name:'Community',      count:19, sub:'Vancouver Is Awesome, neighbourhood weeklies' },
  { name:'Radio / podcast',count:14, sub:'CBC Early Edition, CKNW, local pods' },
  { name:'Broadcast TV',   count:9,  sub:'Global BC, CTV, CityNews' },
];

export {
  BEACON_TRACKED_TERMS, BEACON_MENTION_TIMELINE, BEACON_AUTHORS, BEACON_SOV_HISTORY,
  BEACON_TOP_POSTS, BEACON_ENG_OVER_TIME, BEACON_AUDIENCE_GROWTH, BEACON_BEST_TIME, BEACON_CONTENT_SCORE,
  BEACON_BOOSTS, BEACON_BOOST_SUGGESTIONS,
  BEACON_PRESS, BEACON_PRESS_OUTLETS,
};
