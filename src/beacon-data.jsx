// Mandate 2.0 — Beacon data
//
// Entity seeds and decorative dashboard blobs are empty. BEACON_DAYS
// keeps a generic Mon–Sun structure (calendar grid config) without fake
// dates.

const BEACON_ACCOUNTS = [];

const BEACON_DAYS = [
  { key:'mon', label:'MON', date:'' },
  { key:'tue', label:'TUE', date:'' },
  { key:'wed', label:'WED', date:'' },
  { key:'thu', label:'THU', date:'' },
  { key:'fri', label:'FRI', date:'' },
  { key:'sat', label:'SAT', date:'' },
  { key:'sun', label:'SUN', date:'' },
];

const BEACON_POSTS = [];
const BEACON_LISTENING = [];
const BEACON_APPROVALS = [];
const BEACON_METRICS = [];

export { BEACON_ACCOUNTS, BEACON_DAYS, BEACON_POSTS, BEACON_LISTENING, BEACON_APPROVALS, BEACON_METRICS };
