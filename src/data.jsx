// Mandate 2.0 — Workspace data
//
// Workspace metadata, top-level pillars, mandate index, the cross-module
// "Today" feed, module headline cards, and the demo Conductor asks have
// all been emptied so the Home page no longer shows simulated numbers.
// Pages compute these from live records (and Conductor asks live in the
// `conductor.ask` DB bucket).

export const WORKSPACE = {
  kind:   '',
  name:   '',
  candidate: '',
  party:   '',
  phase:   '',
  daysToVote: 0,
  livePulse: '',
  tz: '',
};

export const PILLARS = [
  { id: 'persuasion',   name: 'Persuasion',   formula: 'ID rate × support swing × universe coverage',
    value: 0, target: 0, delta: 0, spark: [], breakdown: [], sourceModule: 'ground' },
  { id: 'field',        name: 'Field trend',  formula: 'Doors/day × contact rate × support drift',
    value: 0, target: 0, delta: 0, spark: [], breakdown: [], sourceModule: 'ground' },
  { id: 'money',        name: 'Money',        formula: 'Cash runway × cost-per-persuaded × burn vs plan',
    value: 0, target: 0, delta: 0, spark: [], breakdown: [], sourceModule: 'ledger' },
  { id: 'mobilization', name: 'Mobilization', formula: 'Confirmed supporters × GOTV readiness × shift fill',
    value: 0, target: 0, delta: 0, spark: [], breakdown: [], sourceModule: 'ground' },
];

export const INDEX = {
  value: 0, target: 0, delta: 0, band: '', history: [],
};

export const TODAY = [];

export const MOD_CARDS = [
  { k:'ground',     head:'—', sub:'', meta:'', spark:[] },
  { k:'beacon',     head:'—', sub:'', meta:'', spark:[] },
  { k:'raise',      head:'—', sub:'', meta:'', spark:[] },
  { k:'ledger',     head:'—', sub:'', meta:'', spark:[] },
  { k:'coalition',  head:'—', sub:'', meta:'', spark:[] },
  { k:'opposition', head:'—', sub:'', meta:'', spark:[] },
  { k:'site',       head:'—', sub:'', meta:'', spark:[] },
  { k:'events',     head:'—', sub:'', meta:'', spark:[] },
  { k:'civic',      head:'—', sub:'', meta:'', spark:[] },
  { k:'academy',    head:'—', sub:'', meta:'', spark:[] },
];

export const CONDUCTOR = [];
