// Events 2.0 — data
//
// All entity seeds (events, venues, hosts, shifts) and gala roll-up
// blobs are empty. Pages read live records via useLiveRecords. EV_TYPES
// is preserved because it is a category vocabulary, not data.

const EV_TYPES = {
  townhall:   { label:'Town hall',         tint:'#6b3410' },
  canvass:    { label:'Canvass launch',    tint:'#1e3a5f' },
  fundraiser: { label:'Fundraiser',        tint:'#2a4a3a' },
  debate:     { label:'Debate / forum',    tint:'#8a1414' },
  rally:      { label:'Rally',             tint:'#b8334a' },
  housepty:   { label:'House party',       tint:'#5c4a1f' },
  phonebank:  { label:'Phone bank',        tint:'#1f3e5a' },
  gotv:       { label:'GOTV push',         tint:'#b8334a' },
  internal:   { label:'Staff / training',  tint:'#3f3f3f' },
};

// ── Seed: events (kind 'event') ────────────────────────────────────────
// NOTE: one record keeps id 'e-fund-gala' — the "Spring Gala" detail tab
// looks it up directly. (The component now also guards an empty result.)
const EV_LIST = [
  {
    id: 'e-fund-gala', type: 'fundraiser',
    title: 'Spring Gala · An Evening for the Coast [SAMPLE]',
    subtitle: 'Plated dinner, keynote, and live appeal',
    date: '2026-05-08', start: '18:00', end: '22:00',
    venue: 'v-empress', host: 'Finance Committee', priority: 'high',
    capacity: 320, rsvped: 290, shifts: 8, shiftsFilled: 6,
    ticketed: true, ticketRev: 184000, revenueGoal: 250000, attended: null,
  },
  {
    id: 'e-townhall-saanich', type: 'townhall',
    title: 'Town Hall · Saanich North [SAMPLE]',
    subtitle: 'Affordability and the ferry file',
    date: '2026-05-12', start: '19:00', end: '20:30',
    venue: 'v-mary-winspear', host: 'Riding Association', priority: 'high',
    capacity: 200, rsvped: 142, shifts: 4, shiftsFilled: 3,
    ticketed: false, ticketRev: 0, attended: null,
  },
  {
    id: 'e-canvass-esq', type: 'canvass',
    title: 'Canvass Launch · Esquimalt [SAMPLE]',
    subtitle: 'Weekend door-knock kickoff',
    date: '2026-05-16', start: '09:30', end: '13:00',
    venue: 'v-esq-rec', host: 'Field Team & Volunteers', priority: 'med',
    capacity: 80, rsvped: 54, shifts: 3, shiftsFilled: 3,
    ticketed: false, ticketRev: 0, attended: null,
  },
  {
    id: 'e-debate-oakbay', type: 'debate',
    title: 'All-Candidates Forum · Oak Bay [SAMPLE]',
    subtitle: 'Moderated by the Chamber of Commerce',
    date: '2026-05-21', start: '18:30', end: '20:30',
    venue: 'v-oakbay-hall', host: 'Chamber of Commerce', priority: 'high',
    capacity: 150, rsvped: 150, shifts: 2, shiftsFilled: 1,
    ticketed: false, ticketRev: 0, attended: null,
  },
  {
    id: 'e-houseparty-fairfield', type: 'housepty',
    title: 'House Party · Fairfield [SAMPLE]',
    subtitle: 'Intimate evening with the candidate',
    date: '2026-04-28', start: '19:00', end: '21:00',
    venue: 'v-private-home', host: 'Dana & Chris Whitford', priority: 'low',
    capacity: 35, rsvped: 31, shifts: 1, shiftsFilled: 1,
    ticketed: true, ticketRev: 4200, attended: 28,
  },
  {
    id: 'e-phonebank-hq', type: 'phonebank',
    title: 'Phone Bank · Campaign HQ [SAMPLE]',
    subtitle: 'Voter ID calling shift',
    date: '2026-04-24', start: '17:00', end: '20:00',
    venue: 'v-hq', host: 'Field Team', priority: 'med',
    capacity: 40, rsvped: 33, shifts: 2, shiftsFilled: 2,
    ticketed: false, ticketRev: 0, attended: 30,
  },
];

// ── Seed: venues (kind 'venue') ────────────────────────────────────────
const EV_VENUES = [
  {
    id: 'v-empress', name: 'The Crystal Garden Ballroom [SAMPLE]', kind: 'Ballroom', city: 'Victoria',
    contact: 'Events Office', phone: '250-555-0142', cap: 340, priorEvents: 5,
    accessibility: 'Full · step-free · accessible washrooms · hearing loop',
    notes: 'Heritage ballroom; AV included, catering exclusive. [SAMPLE DATA]',
  },
  {
    id: 'v-mary-winspear', name: 'Mary Winspear Centre [SAMPLE]', kind: 'Community hall', city: 'Sidney',
    contact: 'Bookings', phone: '250-555-0177', cap: 250, priorEvents: 3,
    accessibility: 'Full · ramp · accessible parking',
    notes: 'Flexible seating; ample parking. [SAMPLE DATA]',
  },
  {
    id: 'v-esq-rec', name: 'Esquimalt Recreation Centre [SAMPLE]', kind: 'Rec centre', city: 'Esquimalt',
    contact: 'Front Desk', phone: '250-555-0190', cap: 120, priorEvents: 2,
    accessibility: 'Partial · ground floor only',
    notes: 'Good for canvass staging; whiteboards available. [SAMPLE DATA]',
  },
  {
    id: 'v-oakbay-hall', name: 'Oak Bay Municipal Hall [SAMPLE]', kind: 'Civic hall', city: 'Oak Bay',
    contact: 'Clerk', phone: '250-555-0123', cap: 160, priorEvents: 1,
    accessibility: 'Full · elevator · accessible washrooms',
    notes: 'Formal chamber; livestream rig on site. [SAMPLE DATA]',
  },
  {
    id: 'v-hq', name: 'Campaign HQ — Quadra St [SAMPLE]', kind: 'Office', city: 'Victoria',
    contact: 'Office Manager', phone: '250-555-0100', cap: 50, priorEvents: 12,
    accessibility: 'Partial · street-level entry',
    notes: 'Phone-bank stations and break area. [SAMPLE DATA]',
  },
  {
    id: 'v-private-home', name: 'Private residence (Fairfield) [SAMPLE]', kind: 'House party', city: 'Victoria',
    contact: 'D. Whitford', phone: '250-555-0166', cap: 40, priorEvents: 0,
    accessibility: 'Limited · steps to entry',
    notes: 'Backyard set-up weather permitting. [SAMPLE DATA]',
  },
];

const EV_SHIFTS = [];
const EV_GALA_TICKETS = [];
const EV_GALA_ROS = [];
const EV_GALA_RSVPS = [];

// ── Seed: hosts (kind 'host') ──────────────────────────────────────────
const EV_HOSTS = [
  {
    id: 'h-1', name: 'Dana Whitford', joined: '2024-09', events: 4, raised: 38000,
    rsvps: 96, city: 'Victoria', status: 'active',
  },
  {
    id: 'h-2', name: 'Raymond Leclair', joined: '2023-11', events: 9, raised: 142000,
    rsvps: 310, city: 'Sidney', status: 'active',
  },
  {
    id: 'h-3', name: 'Priscilla Adeyemi', joined: '2025-02', events: 2, raised: 12500,
    rsvps: 44, city: 'Esquimalt', status: 'active',
  },
  {
    id: 'h-4', name: 'Gordon Mackenzie', joined: '2022-06', events: 14, raised: 205000,
    rsvps: 520, city: 'Oak Bay', status: 'active',
  },
  {
    id: 'h-5', name: 'Yuki Tanaka', joined: '2024-01', events: 1, raised: 0,
    rsvps: 18, city: 'Saanich', status: 'dormant',
  },
];

const EV_SUMMARY = {
  next: null, rsvps7d: 0, capacity7d: 0, fill7d: 0,
  shiftsOpen: 0, shiftsFilled: 0, gala: null,
};

export { EV_TYPES, EV_LIST, EV_VENUES, EV_SHIFTS, EV_GALA_TICKETS, EV_GALA_ROS, EV_GALA_RSVPS, EV_HOSTS, EV_SUMMARY };
