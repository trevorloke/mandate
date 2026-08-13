// Universal search — one query across canonical entities and every module's
// records, powering the ⌘K command palette.
//   GET /api/search?q=…   → { entities: […], records: […] }
// Entities come from the cross-module directory (name/email match, with module
// touchpoints attached). Records are a case-insensitive substring match over
// the raw data JSON, capped per (module, kind) bucket so one giant voter file
// can't drown out everything else.
import { Hono } from 'hono';
import { and, eq, isNull, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { moduleData } from '../db/schema.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { listEntities } from '../lib/entities.js';

const app = new Hono();
const parse = (s) => { try { return JSON.parse(s); } catch { return {}; } };

// Escape LIKE wildcards (and the escape char itself) so user input is always a
// literal substring match — '%' in the query matches a literal '%'.
const likePattern = (q) => '%' + q.toLowerCase().replace(/[\\%_]/g, (ch) => '\\' + ch) + '%';

const labelOf = (data) =>
  data.name
  || [data.first, data.last].join(' ').trim()
  || data.title || data.headline || data.org || data.memo || data.id
  || '(record)';

app.use('*', requireAuth);

app.get('/', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const q = String(c.req.query('q') || '').trim();
  if (q.length < 2) return c.json({ entities: [], records: [] });

  // People & orgs — the canonical directory already filters by name/email and
  // attaches modules + touchpointCount. Its name match runs on normalized
  // (alphanumeric) text, so a query with no alphanumerics (e.g. '%%') would
  // normalize to '' and match every entity — skip the lookup instead.
  const ents = (!/[a-z0-9]/i.test(q) ? [] : await listEntities(me.workspaceId, { q }))
    .slice(0, 8)
    .map((e) => ({ id: e.id, name: e.name, type: e.type, email: e.email, modules: e.modules, touchpointCount: e.touchpointCount }));

  // Module records — scan the data JSON itself so any field matches.
  const rows = await db.select().from(moduleData)
    .where(and(
      eq(moduleData.workspaceId, me.workspaceId),
      isNull(moduleData.deletedAt),
      sql`lower(${moduleData.data}) LIKE ${likePattern(q)} ESCAPE '\\'`,
    ))
    .orderBy(desc(moduleData.updatedAt))
    .limit(60);

  const perBucket = new Map();  // `${module}.${kind}` → hits kept
  const records = [];
  for (const r of rows) {
    if (records.length >= 15) break;
    const bucket = r.module + '.' + r.kind;
    const n = perBucket.get(bucket) || 0;
    if (n >= 3) continue;
    perBucket.set(bucket, n + 1);
    records.push({
      id: r.id, module: r.module, kind: r.kind,
      label: String(labelOf(parse(r.data))),
      sub: `${r.module} · ${r.kind}`,
    });
  }

  return c.json({ entities: ents, records });
});

export default app;
