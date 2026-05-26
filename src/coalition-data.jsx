// Mandate 2.0 — Coalition data
//
// All entity seeds and decorative dashboard blobs are empty. Pages read
// live records from the database via useLiveRecords; KPIs / ops board /
// events / relationship graph render empty until real records exist.

export const COA_KPIS = {
  committed: { label:'COMMITTED ORGS',     value:'—', delta:'', sub:'', tone:'flat' },
  public:    { label:'PUBLIC ENDORSEMENTS',value:'—', delta:'', sub:'', tone:'flat' },
  reach:     { label:'COMBINED REACH',     value:'—', delta:'', sub:'', tone:'flat' },
  asks:      { label:'ASKS OPEN',          value:'—', delta:'', sub:'', tone:'flat' },
  ops:       { label:'JOINT OPS',          value:'—', delta:'', sub:'', tone:'flat' },
  events:    { label:'CO-HOSTED',          value:'—', delta:'', sub:'', tone:'flat' },
};

export const COA_LEDGER = [];
export const COA_ORGS = {};
export const COA_ASKS_STAGES = ['Queued','In discussion','Verbal yes','Delivered','Lost'];
export const COA_ASKS = [];
export const COA_OPS = [];
export const COA_COMMS = [];
export const COA_EVENTS = [];
export const COA_GRAPH = { nodes: [], edges: [] };
