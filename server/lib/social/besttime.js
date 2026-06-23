// Best-time-to-post — derived from this workspace's own engagement history.
// Buckets published posts by (weekday, hour) in the workspace tz and ranks the
// windows by average engagement. Powers both the Performance heatmap and the
// compose "schedule at best time" option (which reuses the DST-aware slot walker).
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { socialPosts, workspaces } from '../../db/schema.js';
import { upcomingSlotTimes } from './slots.js';

const TZ_IANA = {
  PT: 'America/Los_Angeles', MT: 'America/Denver', CT: 'America/Chicago', ET: 'America/New_York',
  AT: 'America/Halifax', NT: 'America/St_Johns', GMT: 'Etc/UTC', BST: 'Europe/London',
  CET: 'Europe/Paris', EET: 'Europe/Helsinki', IST: 'Asia/Kolkata',
};
const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const safe = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const engOf = (m) => (m.likes || 0) + (m.reposts || 0) + (m.replies || 0) + (m.comments || 0) + (m.shares || 0);

// Weekday + hour of a date in a tz abbreviation (DST-aware).
export function dayHourInTz(date, tzAbbr) {
  const timeZone = TZ_IANA[tzAbbr] || 'Etc/UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(date);
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    let hour = parseInt(parts.find((p) => p.type === 'hour')?.value, 10);
    if (hour === 24) hour = 0;
    return { day: WD[wd] ?? 0, hour: Number.isNaN(hour) ? 0 : hour };
  } catch {
    return { day: date.getUTCDay(), hour: date.getUTCHours() };
  }
}

// Aggregate published posts into per (day,hour) average-engagement buckets.
export function engagementGrid(posts, tz) {
  const buckets = new Map();
  let samples = 0;
  for (const p of posts) {
    if (!p.publishedAt || !p.metricsJson) continue;
    const m = safe(p.metricsJson); if (!m) continue;
    const d = p.publishedAt instanceof Date ? p.publishedAt : new Date(p.publishedAt * 1000);
    const { day, hour } = dayHourInTz(d, tz);
    const key = `${day}-${hour}`;
    const b = buckets.get(key) || { day, hour, sum: 0, n: 0 };
    b.sum += engOf(m); b.n++; buckets.set(key, b); samples++;
  }
  const grid = [...buckets.values()].map((b) => ({ day: b.day, hour: b.hour, avg: b.sum / b.n, n: b.n }));
  return { grid, samples };
}

// Workspace engagement grid + ranked suggestions (optionally per platform).
export async function bestTimes(workspaceId, platform = null) {
  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0];
  const tz = ws?.tz || 'GMT';
  const base = and(eq(socialPosts.workspaceId, workspaceId), eq(socialPosts.status, 'published'));
  const where = platform ? and(base, eq(socialPosts.platform, platform)) : base;
  const posts = await db.select().from(socialPosts).where(where);
  const { grid, samples } = engagementGrid(posts, tz);
  const suggestions = grid.slice().sort((a, b) => b.avg - a.avg).slice(0, 5);
  return { suggestions, grid, samples, tz };
}

// The soonest upcoming instant within one of the top engagement windows.
// Reuses the DST-aware slot walker by treating top buckets as posting slots.
export async function nextBestTime(workspaceId, { platform = null, after = new Date() } = {}) {
  const { grid, tz } = await bestTimes(workspaceId, platform);
  if (!grid.length) return { error: 'Not enough history yet to pick a best time — schedule manually or use the queue.' };
  const slots = grid.slice().sort((a, b) => b.avg - a.avg).slice(0, 5)
    .map((b) => ({ day: b.day, time: `${String(b.hour).padStart(2, '0')}:00` }));
  const [t] = upcomingSlotTimes(slots, tz, after, 1);
  return t ? { time: t, tz } : { error: 'No upcoming best-time window found.' };
}
