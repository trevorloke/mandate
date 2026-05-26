// Opposition 2.0 — investigative dossier desk.
//
// All entity seeds and decorative dashboard blobs emptied. Pages read
// live records from the DB via useLiveRecords. OP_LEAD_STAGES is kept
// as a vocabulary (pipeline stage labels).

const OP_TARGETS = [];
const OP_CLAIMS = [];
const OP_EVIDENCE = [];
const OP_LEADS = [];

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
