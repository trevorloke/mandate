// Margin Phase 4 — assemble a forecast contest from live workspace records.
//
// The campaign stores its electoral picture as module data:
//   margin.contest  — one record: parties, yourParty, system, ledger, raise
//   margin.district — one per unit: eligible_voters, turnout_history,
//                     partisan_baseline {partyId: share}, ground {...}, electors?
//   margin.poll     — one per poll: field_date, sample_size, scope, shares {...}
//
// This builder turns those into the exact config the (client) engine consumes,
// so Margin forecasts off real data instead of fixtures. Pure: it takes already-
// parsed record data and returns a config; the route does the DB read.
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

// Coerce a district record's flat fields into the engine's unit shape. Accepts
// either a nested `partisan_baseline` object or flat `baseline_<id>` fields.
function toUnit(d, partyIds) {
  const baseline = (d.partisan_baseline && typeof d.partisan_baseline === 'object') ? { ...d.partisan_baseline } : {};
  for (const p of partyIds) if (d[`baseline_${p}`] != null) baseline[p] = num(d[`baseline_${p}`]);
  const unit = {
    unit_id: String(d.unit_id || d.id || ''),
    region: d.region || 'all',
    eligible_voters: num(d.eligible_voters),
    eligible_unregistered: num(d.eligible_unregistered),
    turnout_history: num(d.turnout_history, 0.5),
    incumbent_party: d.incumbent_party || null,
    partisan_baseline: baseline,
  };
  if (d.electors != null) unit.electors = num(d.electors);
  if (d.ground && typeof d.ground === 'object') unit.ground = d.ground;
  else if (d.support_score_mean != null) {
    unit.ground = {
      support_score_mean: num(d.support_score_mean), contact_rate: num(d.contact_rate),
      id_contacts: num(d.id_contacts), confirmed_supporters: num(d.confirmed_supporters),
      leaners: num(d.leaners), undecided_contacted: num(d.undecided_contacted),
    };
  }
  return unit;
}

function toPoll(p, partyIds) {
  const shares = (p.shares && typeof p.shares === 'object') ? { ...p.shares } : {};
  for (const id of partyIds) if (p[`share_${id}`] != null) shares[id] = num(p[`share_${id}`]);
  return {
    poll_id: String(p.poll_id || p.id || ''),
    field_date: p.field_date || null,
    sample_size: num(p.sample_size, 500),
    pollster_rating: p.pollster_rating != null ? num(p.pollster_rating, 0.6) : 0.6,
    scope: p.scope || 'contest',
    region: p.region || null,
    shares,
    house_effect: num(p.house_effect, 0),
  };
}

// contest: parsed margin.contest data; districts/polls: arrays of parsed data.
// Returns { config } or { error } when the contest is not configured.
export function buildContestConfig(contest, districts = [], polls = [], { asOf = null } = {}) {
  if (!contest || !Array.isArray(contest.parties) || !contest.parties.length) {
    return { error: 'No contest configured. Add a margin.contest record with parties and yourParty.' };
  }
  if (!districts.length) return { error: 'No districts. Add margin.district records.' };
  const partyIds = contest.parties.map((p) => p.id);
  const yourParty = contest.yourParty || partyIds[0];

  const config = {
    synthetic: false,
    name: contest.name || 'Workspace contest',
    mode: contest.mode || (contest.system?.family && contest.system.family !== 'plurality' ? 'seat' : 'single'),
    system: contest.system || { family: 'fptp-seats' },
    parties: contest.parties,
    yourParty,
    threshold: contest.threshold != null ? num(contest.threshold) : undefined,
    winningThreshold: contest.winningThreshold != null ? num(contest.winningThreshold) : null,
    units: districts.map((d) => toUnit(d, partyIds)).filter((u) => u.unit_id),
    polls: polls.map((p) => toPoll(p, partyIds)).filter((p) => Object.keys(p.shares).length),
    raise: contest.raise || { available_to_spend: 0, cost_per_contact: 10 },
    ledger: contest.ledger || { spending_cap: 0, spent_to_date: 0, cap_remaining: 0 },
    params: { undecidedMethod: contest.undecidedMethod || 'proportional', asOf, seed: num(contest.seed, 12345), iterations: num(contest.iterations, 1000) },
  };
  // Derive cap_remaining if only cap + spent were given.
  if (config.ledger && config.ledger.cap_remaining == null && config.ledger.spending_cap != null) {
    config.ledger.cap_remaining = num(config.ledger.spending_cap) - num(config.ledger.spent_to_date);
  }
  if (!config.units.length) return { error: 'Districts present but none had a unit_id.' };
  return { config };
}
