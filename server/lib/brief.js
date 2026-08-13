// Daily Brief — synthesize the whole campaign's state into ordered sections so
// Home can show "where things stand + what needs attention" in one fetch.
//
// Each section is { key, module, route, label, headline, detail, attention }.
// Sections needing attention sort first; within each group the fixed module
// order holds (Array.prototype.sort is stable). Every builder is null-safe: an
// empty workspace produces all nine sections with zeroed copy and
// attention:false — buildBrief never throws.
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/index.js';
import { moduleData, entities, entityLinks } from '../db/schema.js';
import { metricsForWorkspace } from './metrics-compute.js';
import { buildContestConfig } from './margin/build-contest.js';
import { listTopics } from './tide/service.js';

const DAY = 86400000;
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString();
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dateMs = (s) => { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? t : null; };

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

export async function buildBrief(workspaceId) {
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
  const disp = (key, fallback) => metrics[key]?.display ?? fallback;

  const sections = [];
  // Push meta + build(); on any surprise, fall back to the section's zero state.
  const add = (meta, build, zero) => {
    try {
      const s = build();
      sections.push({ ...meta, headline: String(s.headline), detail: String(s.detail), attention: !!s.attention });
    } catch {
      sections.push({ ...meta, ...zero, attention: false });
    }
  };

  // ── money ── raised YTD, week's gifts, cash + AP; flag bills coming due.
  add({ key: 'money', module: 'raise', route: 'raise', label: 'Money' }, () => {
    const week = (by['raise.gift'] || [])
      .filter((r) => r.createdAtMs != null && now - r.createdAtMs <= 7 * DAY)
      .reduce((s, r) => s + (Number(r.data.amt) || 0), 0);
    const billsDueSoon = g('ledger.bill').filter((b) => {
      if (String(b.status || '').toLowerCase() === 'paid') return false;
      const ms = dateMs(b.due);
      return ms != null && ms - now <= 7 * DAY;
    });
    return {
      headline: disp('raise.ytd', '$0'),
      detail: `${money(week)} this week · ${disp('ledger.cash', '$0')} on hand · ${disp('ledger.ap', '$0')} in bills`,
      attention: billsDueSoon.length > 0,
    };
  }, { headline: '$0', detail: '$0 this week · $0 on hand · $0 in bills' });

  // ── compliance ── next filing deadline + anything flagged.
  add({ key: 'compliance', module: 'ledger', route: 'ledger', label: 'Compliance' }, () => {
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
    const flaggedJournal = g('ledger.journal').filter((j) => j.flagged).length;
    const flaggedGifts = g('raise.gift').filter((x) => String(x.status || '') === 'flagged').length;
    return {
      headline: minDays != null ? `due in ${minDays}d` : 'No filings due',
      detail: `${plural(flaggedJournal, 'flagged journal entry', 'flagged journal entries')} · ${plural(flaggedGifts, 'flagged gift')}`,
      attention: (minDays != null && minDays <= 14) || flaggedJournal > 0 || flaggedGifts > 0,
    };
  }, { headline: 'No filings due', detail: '0 flagged journal entries · 0 flagged gifts' });

  // ── approvals ── posts held or explicitly awaiting a sign-off.
  add({ key: 'approvals', module: 'beacon', route: 'beacon', label: 'Approvals' }, () => {
    const awaiting = g('beacon.post')
      .filter((p) => /^needs/i.test(String(p.signoff || '').trim()) || p.status === 'HOLD');
    return {
      headline: `${plural(awaiting.length, 'post')} awaiting sign-off`,
      detail: awaiting.length ? String(awaiting[0].headline || '') : '',
      attention: awaiting.length > 0,
    };
  }, { headline: '0 posts awaiting sign-off', detail: '' });

  // ── field ── universe size + shift coverage.
  add({ key: 'field', module: 'ground', route: 'ground', label: 'Field' }, () => {
    const voters = g('ground.voter').length;
    const unfilled = g('ground.shift').filter((s) => (Number(s.filled) || 0) < (Number(s.cap) || 0)).length;
    return {
      headline: `${voters.toLocaleString()} voters in universe`,
      detail: `${plural(unfilled, 'shift')} unfilled`,
      attention: unfilled > 0,
    };
  }, { headline: '0 voters in universe', detail: '0 shifts unfilled' });

  // ── asks ── undelivered asks whose deadline is within a week or past.
  add({ key: 'asks', module: 'coalition', route: 'coalition', label: 'Asks' }, () => {
    const stalled = g('coalition.ask')
      .filter((a) => (Number(a.stage) || 0) < 3)
      .map((a) => ({ ...a, dueMs: dateMs(a.due) }))
      .filter((a) => a.dueMs != null && a.dueMs - now <= 7 * DAY)
      .sort((a, b) => a.dueMs - b.dueMs);
    const nearest = stalled[0];
    return {
      headline: `${plural(stalled.length, 'ask')} stalled or due`,
      detail: nearest ? `${nearest.org || 'Unknown org'} · due ${nearest.due}` : '',
      attention: stalled.length > 0,
    };
  }, { headline: '0 asks stalled or due', detail: '' });

  // ── events ── next event in the 14-day window + staffing gaps.
  add({ key: 'events', module: 'events', route: 'events', label: 'Events' }, () => {
    const todayStr = new Date(now).toISOString().slice(0, 10);
    const upcoming = g('events.event')
      .filter((e) => typeof e.date === 'string' && e.date >= todayStr)
      .map((e) => ({ ...e, _ms: dateMs(e.date) }))
      .filter((e) => e._ms != null && e._ms - now <= 14 * DAY)
      .sort((a, b) => a._ms - b._ms);
    const gaps = upcoming.reduce((s, e) => s + Math.max(0, (Number(e.shifts) || 0) - (Number(e.shiftsFilled) || 0)), 0);
    const next = upcoming[0];
    return {
      headline: next ? `${next.title || 'Untitled event'} · ${next.date}` : 'Nothing scheduled',
      detail: `${plural(upcoming.length, 'event')} in 14d · ${plural(gaps, 'shift gap')}`,
      attention: upcoming.some((e) => (Number(e.shiftsFilled) || 0) < (Number(e.shifts) || 0)),
    };
  }, { headline: 'Nothing scheduled', detail: '0 events in 14d · 0 shift gaps' });

  // ── attention ── Tide topics currently spiking.
  add({ key: 'attention', module: 'tide', route: 'tide', label: 'Attention' }, () => {
    const spiking = topics.filter((t) => t.spiking);
    return {
      headline: spiking.length ? `${plural(spiking.length, 'topic')} spiking` : 'Attention steady',
      detail: spiking.length ? String(spiking[0].name || '') : '',
      attention: spiking.length > 0,
    };
  }, { headline: 'Attention steady', detail: '' });

  // ── forecast ── whether Margin has a buildable contest; informational only.
  add({ key: 'forecast', module: 'margin', route: 'margin', label: 'Forecast' }, () => {
    const districts = g('margin.district');
    const polls = g('margin.poll');
    let result;
    try { result = buildContestConfig(g('margin.contest')[0] || null, districts, polls); }
    catch { result = { error: 'build failed' }; }
    return {
      headline: result.config ? `Forecast live — ${result.config.name}` : 'Not configured',
      detail: `${plural(districts.length, 'district')} · ${plural(polls.length, 'poll')}`,
      attention: false,
    };
  }, { headline: 'Not configured', detail: '0 districts · 0 polls' });

  // ── directory ── canonical entities + the cross-module payoff count.
  add({ key: 'directory', module: 'directory', route: 'directory', label: 'Directory' }, () => ({
    headline: `${directory.total.toLocaleString()} people & orgs`,
    detail: `${directory.multiModule.toLocaleString()} span multiple modules`,
    attention: false,
  }), { headline: '0 people & orgs', detail: '0 span multiple modules' });

  // Attention first; stable sort preserves the fixed order within each group.
  sections.sort((a, b) => Number(b.attention) - Number(a.attention));
  return sections;
}
