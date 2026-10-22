// Offline field mode — the server half.
//
//   sql   signs.client_id: the offline outbox's key for a sign request, so a
//         request replayed after reconnecting is the same request (sign.place
//         dedupes on it, per workspace). person.create dedupes on a client-made
//         id and contact.log already has its own client_id.
//   api   GET /api/map/config (signed in, every role): which map tiles to draw.
//
// Map tiles come from OpenStreetMap unless the deployment names its own
// provider (OSM's volunteer servers are not for heavy use — a big team in
// election week should switch):
//   STARBASE_TILE_URL          https://…/{z}/{x}/{y}.png  ({s} optional)
//   STARBASE_TILE_ATTRIBUTION  the provider's credit line (links allowed)
//   STARBASE_TILE_MAX_ZOOM     1–22 (default 19)
// Read on every request, so a restart is all a change needs.
import { Hono } from 'hono';

export const sql = `
alter table signs add column if not exists client_id uuid;
create unique index if not exists signs_client_idx on signs (workspace_id, client_id) where client_id is not null;
`;

export const TILE_DEFAULTS = Object.freeze({
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
});

// A tile template the map can use: http(s), with {z}, {x} and {y}.
const validUrl = (v) => {
  const s = String(v || '').trim();
  if (!/^https?:\/\/[^\s/]+\/\S*$/i.test(s) || s.length > 1000) return null;
  if (!['{z}', '{x}', '{y}'].every((p) => s.includes(p))) return null;
  return s;
};

const warned = new Set();
const warnOnce = (msg) => {
  if (warned.has(msg)) return;
  warned.add(msg);
  console.warn(`map tiles: ${msg}`);
};

export const tileConfig = (env = process.env) => {
  const out = { ...TILE_DEFAULTS };
  if (env.STARBASE_TILE_URL) {
    const url = validUrl(env.STARBASE_TILE_URL);
    if (url) out.url = url;
    else warnOnce('STARBASE_TILE_URL needs http(s) and {z}/{x}/{y} — using OpenStreetMap');
  }
  // A custom provider without its own credit line gets none rather than
  // OpenStreetMap's (that would be a false credit).
  if (env.STARBASE_TILE_ATTRIBUTION != null && env.STARBASE_TILE_ATTRIBUTION !== '') {
    out.attribution = String(env.STARBASE_TILE_ATTRIBUTION).slice(0, 500);
  } else if (!/openstreetmap\.org\//i.test(out.url)) {
    out.attribution = '';
  }
  if (env.STARBASE_TILE_MAX_ZOOM) {
    const z = Number(env.STARBASE_TILE_MAX_ZOOM);
    if (Number.isInteger(z) && z >= 1 && z <= 22) out.maxZoom = z;
    else warnOnce('STARBASE_TILE_MAX_ZOOM must be a whole number 1–22 — using 19');
  }
  return out;
};

export const api = new Hono();
api.get('/map/config', (c) => {
  const t = tileConfig();
  return c.json({ tiles: { url: t.url, attribution: t.attribution, maxZoom: t.maxZoom } });
});
