// Margin — election forecasting + path to victory. Know the number, find the
// path. Black and yellow, No Name plain, sentence case, honest intervals. All
// computation is client-side off the pure engine; nothing is fetched.
import { useState, useMemo, useEffect } from 'react';
import './margin.css';
import { api } from './auth/api';
import { pctInt, aboutInTen, num, counted, seatRange, share1, pts } from './margin/format';
import { Gauge, SeatHistogram, MarginDensity, Tornado, GapBar } from './margin/charts';
import {
  buildPointEstimates, runSimulation, summarize, tippingPoints,
  opponentScenarios, sensitivity, optimizeMoves, winNumberAndGap, backtest,
  shareShiftToLogOdds,
} from './margin/engine';
import { SYSTEMS, ALLOCATION_METHODS, resolveSystem } from './margin/systems';
import { FIXTURES, seatBacktestActual, singleBacktestActual } from './margin/seed';
import { forecastCsv, downloadCsv } from './margin/export';

const VOL_SIGMA = { low: 0.02, medium: 0.03, high: 0.045 };
const INVEST_CONTACTS = 1500;

const defaultLevers = (fixture) => {
  const s = resolveSystem(fixture);
  return {
    envShiftPts: 0,
    gotvLift: 0,
    undToYou: null,
    oppStrengthPts: 0,
    volatility: 'medium',
    undecidedMethod: fixture.params.undecidedMethod || 'proportional',
    winningThreshold: fixture.winningThreshold || null,
    iterations: 1000,
    seed: fixture.params.seed || 12345,
    investUnits: [],
    // Editable electoral-system spec — what makes Margin universal.
    system: {
      family: s.family, allocation: s.allocation, electoralThreshold: s.electoralThreshold,
      totalSeats: s.totalSeats, districtSeats: s.districtSeats, listSeats: s.listSeats,
      winThreshold: s.winThreshold, majoritySeats: s.majoritySeats,
    },
  };
};

// Build the working config + simulation overrides from the levers (pure).
function deriveModel(fixture, levers) {
  const sigma_nat = VOL_SIGMA[levers.volatility];
  const output = (SYSTEMS[levers.system.family] || SYSTEMS.plurality).output;
  const system = { ...levers.system };
  if (system.family === 'block-vote' || system.family === 'stv') system.districtMagnitude = system.totalSeats;
  const config = {
    ...fixture,
    system,
    mode: output,
    params: { ...fixture.params, seed: levers.seed, iterations: levers.iterations, sigma_nat, undecidedMethod: levers.undecidedMethod },
  };
  if (output === 'seat' && levers.system.majoritySeats) config.threshold = levers.system.majoritySeats;
  if (output === 'single' && levers.winningThreshold) config.winningThreshold = levers.winningThreshold;

  const opps = fixture.parties.filter((p) => p.id !== fixture.yourParty);
  const oppShiftLogOdds = {};
  for (const o of opps) oppShiftLogOdds[o.id] = shareShiftToLogOdds(levers.oppStrengthPts / 100);
  const unitBoostLogOdds = {};
  for (const u of levers.investUnits) unitBoostLogOdds[u] = shareShiftToLogOdds(0.02);

  const overrides = {
    envShiftLogOdds: shareShiftToLogOdds(levers.envShiftPts / 100),
    gotvLift: levers.gotvLift,
    oppShiftLogOdds,
    undecidedToYou: levers.undToYou,
    unitBoostLogOdds,
    params: config.params,
    seed: levers.seed,
    iterations: levers.iterations,
  };
  return { config, overrides };
}

// ── Shared bits ──
const SampleBadge = () => <span className="mg-badge">sample data</span>;
const Interval = ({ label, lo, hi, fmt = num }) => (
  <span className="mg-int">{label} <b>{fmt(lo)}</b> to <b>{fmt(hi)}</b></span>
);

function ConfidenceDot({ c }) {
  return <span className={`mg-conf mg-conf--${c}`} title={`${c} confidence`}>{c}</span>;
}

// ── Setup screen ──
function SetupScreen({ fixtureKey, setFixtureKey, levers, setLever, fixture, useWorkspace, setUseWorkspace, wsReady, wsErr }) {
  const sys = levers.system;
  const setSys = (k, v) => setLever('system', { ...sys, [k]: v });
  const def = SYSTEMS[sys.family] || SYSTEMS.plurality;
  const needsAllocation = ['party-list-pr', 'mmp', 'parallel', 'popular-pr'].includes(sys.family);
  const isMultiMember = ['block-vote', 'stv'].includes(sys.family);
  const isMixed = ['mmp', 'parallel'].includes(sys.family);

  return (
    <div className="mg-screen">
      <h2 className="mg-h2">Setup</h2>
      <p className="mg-dek">Margin works for any electoral system — popular-vote and seat models alike. Forecast off your live workspace contest, or a sample dataset, then choose the system and tune its parameters.</p>

      <h3 className="mg-h3">Data source</h3>
      <div className="mg-modes">
        <button className={`mg-mode ${!useWorkspace ? 'is-on' : ''}`} onClick={() => setUseWorkspace(false)}>
          <div className="mg-mode__t">Sample dataset <SampleBadge /></div><div className="mg-mode__d">Bundled synthetic fixtures</div>
        </button>
        <button className={`mg-mode ${useWorkspace ? 'is-on' : ''}`} onClick={() => setUseWorkspace(true)}>
          <div className="mg-mode__t">Workspace data</div><div className="mg-mode__d">Your margin.contest / district / poll records</div>
        </button>
      </div>
      {useWorkspace && !wsReady && <p className="mg-dek">{wsErr || 'Loading workspace contest…'}</p>}
      {useWorkspace && wsReady && <p className="mg-dek">Forecasting off <b>{fixture.name}</b> — {fixture.units.length} districts, {(fixture.polls || []).length} polls from your workspace.</p>}

      {!useWorkspace && <>
        <h3 className="mg-h3">Sample dataset</h3>
        <div className="mg-modes">
          {Object.values(FIXTURES).map((f) => (
            <button key={f.key} className={`mg-mode ${fixtureKey === f.key ? 'is-on' : ''}`} onClick={() => setFixtureKey(f.key)}>
              <div className="mg-mode__t">{f.label}</div><div className="mg-mode__d">{f.fixture.parties.length} {f.fixture.mode === 'single' ? 'candidates' : 'parties'} · {f.fixture.units.length} {f.fixture.units.length === 1 ? 'unit' : 'units'}</div>
            </button>
          ))}
        </div>
      </>}

      <div className="mg-card">
        <h3 className="mg-h3">Electoral system</h3>
        <label className="mg-field">System
          <select value={sys.family} onChange={(e) => setSys('family', e.target.value)}>
            <optgroup label="Single winner (popular vote)">
              {Object.values(SYSTEMS).filter((s) => s.output === 'single').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
            <optgroup label="Seats">
              {Object.values(SYSTEMS).filter((s) => s.output === 'seat').map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </optgroup>
          </select>
        </label>
        <div className="mg-sysblurb">{def.blurb}</div>
        {(sys.family === 'majority-runoff' || sys.family === 'supermajority') && (
          <label className="mg-field">{sys.family === 'supermajority' ? 'Threshold to pass' : 'Majority needed to avoid a runoff'}
            <input type="number" step="0.01" value={sys.winThreshold} onChange={(e) => setSys('winThreshold', +e.target.value || 0.5)} />
          </label>
        )}
        {needsAllocation && (
          <>
            <label className="mg-field">Allocation method
              <select value={sys.allocation} onChange={(e) => setSys('allocation', e.target.value)}>
                {Object.entries(ALLOCATION_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="mg-field">Electoral threshold
              <input type="number" step="0.01" value={sys.electoralThreshold} onChange={(e) => setSys('electoralThreshold', +e.target.value || 0)} />
            </label>
            <label className="mg-field">Total seats
              <input type="number" value={sys.totalSeats} onChange={(e) => setSys('totalSeats', +e.target.value || 0)} />
            </label>
          </>
        )}
        {isMultiMember && (
          <label className="mg-field">Seats to fill
            <input type="number" value={sys.totalSeats} onChange={(e) => setSys('totalSeats', +e.target.value || 1)} />
          </label>
        )}
        {isMixed && (
          <div className="mg-field2">
            <label className="mg-field">District seats<input type="number" value={sys.districtSeats} onChange={(e) => setSys('districtSeats', +e.target.value || 0)} /></label>
            <label className="mg-field">List seats<input type="number" value={sys.listSeats} onChange={(e) => setSys('listSeats', +e.target.value || 0)} /></label>
          </div>
        )}
        {def.output === 'seat' && (
          <label className="mg-field">Seats for a majority
            <input type="number" value={sys.majoritySeats} onChange={(e) => setSys('majoritySeats', +e.target.value || 1)} />
          </label>
        )}
      </div>

      <div className="mg-grid2">
        <div className="mg-card">
          <h3 className="mg-h3">{fixture.mode === 'single' ? 'Candidates' : 'Parties'}</h3>
          <ul className="mg-parties">
            {fixture.parties.map((p) => (
              <li key={p.id}><span className="mg-swatch" style={{ background: p.color }} />{p.name}{p.id === fixture.yourParty && <span className="mg-you">you</span>}</li>
            ))}
          </ul>
          <div className="mg-source">Data source: <b>{fixture.name}</b> — clearly synthetic, never presented as real</div>
        </div>

        <div className="mg-card">
          <h3 className="mg-h3">Parameters</h3>
          <label className="mg-field">Iteration count
            <select value={levers.iterations} onChange={(e) => setLever('iterations', +e.target.value)}>
              {[500, 1000, 2000, 5000, 10000].map((n) => <option key={n} value={n}>{num(n)}</option>)}
            </select>
          </label>
          <label className="mg-field">Seed
            <input type="number" value={levers.seed} onChange={(e) => setLever('seed', +e.target.value || 0)} />
          </label>
          <label className="mg-field">Race volatility
            <select value={levers.volatility} onChange={(e) => setLever('volatility', e.target.value)}>
              <option value="low">low (stable)</option><option value="medium">medium</option><option value="high">high (early or turbulent)</option>
            </select>
          </label>
          <label className="mg-field">Undecided allocation
            <select value={levers.undecidedMethod} onChange={(e) => setLever('undecidedMethod', e.target.value)}>
              <option value="proportional">proportional</option><option value="incumbent">incumbent rule</option><option value="partisan">partisan lean</option>
            </select>
          </label>
        </div>
      </div>
    </div>
  );
}

// ── Forecast screen ──
function ForecastScreen({ model }) {
  const { config, summary, tips, point, levers } = model;
  return (
    <div className="mg-screen">
      <div className="mg-screenhd">
        <h2 className="mg-h2">Forecast</h2>
        <button className="mg-export" onClick={() => downloadCsv('margin-forecast.csv', forecastCsv(model))}>Export CSV</button>
      </div>
      {config.mode === 'single' ? (
        <div className="mg-forecast">
          <div className="mg-gaugewrap"><Gauge p={summary.pWin} /><div className="mg-odds">{aboutInTen(summary.pWin)}</div></div>
          <div className="mg-headline">
            <div className="mg-stat"><div className="mg-stat__lbl">expected vote share</div><div className="mg-stat__big">{share1(summary.share.mean)}</div>
              <div className="mg-stat__int"><Interval label="80%" lo={summary.share.p10} hi={summary.share.p90} fmt={share1} /> · <Interval label="95%" lo={summary.share.p2_5} hi={summary.share.p97_5} fmt={share1} /></div>
            </div>
            <div className="mg-stat"><div className="mg-stat__lbl">expected margin over runner-up</div><div className="mg-stat__big">{pts(summary.margin.mean)}</div>
              <div className="mg-stat__int"><Interval label="80%" lo={summary.margin.p10} hi={summary.margin.p90} fmt={pts} /></div>
            </div>
          </div>
          <MarginDensity values={model.results.map((r) => r.yourMargin)} />
        </div>
      ) : (
        <div className="mg-forecast">
          <div className="mg-probs">
            <div className="mg-prob"><div className="mg-prob__v">{pctInt(summary.pMajority)}</div><div className="mg-prob__l">majority</div></div>
            <div className="mg-prob"><div className="mg-prob__v">{pctInt(summary.pLargest)}</div><div className="mg-prob__l">largest party</div></div>
            <div className="mg-prob"><div className="mg-prob__v">{pctInt(summary.pPluralityShort)}</div><div className="mg-prob__l">plurality, short of majority</div></div>
          </div>
          <div className="mg-seatline">
            Seats: median <b>{Math.round(summary.seats.median)}</b>
            <span className="mg-int">80% <b>{seatRange(summary.seats.p10, summary.seats.p90)}</b></span>
            <span className="mg-int">95% <b>{seatRange(summary.seats.p2_5, summary.seats.p97_5)}</b></span>
          </div>
          <SeatHistogram histogram={summary.seats.histogram} threshold={config.threshold} p10={summary.seats.p10} p90={summary.seats.p90} />
          <h3 className="mg-h3">Where the race lives</h3>
          <table className="mg-units">
            <thead><tr><th>unit</th><th>region</th><th>your win prob</th><th>mean margin</th><th>confidence</th></tr></thead>
            <tbody>
              {summary.perUnit.map((u) => (
                <tr key={u.unit_id}>
                  <td>{u.unit_id}</td><td>{u.region}</td>
                  <td><span className="mg-units__bar"><span style={{ width: pctInt(u.winProb) }} /></span>{pctInt(u.winProb)}</td>
                  <td className={u.meanMargin >= 0 ? 'mg-pos' : 'mg-neg'}>{pts(u.meanMargin)}</td>
                  <td><ConfidenceDot c={u.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mg-wincond"><div className="mg-wincond__tag">win condition</div><p>{summary.winCondition}</p></div>
      {config.mode === 'seat' && tips?.length > 0 && (
        <div className="mg-tipsmini">Tipping seats: {tips.slice(0, 4).map((t) => <span key={t.unit_id} className="mg-chip">{t.unit_id} {pctInt(t.freq)}</span>)}</div>
      )}
      <div className="mg-meta">{(SYSTEMS[config.system?.family] || {}).label} · seed {num(levers.seed)} · {num(levers.iterations)} iterations · {point.units.length} {point.units.length === 1 ? 'unit' : 'units'} · sample data, reproducible</div>
    </div>
  );
}

// ── Stress test screen ──
function StressScreen({ model }) {
  const { config, point } = model;
  const grid = useMemo(() => opponentScenarios(config, point, 700), [model.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const torn = useMemo(() => sensitivity(config, point, 450), [model.key]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="mg-screen">
      <h2 className="mg-h2">Stress test</h2>
      <h3 className="mg-h3">Robustness against opponent scenarios</h3>
      <p className="mg-dek">A win that holds under Base and Strong is robust; one that appears only under Weak is fragile</p>
      <div className="mg-oppgrid">
        {grid.map((g) => (
          <div key={g.id} className={`mg-oppcell mg-oppcell--${g.pWin >= 0.6 ? 'good' : g.pWin >= 0.4 ? 'mid' : 'bad'}`}>
            <div className="mg-oppcell__v">{pctInt(g.pWin)}</div>
            <div className="mg-oppcell__l">{g.label}</div>
          </div>
        ))}
      </div>
      <h3 className="mg-h3">What moves the result</h3>
      <p className="mg-dek">Each input varied one at a time across a plausible range — the longest bars are where your forecast is most fragile, and where intelligence is most worth buying</p>
      <Tornado base={torn.base} rows={torn.rows} />
    </div>
  );
}

// ── Path to victory screen ──
function PathScreen({ model }) {
  const { config, point } = model;
  const gaps = useMemo(() => winNumberAndGap(config, point), [model.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const opt = useMemo(() => optimizeMoves(config, point, { iterations: 450 }), [model.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const tips = model.tips || [];
  const targets = config.mode === 'seat'
    ? gaps.filter((g) => tips.slice(0, 3).some((t) => t.unit_id === g.unit_id)).slice(0, 3)
    : gaps;

  return (
    <div className="mg-screen">
      <h2 className="mg-h2">Path to victory</h2>

      {(targets.length ? targets : gaps.slice(0, 1)).map((g) => (
        <div key={g.unit_id} className="mg-card mg-gapcard">
          <div className="mg-gaphd">
            <span className="mg-gaphd__u">{g.unit_id}</span>
            <span>win number <b>{num(g.winNumber)}</b> · current support <b>{num(g.currentSupport)}</b> · gap <b className={g.gap > 0 ? 'mg-neg' : 'mg-pos'}>{num(g.gap)}</b></span>
          </div>
          <GapBar gap={Math.max(0, g.gap)} pools={g.pools} />
          <div className={`mg-feas ${g.feasible ? 'mg-feas--ok' : 'mg-feas--no'}`}>
            {g.feasible
              ? `The persuasion, mobilization, and registration pools can close this gap`
              : `The available pools cannot close this gap — that is a feasibility finding, not a messaging problem`}
          </div>
        </div>
      ))}

      {config.mode === 'seat' && tips.length > 0 && (
        <div className="mg-card">
          <h3 className="mg-h3">Tipping-point seats</h3>
          <p className="mg-dek">The seats most likely to decide the outcome — concentrate marginal effort here</p>
          <ol className="mg-tiprank">
            {tips.slice(0, 8).map((t) => (
              <li key={t.unit_id}><span className="mg-tiprank__u">{t.unit_id}</span><span className="mg-tiprank__bar"><span style={{ width: pctInt(t.freq) }} /></span><span className="mg-tiprank__v">{pctInt(t.freq)}</span></li>
            ))}
          </ol>
        </div>
      )}

      <div className="mg-card">
        <h3 className="mg-h3">Where the next dollar goes</h3>
        <p className="mg-dek">Ranked by win-probability gain per dollar, bounded by the Ledger cap — cap remaining <b>{num(opt.capRemaining)}</b></p>
        <table className="mg-moves">
          <thead><tr><th>unit</th><th>move</th><th>win gain</th><th>cost</th><th>running</th><th /></tr></thead>
          <tbody>
            {opt.moves.slice(0, 12).map((m, i) => (
              <tr key={i} className={m.accepted ? '' : 'mg-moves--over'}>
                <td>{m.unit_id}</td><td>{m.kind} · {num(m.contacts)} contacts</td>
                <td>{pctInt(m.winProbGain)}</td><td>{num(m.cost)}</td>
                <td>{m.accepted ? num(m.runningTotal) : '—'}</td>
                <td>{!m.accepted ? <span className="mg-flag mg-flag--over">over cap</span> : m.gotvReserveFlag ? <span className="mg-flag mg-flag--reserve">GOTV reserve</span> : <span className="mg-flag mg-flag--ok">in plan</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Scenario lab ──
function Lever({ label, children, value }) {
  return <div className="mg-lever"><div className="mg-lever__hd"><span>{label}</span><span className="mg-lever__v">{value}</span></div>{children}</div>;
}
function LabScreen({ model, levers, setLever, scenarios, saveScenario, deleteScenario, loadScenario }) {
  const { config, summary } = model;
  const fixture = model.fixture;
  const costPer = (fixture.raise?.cost_per_contact || 10) * INVEST_CONTACTS;
  const investSpend = levers.investUnits.length * costPer;
  const capRemaining = fixture.ledger?.cap_remaining ?? Infinity;
  const winNow = config.mode === 'single' ? summary.pWin : summary.pMajority;

  const toggleUnit = (u) => {
    const on = levers.investUnits.includes(u);
    if (!on && investSpend + costPer > capRemaining) return; // cap ceiling
    setLever('investUnits', on ? levers.investUnits.filter((x) => x !== u) : [...levers.investUnits, u]);
  };

  return (
    <div className="mg-screen mg-lab">
      <div className="mg-levers">
        <h2 className="mg-h2">Scenario lab</h2>
        <p className="mg-dek">Drag a lever and the forecast re-runs live</p>
        <Lever label="Environment / national swing toward you" value={`${levers.envShiftPts > 0 ? '+' : ''}${levers.envShiftPts} pts`}>
          <input type="range" min="-6" max="6" step="1" value={levers.envShiftPts} onChange={(e) => setLever('envShiftPts', +e.target.value)} />
        </Lever>
        <Lever label="Your turnout (GOTV lift)" value={pctInt(levers.gotvLift)}>
          <input type="range" min="0" max="0.15" step="0.01" value={levers.gotvLift} onChange={(e) => setLever('gotvLift', +e.target.value)} />
        </Lever>
        <Lever label="Undecided break to you" value={levers.undToYou == null ? 'model' : pctInt(levers.undToYou)}>
          <input type="range" min="0" max="1" step="0.05" value={levers.undToYou == null ? 0.5 : levers.undToYou} onChange={(e) => setLever('undToYou', +e.target.value)} />
          <button className="mg-mini" onClick={() => setLever('undToYou', null)}>reset to model</button>
        </Lever>
        <Lever label="Opponent strength" value={`${levers.oppStrengthPts > 0 ? '+' : ''}${levers.oppStrengthPts} pts`}>
          <input type="range" min="-5" max="5" step="1" value={levers.oppStrengthPts} onChange={(e) => setLever('oppStrengthPts', +e.target.value)} />
        </Lever>
        <Lever label="Race volatility" value={levers.volatility}>
          <select value={levers.volatility} onChange={(e) => setLever('volatility', e.target.value)}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select>
        </Lever>
        {config.mode === 'seat' && (
          <Lever label={`Per-unit investment · spend ${num(investSpend)} of ${num(capRemaining)} cap`} value={`${levers.investUnits.length} on`}>
            <div className="mg-investunits">
              {model.point.units.map((u) => {
                const on = levers.investUnits.includes(u.unit_id);
                const blocked = !on && investSpend + costPer > capRemaining;
                return <button key={u.unit_id} className={`mg-uchip ${on ? 'is-on' : ''} ${blocked ? 'is-blocked' : ''}`} onClick={() => toggleUnit(u.unit_id)}>{u.unit_id}</button>;
              })}
            </div>
          </Lever>
        )}
        <button className="mg-save" onClick={saveScenario}>Save this scenario</button>
      </div>

      <div className="mg-compare">
        <div className="mg-livecard">
          <div className="mg-livecard__lbl">live</div>
          <div className="mg-livecard__v">{pctInt(winNow)}</div>
          <div className="mg-livecard__l">{config.mode === 'single' ? 'win probability' : 'majority probability'}</div>
          <div className="mg-livecard__seats">{config.mode === 'seat' ? `seats ${seatRange(summary.seats.p10, summary.seats.p90)} (80%)` : `share ${share1(summary.share.p10)} to ${share1(summary.share.p90)}`}</div>
        </div>
        {scenarios.map((s) => (
          <div key={s.id} className="mg-livecard mg-livecard--saved">
            <div className="mg-livecard__lbl">{s.name}</div>
            <div className="mg-livecard__v">{pctInt(s.win)}</div>
            <div className="mg-livecard__l">{s.modeLabel}</div>
            <div className="mg-livecard__seats">{s.detail}</div>
            <div className="mg-livecard__acts">
              {s.levers && <button className="mg-mini" onClick={() => loadScenario(s.levers)}>load</button>}
              <button className="mg-mini" onClick={() => deleteScenario(s.id)}>delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Assumptions and calibration ──
function AssumptionsScreen({ model }) {
  const { config, point, levers } = model;
  const p = point.params;
  const rows = [
    ['Iterations', num(levers.iterations), 'Setup'],
    ['Seed', num(levers.seed), 'Setup — reproducibility'],
    ['National swing σ_nat', p.sigma_nat.toFixed(3), `Volatility = ${levers.volatility}`],
    ['Regional swing σ_reg', p.sigma_reg.toFixed(3), 'Default'],
    ['Local noise σ_loc', p.sigma_loc.toFixed(3), 'Default'],
    ['Turnout noise σ_turnout', p.sigma_turnout.toFixed(3), 'Default'],
    ['Undecided method', p.undecidedMethod, 'Setup'],
    ['Poll half-life', `${p.pollHalfLifeDays} days`, 'Default'],
    ['Win cushion', pctInt(p.cushion), 'Default'],
    ['As-of date', p.asOf || 'newest poll', 'Fixture'],
  ];
  if (config.mode === 'seat') rows.push(['Majority threshold', num(config.threshold), 'Setup']);

  const bt = useMemo(() => backtest(config, config.mode === 'seat' ? seatBacktestActual : singleBacktestActual, 800), [model.key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mg-screen">
      <h2 className="mg-h2">Assumptions and calibration</h2>
      <p className="mg-dek">Every number the forecast rests on, in the open. Restraint is the credibility</p>
      <table className="mg-assume">
        <thead><tr><th>assumption</th><th>value</th><th>source</th></tr></thead>
        <tbody>{rows.map(([a, v, s]) => <tr key={a}><td>{a}</td><td>{v}</td><td>{s}</td></tr>)}</tbody>
      </table>

      <div className="mg-card">
        <h3 className="mg-h3">Backtest against a held-out result</h3>
        {bt.mode === 'seat' ? (
          <p className="mg-bt">Predicted seats <b>{seatRange(bt.predicted.p10, bt.predicted.p90)}</b> (80%), majority probability <b>{pctInt(bt.predictedPMajority)}</b>. Actual result <b>{counted(bt.actualSeats)}</b> seats — {bt.within80 ? 'inside' : 'outside'} the 80% interval, {bt.within95 ? 'inside' : 'outside'} the 95%.</p>
        ) : (
          <p className="mg-bt">Predicted share <b>{share1(bt.predicted.p10)} to {share1(bt.predicted.p90)}</b> (80%), win probability <b>{pctInt(bt.predictedPWin)}</b>. Actual share <b>{share1(bt.actualShare)}</b> — {bt.within80 ? 'inside' : 'outside'} the 80% interval.</p>
        )}
      </div>

      <div className="mg-card mg-limits">
        <h3 className="mg-h3">What this model does not capture</h3>
        <p>Late shocks and scandals, turnout surprises beyond the modeled band, data staleness, and correlated polling error larger than σ_nat. The forecast is directional, never a guarantee — read the intervals, not the point.</p>
      </div>
    </div>
  );
}

// ── Page ──
const TABS = [['setup', 'Setup'], ['forecast', 'Forecast'], ['stress', 'Stress test'], ['path', 'Path to victory'], ['lab', 'Scenario lab'], ['assume', 'Assumptions and calibration']];

function Margin() {
  const [fixtureKey, setFixtureKey] = useState('seat');
  const [leversByKey, setLeversByKey] = useState(() => Object.fromEntries(Object.values(FIXTURES).map((f) => [f.key, defaultLevers(f.fixture)])));
  // Live workspace contest (Phase 4) vs the bundled sample fixtures.
  const [useWorkspace, setUseWorkspace] = useState(false);
  const [wsCfg, setWsCfg] = useState(null);
  const [wsErr, setWsErr] = useState(null);
  useEffect(() => {
    if (!useWorkspace || wsCfg) return;
    api.marginContest().then((r) => {
      if (r.config) { setWsCfg(r.config); setLeversByKey((s) => (s.__ws__ ? s : { ...s, __ws__: defaultLevers(r.config) })); }
      else setWsErr(r.reason || 'No workspace contest configured.');
    }).catch((e) => setWsErr(e.message));
  }, [useWorkspace, wsCfg]);

  const activeKey = useWorkspace && wsCfg ? '__ws__' : fixtureKey;
  const fixture = useWorkspace && wsCfg ? wsCfg : FIXTURES[fixtureKey].fixture;
  const levers = leversByKey[activeKey] || defaultLevers(fixture);
  const setLever = (k, v) => setLeversByKey((s) => ({ ...s, [activeKey]: { ...(s[activeKey] || defaultLevers(fixture)), [k]: v } }));
  const [tab, setTab] = useState('forecast');
  const [scenarios, setScenarios] = useState([]);
  const refreshScenarios = () => api.marginScenarios().then((r) => setScenarios(r.scenarios || [])).catch(() => {});
  useEffect(() => { refreshScenarios(); }, []);

  const leverKey = JSON.stringify({ activeKey, ...levers });
  const model = useMemo(() => {
    const { config, overrides } = deriveModel(fixture, levers);
    const point = buildPointEstimates(config);
    const results = runSimulation(config, point, overrides);
    const cfg = { ...config, _point: point };
    const summary = summarize(results, cfg);
    const tips = config.mode === 'seat' ? tippingPoints(results, cfg) : [];
    return { config, overrides, point, results, summary, tips, levers, fixture, key: leverKey };
  }, [leverKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveScenario = async () => {
    const s = model.summary;
    const win = model.config.mode === 'single' ? s.pWin : s.pMajority;
    const detail = model.config.mode === 'seat' ? `seats ${seatRange(s.seats.p10, s.seats.p90)}` : `share ${share1(s.share.p10)} to ${share1(s.share.p90)}`;
    const name = `${fixture.mode === 'seat' ? 'Seat' : 'Single'} · env ${levers.envShiftPts >= 0 ? '+' : ''}${levers.envShiftPts}, gotv ${pctInt(levers.gotvLift)}`;
    const modeLabel = model.config.mode === 'single' ? 'win probability' : 'majority probability';
    try { await api.marginSaveScenario({ name, win, detail, modeLabel, levers }); await refreshScenarios(); } catch { /* surfaced inline */ }
  };
  const deleteScenario = async (id) => { try { await api.marginDeleteScenario(id); await refreshScenarios(); } catch { /* noop */ } };
  const loadScenario = (lv) => { if (lv) setLeversByKey((st) => ({ ...st, [activeKey]: { ...defaultLevers(fixture), ...lv } })); };

  return (
    <main className="margin" data-screen-label="Margin">
      <header className="mg-mast">
        <div>
          <div className="mg-plate">Margin · know the number, find the path</div>
          <h1 className="mg-title">Margin</h1>
        </div>
        <div className="mg-mast__r">forecasting and path to victory · any electoral system · <SampleBadge /></div>
      </header>

      <nav className="mg-tabs">
        {TABS.map(([k, t]) => <button key={k} className={`mg-tab ${tab === k ? 'is-on' : ''}`} onClick={() => setTab(k)}>{t}</button>)}
      </nav>

      {tab === 'setup' && <SetupScreen fixtureKey={fixtureKey} setFixtureKey={setFixtureKey} levers={levers} setLever={setLever} fixture={fixture} useWorkspace={useWorkspace} setUseWorkspace={setUseWorkspace} wsReady={!!wsCfg} wsErr={wsErr} />}
      {tab === 'forecast' && <ForecastScreen model={model} />}
      {tab === 'stress' && <StressScreen model={model} />}
      {tab === 'path' && <PathScreen model={model} />}
      {tab === 'lab' && <LabScreen model={model} levers={levers} setLever={setLever} scenarios={scenarios} saveScenario={saveScenario} deleteScenario={deleteScenario} loadScenario={loadScenario} />}
      {tab === 'assume' && <AssumptionsScreen model={model} />}
    </main>
  );
}

export { Margin };
