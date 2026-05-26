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

const EV_LIST = [];
const EV_VENUES = [];
const EV_SHIFTS = [];
const EV_GALA_TICKETS = [];
const EV_GALA_ROS = [];
const EV_GALA_RSVPS = [];
const EV_HOSTS = [];
const EV_SUMMARY = {
  next: null, rsvps7d: 0, capacity7d: 0, fill7d: 0,
  shiftsOpen: 0, shiftsFilled: 0, gala: null,
};

export { EV_TYPES, EV_LIST, EV_VENUES, EV_SHIFTS, EV_GALA_TICKETS, EV_GALA_ROS, EV_GALA_RSVPS, EV_HOSTS, EV_SUMMARY };
