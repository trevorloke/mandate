// Tide service — the DB-facing orchestration used by routes, the worker, and the
// seed flow. Pure aggregation lives in ./index.js; this module loads inputs,
// persists readings, and exposes summaries.
import { randomBytes } from 'crypto';
import { and, eq, desc } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { tideTopics, tidePanelists, tideReadings } from '../../db/schema.js';
import { buildReading } from './index.js';
import { panelComposition } from './panel.js';
import { applyStep, nextStep } from './profiling.js';
import { buildMirror } from './mirror.js';

const newId = (p) => p + randomBytes(9).toString('hex');
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };

export function slugify(name) {
  return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'topic';
}

// Normalize a topic row into the shape the engine expects.
const shapeTopic = (t) => ({
  id: t.id, name: t.name, slug: t.slug,
  keywords: parse(t.keywordsJson, []),
  refreshHours: t.refreshHours || 4,
  status: t.status,
});

const parseReading = (r) => r && ({
  ...r,
  sentiment: parse(r.sentimentJson, {}),
  demographics: parse(r.demographicsJson, {}),
  drivers: parse(r.driversJson, []),
  sources: parse(r.sourcesJson, []),
});

export async function activePanelists(workspaceId) {
  const rows = await db.select().from(tidePanelists)
    .where(and(eq(tidePanelists.workspaceId, workspaceId), eq(tidePanelists.status, 'active')));
  return rows.map((p) => ({ ...p, interests: parse(p.interestsJson, []) }));
}

export async function latestReadingFor(topicId) {
  const r = (await db.select().from(tideReadings)
    .where(eq(tideReadings.topicId, topicId))
    .orderBy(desc(tideReadings.capturedAt)).limit(1))[0];
  return parseReading(r) || null;
}

// Build + persist one reading for a topic. Returns the parsed reading.
export async function generateReading(workspaceId, topicId, { at = Date.now() } = {}) {
  const row = (await db.select().from(tideTopics)
    .where(and(eq(tideTopics.id, topicId), eq(tideTopics.workspaceId, workspaceId))).limit(1))[0];
  if (!row) throw new Error('Topic not found');

  const topic = shapeTopic(row);
  const [panelists, prev] = await Promise.all([activePanelists(workspaceId), latestReadingFor(topicId)]);
  const reading = await buildReading({ topic, panelists, prev, at });

  const id = newId('tr_');
  const capturedAt = new Date(at);
  await db.insert(tideReadings).values({
    id, workspaceId, topicId, capturedAt,
    volume: reading.volume,
    momentum: reading.momentum,
    sentimentJson: JSON.stringify(reading.sentiment),
    demographicsJson: JSON.stringify(reading.demographics),
    driversJson: JSON.stringify(reading.drivers),
    sourcesJson: JSON.stringify(reading.sources),
    why: reading.why,
    confidence: reading.confidence,
    panelN: reading.panelN,
  });
  await db.update(tideTopics).set({ lastReadingAt: capturedAt, updatedAt: new Date() }).where(eq(tideTopics.id, topicId));
  return { id, topicId, capturedAt, ...reading };
}

// Topics with their latest reading folded in — powers the Waves list.
export async function listTopics(workspaceId) {
  const topics = await db.select().from(tideTopics)
    .where(eq(tideTopics.workspaceId, workspaceId)).orderBy(desc(tideTopics.updatedAt));
  const out = [];
  for (const t of topics) {
    out.push({
      id: t.id, name: t.name, slug: t.slug, status: t.status,
      keywords: parse(t.keywordsJson, []),
      refreshHours: t.refreshHours,
      lastReadingAt: t.lastReadingAt,
      latest: await latestReadingFor(t.id),
    });
  }
  return out;
}

export async function topicHistory(workspaceId, topicId, limit = 30) {
  const topic = (await db.select().from(tideTopics)
    .where(and(eq(tideTopics.id, topicId), eq(tideTopics.workspaceId, workspaceId))).limit(1))[0];
  if (!topic) return null;
  const readings = (await db.select().from(tideReadings)
    .where(eq(tideReadings.topicId, topicId))
    .orderBy(desc(tideReadings.capturedAt)).limit(limit)).map(parseReading);
  return {
    id: topic.id, name: topic.name, slug: topic.slug, status: topic.status,
    keywords: parse(topic.keywordsJson, []), refreshHours: topic.refreshHours,
    readings,
  };
}

export async function panelSummary(workspaceId) {
  const panelists = await activePanelists(workspaceId);
  return panelComposition(panelists);
}

// ── Panelist journey (gamified opt-in + progressive profiling) ──────────────
const shapePanelist = (p) => ({ ...p, interests: parse(p.interestsJson, []) });

export async function getPanelist(workspaceId, id) {
  const row = (await db.select().from(tidePanelists)
    .where(and(eq(tidePanelists.id, id), eq(tidePanelists.workspaceId, workspaceId))).limit(1))[0];
  return row ? shapePanelist(row) : null;
}

// Apply one profiling step and persist. Returns the gamification result
// (reward, level, new badges, next step) or { error }.
export async function recordStep(workspaceId, id, stepId, value) {
  const panelist = await getPanelist(workspaceId, id);
  if (!panelist) return { error: 'not found', status: 404 };
  const result = applyStep(panelist, stepId, value);
  if (result.error) return { error: result.error, status: 400 };
  await db.update(tidePanelists).set({ ...result.updates, updatedAt: new Date() }).where(eq(tidePanelists.id, id));
  delete result.updates; // don't leak the raw column patch to callers
  return result;
}

// The full engine-shaped topic set, used by the mirror.
export async function engineTopics(workspaceId) {
  const rows = await db.select().from(tideTopics)
    .where(and(eq(tideTopics.workspaceId, workspaceId), eq(tideTopics.status, 'active')));
  return rows.map(shapeTopic);
}

// Value-back mirror for a panelist: where they sit, what they're early/late to,
// how their take compares to people like them.
export async function mirrorFor(workspaceId, id) {
  const panelist = await getPanelist(workspaceId, id);
  if (!panelist) return null;
  const [topics, panel] = await Promise.all([engineTopics(workspaceId), activePanelists(workspaceId)]);
  return buildMirror({ panelist, topics, panel });
}

// Next step for a panelist's journey (null when complete).
export async function journeyState(workspaceId, id) {
  const panelist = await getPanelist(workspaceId, id);
  if (!panelist) return null;
  return {
    id: panelist.id,
    completeness: panelist.profileCompleteness,
    points: panelist.points || 0,
    badges: parse(panelist.badgesJson, []),
    next: nextStep(panelist),
  };
}

// Topics due for a refresh: never read, or older than their cadence.
export async function dueTopics(now = Date.now()) {
  const topics = await db.select().from(tideTopics).where(eq(tideTopics.status, 'active'));
  return topics.filter((t) => {
    if (!t.lastReadingAt) return true;
    const last = new Date(t.lastReadingAt).getTime();
    return now - last >= (t.refreshHours || 4) * 3600 * 1000;
  });
}

// ── Sample data ────────────────────────────────────────────────────────────
const AGE_BANDS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
const GENDERS = ['female', 'male', 'nonbinary'];
const REGIONS = ['urban', 'suburban', 'rural'];
const INTEREST_POOL = ['housing', 'transit', 'schools', 'taxes', 'climate', 'jobs', 'healthcare', 'safety', 'small-business', 'childcare'];

const SAMPLE_TOPICS = [
  { name: 'Housing affordability', keywords: ['housing', 'rent', 'zoning'] },
  { name: 'Public transit plan', keywords: ['transit', 'buses', 'transport'] },
  { name: 'School funding', keywords: ['schools', 'education', 'teachers'] },
  { name: 'Climate resilience', keywords: ['climate', 'flooding', 'energy'] },
  { name: 'Small-business relief', keywords: ['small-business', 'jobs', 'taxes'] },
];

// Idempotent: seeds ~240 consented panelists + a sample topic set, then generates
// two readings per topic (8h apart) so momentum is meaningful. Skips if topics
// already exist for the workspace.
export async function seedSampleData(workspaceId, { createdById = null, now = Date.now() } = {}) {
  const existing = await db.select().from(tideTopics).where(eq(tideTopics.workspaceId, workspaceId)).limit(1);
  if (existing.length) return { seeded: false, reason: 'topics already exist' };

  // Panel.
  const N = 240;
  const panelRows = [];
  for (let i = 0; i < N; i++) {
    const age = AGE_BANDS[i % AGE_BANDS.length];
    const gender = GENDERS[(i * 7) % GENDERS.length];
    const region = REGIONS[(i * 3) % REGIONS.length];
    const interests = [INTEREST_POOL[i % INTEREST_POOL.length], INTEREST_POOL[(i * 5 + 2) % INTEREST_POOL.length]];
    const completeness = 0.4 + ((i * 13) % 60) / 100;          // 0.40 – 0.99
    panelRows.push({
      id: newId('tp_'), workspaceId,
      externalRef: `panelist-${i + 1}`,
      consentAt: new Date(now - (i % 90) * 86400000),
      ageBand: age, gender, region,
      demographicsJson: '{}',
      interestsJson: JSON.stringify([...new Set(interests)]),
      linkedAccountsJson: '[]',
      profileCompleteness: Math.round(completeness * 100) / 100,
      weight: 1,
      status: 'active',
    });
  }
  // Chunked insert to stay well under SQLite's variable limit.
  for (let i = 0; i < panelRows.length; i += 60) await db.insert(tidePanelists).values(panelRows.slice(i, i + 60));

  // Topics.
  const created = [];
  for (const t of SAMPLE_TOPICS) {
    const id = newId('tt_');
    await db.insert(tideTopics).values({
      id, workspaceId, name: t.name, slug: slugify(t.name),
      keywordsJson: JSON.stringify(t.keywords), status: 'active', refreshHours: 4,
      createdById,
    });
    created.push(id);
  }

  // Two readings per topic, 8h apart, so the latest carries real momentum.
  for (const id of created) {
    await generateReading(workspaceId, id, { at: now - 8 * 3600 * 1000 });
    await generateReading(workspaceId, id, { at: now });
  }

  return { seeded: true, topics: created.length, panelists: N };
}
