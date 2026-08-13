// Daily Brief v2 — synthesize the whole campaign's state into persona-shaped,
// VISUAL sections so Home can show "where things stand + what needs attention"
// as numbers, sparks and meters instead of prose.
//
// Every section carries { key, module, route, label, attention, kind } plus a
// kind-specific visual payload:
//   kind:'stat'  → { value, raw, delta?, spark?, sub? }
//   kind:'meter' → { value, num, den, severity, sub? }
//   kind:'list'  → { items: [{ label, sub?, when? }] (≤4), sub? }
//
// One section list is built per persona (manager | staff | candidate |
// volunteer) — same section objects, different selection and order. Every
// builder is null-safe: an empty workspace produces zeroed values, empty
// lists and attention:false — buildBrief never throws.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { moduleData, entities, entityLinks, users } from '../db/schema.js';
import { metricsForWorkspace } from './metrics-compute.js';
import { buildContestConfig } from './margin/build-contest.js';
import { listTopics } from './tide/service.js';

export { PERSONAS, effectivePersona } from './persona.js';

const DAY = 86400000;
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dateMs = (s) => { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? t : null; };

// Compact display formats — '$6.2K', '241', '1.5M'.
const compactNum = (n) => {
  n = Math.round(Number(n) || 0);
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e4) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
};
const compactMoney = (n) => {
  n = Math.round(Number(n) || 0);
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n}`;
};

// All live records for a workspace grouped by "module.kind", each carried as
// { data, createdAtMs } — createdAt drives the "this week" windows.
async function loadRecords(workspaceId) {
  const rows = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, workspaceId), isNull(moduleData.deletedAt)));
  const by = {};
  for (const r of rows) {
    const data = parse(r.data);
    if (!data || typeof data !== 'object') continue;
    const t = r.createdAt ? new Date(r.createdAt).getTime() : NaN;
    (by[`${r.module}.${r.kind}`] ||= []).push({ data, createdAtMs: Number.isFinite(t) ? t : null });
  }
  return by;
}

export async function buildBrief(workspaceId, persona = 'manager') {
  const now = Date.now();

  // Shared inputs — each guarded so one broken source never sinks the brief.
  let by = {};
  try { by = await loadRecords(workspaceId); } catch { by = {}; }
  let metrics = {};
  try { metrics = await metricsForWorkspace(workspaceId); } catch { metrics = {}; }
  let topics = [];
  try { topics = (await listTopics(workspaceId)) || []; } catch { topics = []; } // Tide may be unused

  let directory = { total: 0, multiModule: 0 };
  try {
    const ents = await db.select({ id: entities.id }).from(entities)
      .where(and(eq(entities.workspaceId, workspaceId), isNull(entities.deletedAt)));
    const links = await db.select({ entityId: entityLinks.entityId, module: entityLinks.module })
      .from(entityLinks).where(eq(entityLinks.workspaceId, workspaceId));
    // How many entities span >1 module — same computation as entities.rebuildFromModuleData.
    const modsByEntity = new Map();
    for (const l of links) { const s = modsByEntity.get(l.entityId) || new Set(); s.add(l.module); modsByEntity.set(l.entityId, s); }
    directory = { total: ents.length, multiModule: [...modsByEntity.values()].filter((s) => s.size > 1).length };
  } catch { /* zeroed */ }

  const g = (key) => (by[key] || []).map((r) => r.data);

  // Stat visuals lifted straight off a computed metric (display/delta/spark).
  const statFromMetric = (key, fallback) => {
    const mt = metrics[key] || {};
    const out = { value: mt.display ?? fallback, raw: Number.isFinite(mt.value) ? mt.value : 0 };
    if (mt.delta && mt.delta.text) {
      out.delta = { text: mt.delta.text, dir: mt.delta.dir, good: mt.delta.dir !== 'down' };
    }
    if (Array.isArray(mt.spark) && mt.spark.length > 1) out.spark = mt.spark.slice(-12);
    return out;
  };

  // ── section builders — each returns { kind, ...visual, attention } ──

  const money = () => {
    const week = (by['raise.gift'] || [])
      .filter((r) => r.createdAtMs != null && now - r.createdAtMs <= 7 * DAY)
      .reduce((s, r) => s + (Number(r.data.amt) || 0), 0);
    const billsDueSoon = g('ledger.bill').filter((b) => {
      if (String(b.status || '').toLowerCase() === 'paid') return false;
      const ms = dateMs(b.due);
      return ms != null && ms - now <= 7 * DAY;
    });
    return {
      kind: 'stat',
      ...statFromMetric('raise.ytd', '$0'),
      sub: `${compactMoney(week)} this week`,
      attention: billsDueSoon.length > 0,
    };
  };

  const compliance = () => {
    const DONE = new Set(['done', 'filed', 'submitted', 'complete']);
    const open = g('ledger.filing').filter((f) => !DONE.has(String(f.status || '').toLowerCase()));
    const days = open
      .map((f) => {
        if (f.daysToFile != null && Number.isFinite(Number(f.daysToFile))) return Number(f.daysToFile);
        const ms = dateMs(f.due);
        return ms != null ? Math.ceil((ms - now) / DAY) : null;
      })
      .filter((d) => d != null);
    const minDays = days.length ? Math.min(...days) : null;
    const flagged = g('ledger.journal').filter((j) => j.flagged).length
      + g('raise.gift').filter((x) => String(x.status || '') === 'flagged').length;
    return {
      kind: 'meter',
      value: minDays != null ? `${minDays}d` : '—',
      num: minDays != null ? Math.max(0, Math.min(30, minDays)) : 30,
      den: 30,
      severity: minDays == null ? 'ok' : minDays < 7 ? 'danger' : minDays <= 14 ? 'warn' : 'ok',
      sub: flagged > 0 ? `${flagged} flagged` : minDays != null ? 'to next filing' : 'no filings due',
      attention: (minDays != null && minDays <= 14) || flagged > 0,
    };
  };

  const approvals = () => {
    const awaiting = g('beacon.post')
      .filter((p) => /^needs/i.test(String(p.signoff || '').trim()) || p.status === 'HOLD');
    const s = {
      kind: 'stat',
      value: compactNum(awaiting.length),
      raw: awaiting.length,
      attention: awaiting.length > 0,
    };
    if (awaiting.length) s.sub = String(awaiting[0].headline || 'awaiting sign-off');
    return s;
  };

  const fieldStat = () => {
    const voters = g('ground.voter').length;
    const unfilled = g('ground.shift').filter((sh) => (Number(sh.filled) || 0) < (Number(sh.cap) || 0)).length;
    return {
      kind: 'stat',
      value: compactNum(voters),
      raw: voters,
      sub: `${plural(unfilled, 'shift')} unfilled`,
      attention: unfilled > 0,
    };
  };

  const fieldMeter = () => {
    const shifts = g('ground.shift');
    const den = shifts.reduce((s, sh) => s + Math.max(0, Number(sh.cap) || 0), 0);
    const num = shifts.reduce((s, sh) => s + Math.min(Math.max(0, Number(sh.filled) || 0), Math.max(0, Number(sh.cap) || 0)), 0);
    const ratio = den > 0 ? num / den : 1;
    return {
      kind: 'meter',
      value: `${num}/${den}`,
      num,
      den,
      severity: ratio >= 0.8 ? 'ok' : ratio >= 0.5 ? 'warn' : 'danger',
      sub: 'shifts filled',
      attention: den > 0 && num < den,
    };
  };

  const asks = () => {
    const stalled = g('coalition.ask')
      .filter((a) => (Number(a.stage) || 0) < 3)
      .map((a) => ({ ...a, dueMs: dateMs(a.due) }))
      .filter((a) => a.dueMs != null && a.dueMs - now <= 7 * DAY)
      .sort((a, b) => a.dueMs - b.dueMs);
    const s = {
      kind: 'stat',
      value: compactNum(stalled.length),
      raw: stalled.length,
      attention: stalled.length > 0,
    };
    if (stalled[0]) s.sub = `${stalled[0].org || 'Unknown org'} · due ${stalled[0].due}`;
    return s;
  };

  const events = () => {
    const todayStr = new Date(now).toISOString().slice(0, 10);
    const upcoming = g('events.event')
      .filter((e) => typeof e.date === 'string' && e.date >= todayStr)
      .map((e) => ({ ...e, _ms: dateMs(e.date) }))
      .filter((e) => e._ms != null && e._ms - now <= 14 * DAY)
      .sort((a, b) => a._ms - b._ms);
    const gaps = upcoming.reduce((s, e) => s + Math.max(0, (Number(e.shifts) || 0) - (Number(e.shiftsFilled) || 0)), 0);
    const sec = {
      kind: 'list',
      items: upcoming.slice(0, 4).map((e) => {
        const item = { label: String(e.title || 'Untitled event'), when: String(e.date) };
        const where = e.venue || e.location || e.city;
        if (where) item.sub = String(where);
        return item;
      }),
      attention: upcoming.some((e) => (Number(e.shiftsFilled) || 0) < (Number(e.shifts) || 0)),
    };
    if (gaps > 0) sec.sub = plural(gaps, 'shift gap');
    return sec;
  };

  const attention = () => {
    const spiking = topics.filter((t) => t.spiking);
    const s = {
      kind: 'stat',
      value: compactNum(spiking.length),
      raw: spiking.length,
      attention: spiking.length > 0,
    };
    if (spiking.length) s.sub = String(spiking[0].name || '');
    return s;
  };

  const forecast = () => {
    const districts = g('margin.district');
    const polls = g('margin.poll');
    let result;
    try { result = buildContestConfig(g('margin.contest')[0] || null, districts, polls); }
    catch { result = { error: 'build failed' }; }
    return {
      kind: 'stat',
      value: result.config ? 'Live' : '—',
      raw: result.config ? 1 : 0,
      sub: result.config
        ? String(result.config.name || 'Forecast live')
        : `${plural(districts.length, 'district')} · ${plural(polls.length, 'poll')}`,
      attention: false,
    };
  };

  const directoryStat = (sub) => () => ({
    kind: 'stat',
    value: compactNum(directory.total),
    raw: directory.total,
    sub,
    attention: false,
  });

  const academy = () => {
    const courses = g('academy.course').length;
    return {
      kind: 'stat',
      value: compactNum(courses),
      raw: courses,
      sub: 'keep training',
      attention: false,
    };
  };

  // ── assembly — per-persona selection + order ──

  const META = {
    money:      { key: 'money', module: 'raise', route: 'raise', label: 'Money' },
    compliance: { key: 'compliance', module: 'ledger', route: 'ledger', label: 'Compliance' },
    approvals:  { key: 'approvals', module: 'beacon', route: 'beacon', label: 'Approvals' },
    field:      { key: 'field', module: 'ground', route: 'ground', label: 'Field' },
    asks:       { key: 'asks', module: 'coalition', route: 'coalition', label: 'Asks' },
    events:     { key: 'events', module: 'events', route: 'events', label: 'Events' },
    attention:  { key: 'attention', module: 'tide', route: 'tide', label: 'Attention' },
    forecast:   { key: 'forecast', module: 'margin', route: 'margin', label: 'Forecast' },
    directory:  { key: 'directory', module: 'directory', route: 'directory', label: 'Directory' },
    academy:    { key: 'academy', module: 'academy', route: 'academy', label: 'Academy' },
  };

  // Zero states per kind — used when a builder throws on surprise data.
  const ZERO = {
    stat: { kind: 'stat', value: '0', raw: 0 },
    meter: { kind: 'meter', value: '—', num: 0, den: 0, severity: 'ok' },
    list: { kind: 'list', items: [] },
  };

  const managerDirectory = directoryStat(`${compactNum(directory.multiModule)} span multiple modules`);
  const volunteerDirectory = directoryStat('people in the campaign');

  const SHAPES = {
    manager: [
      ['money', money, 'stat'], ['compliance', compliance, 'meter'], ['approvals', approvals, 'stat'],
      ['field', fieldStat, 'stat'], ['asks', asks, 'stat'], ['events', events, 'list'],
      ['attention', attention, 'stat'], ['forecast', forecast, 'stat'], ['directory', managerDirectory, 'stat'],
    ],
    staff: [
      ['money', money, 'stat'], ['compliance', compliance, 'meter'], ['approvals', approvals, 'stat'],
      ['field', fieldStat, 'stat'], ['asks', asks, 'stat'], ['events', events, 'list'],
      ['attention', attention, 'stat'], ['directory', managerDirectory, 'stat'],
    ],
    candidate: [
      ['events', events, 'list'], ['money', money, 'stat'], ['field', fieldStat, 'stat'],
      ['attention', attention, 'stat'], ['approvals', approvals, 'stat'],
    ],
    volunteer: [
      ['events', events, 'list'], ['field', fieldMeter, 'meter'],
      ['academy', academy, 'stat'], ['directory', volunteerDirectory, 'stat'],
    ],
  };

  const shape = SHAPES[persona] || SHAPES.manager;
  const sections = shape.map(([metaKey, build, kind]) => {
    const meta = META[metaKey];
    try {
      const s = build();
      return { ...meta, ...s, attention: !!s.attention };
    } catch {
      return { ...meta, ...ZERO[kind], attention: false };
    }
  });

  // Activation checklist — managers only. The five first actions that predict
  // retention; carried on the brief so Home can engineer the path to them.
  if (persona === 'manager') {
    let userCount = 0;
    try {
      const rows = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.workspaceId, workspaceId), eq(users.active, true)));
      userCount = rows.length;
    } catch { /* zeroed */ }
    const steps = [
      { key: 'voter', label: 'Add your first voter', done: g('ground.voter').length > 0 },
      { key: 'gift', label: 'Log your first gift', done: g('raise.gift').length > 0 },
      { key: 'event', label: 'Put an event on the calendar', done: g('events.event').length > 0 },
      { key: 'post', label: 'Draft a social post', done: g('beacon.post').length > 0 },
      { key: 'team', label: 'Invite a teammate', done: userCount > 1 },
    ];
    sections.activation = { steps, complete: steps.every((s) => s.done) };
  }

  return sections;
}
