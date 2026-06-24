// Margin — synthetic BC-flavoured seed dataset (spec §14). Clearly fake; the UI
// must label it sample data and never present it as real. Dates are fixed and
// params.asOf is pinned so the demo is fully reproducible (no wall-clock).

const ASOF = '2025-06-01';

// ── Single-contest fixture: a five-candidate mayoral race ────────────────────
// Projected turnout 120,000 (0.60 × 200,000 eligible). Your candidate (A) is the
// challenger; B is the incumbent. One recent internal poll; Ground covers ~30%.
export const singleFixture = {
  synthetic: true,
  name: 'Sample mayoral race',
  mode: 'single',
  system: { family: 'plurality' },
  yourParty: 'A',
  winningThreshold: null, // auto from candidate count (5-way plurality)
  parties: [
    { id: 'A', name: 'Okafor', color: '#111111' },
    { id: 'B', name: 'Reyes (incumbent)', color: '#c79a00', incumbency_adj: 0.03 },
    { id: 'C', name: 'Tran', color: '#6a645a' },
    { id: 'D', name: 'Dubois', color: '#9c8a3e' },
    { id: 'E', name: 'Singh', color: '#b8b2a2' },
  ],
  units: [{
    unit_id: 'city', region: 'all',
    eligible_voters: 200000, eligible_unregistered: 18000,
    turnout_history: 0.60, incumbent_party: 'B',
    partisan_baseline: { A: 0.30, B: 0.28, C: 0.20, D: 0.14, E: 0.08 },
    ground: {
      support_score_mean: 0.31, contact_rate: 0.30, id_contacts: 60000,
      confirmed_supporters: 18600, leaners: 8200, undecided_contacted: 9000,
    },
  }],
  polls: [
    { poll_id: 'internal-1', field_date: '2025-05-20', sample_size: 800, pollster_rating: 0.7, scope: 'contest',
      shares: { A: 0.31, B: 0.27, C: 0.20, D: 0.13, E: 0.07 }, house_effect: 0 },
  ],
  raise: { available_to_spend: 90000, cost_per_contact: 9 },
  ledger: { spending_cap: 250000, spent_to_date: 160000, cap_remaining: 90000 },
  params: { undecidedMethod: 'incumbent', asOf: ASOF, seed: 12345, iterations: 1000 },
};

// ── Seat-projection fixture: a 12-district provincial slice ───────────────────
// Three regions (Metro, Valley, Interior), three parties (A = you, B, C),
// majority threshold 7 of 12. Four genuine swing units so tipping points bite.
const REGIONS = { Metro: 'Metro', Valley: 'Valley', Interior: 'Interior' };
const seatUnit = (id, region, base, eligible, turnout, support, contact) => ({
  unit_id: id, region,
  eligible_voters: eligible, eligible_unregistered: Math.round(eligible * 0.08),
  turnout_history: turnout, incumbent_party: base.A >= base.B && base.A >= base.C ? 'A' : (base.B >= base.C ? 'B' : 'C'),
  partisan_baseline: base,
  ground: {
    support_score_mean: support, contact_rate: contact,
    id_contacts: Math.round(eligible * contact),
    confirmed_supporters: Math.round(eligible * contact * support),
    leaners: Math.round(eligible * contact * 0.18),
    undecided_contacted: Math.round(eligible * contact * 0.12),
  },
});

export const seatFixture = {
  synthetic: true,
  name: 'Sample provincial slice',
  mode: 'seat',
  system: { family: 'fptp-seats' },
  yourParty: 'A',
  threshold: 7,
  parties: [
    { id: 'A', name: 'Your party', color: '#111111' },
    { id: 'B', name: 'Opposition', color: '#c79a00' },
    { id: 'C', name: 'Third party', color: '#6a645a' },
  ],
  units: [
    // Metro — leans you, two swing
    seatUnit('metro-1', REGIONS.Metro, { A: 0.46, B: 0.34, C: 0.20 }, 58000, 0.62, 0.47, 0.42),
    seatUnit('metro-2', REGIONS.Metro, { A: 0.41, B: 0.39, C: 0.20 }, 61000, 0.60, 0.41, 0.38), // swing
    seatUnit('metro-3', REGIONS.Metro, { A: 0.50, B: 0.30, C: 0.20 }, 54000, 0.64, 0.50, 0.30),
    seatUnit('metro-4', REGIONS.Metro, { A: 0.39, B: 0.41, C: 0.20 }, 60000, 0.59, 0.39, 0.12), // swing, thin data
    // Valley — leans opposition, two swing
    seatUnit('valley-1', REGIONS.Valley, { A: 0.36, B: 0.46, C: 0.18 }, 49000, 0.57, 0.37, 0.20),
    seatUnit('valley-2', REGIONS.Valley, { A: 0.40, B: 0.42, C: 0.18 }, 52000, 0.58, 0.40, 0.34), // swing
    seatUnit('valley-3', REGIONS.Valley, { A: 0.33, B: 0.49, C: 0.18 }, 47000, 0.56, 0.34, 0.15),
    seatUnit('valley-4', REGIONS.Valley, { A: 0.41, B: 0.41, C: 0.18 }, 51000, 0.58, 0.41, 0.40), // swing
    // Interior — mixed
    seatUnit('interior-1', REGIONS.Interior, { A: 0.44, B: 0.38, C: 0.18 }, 43000, 0.55, 0.44, 0.22),
    seatUnit('interior-2', REGIONS.Interior, { A: 0.30, B: 0.40, C: 0.30 }, 40000, 0.54, 0.31, 0.10), // thin data
    seatUnit('interior-3', REGIONS.Interior, { A: 0.47, B: 0.35, C: 0.18 }, 45000, 0.56, 0.47, 0.28),
    seatUnit('interior-4', REGIONS.Interior, { A: 0.38, B: 0.42, C: 0.20 }, 44000, 0.55, 0.38, 0.18),
  ],
  polls: [
    { poll_id: 'metro-tracker', field_date: '2025-05-22', sample_size: 1200, pollster_rating: 0.75, scope: 'regional', region: 'Metro', shares: { A: 0.44, B: 0.36, C: 0.18 }, house_effect: 0 },
    { poll_id: 'valley-tracker', field_date: '2025-05-18', sample_size: 900, pollster_rating: 0.65, scope: 'regional', region: 'Valley', shares: { A: 0.39, B: 0.43, C: 0.16 }, house_effect: 0 },
    { poll_id: 'prov-wide', field_date: '2025-05-25', sample_size: 1500, pollster_rating: 0.7, scope: 'national', shares: { A: 0.42, B: 0.39, C: 0.17 }, house_effect: 0 },
  ],
  raise: { available_to_spend: 220000, cost_per_contact: 11 },
  ledger: { spending_cap: 1400000, spent_to_date: 1180000, cap_remaining: 220000 },
  params: { undecidedMethod: 'proportional', asOf: ASOF, seed: 12345, iterations: 1000 },
};

// ── Party-list PR fixture: a popular-vote → proportional-seats election ───────
// Five parties, six regions feeding one national popular vote, 100 seats by
// D'Hondt with a 5% electoral threshold (E sits just under it). Demonstrates the
// popular-vote model + proportional allocation — no districts.
const prRegion = (id, base, eligible, turnout) => ({
  unit_id: id, region: id,
  eligible_voters: eligible, eligible_unregistered: Math.round(eligible * 0.07),
  turnout_history: turnout, incumbent_party: null, partisan_baseline: base,
});
export const prFixture = {
  synthetic: true,
  name: 'Sample proportional election',
  mode: 'seat',
  system: { family: 'party-list-pr', allocation: 'dhondt', electoralThreshold: 0.05, totalSeats: 100, majoritySeats: 51 },
  yourParty: 'A',
  threshold: 51,
  parties: [
    { id: 'A', name: 'Your party', color: '#111111' },
    { id: 'B', name: 'Rivals', color: '#c79a00' },
    { id: 'C', name: 'Greens', color: '#3a7d44' },
    { id: 'D', name: 'Liberals', color: '#9c8a3e' },
    { id: 'E', name: 'Fringe', color: '#b8b2a2' },
  ],
  units: [
    prRegion('north', { A: 0.34, B: 0.30, C: 0.14, D: 0.16, E: 0.06 }, 220000, 0.62),
    prRegion('south', { A: 0.31, B: 0.33, C: 0.13, D: 0.18, E: 0.05 }, 260000, 0.60),
    prRegion('east', { A: 0.36, B: 0.28, C: 0.16, D: 0.15, E: 0.05 }, 190000, 0.58),
    prRegion('west', { A: 0.29, B: 0.31, C: 0.18, D: 0.18, E: 0.04 }, 240000, 0.61),
    prRegion('central', { A: 0.33, B: 0.30, C: 0.15, D: 0.17, E: 0.05 }, 280000, 0.63),
    prRegion('coast', { A: 0.35, B: 0.27, C: 0.17, D: 0.16, E: 0.05 }, 175000, 0.59),
  ],
  polls: [
    { poll_id: 'natl', field_date: '2025-05-24', sample_size: 2000, pollster_rating: 0.75, scope: 'national', shares: { A: 0.33, B: 0.30, C: 0.15, D: 0.17, E: 0.05 }, house_effect: 0 },
  ],
  raise: { available_to_spend: 400000, cost_per_contact: 10 },
  ledger: { spending_cap: 3000000, spent_to_date: 2600000, cap_remaining: 400000 },
  params: { undecidedMethod: 'proportional', asOf: ASOF, seed: 12345, iterations: 1000 },
};

// ── MMP fixture: the 12 districts above, topped up from lists to 24 total ─────
export const mmpFixture = {
  ...seatFixture,
  name: 'Sample mixed-member election',
  system: { family: 'mmp', allocation: 'sainte-lague', electoralThreshold: 0.03, totalSeats: 24, districtSeats: 12, listSeats: 12, majoritySeats: 13 },
  threshold: 13,
};

// ── At-large block-vote fixture: a nonpartisan municipal council ──────────────
// One at-large body, nine candidates for five seats; the top five win. Your
// candidate (C1) needs one seat, so the "majority" bar is 1. (BC municipal.)
export const atLargeFixture = {
  synthetic: true,
  name: 'Sample at-large council',
  mode: 'seat',
  system: { family: 'block-vote', totalSeats: 5, districtMagnitude: 5, majoritySeats: 1 },
  yourParty: 'C1',
  threshold: 1,
  parties: [
    { id: 'C1', name: 'Okonkwo', color: '#111111' },
    { id: 'C2', name: 'Bianchi', color: '#c79a00' },
    { id: 'C3', name: 'Haridto', color: '#3a7d44' },
    { id: 'C4', name: 'Nguyen', color: '#9c8a3e' },
    { id: 'C5', name: 'Park', color: '#6a645a' },
    { id: 'C6', name: 'Ferreira', color: '#7a8a3e' },
    { id: 'C7', name: 'Adeyemi', color: '#b8b2a2' },
    { id: 'C8', name: 'Olsen', color: '#9c6a3e' },
    { id: 'C9', name: 'Rourke', color: '#3e7a8a' },
  ],
  units: [{
    unit_id: 'city', region: 'all', eligible_voters: 90000, eligible_unregistered: 8000, turnout_history: 0.42,
    incumbent_party: 'C2',
    partisan_baseline: { C1: 0.15, C2: 0.16, C3: 0.13, C4: 0.12, C5: 0.11, C6: 0.09, C7: 0.08, C8: 0.08, C9: 0.08 },
    ground: { support_score_mean: 0.15, contact_rate: 0.18, id_contacts: 16000, confirmed_supporters: 2400, leaners: 1200, undecided_contacted: 2000 },
  }],
  polls: [
    { poll_id: 'civic-1', field_date: '2025-05-19', sample_size: 600, pollster_rating: 0.6, scope: 'contest',
      shares: { C1: 0.16, C2: 0.15, C3: 0.13, C4: 0.12, C5: 0.11, C6: 0.09, C7: 0.08, C8: 0.08, C9: 0.08 }, house_effect: 0 },
  ],
  raise: { available_to_spend: 40000, cost_per_contact: 7 },
  ledger: { spending_cap: 120000, spent_to_date: 92000, cap_remaining: 28000 },
  params: { undecidedMethod: 'proportional', asOf: ASOF, seed: 12345, iterations: 1000 },
};

// ── STV fixture: a single seven-seat district, three slates of three ──────────
// Single transferable vote with within-slate preference flows, so a slate can
// win several seats off quota + transfers. Your slate is A; majority is 4 of 7.
const SLATE_CANDS = ['A', 'B', 'C'].flatMap((s) => [1, 2, 3].map((n) => ({ id: `${s}${n}`, slate: s })));
function stvTransfers() {
  // Each candidate transfers mostly to same-slate mates, a little to others.
  const t = {};
  for (const c of SLATE_CANDS) {
    t[c.id] = {};
    for (const o of SLATE_CANDS) { if (o.id === c.id) continue; t[c.id][o.id] = o.slate === c.slate ? 0.8 : 0.1; }
  }
  return t;
}
export const stvFixture = {
  synthetic: true,
  name: 'Sample STV district',
  mode: 'seat',
  system: { family: 'stv', totalSeats: 7, districtMagnitude: 7, majoritySeats: 4, transfers: stvTransfers() },
  yourParty: 'A', // slate id
  threshold: 4,
  parties: [
    { id: 'A1', name: 'A · Mbeki', slate: 'A', color: '#111111' },
    { id: 'A2', name: 'A · Costa', slate: 'A', color: '#333333' },
    { id: 'A3', name: 'A · Lim', slate: 'A', color: '#555555' },
    { id: 'B1', name: 'B · Reyes', slate: 'B', color: '#c79a00' },
    { id: 'B2', name: 'B · Novak', slate: 'B', color: '#d6ad22' },
    { id: 'B3', name: 'B · Hassan', slate: 'B', color: '#e3c04a' },
    { id: 'C1', name: 'C · Green', slate: 'C', color: '#3a7d44' },
    { id: 'C2', name: 'C · Ade', slate: 'C', color: '#4f9159' },
    { id: 'C3', name: 'C · Roy', slate: 'C', color: '#67a571' },
  ],
  units: [{
    unit_id: 'district', region: 'all', eligible_voters: 140000, eligible_unregistered: 11000, turnout_history: 0.58,
    incumbent_party: null,
    partisan_baseline: { A1: 0.18, A2: 0.12, A3: 0.08, B1: 0.16, B2: 0.10, B3: 0.07, C1: 0.12, C2: 0.09, C3: 0.08 },
  }],
  polls: [
    { poll_id: 'stv-1', field_date: '2025-05-21', sample_size: 1000, pollster_rating: 0.7, scope: 'contest',
      shares: { A1: 0.19, A2: 0.12, A3: 0.07, B1: 0.16, B2: 0.10, B3: 0.07, C1: 0.12, C2: 0.09, C3: 0.08 }, house_effect: 0 },
  ],
  raise: { available_to_spend: 120000, cost_per_contact: 9 },
  ledger: { spending_cap: 500000, spent_to_date: 410000, cap_remaining: 90000 },
  params: { undecidedMethod: 'proportional', asOf: ASOF, seed: 12345, iterations: 1000 },
};

// ── Electoral college fixture: winner-take-all states → 100 electors ──────────
// Two main parties; eight states with electors summing to 100, majority 51.
// Three states are genuine swings so tipping (swing-state) analysis bites.
const ecState = (id, electors, base, eligible, turnout) => ({
  unit_id: id, region: id, electors,
  eligible_voters: eligible, eligible_unregistered: Math.round(eligible * 0.06),
  turnout_history: turnout, incumbent_party: base.A >= base.B ? 'A' : 'B', partisan_baseline: base,
});
export const electoralCollegeFixture = {
  synthetic: true,
  name: 'Sample electoral college',
  mode: 'seat',
  system: { family: 'electoral-college', totalSeats: 100, majoritySeats: 51 },
  yourParty: 'A',
  threshold: 51,
  parties: [
    { id: 'A', name: 'Your ticket', color: '#111111' },
    { id: 'B', name: 'Opposing ticket', color: '#c79a00' },
  ],
  units: [
    ecState('Safe North', 20, { A: 0.58, B: 0.42 }, 5000000, 0.64),
    ecState('Safe South', 18, { A: 0.40, B: 0.60 }, 4600000, 0.60),
    ecState('Lakeside', 16, { A: 0.50, B: 0.50 }, 4200000, 0.66), // swing
    ecState('Riverbend', 14, { A: 0.49, B: 0.51 }, 3800000, 0.63), // swing
    ecState('Heartland', 12, { A: 0.46, B: 0.54 }, 3000000, 0.61),
    ecState('Gulf Coast', 10, { A: 0.51, B: 0.49 }, 2600000, 0.59), // swing
    ecState('Highlands', 6, { A: 0.55, B: 0.45 }, 1500000, 0.58),
    ecState('Capital', 4, { A: 0.62, B: 0.38 }, 1100000, 0.67),
  ],
  polls: [
    { poll_id: 'natl-ec', field_date: '2025-05-26', sample_size: 2500, pollster_rating: 0.75, scope: 'national', shares: { A: 0.50, B: 0.50 }, house_effect: 0 },
    { poll_id: 'lakeside', field_date: '2025-05-24', sample_size: 900, pollster_rating: 0.7, scope: 'regional', region: 'Lakeside', shares: { A: 0.50, B: 0.50 }, house_effect: 0 },
  ],
  raise: { available_to_spend: 5000000, cost_per_contact: 14 },
  ledger: { spending_cap: 90000000, spent_to_date: 85000000, cap_remaining: 5000000 },
  params: { undecidedMethod: 'proportional', asOf: ASOF, seed: 12345, iterations: 1000 },
};

// A held-out "actual" past result for the backtest screen (§9). Synthetic.
export const seatBacktestActual = { yourSeats: 6 };       // came up one short of the 7 threshold
export const singleBacktestActual = { yourShare: 0.33, win: true };

export const FIXTURES = {
  single: { key: 'single', label: 'Plurality race', fixture: singleFixture },
  seat: { key: 'seat', label: 'FPTP seats', fixture: seatFixture },
  pr: { key: 'pr', label: 'Proportional', fixture: prFixture },
  mmp: { key: 'mmp', label: 'Mixed-member', fixture: mmpFixture },
  atlarge: { key: 'atlarge', label: 'At-large council', fixture: atLargeFixture },
  stv: { key: 'stv', label: 'STV district', fixture: stvFixture },
  ec: { key: 'ec', label: 'Electoral college', fixture: electoralCollegeFixture },
};
