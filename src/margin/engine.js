// Margin — the forecasting + path-to-victory engine. Pure, framework-agnostic
// (no UI, no browser, no DOM): runs client-side in the demo, server-side later,
// and inside the node test harness unchanged. Every public function is a plain
// function over plain data.
//
// THE load-bearing rule (spec §5.3): district outcomes are correlated through a
// single national swing drawn ONCE per simulation and applied to every unit.
// Districts are never independent — independence makes errors cancel and yields
// absurdly narrow, overconfident seat distributions. runSimulation() draws
// e_nat once per iteration; the margin.test.js suite asserts the resulting seat
// variance is realistically wide.
//
// The electoral system (plurality / runoff / ranked-choice / FPTP seats /
// party-list PR / MMP / popular-PR) is resolved per simulation via ./systems.js,
// so Margin is system-agnostic and universal, not BC/FPTP-only.
import { resolveSystem, resolveSingle, resolveSeats, normalize } from './systems.js';

// ── Seeded RNG (mulberry32) + Box-Muller normals ───────────────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Standard normal via Box-Muller from the seeded uniform stream.
export function normal(rng, mean = 0, sd = 1) {
  let u1 = rng(); if (u1 < 1e-12) u1 = 1e-12;
  const u2 = rng();
  return mean + sd * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── Small helpers ──
const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const ln = (x) => Math.log(Math.max(x, 1e-9));

function quantile(sortedAsc, q) {
  if (!sortedAsc.length) return 0;
  const pos = clamp(q, 0, 1) * (sortedAsc.length - 1);
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (pos - lo);
}
const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);

// Default simulation parameters (spec §5.3, §5.5, §8.1).
export const DEFAULT_PARAMS = {
  iterations: 1000,
  seed: 12345,
  sigma_nat: 0.03,        // shared national swing (log-odds) — the fat-tail term
  sigma_reg: 0.02,        // per-region swing
  sigma_loc: 0.03,        // per-unit idiosyncratic
  sigma_turnout: 0.04,
  pollHalfLifeDays: 30,
  undecidedMethod: 'proportional', // 'proportional' | 'incumbent' | 'partisan'
  cushion: 0.04,
  asOf: null,             // ISO date for poll-age weighting; null → newest poll date
  // Base blend weights (re-weighted by data availability in buildPointEstimates).
  baseWeights: { fund: 0.34, poll: 0.33, ground: 0.33 },
};

// ── §4 Point estimate ───────────────────────────────────────────────────────
// Effective weight of one poll: quality × recency (30-day half-life) × sample.
function pollWeight(poll, asOfMs, halfLifeDays) {
  const rating = poll.pollster_rating ?? 0.6;
  const ageDays = Math.max(0, (asOfMs - new Date(poll.field_date).getTime()) / 86400000);
  const recency = Math.pow(0.5, ageDays / halfLifeDays);
  const sampleFactor = Math.min(1, Math.sqrt(poll.sample_size || 0) / Math.sqrt(1000));
  return rating * recency * sampleFactor;
}

// Polls applicable to a unit: contest-scope always; regional-scope on match;
// unit-scope on match. Returns blended shares + a 0..1 strength.
function pollShareFor(unit, parties, polls, asOfMs, halfLifeDays) {
  const applicable = polls.filter((p) =>
    p.scope === 'contest' || p.scope === 'national'
    || (p.scope === 'regional' && p.region === unit.region)
    || (p.scope === 'unit' && p.unit_id === unit.unit_id));
  if (!applicable.length) return { shares: null, strength: 0 };

  const acc = {}; let wsum = 0;
  for (const poll of applicable) {
    const w = pollWeight(poll, asOfMs, halfLifeDays);
    if (w <= 0) continue;
    wsum += w;
    for (const p of parties) {
      const s = (poll.shares?.[p.id] || 0) - (p.id === '_' ? 0 : 0);
      acc[p.id] = (acc[p.id] || 0) + w * Math.max(0, s - (poll.house_effect || 0) * 0);
    }
  }
  if (wsum <= 0) return { shares: null, strength: 0 };
  const shares = {};
  for (const p of parties) shares[p.id] = (acc[p.id] || 0) / wsum;
  // Strength saturates as total effective weight grows.
  const strength = clamp(wsum / (wsum + 0.8), 0, 1);
  return { shares, strength };
}

function fundamentalsShareFor(unit, parties) {
  const base = unit.partisan_baseline || {};
  const shares = {};
  for (const p of parties) {
    let s = base[p.id] || 0;
    if (unit.incumbent_party && p.id === unit.incumbent_party) s += (p.incumbency_adj ?? 0.03);
    s += (p.candidate_quality_adj || 0);
    shares[p.id] = Math.max(0, s);
  }
  return shares;
}

// Ground measures YOUR support best; the rest is distributed across opponents by
// their fundamentals. Strength scales with contact_rate (40% ≈ full weight).
function groundShareFor(unit, parties, yourParty, fundShares) {
  const g = unit.ground;
  if (!g || g.support_score_mean == null) return { shares: null, strength: 0 };
  const yours = clamp(g.support_score_mean, 0, 1);
  const others = parties.filter((p) => p.id !== yourParty);
  const fundOthers = sum(others.map((p) => fundShares[p.id] || 0)) || 1;
  const shares = {};
  for (const p of parties) {
    shares[p.id] = p.id === yourParty ? yours : (1 - yours) * ((fundShares[p.id] || 0) / fundOthers);
  }
  const strength = clamp((g.contact_rate || 0) / 0.4, 0, 1);
  return { shares, strength };
}

function normalizeShares(obj, parties) {
  const tot = sum(parties.map((p) => Math.max(0, obj[p.id] || 0))) || 1;
  const out = {};
  for (const p of parties) out[p.id] = Math.max(0, obj[p.id] || 0) / tot;
  return out;
}

// Allocate the undecided remainder per the chosen method, returning the final
// (normalized) μ plus the direction each party gained from undecideds.
function allocateUndecided(decided, parties, unit, method) {
  const tot = sum(parties.map((p) => decided[p.id] || 0));
  const undecided = clamp(1 - tot, 0, 1);
  const alloc = {};
  if (undecided <= 1e-9) {
    for (const p of parties) alloc[p.id] = 0;
  } else if (method === 'partisan') {
    const base = unit.partisan_baseline || {};
    const bsum = sum(parties.map((p) => base[p.id] || 0)) || 1;
    for (const p of parties) alloc[p.id] = undecided * ((base[p.id] || 0) / bsum);
  } else if (method === 'incumbent' && unit.incumbent_party) {
    // Challengers split the larger share of late undecideds.
    const challengers = parties.filter((p) => p.id !== unit.incumbent_party);
    const chShare = 0.7, incShare = 0.3;
    const chSum = sum(challengers.map((p) => decided[p.id] || 0)) || challengers.length;
    for (const p of parties) {
      if (p.id === unit.incumbent_party) alloc[p.id] = undecided * incShare;
      else alloc[p.id] = undecided * chShare * ((decided[p.id] || (1 / challengers.length)) / chSum);
    }
  } else { // proportional
    const dsum = tot || 1;
    for (const p of parties) alloc[p.id] = undecided * ((decided[p.id] || 0) / dsum);
  }
  const mu = {}; const dir = {};
  for (const p of parties) {
    mu[p.id] = (decided[p.id] || 0) + (alloc[p.id] || 0);
    dir[p.id] = undecided > 0 ? (alloc[p.id] || 0) / undecided : 0; // 0..1 share of the pool
  }
  return { mu: normalizeShares(mu, parties), undecided, dir };
}

// Build μ[unit][party] + per-unit metadata (weights, undecided dir, confidence).
export function buildPointEstimates(config) {
  const params = { ...DEFAULT_PARAMS, ...(config.params || {}) };
  const parties = config.parties;
  const polls = config.polls || [];
  const asOfMs = params.asOf ? new Date(params.asOf).getTime()
    : (polls.length ? Math.max(...polls.map((p) => new Date(p.field_date).getTime())) : Date.now());

  const units = config.units.map((unit) => {
    const fund = normalizeShares(fundamentalsShareFor(unit, parties), parties);
    const poll = pollShareFor(unit, parties, polls, asOfMs, params.pollHalfLifeDays);
    const ground = groundShareFor(unit, parties, config.yourParty, fund);

    // Availability-weighted blend (spec §4.1): thin data → fundamentals dominate.
    const bw = params.baseWeights;
    let wPoll = bw.poll * poll.strength;
    let wGround = bw.ground * ground.strength;
    let wFund = bw.fund;
    const wTot = wPoll + wGround + wFund || 1;
    wPoll /= wTot; wGround /= wTot; wFund /= wTot;

    const decided = {};
    for (const p of parties) {
      decided[p.id] = wFund * (fund[p.id] || 0)
        + wPoll * (poll.shares ? poll.shares[p.id] || 0 : 0)
        + wGround * (ground.shares ? ground.shares[p.id] || 0 : 0);
    }
    const { mu, undecided, dir } = allocateUndecided(decided, parties, unit, params.undecidedMethod);

    // Confidence: thin contact + no recent poll → low.
    const confScore = 0.5 * poll.strength + 0.5 * ground.strength;
    const confidence = confScore >= 0.5 ? 'high' : confScore >= 0.25 ? 'medium' : 'low';

    return {
      unit_id: unit.unit_id, region: unit.region || 'all', raw: unit,
      mu, undecidedDir: dir, undecidedPool: undecided,
      weights: { fund: wFund, poll: wPoll, ground: wGround },
      confidence,
    };
  });
  return { units, params, asOfMs };
}

// ── §5 Simulation ─────────────────────────────────────────────────────────��─
// Draws e_nat ONCE per iteration (shared across all units) — the correlation
// that produces realistic fat tails. Returns the raw outcome array.
export function runSimulation(config, point, overrides = {}) {
  const params = { ...point.params, ...(overrides.params || {}) };
  const N = overrides.iterations || params.iterations;
  const parties = config.parties;
  const yourParty = config.yourParty;
  const rng = mulberry32((overrides.seed ?? params.seed) >>> 0);
  const regions = [...new Set(point.units.map((u) => u.region))];
  const sys = resolveSystem(config);

  // Levers (scenario lab) — applied deterministically each iteration.
  const envShift = overrides.envShiftLogOdds || 0;          // toward your party
  const gotvLift = overrides.gotvLift || 0;                 // 0..0.15
  const oppShift = overrides.oppShiftLogOdds || {};         // {partyId: logodds}
  const undecidedToYou = overrides.undecidedToYou;          // 0..1 override of break
  const unitBoost = overrides.unitBoostLogOdds || {};       // {unit_id: logodds to your party}

  const results = [];
  for (let i = 0; i < N; i++) {
    const eNat = {}; for (const p of parties) eNat[p.id] = normal(rng, 0, params.sigma_nat);
    const eReg = {}; for (const r of regions) { eReg[r] = {}; for (const p of parties) eReg[r][p.id] = normal(rng, 0, params.sigma_reg); }

    const districtWins = {}; for (const p of parties) districtWins[p.id] = 0;
    const unitWinners = {}; const sharesOut = {}; const votesOut = {};

    for (const U of point.units) {
      const eUnd = normal(rng, 0, (params.sigma_undecided ?? 0.05) * (0.5 + U.undecidedPool));
      const a = {};
      for (const p of parties) {
        let dir = U.undecidedDir[p.id] || 0;
        if (undecidedToYou != null) dir = (p.id === yourParty) ? undecidedToYou : (1 - undecidedToYou) / Math.max(1, parties.length - 1);
        let v = ln(U.mu[p.id])
          + eNat[p.id]
          + eReg[U.region][p.id]
          + normal(rng, 0, params.sigma_loc)
          + eUnd * dir;
        if (p.id === yourParty) v += envShift + (unitBoost[U.unit_id] || 0);
        if (oppShift[p.id]) v += oppShift[p.id];
        a[p.id] = v;
      }
      // softmax → valid shares
      let denom = 0; const ex = {};
      for (const p of parties) { ex[p.id] = Math.exp(a[p.id]); denom += ex[p.id]; }
      const shares = {}; for (const p of parties) shares[p.id] = ex[p.id] / denom;

      const turnout = U.raw.turnout_history * U.raw.eligible_voters * (1 + normal(rng, 0, params.sigma_turnout));
      const votes = {}; let bestC = null, bestV = -1;
      for (const p of parties) {
        const gotv = p.id === yourParty ? (1 + gotvLift) : 1;
        votes[p.id] = turnout * shares[p.id] * gotv;
        if (votes[p.id] > bestV) { bestV = votes[p.id]; bestC = p.id; }
      }
      unitWinners[U.unit_id] = bestC;
      districtWins[bestC] += 1;
      sharesOut[U.unit_id] = shares;
      votesOut[U.unit_id] = votes;
    }

    // Aggregate popular vote across every unit (the popular-vote model + PR).
    const popVotes = {}; for (const p of parties) popVotes[p.id] = 0;
    for (const u of point.units) for (const p of parties) popVotes[p.id] += votesOut[u.unit_id][p.id];

    const outcome = { unitWinners, shares: sharesOut, votes: votesOut, district: sys.district };
    if (sys.output === 'single') {
      const popShare = normalize(popVotes);
      const r = resolveSingle(popShare, sys);
      outcome.yourShare = popShare[yourParty];
      outcome.winner = r.winner;
      outcome.win = r.winner === yourParty;
      outcome.yourMargin = r.winner === yourParty ? r.margin : -r.margin;
      outcome.round = r.round;
    } else {
      outcome.seats = resolveSeats(districtWins, popVotes, sys, parties);
    }
    results.push(outcome);
  }
  return results;
}

// ── §6 Summary ──────────────────────────────────────────────────────────────
export function summarize(results, config) {
  const parties = config.parties;
  const yourParty = config.yourParty;
  const N = results.length || 1;
  const sys = resolveSystem(config);

  if (sys.output === 'single') {
    const shares = results.map((r) => r.yourShare).sort((a, b) => a - b);
    const margins = results.map((r) => r.yourMargin).sort((a, b) => a - b);
    const pWin = results.filter((r) => r.win).length / N;
    return {
      mode: 'single',
      pWin,
      share: intervalsOf(shares),
      margin: intervalsOf(margins),
      winCondition: winConditionSingle(pWin, intervalsOf(margins)),
    };
  }

  // Seat mode — seats are keyed by GROUP (slate or party id) so candidate-based
  // systems (at-large, STV) roll up to the contesting slate.
  const groups = [...new Set(parties.map((p) => p.slate || p.id))];
  const threshold = sys.majoritySeats;
  const yourSeats = results.map((r) => r.seats[yourParty]).sort((a, b) => a - b);
  const pMajority = results.filter((r) => r.seats[yourParty] >= threshold).length / N;
  let largest = 0, plurShort = 0;
  for (const r of results) {
    const maxSeats = Math.max(...groups.map((grp) => r.seats[grp]));
    const isMax = r.seats[yourParty] === maxSeats && groups.filter((grp) => r.seats[grp] === maxSeats).length === 1;
    if (isMax) { largest += 1; if (r.seats[yourParty] < threshold) plurShort += 1; }
  }
  // Histogram of your seat count
  const hist = {};
  for (const s of yourSeats) hist[s] = (hist[s] || 0) + 1;
  const histogram = Object.keys(hist).map(Number).sort((a, b) => a - b).map((seats) => ({ seats, count: hist[seats], freq: hist[seats] / N }));

  // Per-unit win probability + mean margin + confidence — a district concept.
  const perUnit = !sys.district ? [] : config.units.map((u) => {
    let wins = 0; const margins = [];
    for (const r of results) {
      if (r.unitWinners[u.unit_id] === yourParty) wins += 1;
      const sh = r.shares[u.unit_id];
      const yours = sh[yourParty];
      const runnerUp = Math.max(...parties.filter((p) => p.id !== yourParty).map((p) => sh[p.id]));
      margins.push(yours - runnerUp);
    }
    const pe = (config._point?.units || []).find((x) => x.unit_id === u.unit_id);
    return { unit_id: u.unit_id, region: u.region, winProb: wins / N, meanMargin: mean(margins), confidence: pe?.confidence || 'medium' };
  }).sort((a, b) => b.winProb - a.winProb);

  return {
    mode: 'seat', threshold,
    pMajority, pLargest: largest / N, pPluralityShort: plurShort / N,
    seats: { mean: mean(yourSeats), median: quantile(yourSeats, 0.5), ...intervalsOf(yourSeats), histogram },
    perUnit,
    winCondition: winConditionSeat(pMajority, threshold, null),
  };
}

function intervalsOf(sortedAsc) {
  return {
    mean: mean(sortedAsc),
    p10: quantile(sortedAsc, 0.10), p90: quantile(sortedAsc, 0.90),
    p2_5: quantile(sortedAsc, 0.025), p97_5: quantile(sortedAsc, 0.975),
  };
}

// ── §6.4 Tipping-point analysis (seat mode) ──
export function tippingPoints(results, config) {
  const sys = resolveSystem(config);
  if (sys.family !== 'fptp-seats') return []; // cleanest where each district is one seat
  const yourParty = config.yourParty;
  const threshold = sys.majoritySeats;
  const tally = {};
  let decidedSims = 0;
  for (const r of results) {
    if (r.seats[yourParty] < threshold) continue; // only sims you actually win
    decidedSims += 1;
    const won = Object.keys(r.unitWinners).filter((u) => r.unitWinners[u] === yourParty);
    // Sort your won units by margin DESCENDING (most secure first) and accumulate
    // until you cross the threshold; the crossing unit is the decisive marginal
    // seat. (The spec text says "ascending", but that records your *safest*
    // necessary seat — the opposite of §6.4's stated intent, which is the swing
    // seat where marginal effort moves the win probability most. We follow the
    // intent and the canonical 538-style definition.)
    won.sort((a, b) => marginIn(r, b, config) - marginIn(r, a, config));
    let cum = 0, tip = null;
    for (const u of won) { cum += 1; if (cum >= threshold) { tip = u; break; } }
    if (tip) tally[tip] = (tally[tip] || 0) + 1;
  }
  return Object.keys(tally)
    .map((unit_id) => ({ unit_id, count: tally[unit_id], freq: decidedSims ? tally[unit_id] / decidedSims : 0 }))
    .sort((a, b) => b.count - a.count);
}
function marginIn(r, unit_id, config) {
  const sh = r.shares[unit_id]; const yours = sh[config.yourParty];
  const runnerUp = Math.max(...config.parties.filter((p) => p.id !== config.yourParty).map((p) => sh[p.id]));
  return yours - runnerUp;
}

// ── §8 Win number + gap decomposition ──
export function winNumberAndGap(config, point) {
  const params = point.params;
  const cushion = params.cushion;
  const out = [];
  for (const U of point.units) {
    const u = U.raw;
    const projTurnout = (u.turnout_history || 0) * (u.eligible_voters || 0);
    const thr = resolveSystem(config).output === 'single' ? (config.winningThreshold || winThresholdFor(config.parties.length)) : 0.5;
    const winNumber = projTurnout * thr * (1 + cushion);
    const g = u.ground || {};
    const currentSupport = (g.confirmed_supporters || 0) + 0.5 * (g.leaners || 0);
    const gap = winNumber - currentSupport;
    // Three universes
    const persuadable = (g.undecided_contacted || 0) + Math.max(0, (g.id_contacts || 0) - (g.confirmed_supporters || 0) - (g.leaners || 0) - (g.undecided_contacted || 0));
    const persuasionPool = persuadable * 0.35;                       // realistic conversion
    const mobilizationPool = ((g.confirmed_supporters || 0) + (g.leaners || 0)) * (1 - (u.turnout_history || 0)) * 0.5; // GOTV lift on low-propensity
    const registrationPool = (u.eligible_unregistered || 0) * (u.turnout_history || 0) * 0.15;
    const closeable = persuasionPool + mobilizationPool + registrationPool;
    out.push({
      unit_id: u.unit_id, winNumber, currentSupport, gap,
      pools: { persuasion: persuasionPool, mobilization: mobilizationPool, registration: registrationPool },
      closeable, feasible: closeable >= gap,
    });
  }
  return out;
}
function winThresholdFor(nCandidates) { return nCandidates <= 2 ? 0.5 : Math.max(0.30, 1 / nCandidates + 0.05); }

// ── §7.2/7.3 Opponent scenarios ──
const OPP_SCENARIOS = [
  { id: 'base', label: 'Base', shift: 0, volMul: 1 },
  { id: 'strong', label: 'Strong', shift: 0.04, volMul: 1 },
  { id: 'weak', label: 'Weak', shift: -0.04, volMul: 1 },
  { id: 'surprise', label: 'Surprise', shift: 0, volMul: 2.2 },
];
export function opponentScenarios(config, point, N = 600) {
  const opps = config.parties.filter((p) => p.id !== config.yourParty);
  const single = resolveSystem(config).output === 'single';
  return OPP_SCENARIOS.map((sc) => {
    const oppShift = {};
    for (const o of opps) oppShift[o.id] = shareShiftToLogOdds(sc.shift);
    const overrides = { iterations: N, oppShiftLogOdds: oppShift, params: { ...point.params, sigma_nat: point.params.sigma_nat * sc.volMul } };
    const res = runSimulation(config, point, overrides);
    const s = summarize(res, { ...config, _point: point });
    return { id: sc.id, label: sc.label, pWin: single ? s.pWin : s.pMajority };
  });
}
function shareShiftToLogOdds(shareShift) { return shareShift / 0.22; } // ≈ derivative of logit near typical shares

// ── §7.4 Sensitivity (tornado) ──
export function sensitivity(config, point, N = 500) {
  const baseP = winProbOf(config, point, {}, N);
  const tests = [
    { id: 'turnout', label: 'Overall turnout', lo: { params: { ...point.params, sigma_turnout: point.params.sigma_turnout, _shift: 0 } } },
  ];
  // Each input: {label, low override, high override}
  const inputs = [
    { label: 'Overall turnout', lo: { gotvLift: -0.05 }, hi: { gotvLift: 0.05 } },
    { label: 'Undecided break', lo: { undecidedToYou: 0.2 }, hi: { undecidedToYou: 0.6 } },
    { label: 'National swing (σ_nat)', lo: { params: { ...point.params, sigma_nat: point.params.sigma_nat * 0.5 } }, hi: { params: { ...point.params, sigma_nat: point.params.sigma_nat * 1.8 } } },
    { label: 'Opponent strength', lo: { oppShiftLogOdds: allOpp(config, -0.03) }, hi: { oppShiftLogOdds: allOpp(config, 0.03) } },
    { label: 'GOTV effectiveness', lo: { gotvLift: 0 }, hi: { gotvLift: 0.12 } },
    { label: 'Your Ground estimate', lo: { envShiftLogOdds: shareShiftToLogOdds(-0.03) }, hi: { envShiftLogOdds: shareShiftToLogOdds(0.03) } },
  ];
  void tests;
  const rows = inputs.map((inp) => {
    const lo = winProbOf(config, point, inp.lo, N);
    const hi = winProbOf(config, point, inp.hi, N);
    return { label: inp.label, low: lo, high: hi, base: baseP, swing: Math.abs(hi - lo) };
  }).sort((a, b) => b.swing - a.swing);
  return { base: baseP, rows };
}
function allOpp(config, shareShift) {
  const o = {}; for (const p of config.parties) if (p.id !== config.yourParty) o[p.id] = shareShiftToLogOdds(shareShift); return o;
}
function winProbOf(config, point, overrides, N) {
  const res = runSimulation(config, point, { ...overrides, iterations: N });
  const s = summarize(res, { ...config, _point: point });
  return resolveSystem(config).output === 'single' ? s.pWin : s.pMajority;
}

// ── §8.3 Optimizer — ranked, costed, cap-bounded moves ──
export function optimizeMoves(config, point, opts = {}) {
  const N = opts.iterations || 500;
  const capRemaining = config.ledger?.cap_remaining ?? Infinity;
  const costPerContact = config.raise?.cost_per_contact || 12;
  const sys = resolveSystem(config);
  const baseP = winProbOf(config, point, {}, N);
  const tips = sys.district ? tippingPoints(runSimulation(config, point, { iterations: N }), { ...config, _point: point }) : [];
  const tipFreq = Object.fromEntries(tips.map((t) => [t.unit_id, t.freq]));

  // Candidate units: tipping units (district systems) else every unit.
  const candidates = sys.district && tips.length
    ? tips.slice(0, 8).map((t) => t.unit_id)
    : point.units.slice(0, 8).map((u) => u.unit_id);

  const moves = [];
  for (const unit_id of candidates) {
    for (const move of [
      { kind: 'persuasion', contacts: 1000, logodds: shareShiftToLogOdds(0.02) },
      { kind: 'gotv', contacts: 800, logodds: shareShiftToLogOdds(0.015), gotv: true },
    ]) {
      const overrides = move.gotv
        ? { gotvLift: 0.04, unitBoostLogOdds: { [unit_id]: move.logodds } }
        : { unitBoostLogOdds: { [unit_id]: move.logodds } };
      const p = winProbOf(config, point, overrides, N);
      let gain = p - baseP;
      if (sys.district) gain *= (0.5 + (tipFreq[unit_id] || 0)); // weight by tipping frequency
      const cost = move.contacts * costPerContact;
      moves.push({ unit_id, kind: move.kind, contacts: move.contacts, winProbGain: Math.max(0, gain), cost, perDollar: Math.max(0, gain) / cost });
    }
  }
  moves.sort((a, b) => b.perDollar - a.perDollar);

  // Greedily accept under the cap; flag GOTV reserve.
  let running = 0; const ranked = [];
  const reserve = (config.ledger?.spending_cap || 0) * 0.15; // protect ~15% for final push
  for (const m of moves) {
    if (m.winProbGain <= 0) continue;
    const within = running + m.cost <= capRemaining;
    const breaksReserve = (running + m.cost) > Math.max(0, capRemaining - reserve);
    ranked.push({ ...m, accepted: within, runningTotal: within ? (running += m.cost) : running, gotvReserveFlag: within && breaksReserve });
  }
  return { baseWinProb: baseP, capRemaining, costPerContact, moves: ranked };
}

// ── §9 Backtest ──
// Run the forecast on a past contest and compare to the known result.
export function backtest(config, actual, N = 1000) {
  const point = buildPointEstimates(config);
  const res = runSimulation(config, point, { iterations: N });
  const s = summarize(res, { ...config, _point: point });
  const sys = resolveSystem(config);
  if (sys.output === 'seat') {
    const within80 = actual.yourSeats >= s.seats.p10 && actual.yourSeats <= s.seats.p90;
    const within95 = actual.yourSeats >= s.seats.p2_5 && actual.yourSeats <= s.seats.p97_5;
    return { mode: 'seat', predicted: s.seats, predictedPMajority: s.pMajority, actualSeats: actual.yourSeats, actualMajority: actual.yourSeats >= sys.majoritySeats, within80, within95 };
  }
  const within80 = actual.yourShare >= s.share.p10 && actual.yourShare <= s.share.p90;
  return { mode: 'single', predicted: s.share, predictedPWin: s.pWin, actualShare: actual.yourShare, actualWin: !!actual.win, within80 };
}

// ── Win-condition statements (§6.5) ──
function pct(x) { return Math.round(x * 100); }
function winConditionSingle(pWin) {
  return `You finish first in about ${pct(pWin)}% of simulations. The result turns most on turnout and how late undecideds break — both are modeled as uncertain, so treat this as a range, not a number.`;
}
function winConditionSeat(pMajority, threshold) {
  return `You reach a majority (${threshold}+ seats) in about ${pct(pMajority)}% of simulations. The path runs through the swing seats ranked by tipping-point frequency — concentrate effort there. Result is most sensitive to overall turnout and the national swing.`;
}

// ── Convenience: full forecast in one call ──
export function forecast(config) {
  const point = buildPointEstimates(config);
  const results = runSimulation(config, point);
  const summary = summarize(results, { ...config, _point: point });
  const tips = resolveSystem(config).family === 'fptp-seats' ? tippingPoints(results, { ...config, _point: point }) : [];
  return { point, summary, tipping: tips, seed: point.params.seed, iterations: point.params.iterations };
}

export { shareShiftToLogOdds, winThresholdFor };
