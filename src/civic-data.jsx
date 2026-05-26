// Civic 2.0 — sitting member's command desk.
//
// All entity seeds and decorative dashboard blobs emptied. Pages read
// live records from the DB via useLiveRecords. The two configuration
// enums (case categories list — no counts; pipeline stages) are kept
// because they are vocabulary, not data.

const CV_MEMBER = {
  name: '', title: '', constituency: '', party: '', email: '', phone: '', office: '',
  caucusRole: '', terms: 0, photo: '',
};

const CV_ORDER_TODAY = [];
const CV_BILLS = [];
const CV_CASES = [];

// Category vocabulary — names only. Counts/trends come from live cases.
const CV_CASE_CATS = [
  { k: 'Housing',     count: 0, trend: 0 },
  { k: 'Health',      count: 0, trend: 0 },
  { k: 'Insurance',   count: 0, trend: 0 },
  { k: 'Immigration', count: 0, trend: 0 },
  { k: 'Transport',   count: 0, trend: 0 },
  { k: 'Disability',  count: 0, trend: 0 },
  { k: 'Federal',     count: 0, trend: 0 },
  { k: 'Labour',      count: 0, trend: 0 },
  { k: 'Education',   count: 0, trend: 0 },
  { k: 'Utilities',   count: 0, trend: 0 },
];

// Casework pipeline stages — pure configuration (kept).
const CV_CASE_PIPE_STAGES = [
  { k: 'new',              label: 'NEW · triage',        tone: 'info' },
  { k: 'ack-sent',         label: 'ACK SENT',            tone: 'mid' },
  { k: 'in-progress',      label: 'IN PROGRESS',         tone: 'mid' },
  { k: 'waiting-ministry', label: 'WAITING · MINISTRY',  tone: 'warn' },
  { k: 'resolved',         label: 'RESOLVED',            tone: 'ok' },
];

const CV_VOTES = [];
const CV_MOTIONS = [];
const CV_SPEECHES = [];
const CV_COMMITTEES = [];
const CV_HEARINGS = [];
const CV_PROMISES = [];
const CV_OFFICE_WEEK = [];
const CV_LETTERS = [];
const CV_STAFF = [];
const CV_SPEND = [];
const CV_TRENDS = [];

export {
  CV_MEMBER, CV_ORDER_TODAY, CV_BILLS, CV_CASES, CV_CASE_CATS, CV_CASE_PIPE_STAGES,
  CV_VOTES, CV_MOTIONS, CV_SPEECHES, CV_COMMITTEES, CV_HEARINGS, CV_PROMISES,
  CV_OFFICE_WEEK, CV_LETTERS, CV_STAFF, CV_SPEND, CV_TRENDS,
};
