// Electoral systems — the shared, suite-wide definition of how votes become a
// result. Pure math, no UI, no BC/Canada assumptions: Margin uses it to resolve
// every simulation, and other modules (Civic, Ground) can import the same
// registry so "what system is this contest" means one thing across Mandate.
//
// Two output families:
//   single — one winner; report win probability + margin
//   seat   — a body of seats; report a seat distribution + majority odds
//
// Within those, `family` is the rule. Adding a new rule is a function here plus
// a registry entry — nothing else in the engine changes.

const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const vals = (o) => Object.values(o);
function normalize(obj) {
  const t = sum(vals(obj)) || 1;
  const out = {}; for (const k of Object.keys(obj)) out[k] = obj[k] / t; return out;
}

export const SYSTEMS = {
  // single-winner
  'plurality': { id: 'plurality', label: 'Plurality (first past the post)', output: 'single', district: false, blurb: 'Most votes wins. One round.' },
  'majority-runoff': { id: 'majority-runoff', label: 'Two-round runoff', output: 'single', district: false, blurb: 'Majority required; top two go to a runoff.' },
  'ranked-choice': { id: 'ranked-choice', label: 'Ranked choice (instant runoff)', output: 'single', district: false, blurb: 'Eliminate last, transfer preferences, until a majority.' },
  'supermajority': { id: 'supermajority', label: 'Supermajority threshold', output: 'single', district: false, blurb: 'A set bar (e.g. 60%) must be cleared, or the measure fails.' },
  // seat-allocating
  'fptp-seats': { id: 'fptp-seats', label: 'Single-member districts (FPTP)', output: 'seat', district: true, blurb: 'Each district elects one member by plurality.' },
  'block-vote': { id: 'block-vote', label: 'At-large block vote', output: 'seat', district: false, multiMember: true, blurb: 'One at-large body; the top vote-getters fill every seat. Common in BC municipal councils.' },
  'stv': { id: 'stv', label: 'Single transferable vote', output: 'seat', district: false, multiMember: true, blurb: 'Multi-member, ranked ballots, Droop quota with surplus + elimination transfers.' },
  'party-list-pr': { id: 'party-list-pr', label: 'Party-list proportional', output: 'seat', district: false, blurb: 'Seats split in proportion to the vote, by a chosen formula.' },
  'mmp': { id: 'mmp', label: 'Mixed-member proportional', output: 'seat', district: true, blurb: 'District seats topped up from lists toward proportionality (compensatory).' },
  'parallel': { id: 'parallel', label: 'Parallel (mixed-member majoritarian)', output: 'seat', district: true, blurb: 'District seats plus a separate, non-compensatory proportional list tier.' },
  'popular-pr': { id: 'popular-pr', label: 'Popular vote to proportional seats', output: 'seat', district: false, blurb: 'A single popular vote allocated proportionally to seats.' },
};

export const ALLOCATION_METHODS = {
  'dhondt': 'D’Hondt (highest averages)',
  'sainte-lague': 'Sainte-Laguë (highest averages)',
  'largest-remainder-hare': 'Largest remainder (Hare quota)',
  'largest-remainder-droop': 'Largest remainder (Droop quota)',
};

// Normalize a partial system spec into a complete one (back-compatible: a bare
// mode 'single'|'seat' maps to plurality / FPTP).
export function resolveSystem(config) {
  const s = config.system || {};
  let family = s.family;
  if (!family) family = config.mode === 'seat' ? 'fptp-seats' : 'plurality';
  const def = SYSTEMS[family] || SYSTEMS.plurality;
  const totalSeats = s.totalSeats || (config.units ? config.units.length : 0);
  return {
    family, output: def.output, district: def.district, multiMember: !!def.multiMember,
    winThreshold: s.winThreshold ?? (family === 'supermajority' ? 0.6 : 0.5), // runoff / supermajority bar
    allocation: s.allocation || 'dhondt',
    electoralThreshold: s.electoralThreshold ?? 0,        // min vote share to win seats
    totalSeats,
    districtSeats: s.districtSeats ?? (config.units ? config.units.length : 0),
    listSeats: s.listSeats ?? 0,
    districtMagnitude: s.districtMagnitude ?? totalSeats, // seats per at-large/STV district
    transfers: s.transfers || null,                       // {fromId:{toId:weight}} preference flows
    majoritySeats: s.majoritySeats ?? config.threshold ?? (Math.floor(totalSeats / 2) + 1),
  };
}

// Group seats by slate when contenders are individual candidates (at-large/STV);
// for party systems the group is just the party id.
export const groupOf = (parties, id) => {
  const p = (parties || []).find((x) => x.id === id);
  return (p && p.slate) || id;
};
const groupsOf = (parties, fallbackKeys) =>
  [...new Set(parties && parties.length ? parties.map((p) => p.slate || p.id) : fallbackKeys)];

// ── Seat allocation ─────────────────────────────────────────────────────────
// Apply an electoral threshold: parties below `thr` share win no seats.
function applyThreshold(votes, thr) {
  if (!thr) return { ...votes };
  const total = sum(vals(votes)) || 1;
  const out = {};
  for (const p of Object.keys(votes)) out[p] = (votes[p] / total) >= thr ? votes[p] : 0;
  return out;
}

// Highest-averages (D'Hondt divisors 1,2,3…; Sainte-Laguë 1,3,5…).
export function highestAverages(votes, seats, method = 'dhondt') {
  const parties = Object.keys(votes);
  const res = Object.fromEntries(parties.map((p) => [p, 0]));
  for (let s = 0; s < seats; s++) {
    let best = null, bestQ = -Infinity;
    for (const p of parties) {
      if (votes[p] <= 0) continue;
      const div = method === 'sainte-lague' ? (2 * res[p] + 1) : (res[p] + 1);
      const q = votes[p] / div;
      if (q > bestQ) { bestQ = q; best = p; }
    }
    if (best == null) break;
    res[best] += 1;
  }
  return res;
}

// Largest remainder (Hare quota = total/seats; Droop = floor(total/(seats+1))+1).
export function largestRemainder(votes, seats, quotaType = 'hare') {
  const parties = Object.keys(votes);
  const total = sum(parties.map((p) => Math.max(0, votes[p])));
  if (total <= 0 || seats <= 0) return Object.fromEntries(parties.map((p) => [p, 0]));
  const quota = quotaType === 'droop' ? (Math.floor(total / (seats + 1)) + 1) : (total / seats);
  const res = {}; const rema = []; let used = 0;
  for (const p of parties) {
    const q = Math.max(0, votes[p]) / quota;
    const floor = Math.floor(q);
    res[p] = floor; used += floor; rema.push([p, q - floor]);
  }
  rema.sort((a, b) => b[1] - a[1]);
  let i = 0;
  while (used < seats && rema.length) { res[rema[i % rema.length][0]] += 1; used += 1; i += 1; }
  return res;
}

// Dispatcher: allocate `seats` from `votes` by method, after the threshold.
export function allocateSeats(votes, seats, method = 'dhondt', electoralThreshold = 0) {
  const filtered = applyThreshold(votes, electoralThreshold);
  if (method === 'largest-remainder-hare') return largestRemainder(filtered, seats, 'hare');
  if (method === 'largest-remainder-droop') return largestRemainder(filtered, seats, 'droop');
  return highestAverages(filtered, seats, method === 'sainte-lague' ? 'sainte-lague' : 'dhondt');
}

// ── Single-winner resolvers ──────────────────────────────────────────────────
// Each takes share-like values per party id and returns { winner, margin } where
// margin is the final-round two-way gap as a fraction of the active total.

export function pluralityResolve(shares) {
  const ids = Object.keys(shares);
  const sorted = ids.sort((a, b) => shares[b] - shares[a]);
  const total = sum(vals(shares)) || 1;
  return { winner: sorted[0], margin: (shares[sorted[0]] - (shares[sorted[1]] || 0)) / total, round: 1 };
}

export function runoffResolve(shares, sys) {
  const ids = Object.keys(shares);
  const total = sum(vals(shares)) || 1;
  const sorted = ids.sort((a, b) => shares[b] - shares[a]);
  if (shares[sorted[0]] / total >= (sys.winThreshold ?? 0.5)) {
    return { winner: sorted[0], margin: (shares[sorted[0]] - (shares[sorted[1]] || 0)) / total, round: 1 };
  }
  const [f1, f2] = sorted;
  let t1 = shares[f1], t2 = shares[f2];
  for (const p of sorted.slice(2)) {
    const w1 = sys.transfers?.[p]?.[f1] ?? shares[f1];
    const w2 = sys.transfers?.[p]?.[f2] ?? shares[f2];
    const ws = (w1 + w2) || 1;
    t1 += shares[p] * (w1 / ws); t2 += shares[p] * (w2 / ws);
  }
  const winner = t1 >= t2 ? f1 : f2;
  return { winner, margin: Math.abs(t1 - t2) / total, round: 2 };
}

export function irvResolve(shares, sys) {
  let active = Object.keys(shares);
  const tally = { ...shares };
  const total = sum(vals(shares)) || 1;
  let guard = active.length + 1;
  while (guard-- > 0) {
    const activeTotal = sum(active.map((p) => tally[p])) || 1;
    const sorted = [...active].sort((a, b) => tally[b] - tally[a]);
    if (tally[sorted[0]] / activeTotal > 0.5 || active.length <= 2) {
      return { winner: sorted[0], margin: (tally[sorted[0]] - (tally[sorted[1]] || 0)) / total, round: Object.keys(shares).length - active.length + 1 };
    }
    const loser = [...active].sort((a, b) => tally[a] - tally[b])[0];
    const pot = tally[loser]; tally[loser] = 0;
    active = active.filter((p) => p !== loser);
    let wsum = 0; const w = {};
    for (const r of active) { w[r] = Math.max(0, sys.transfers?.[loser]?.[r] ?? tally[r]); wsum += w[r]; }
    for (const r of active) tally[r] += pot * (wsum > 0 ? w[r] / wsum : 1 / active.length);
  }
  const sorted = Object.keys(shares).sort((a, b) => tally[b] - tally[a]);
  return { winner: sorted[0], margin: (tally[sorted[0]] - (tally[sorted[1]] || 0)) / total, round: 0 };
}

// Supermajority: the leader must clear winThreshold or the measure fails (no
// winner). Used for referenda / amendments and high-bar elections.
export function supermajorityResolve(shares, sys) {
  const total = sum(vals(shares)) || 1;
  const sorted = Object.keys(shares).sort((a, b) => shares[b] - shares[a]);
  const lead = sorted[0];
  const passed = shares[lead] / total >= (sys.winThreshold ?? 0.6);
  return { winner: passed ? lead : null, margin: (shares[lead] - (shares[sorted[1]] || 0)) / total, round: 1, passed };
}

// Resolve a single-winner contest by family.
export function resolveSingle(shares, sys) {
  if (sys.family === 'majority-runoff') return runoffResolve(shares, sys);
  if (sys.family === 'ranked-choice') return irvResolve(shares, sys);
  if (sys.family === 'supermajority') return supermajorityResolve(shares, sys);
  return pluralityResolve(shares);
}

// At-large block vote / SNTV: the top `magnitude` contenders by vote each win a
// seat. (Block vote and SNTV differ in how voters cast ballots; once we model
// the resulting per-contender shares, both reduce to "top M win".)
export function blockVoteElect(votes, magnitude) {
  return Object.keys(votes).sort((a, b) => votes[b] - votes[a]).slice(0, magnitude);
}

// Single transferable vote: Droop quota, surplus transfers (fractional, by
// preference flow), elimination of the lowest, until `magnitude` are elected.
export function stvElect(votes, magnitude, transfers) {
  const cands = Object.keys(votes);
  const tally = { ...votes };
  const total = sum(cands.map((c) => Math.max(0, votes[c])));
  if (total <= 0 || magnitude <= 0) return [];
  const quota = Math.floor(total / (magnitude + 1)) + 1;
  const elected = []; const eliminated = [];
  const active = () => cands.filter((c) => !elected.includes(c) && !eliminated.includes(c));

  const distribute = (pot, from, remaining) => {
    if (pot <= 0 || !remaining.length) return;
    let wsum = 0; const w = {};
    for (const r of remaining) { w[r] = Math.max(0, transfers?.[from]?.[r] ?? tally[r]); wsum += w[r]; }
    for (const r of remaining) tally[r] += pot * (wsum > 0 ? w[r] / wsum : 1 / remaining.length);
  };

  let guard = cands.length * 2 + 5;
  while (elected.length < magnitude && guard-- > 0) {
    const act = active();
    if (act.length + elected.length <= magnitude) { for (const c of act) elected.push(c); break; }
    const over = act.filter((c) => tally[c] >= quota).sort((a, b) => tally[b] - tally[a]);
    if (over.length) {
      const c = over[0]; const surplus = tally[c] - quota;
      tally[c] = quota; elected.push(c);
      distribute(surplus, c, active());
    } else {
      const low = [...act].sort((a, b) => tally[a] - tally[b])[0];
      const pot = tally[low]; tally[low] = 0; eliminated.push(low);
      distribute(pot, low, active());
    }
  }
  while (elected.length < magnitude) { const r = active().sort((a, b) => tally[b] - tally[a])[0]; if (!r) break; elected.push(r); }
  return elected;
}

// Resolve a seat body from per-district winners + the aggregate popular vote.
// Always returns seats keyed by GROUP (slate or party id), so candidate-based
// systems (at-large, STV) roll up to the contesting slate.
export function resolveSeats(districtWins, popVotes, sys, parties) {
  const groups = groupsOf(parties, Object.keys(popVotes));
  const g = (id) => groupOf(parties, id);
  const zero = () => Object.fromEntries(groups.map((x) => [x, 0]));
  const rollup = (perId) => { const s = zero(); for (const id of Object.keys(perId)) s[g(id)] = (s[g(id)] || 0) + perId[id]; return s; };

  if (sys.family === 'fptp-seats') return rollup(districtWins);

  if (sys.family === 'block-vote') {
    const won = blockVoteElect(popVotes, sys.districtMagnitude || sys.totalSeats);
    const s = zero(); for (const id of won) s[g(id)] += 1; return s;
  }
  if (sys.family === 'stv') {
    const won = stvElect(popVotes, sys.districtMagnitude || sys.totalSeats, sys.transfers);
    const s = zero(); for (const id of won) s[g(id)] += 1; return s;
  }
  if (sys.family === 'parallel') {
    // District tier (majoritarian) + an independent, non-compensatory PR list tier.
    const list = allocateSeats(popVotes, sys.listSeats, sys.allocation, sys.electoralThreshold);
    const s = rollup(districtWins);
    const lg = rollup(list);
    for (const x of groups) s[x] += lg[x];
    return s;
  }
  const entitlement = allocateSeats(popVotes, sys.totalSeats, sys.allocation, sys.electoralThreshold);
  if (sys.family === 'mmp') {
    const dg = rollup(districtWins); const eg = rollup(entitlement);
    const s = {}; for (const x of groups) s[x] = Math.max(dg[x] || 0, eg[x] || 0);
    return s;
  }
  return rollup(entitlement); // party-list-pr, popular-pr
}

export { normalize };
