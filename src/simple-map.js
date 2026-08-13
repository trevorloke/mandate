// The Simple Shell spine — one place that says, in plain words, what each
// module is, where it lives, what you do there first, and how it connects.
// Display layer only: module keys, routes, and the backend are untouched.
// Consumed by the grouped nav (shell.jsx), the module guide strip
// (ModuleGuide.jsx), and Today's action row (home.jsx).

// Six groups in campaign language. Order = nav order.
export const NAV_GROUPS = [
  { key: 'people',   label: 'People',   modules: ['ground', 'people', 'directory', 'coalition'] },
  { key: 'money',    label: 'Money',    modules: ['raise', 'ledger'] },
  { key: 'message',  label: 'Message',  modules: ['beacon', 'site'] },
  { key: 'team',     label: 'Team',     modules: ['events', 'command', 'academy'] },
  { key: 'insights', label: 'Insights', modules: ['tide', 'margin', 'civic', 'opposition'] },
];

// Plain-language identity + first actions + connections, per module.
// action: { label, bucket } opens Quick Add on that bucket; { label, route }
// navigates. `connections` are one-liners that answer "how is this linked?".
export const MODULE_META = {
  ground: {
    plain: 'Field', code: 'Ground',
    desc: 'Voters, door-knocking, and canvass shifts.',
    actions: [
      { label: 'Add a voter', bucket: 'ground.voter' },
      { label: 'Plan a shift', bucket: 'ground.shift' },
    ],
    connections: ['Voters appear in Everyone automatically', 'Shift gaps show on Today'],
  },
  people: {
    plain: 'Volunteers', code: 'People',
    desc: 'Volunteer sign-ups, skills, and availability.',
    actions: [{ label: 'Add a volunteer', bucket: 'people.volunteer' }],
    connections: ['Volunteers appear in Everyone automatically'],
  },
  directory: {
    plain: 'Everyone', code: 'Directory',
    desc: 'One profile per person or org, across every part of the campaign.',
    actions: [],
    connections: ['Built automatically from voters, donors, hosts, and orgs as you add them'],
  },
  coalition: {
    plain: 'Allies', code: 'Coalition',
    desc: 'Endorsements, partner orgs, and the asks you make of them.',
    actions: [
      { label: 'Add an endorsement', bucket: 'coalition.endorsement' },
      { label: 'Make an ask', bucket: 'coalition.ask' },
    ],
    connections: ['Stalled asks show on Today', 'Orgs appear in Everyone'],
  },
  raise: {
    plain: 'Fundraising', code: 'Raise',
    desc: 'Donors, gifts, and your pipeline of prospects.',
    actions: [
      { label: 'Log a gift', bucket: 'raise.gift' },
      { label: 'Add a donor', bucket: 'raise.donor' },
    ],
    connections: ['Every gift is checked against the contribution cap', 'Donors appear in Everyone'],
  },
  ledger: {
    plain: 'Books & filings', code: 'Ledger',
    desc: 'The money book, bills, filings, and compliance.',
    actions: [
      { label: 'Record an entry', bucket: 'ledger.journal' },
      { label: 'Add a bill', bucket: 'ledger.bill' },
    ],
    connections: ['Filing deadlines show on Today', 'Over-cap gifts are flagged here'],
  },
  beacon: {
    plain: 'Social', code: 'Beacon',
    desc: 'Posts, scheduling, listening, and press.',
    actions: [{ label: 'Draft a post', bucket: 'beacon.post' }],
    connections: ['Posts awaiting sign-off show on Today'],
  },
  site: {
    plain: 'Website', code: 'Site',
    desc: 'Your pages, forms, and A/B experiments.',
    actions: [{ label: 'Add a page', bucket: 'site.page' }],
    connections: ['Form submissions can feed Volunteers'],
  },
  events: {
    plain: 'Events', code: 'Events',
    desc: 'The schedule — town halls, canvass launches, fundraisers.',
    actions: [
      { label: 'Add an event', bucket: 'events.event' },
      { label: 'Add a venue', bucket: 'events.venue' },
    ],
    connections: ['Upcoming events lead Today for candidates and volunteers'],
  },
  command: {
    plain: 'Team chat', code: 'Command',
    desc: 'The war room — channels, huddles, decisions.',
    actions: [],
    connections: [],
  },
  academy: {
    plain: 'Training', code: 'Academy',
    desc: 'Courses and reading for staff and volunteers.',
    actions: [],
    connections: [],
  },
  tide: {
    plain: 'Attention', code: 'Tide',
    desc: 'What your community is paying attention to, and why.',
    actions: [],
    connections: ['Attention spikes show on Today'],
  },
  margin: {
    plain: 'Forecast', code: 'Margin',
    desc: 'Your win probability and the path to victory.',
    actions: [],
    connections: ['Runs off your real voters, districts, and polls'],
  },
  civic: {
    plain: 'Office desk', code: 'Civic',
    desc: 'Bills, casework, and promises — for sitting members.',
    actions: [{ label: 'Open a case', bucket: 'civic.case' }],
    connections: [],
  },
  opposition: {
    plain: 'Research', code: 'Opposition',
    desc: 'Opponents, their claims, and your evidence.',
    actions: [{ label: 'Track a claim', bucket: 'opposition.claim' }],
    connections: [],
  },
};

// Today's verb-first action row: the five things people most often come to do.
export const TODAY_ACTIONS = [
  { label: 'Add someone',     bucket: 'ground.voter',  personas: ['manager', 'staff', 'volunteer'] },
  { label: 'Log a gift',      bucket: 'raise.gift',    personas: ['manager', 'staff'] },
  { label: 'Draft a post',    bucket: 'beacon.post',   personas: ['manager', 'staff', 'candidate'] },
  { label: 'Plan an event',   bucket: 'events.event',  personas: ['manager', 'staff'] },
  { label: 'Find anyone',     palette: true,           personas: ['manager', 'staff', 'candidate', 'volunteer'] },
];

export const plainName = (k) => MODULE_META[k]?.plain || k;
