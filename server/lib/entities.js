// Cross-module entity resolution — the database that transcends modules.
//
// Every module stores its own records, but a person/org/place is ONE canonical
// entity. This module matches module records to entities (by email, else
// normalized name + type), maintains the links, assembles a single 360° profile
// of every touchpoint, and propagates an edit of the entity back to the linked
// records ("one entry impacts all modules").
import { randomBytes } from 'crypto';
import { and, eq, isNull, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { entities, entityLinks, moduleData } from '../db/schema.js';

const newId = (p) => p + randomBytes(9).toString('hex');
const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const normName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const cleanEmail = (s) => String(s || '').trim().toLowerCase() || null;

// The module record kinds that represent real-world entities, with the role the
// touchpoint plays. Other kinds (scripts, journal lines, bills…) are not people.
export const ENTITY_KINDS = {
  voter: { type: 'person', role: 'voter' },
  canvasser: { type: 'person', role: 'canvasser' },
  donor: { type: 'person', role: 'donor' },
  prospect: { type: 'person', role: 'prospect' },
  pledge: { type: 'person', role: 'pledge' },
  gift: { type: 'person', role: 'donor' },
  host: { type: 'person', role: 'host' },
  faculty: { type: 'person', role: 'faculty' },
  org: { type: 'org', role: 'partner org' },
  press_outlet: { type: 'org', role: 'press outlet' },
  venue: { type: 'place', role: 'venue' },
};

// Pull a name/email/phone out of a record's flexible data.
export function extractIdentity(kind, data) {
  const def = ENTITY_KINDS[kind];
  if (!def) return null;
  let name = String(data.name || '').trim();
  if (!name && (data.first || data.last)) name = [data.first, data.last].filter(Boolean).join(' ').trim();
  if (!name && data.fullName) name = String(data.fullName).trim();
  if (!name) return null;
  return { type: def.type, role: def.role, name, email: cleanEmail(data.email), phone: String(data.phone || '').trim() || null };
}

const matchKeyOf = (type, name, email) => (email ? `e:${email}` : `n:${type}:${normName(name)}`);

// Scan every module record and resolve it to a canonical entity, creating
// entities and links as needed. Idempotent: re-running matches the same keys and
// the unique (entity, record) index keeps links from duplicating.
export async function rebuildFromModuleData(workspaceId, createdById = null) {
  const rows = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, workspaceId), isNull(moduleData.deletedAt)));

  // Index existing entities by match key so we reuse them.
  const existing = await db.select().from(entities).where(and(eq(entities.workspaceId, workspaceId), isNull(entities.deletedAt)));
  const byKey = new Map(existing.filter((e) => e.matchKey).map((e) => [e.matchKey, e]));

  let created = 0, linked = 0;
  for (const r of rows) {
    const id = extractIdentity(r.kind, parse(r.data, {}));
    if (!id) continue;
    const key = matchKeyOf(id.type, id.name, id.email);
    let entity = byKey.get(key);
    if (!entity) {
      entity = { id: newId('ent_'), workspaceId, type: id.type, name: id.name, email: id.email, phone: id.phone, matchKey: key };
      await db.insert(entities).values({ ...entity, tagsJson: '[]', dataJson: '{}', createdById });
      byKey.set(key, entity);
      created += 1;
    } else if ((!entity.email && id.email) || (!entity.phone && id.phone)) {
      // Enrich the canonical record with contact info discovered elsewhere.
      await db.update(entities).set({ email: entity.email || id.email, phone: entity.phone || id.phone, updatedAt: new Date() }).where(eq(entities.id, entity.id));
      entity.email = entity.email || id.email; entity.phone = entity.phone || id.phone;
    }
    try {
      await db.insert(entityLinks).values({ id: newId('el_'), workspaceId, entityId: entity.id, module: r.module, kind: r.kind, recordId: r.id, role: id.role });
      linked += 1;
    } catch { /* unique (entity, record) — already linked */ }
  }

  // How many entities now span more than one module — the cross-module payoff.
  const links = await db.select().from(entityLinks).where(eq(entityLinks.workspaceId, workspaceId));
  const modsByEntity = new Map();
  for (const l of links) { const s = modsByEntity.get(l.entityId) || new Set(); s.add(l.module); modsByEntity.set(l.entityId, s); }
  const multiModule = [...modsByEntity.values()].filter((s) => s.size > 1).length;
  return { created, linked, totalEntities: byKey.size, multiModule };
}

// Assemble the 360° profile: the entity + every linked record, grouped by module.
export async function entityProfile(workspaceId, entityId) {
  const entity = (await db.select().from(entities).where(and(eq(entities.id, entityId), eq(entities.workspaceId, workspaceId))).limit(1))[0];
  if (!entity) return null;
  const links = await db.select().from(entityLinks).where(eq(entityLinks.entityId, entityId));
  const recordIds = links.map((l) => l.recordId);
  const records = recordIds.length
    ? await db.select().from(moduleData).where(and(eq(moduleData.workspaceId, workspaceId), inArray(moduleData.id, recordIds)))
    : [];
  const byId = new Map(records.map((r) => [r.id, parse(r.data, {})]));
  const modules = {};
  for (const l of links) {
    (modules[l.module] ||= []).push({ linkId: l.id, module: l.module, kind: l.kind, role: l.role, recordId: l.recordId, record: byId.get(l.recordId) || null });
  }
  return {
    entity: { ...entity, tags: parse(entity.tagsJson, []), data: parse(entity.dataJson, {}) },
    modules,
    moduleCount: Object.keys(modules).length,
    touchpointCount: links.length,
  };
}

// Reverse lookup: which entity owns a given module record (+ its full profile).
export async function entityForRecord(workspaceId, module, kind, recordId) {
  const link = (await db.select().from(entityLinks)
    .where(and(eq(entityLinks.workspaceId, workspaceId), eq(entityLinks.module, module), eq(entityLinks.kind, kind), eq(entityLinks.recordId, recordId))).limit(1))[0];
  if (!link) return null;
  return entityProfile(workspaceId, link.entityId);
}

// Propagate an entity edit to every linked module record — edit once, reflected
// everywhere. Updates name (split into first/last when the record uses those),
// email, and phone in place.
export async function syncEntityToLinks(workspaceId, entityId) {
  const entity = (await db.select().from(entities).where(eq(entities.id, entityId)).limit(1))[0];
  if (!entity) return 0;
  const links = await db.select().from(entityLinks).where(eq(entityLinks.entityId, entityId));
  if (!links.length) return 0;
  const records = await db.select().from(moduleData)
    .where(and(eq(moduleData.workspaceId, workspaceId), inArray(moduleData.id, links.map((l) => l.recordId))));
  let updated = 0;
  for (const r of records) {
    const data = parse(r.data, {});
    if ('first' in data || 'last' in data) {
      const parts = entity.name.split(/\s+/);
      data.first = parts[0] || ''; data.last = parts.slice(1).join(' ');
    } else {
      data.name = entity.name;
    }
    if (entity.email != null && ('email' in data || entity.email)) data.email = entity.email;
    if (entity.phone != null && ('phone' in data || entity.phone)) data.phone = entity.phone;
    await db.update(moduleData).set({ data: JSON.stringify(data), updatedAt: new Date() }).where(eq(moduleData.id, r.id));
    updated += 1;
  }
  return updated;
}

// ── Manual CRUD ──
export async function listEntities(workspaceId, { q = '', type = '' } = {}) {
  let rows = await db.select().from(entities).where(and(eq(entities.workspaceId, workspaceId), isNull(entities.deletedAt)));
  if (type) rows = rows.filter((e) => e.type === type);
  if (q) { const nq = normName(q); rows = rows.filter((e) => normName(e.name).includes(nq) || (e.email || '').includes(q.toLowerCase())); }
  // Attach each entity's module touchpoint summary for the directory list.
  const links = await db.select().from(entityLinks).where(eq(entityLinks.workspaceId, workspaceId));
  const byEntity = new Map();
  for (const l of links) { const s = byEntity.get(l.entityId) || { modules: new Set(), count: 0 }; s.modules.add(l.module); s.count += 1; byEntity.set(l.entityId, s); }
  return rows
    .map((e) => {
      const s = byEntity.get(e.id) || { modules: new Set(), count: 0 };
      return { ...e, tags: parse(e.tagsJson, []), modules: [...s.modules], touchpointCount: s.count };
    })
    .sort((a, b) => b.touchpointCount - a.touchpointCount || a.name.localeCompare(b.name));
}

export async function createEntity(workspaceId, body, createdById) {
  const id = newId('ent_');
  const name = String(body.name || '').trim();
  const email = cleanEmail(body.email);
  const type = ['person', 'org', 'place'].includes(body.type) ? body.type : 'person';
  await db.insert(entities).values({
    id, workspaceId, type, name, email, phone: body.phone || null,
    tagsJson: JSON.stringify(Array.isArray(body.tags) ? body.tags : []), dataJson: JSON.stringify(body.data || {}),
    matchKey: matchKeyOf(type, name, email), createdById,
  });
  return id;
}

export async function updateEntity(workspaceId, id, body) {
  const row = (await db.select().from(entities).where(and(eq(entities.id, id), eq(entities.workspaceId, workspaceId))).limit(1))[0];
  if (!row) return null;
  const updates = { updatedAt: new Date() };
  if (typeof body.name === 'string' && body.name.trim()) updates.name = body.name.trim();
  if (body.email !== undefined) updates.email = cleanEmail(body.email);
  if (body.phone !== undefined) updates.phone = body.phone || null;
  if (body.type && ['person', 'org', 'place'].includes(body.type)) updates.type = body.type;
  if (Array.isArray(body.tags)) updates.tagsJson = JSON.stringify(body.tags);
  if (body.data && typeof body.data === 'object') updates.dataJson = JSON.stringify(body.data);
  const name = updates.name ?? row.name; const email = updates.email ?? row.email; const type = updates.type ?? row.type;
  updates.matchKey = matchKeyOf(type, name, email);
  await db.update(entities).set(updates).where(eq(entities.id, id));
  return true;
}

export async function addLink(workspaceId, entityId, { module, kind, recordId, role }) {
  const id = newId('el_');
  await db.insert(entityLinks).values({ id, workspaceId, entityId, module, kind, recordId, role: role || kind });
  return id;
}
