// Mandate 2.0 — Ground (canvass / field) data
//
// All entity seeds (voters, canvassers, shifts, scripts, PDs) and
// decorative visual scenery (river path, landmarks) are empty. Pages
// read live records via useLiveRecords. GROUND_VOCAB, UNIVERSE_DEFAULT,
// and MODES are configuration vocabularies and are kept.

const GROUND_VOCAB = {
  filters: {
    universe:  { label: 'Universe',       kind: 'enum',   options: [] },
    tenure:    { label: 'tenure',         kind: 'enum',   options: ['renters','owners','mixed','unknown'] },
    support:   { label: 'support',        kind: 'range',  hint: '0.0 – 1.0', options: ['≥ 0.7 (firm)','≥ 0.5 (lean)','0.3 – 0.7 (persuadable)','≤ 0.3 (unfriendly)','unknown'] },
    ballots:   { label: 'ballot history', kind: 'enum',   options: ['voted 0 of 6','voted 1–2 of 6','voted 3–4 of 6','voted 5–6 of 6','any'] },
    issue:     { label: 'issue',          kind: 'enum',   options: ['housing','transit','climate','childcare','public safety','cost of living','any'] },
    contact:   { label: 'last contact',   kind: 'enum',   options: ['never','> 90 days','30–90 days','< 30 days'] },
    age:       { label: 'age band',       kind: 'enum',   options: ['18–29','30–44','45–59','60+','any'] },
    language:  { label: 'language',       kind: 'enum',   options: ['English','any'] },
  },
};

const UNIVERSE_DEFAULT = [];
const PDS = [];
const RIVER = '';
const LANDMARKS = [];
const VOTERS = [];
const CANVASSERS = [];
const SHIFTS = [];
const SCRIPTS = [];

const MODES = [
  { k:'door', label:'Door',  sub:[
    { k:'door-knock',    label:'Knock',    note:'Residential turf, full script + ID' },
    { k:'door-lit',      label:'Lit drop', note:'No interaction, just dropped' },
    { k:'door-petition', label:'Petition', note:'Issue-scoped, one ask, signature' },
    { k:'door-gotv',     label:'GOTV chase', note:'Election day: voted? ride?' },
  ]},
  { k:'phone', label:'Phone', sub:[
    { k:'phone-id',          label:'ID',          note:'Cold support read' },
    { k:'phone-persuasion',  label:'Persuasion',  note:'Full script, warm list' },
    { k:'phone-gotv',        label:'GOTV chase',  note:'Election day' },
  ]},
  { k:'text', label:'Text', sub:[
    { k:'text-broadcast',    label:'Broadcast',    note:'One-to-many macros' },
    { k:'text-persuasion',   label:'Persuasion',   note:'Threaded, 2-way' },
    { k:'text-gotv',         label:'GOTV chase',   note:'Election day' },
  ]},
  { k:'street', label:'Street', sub:[
    { k:'street-event',      label:'Event booth',  note:'Community fair, inbound' },
    { k:'street-sidewalk',   label:'Sidewalk',     note:'Public table, they come to you' },
  ]},
];

export { GROUND_VOCAB, UNIVERSE_DEFAULT, PDS, RIVER, LANDMARKS, VOTERS, CANVASSERS, SHIFTS, SCRIPTS, MODES };
