// Opposition 2.0 — investigative dossier desk.
//
// All entity seeds and decorative dashboard blobs emptied. Pages read
// live records from the DB via useLiveRecords. OP_LEAD_STAGES is kept
// as a vocabulary (pipeline stage labels).

// ── Seed: targets (kind 'target') ──────────────────────────────────────
const OP_TARGETS = [
  {
    id: 'op-tgt-1', name: 'Hon. Gerald Voss', role: 'Incumbent MLA', party: 'Provincial Unity',
    riding: 'Saanich North', photo: 'GV', threat: 'critical', dossierStatus: 'live',
    note: 'Front-bench, well-funded; vulnerable on ferry file. [SAMPLE DATA]',
    evidenceCount: 3, claimsTracked: 4, openLeads: 2,
    weaknesses: ['Flip-flopped on ferry fares', 'Donor-developer ties'],
    strengths: ['Strong name ID', 'Disciplined messaging', 'Big war chest'],
  },
  {
    id: 'op-tgt-2', name: 'Councillor Brenda Hale', role: 'Challenger', party: 'Coast Forward',
    riding: 'Esquimalt', photo: 'BH', threat: 'high', dossierStatus: 'live',
    note: 'Rising profile on housing; thin record to attack. [SAMPLE DATA]',
    evidenceCount: 2, claimsTracked: 2, openLeads: 1,
    weaknesses: ['Missed 40% of council votes'],
    strengths: ['Authentic on housing', 'Good earned media'],
  },
  {
    id: 'op-tgt-3', name: 'Dr. Anil Kapoor', role: 'Incumbent MLA', party: 'Provincial Unity',
    riding: 'Oak Bay', photo: 'AK', threat: 'medium', dossierStatus: 'monitoring',
    note: 'Low-key backbencher; watch committee remarks. [SAMPLE DATA]',
    evidenceCount: 1, claimsTracked: 1, openLeads: 0,
    weaknesses: ['Absent on health crisis'],
    strengths: ['Credible on science', 'Clean record'],
  },
  {
    id: 'op-tgt-4', name: 'Marcus Tran', role: 'Challenger', party: 'Independent',
    riding: 'Victoria–Swan Lake', photo: 'MT', threat: 'low', dossierStatus: 'monitoring',
    note: 'Single-issue candidate; limited reach. [SAMPLE DATA]',
    evidenceCount: 0, claimsTracked: 1, openLeads: 1,
    weaknesses: ['No ground game'],
    strengths: ['Passionate base'],
  },
];

// ── Seed: claims (kind 'claim') ────────────────────────────────────────
const OP_CLAIMS = [
  {
    id: 'op-clm-1', target: 'op-tgt-1', date: '2026-06-18', venue: 'All-candidates forum',
    channel: 'video', clipMin: '12:40', topic: 'Ferries', visibility: 'high',
    quote: 'I have always opposed fare hikes on the coastal route. [SAMPLE]',
    verdict: 'contradicted-record', heat: 0.88,
    evidenceIds: ['op-ev-1', 'op-ev-2'], rebuttalId: null,
  },
  {
    id: 'op-clm-2', target: 'op-tgt-1', date: '2026-06-12', venue: 'CFAX 1070 interview',
    channel: 'radio', clipMin: '', topic: 'Housing', visibility: 'medium',
    quote: 'No developer has ever funded my campaign. [SAMPLE]',
    verdict: 'false', heat: 0.74,
    evidenceIds: ['op-ev-3'], rebuttalId: null,
  },
  {
    id: 'op-clm-3', target: 'op-tgt-2', date: '2026-06-09', venue: 'Council chamber',
    channel: 'transcript', clipMin: '', topic: 'Attendance', visibility: 'low',
    quote: 'I never miss a vote that matters to my constituents. [SAMPLE]',
    verdict: 'misleading', heat: 0.51,
    evidenceIds: ['op-ev-4'], rebuttalId: null,
  },
  {
    id: 'op-clm-4', target: 'op-tgt-2', date: '2026-05-30', venue: 'Twitter / X',
    channel: 'social', clipMin: '', topic: 'Housing', visibility: 'medium',
    quote: 'Our plan adds 5,000 homes by next spring. [SAMPLE]',
    verdict: 'arguable', heat: 0.42,
    evidenceIds: [], rebuttalId: null,
  },
  {
    id: 'op-clm-5', target: 'op-tgt-3', date: '2026-05-22', venue: 'Health committee',
    channel: 'transcript', clipMin: '', topic: 'Health', visibility: 'low',
    quote: 'Wait-times in Island Health are at an all-time low. [SAMPLE]',
    verdict: 'true · damaging', heat: 0.33,
    evidenceIds: ['op-ev-5'], rebuttalId: null,
  },
];

// ── Seed: evidence (kind 'evidence') ───────────────────────────────────
const OP_EVIDENCE = [
  {
    id: 'op-ev-1', kind: 'video', vault: 'public', strength: 'A',
    title: '2024 budget speech — voted FOR ferry fare increase [SAMPLE]',
    summary: 'Hansard footage of recorded division supporting the fare schedule. [SAMPLE DATA]',
    source: 'Legislative Assembly of BC', date: '2024-03-11', linked: ['op-clm-1'],
  },
  {
    id: 'op-ev-2', kind: 'document', vault: 'public', strength: 'A+',
    title: 'Order Paper — Division 84 voting record [SAMPLE]',
    summary: 'Official record showing the member among the yeas. [SAMPLE DATA]',
    source: 'Votes and Proceedings', date: '2024-03-11', linked: ['op-clm-1'],
  },
  {
    id: 'op-ev-3', kind: 'document', vault: 'foi-cleared', strength: 'B',
    title: 'Elections BC financing return — developer contributions [SAMPLE]',
    summary: 'Filed return listing three named development-sector donors. [SAMPLE DATA]',
    source: 'Elections BC', date: '2025-01-30', linked: ['op-clm-2'],
  },
  {
    id: 'op-ev-4', kind: 'record', vault: 'public', strength: 'B',
    title: 'Municipal council attendance log 2025 [SAMPLE]',
    summary: 'Clerk-published attendance showing missed regular votes. [SAMPLE DATA]',
    source: 'District of Esquimalt', date: '2025-12-15', linked: ['op-clm-3'],
  },
  {
    id: 'op-ev-5', kind: 'data', vault: 'restricted', strength: 'C',
    title: 'Leaked Island Health internal wait-time dashboard [SAMPLE]',
    summary: 'Unverified internal figures suggesting rising surgical waits. [SAMPLE DATA]',
    source: 'Confidential source · K-2', date: '2026-05-20', linked: ['op-clm-5'],
  },
];

// ── Seed: leads (kind 'lead') ──────────────────────────────────────────
const OP_LEADS = [
  {
    id: 'op-lead-1', target: 'op-tgt-1', topic: 'Second numbered company tied to donor [SAMPLE]',
    status: 'investigating', priority: 'A', owner: 'Renée Boudreau',
    confidence: 0.66, source: 'foi', age: 9, redactions: 1, sublead: 2,
  },
  {
    id: 'op-lead-2', target: 'op-tgt-1', topic: 'Undisclosed lobbyist meeting calendar [SAMPLE]',
    status: 'verifying', priority: 'A', owner: '—',
    confidence: 0.41, source: 'tip', age: 3, redactions: 0, sublead: 0,
  },
  {
    id: 'op-lead-3', target: 'op-tgt-2', topic: 'Rezoning vote conflict of interest [SAMPLE]',
    status: 'collecting', priority: 'B', owner: 'Sam Okafor',
    confidence: 0.55, source: 'public', age: 14, redactions: 0, sublead: 1,
  },
  {
    id: 'op-lead-4', target: 'op-tgt-3', topic: 'Committee remark vs. ministry briefing [SAMPLE]',
    status: 'corroborating', priority: 'C', owner: 'Sam Okafor',
    confidence: 0.72, source: 'public', age: 21, redactions: 0, sublead: 0,
  },
  {
    id: 'op-lead-5', target: 'op-tgt-4', topic: 'Anonymous flyer funding question [SAMPLE]',
    status: 'cold', priority: 'C', owner: '—',
    confidence: 0.30, source: 'leak', age: 33, redactions: 2, sublead: 0,
  },
];

const OP_LEAD_STAGES = [
  { k: 'cold',              label: 'COLD' },
  { k: 'collecting',        label: 'COLLECTING' },
  { k: 'verifying',         label: 'VERIFYING' },
  { k: 'investigating',     label: 'INVESTIGATING' },
  { k: 'corroborating',     label: 'CORROBORATING' },
  { k: 'evidence-secured',  label: 'EVIDENCE SECURED' },
];

const OP_REBUTTALS = [];
const OP_MONITORS = [];
const OP_SOURCES = [];

export { OP_TARGETS, OP_CLAIMS, OP_EVIDENCE, OP_LEADS, OP_LEAD_STAGES, OP_REBUTTALS, OP_MONITORS, OP_SOURCES };
