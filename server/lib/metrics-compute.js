// Business-metrics layer.
// Computes per-workspace KPI values from the workspace's live records, snapshots
// them daily into metric_snapshots, and derives deltas + sparklines from that history.
import { randomBytes } from 'crypto';
import { db, sqlite } from '../db/index.js';
import { moduleData, workspaces } from '../db/schema.js';
import { and, eq, isNull } from 'drizzle-orm';

const newId = () => 'ms_' + randomBytes(12).toString('hex');
const TICK_MS = 6 * 60 * 60 * 1000;  // snapshot every 6h (daily dedupe keeps one row/day)
let started = false;

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);
const parseAsk = (a) => { const m = /\$?([\d.]+)\s*([KkMm])?/.exec(String(a ?? '')); if (!m) return 0; return parseFloat(m[1]) * (/[Mm]/.test(m[2] || '') ? 1e6 : /[Kk]/.test(m[2] || '') ? 1e3 : 1); };

const moneyFull = (n) => '$' + Math.round(n).toLocaleString();
const moneyK = (n) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
const kfmt = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));

async function loadRecords(ws) {
  const rows = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, ws), isNull(moduleData.deletedAt)));
  const by = {};
  for (const r of rows) {
    const key = `${r.module}.${r.kind}`;
    let data; try { data = JSON.parse(r.data); } catch { continue; }
    (by[key] ||= []).push(data);
  }
  return by;
}

// Returns { metricKey: { value:number|null, display:string, format, source } }
export function computeMetrics(by) {
  const g = (k) => by[k] || [];
  const m = {};
  const set = (key, value, display, format, source = 'computed') => { m[key] = { value, display, format, source }; };

  // ── RAISE ───────────────────────────────────────────────
  const gifts = g('raise.gift'), donors = g('raise.donor'), prospects = g('raise.prospect'), pledges = g('raise.pledge');
  const giftTotal = gifts.reduce((s, x) => s + (x.amt || 0), 0);
  set('raise.ytd', giftTotal, moneyK(giftTotal), 'money');
  const pipeOpen = prospects.reduce((s, p) => s + parseAsk(p.ask), 0);
  set('raise.pipeline', pipeOpen, moneyK(pipeOpen), 'money');
  const avg = gifts.length ? Math.round(giftTotal / gifts.length) : 0;
  set('raise.averagegift', avg, moneyK(avg), 'money');
  const now = Date.now(), YEAR = 365 * 86400 * 1000;
  const eligible = donors.filter(d => d.first && (now - Date.parse(`${d.first}-01`.slice(0, 10)) > YEAR));
  const retained = eligible.filter(d => d.last && (now - Date.parse(d.last) < YEAR));
  const retention = eligible.length ? (retained.length / eligible.length) * 100 : 0;
  set('raise.retention', retention, eligible.length ? retention.toFixed(1) + '%' : '—', 'pct');
  const pledgeTotal = pledges.reduce((s, p) => s + parseAsk(p.ask), 0);
  set('raise.pledgesdue', pledgeTotal, moneyK(pledgeTotal), 'money');

  // ── LEDGER ──────────────────────────────────────────────
  const coa = g('ledger.account'), journal = g('ledger.journal'), bills = g('ledger.bill');
  const cash = coa.filter(a => a.subkind === 'bank' || a.subkind === 'cash').reduce((s, a) => s + (a.balance || 0), 0);
  set('ledger.cash', cash, moneyFull(cash), 'money');
  const curMonth = new Date().getUTCMonth() + 1;
  const qStart = Math.floor((curMonth - 1) / 3) * 3 + 1;
  const inQuarter = (mmdd) => { const mo = parseInt(String(mmdd || '').split('-')[0], 10); return mo >= qStart && mo < qStart + 3; };
  const isExpense = (acct) => /^[56]/.test(String(acct || '').trim());
  const burn = journal.filter(j => isExpense(j.account) && inQuarter(j.date)).reduce((s, j) => s + (j.debit || 0), 0);
  set('ledger.q2burn', burn, moneyFull(burn), 'money');
  const arAcct = coa.find(a => a.code === '1310');
  const ar = arAcct ? arAcct.balance : pledgeTotal;
  set('ledger.ar', ar, moneyFull(ar), 'money');
  const billsTotal = bills.reduce((s, b) => s + (b.amt || 0), 0);
  set('ledger.ap', billsTotal, moneyFull(billsTotal), 'money');
  const comp = journal.length ? ((journal.length - journal.filter(j => j.flagged).length) / journal.length) * 100 : 100;
  set('ledger.comp', comp, journal.length ? comp.toFixed(1) + '%' : '—', 'pct');

  // ── COALITION ───────────────────────────────────────────
  const endo = g('coalition.endorsement'), asks = g('coalition.ask'), comms = g('coalition.comm');
  const committed = endo.filter(e => e.status === 'committed' || e.status === 'public').length;
  set('coalition.committed', committed, `${committed} / ${endo.length}`, 'ratio');
  const pub = endo.filter(e => e.status === 'public').length;
  set('coalition.public', pub, String(pub), 'count');
  const reach = endo.reduce((s, e) => s + (e.reach || 0), 0);
  set('coalition.reach', reach, kfmt(reach), 'number');
  set('coalition.asks', asks.length, String(asks.length), 'count');
  set('coalition.ops', comms.length, `${comms.length} active`, 'count');

  // ── BEACON ──────────────────────────────────────────────
  const posts = g('beacon.post');
  const awaiting = posts.filter(p => p.status !== 'LIVE' && p.status !== 'SCHEDULED').length;
  set('beacon.approval', awaiting, String(awaiting), 'count');
  // Sentiment / share-of-voice / reach require an external media-monitoring integration.
  set('beacon.sov', null, '—', 'pct', 'integration');
  set('beacon.sent', null, '—', 'plain', 'integration');
  set('beacon.reach', null, '—', 'number', 'integration');

  return m;
}

// Upsert today's numeric snapshots for a workspace.
function snapshot(ws, metrics) {
  const day = utcDay();
  const stmt = sqlite.prepare(`
    INSERT INTO metric_snapshots (id, workspace_id, metric_key, value, day, captured_at)
    VALUES (?, ?, ?, ?, ?, unixepoch())
    ON CONFLICT(workspace_id, metric_key, day) DO UPDATE SET value = excluded.value, captured_at = excluded.captured_at
  `);
  const tx = sqlite.transaction((entries) => {
    for (const [key, mt] of entries) {
      if (mt.value == null || mt.source === 'integration' || !Number.isFinite(mt.value)) continue;
      stmt.run(newId(), ws, key, mt.value, day);
    }
  });
  tx(Object.entries(metrics));
}

// Delta + sparkline from snapshot history for one metric.
function trendFor(ws, key, format, liveValue) {
  const rows = sqlite.prepare(
    'SELECT value, day FROM metric_snapshots WHERE workspace_id = ? AND metric_key = ? ORDER BY day ASC'
  ).all(ws, key);
  const spark = rows.map(r => r.value);
  if (liveValue != null && (!rows.length || rows[rows.length - 1].day !== utcDay())) spark.push(liveValue);
  const trimmed = spark.slice(-14);
  // Prior = oldest snapshot strictly before today (so day-1 shows no delta).
  const prior = rows.find(r => r.day !== utcDay());
  if (prior == null || liveValue == null) return { delta: null, spark: trimmed };
  const cur = liveValue, base = prior.value;
  let text = null, dir = 'flat';
  if (format === 'pct') {
    const pt = cur - base;
    dir = pt > 0.05 ? 'up' : pt < -0.05 ? 'down' : 'flat';
    text = `${pt >= 0 ? '+' : ''}${pt.toFixed(1)}pt`;
  } else if (base !== 0) {
    const pct = ((cur - base) / Math.abs(base)) * 100;
    dir = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
    text = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`;
  }
  return { delta: text ? { text, dir } : null, spark: trimmed };
}

// Full payload for the API: current values + trend, and persist today's snapshot.
export async function metricsForWorkspace(ws) {
  const by = await loadRecords(ws);
  const metrics = computeMetrics(by);
  snapshot(ws, metrics);
  const out = {};
  for (const [key, mt] of Object.entries(metrics)) {
    const { delta, spark } = mt.source === 'integration'
      ? { delta: null, spark: [] }
      : trendFor(ws, key, mt.format, mt.value);
    out[key] = { ...mt, delta, spark };
  }
  return out;
}

async function snapshotAll() {
  const wss = await db.select({ id: workspaces.id }).from(workspaces);
  for (const { id } of wss) {
    try { snapshot(id, computeMetrics(await loadRecords(id))); } catch { /* skip workspace on error */ }
  }
}

export function startMetricsWorker() {
  if (started) return;
  started = true;
  snapshotAll().catch((e) => console.warn('[metrics] error:', e.message));
  setInterval(() => snapshotAll().catch(() => {}), TICK_MS).unref?.();
}
