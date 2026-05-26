// Mandate 2.0 — Raise Gifts/Lists/Reports data
//
// All entity seeds and decorative dashboard blobs are empty. Pages read
// live records via useLiveRecords; reports/sparklines/leaderboards render
// blank until real data exists.

const RAISE_GIFTS_TODAY = { count: 0, total: '—', avg: '—', recurring: 0, peakHour: '' };
const RAISE_GIFTS = [];
const RAISE_GIFTS_HOURLY = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
const RAISE_GIFTS_SOURCES = [];
const RAISE_LISTS = [];
const RAISE_REPORT_GOAL = [];
const RAISE_REPORT_ACQ = [];
const RAISE_REPORT_COHORTS = [];
const RAISE_REPORT_MIX = [];
const RAISE_REPORT_OFFICERS = [];
const RAISE_REPORT_AVG = [];
const RAISE_REPORT_PYRAMID = [];

export {
  RAISE_GIFTS_TODAY, RAISE_GIFTS, RAISE_GIFTS_HOURLY, RAISE_GIFTS_SOURCES,
  RAISE_LISTS,
  RAISE_REPORT_GOAL, RAISE_REPORT_ACQ, RAISE_REPORT_COHORTS, RAISE_REPORT_MIX,
  RAISE_REPORT_OFFICERS, RAISE_REPORT_AVG, RAISE_REPORT_PYRAMID,
};
