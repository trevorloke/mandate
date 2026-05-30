// Media storage for social posts. Images are stored as BLOBs in SQLite and
// served at a PUBLIC url (/api/social/media/:id) so that platforms which fetch
// by URL (Facebook, Instagram) can reach them. Bluesky/Mastodon/X upload the
// raw bytes instead.
import { randomBytes } from 'crypto';
import { sqlite } from '../../db/index.js';

const newId = (p) => p + randomBytes(12).toString('hex');
export const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function isAllowedMime(mime) { return ALLOWED.has(String(mime || '').toLowerCase()); }

export function saveMedia({ workspaceId, userId, mime, filename, bytes }) {
  const id = newId('sm_');
  sqlite.prepare(
    `INSERT INTO social_media (id, workspace_id, mime, filename, size, data, created_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, workspaceId, mime, filename || null, bytes.length, bytes, userId || null);
  return { id, mime, size: bytes.length };
}

export function getMedia(id) {
  const row = sqlite.prepare('SELECT id, workspace_id, mime, filename, data FROM social_media WHERE id = ?').get(id);
  if (!row) return null;
  return { id: row.id, workspaceId: row.workspace_id, mime: row.mime, filename: row.filename, data: row.data };
}

// Absolute, publicly reachable URL for a media id. Requires MANDATE_PUBLIC_URL
// in any context without a request origin (e.g. the scheduled worker), which is
// exactly what Facebook/Instagram need to fetch the image.
export function publicMediaUrl(id, origin) {
  const base = (process.env.MANDATE_PUBLIC_URL || origin || '').replace(/\/$/, '');
  return base ? `${base}/api/social/media/${id}` : null;
}

// Resolve a post's mediaJson (array of {id,mime}) into rich refs the adapters
// can use: raw bytes (for byte-upload platforms) + a public URL (for URL ones).
export function loadMediaForPost(mediaJson, origin) {
  let refs = [];
  try { refs = JSON.parse(mediaJson || '[]'); } catch { refs = []; }
  return refs.map((r) => {
    const m = getMedia(r.id);
    if (!m) return null;
    return { id: m.id, mime: m.mime, bytes: m.data, url: publicMediaUrl(m.id, origin) };
  }).filter(Boolean);
}
