// Buffer-style queue slots. The workspace defines preferred posting times
// (per weekday, in its own timezone); "Add to queue" picks the next free slot.
// Slots live in workspaces.settings.postingSlots: [{ day: 0-6 (Sun-Sat), time: 'HH:MM' }].
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { workspaces } from '../../db/schema.js';

const TZ_IANA = {
  PT: 'America/Los_Angeles', MT: 'America/Denver', CT: 'America/Chicago', ET: 'America/New_York',
  AT: 'America/Halifax', NT: 'America/St_Johns', GMT: 'Etc/UTC', BST: 'Europe/London',
  CET: 'Europe/Paris', EET: 'Europe/Helsinki', IST: 'Asia/Kolkata',
};

const safeJson = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };

export async function getWorkspaceSlots(workspaceId) {
  const ws = (await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1))[0];
  const settings = safeJson(ws?.settings);
  const slots = Array.isArray(settings.postingSlots) ? settings.postingSlots : [];
  return { slots, tz: ws?.tz || 'GMT', settings, ws };
}

export async function setWorkspaceSlots(workspaceId, slots) {
  const clean = (Array.isArray(slots) ? slots : [])
    .map((s) => ({ day: Number(s.day), time: String(s.time || '') }))
    .filter((s) => Number.isInteger(s.day) && s.day >= 0 && s.day <= 6 && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.time))
    .slice(0, 70);
  const { settings } = await getWorkspaceSlots(workspaceId);
  await db.update(workspaces)
    .set({ settings: JSON.stringify({ ...settings, postingSlots: clean }), updatedAt: new Date() })
    .where(eq(workspaces.id, workspaceId));
  return clean;
}

// UTC offset string (e.g. '-07:00') for a zone at a given instant — DST-aware.
function offsetAt(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(date);
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+00:00'; // 'GMT-07:00'
  const m = raw.match(/GMT([+-]\d{2}:\d{2})/);
  return m ? m[1] : '+00:00';
}

// The next `count` slot instants strictly after `after`, in the workspace tz.
export function upcomingSlotTimes(slots, tzAbbr, after, count = 1) {
  if (!slots.length || count < 1) return [];
  const timeZone = TZ_IANA[tzAbbr] || 'Etc/UTC';
  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const out = [];
  // Walk day by day (up to 15 days covers any weekly pattern) in the target tz.
  for (let d = 0; d < 15 && out.length < count; d++) {
    const probe = new Date(after.getTime() + d * 86400_000);
    const ymd = dayFmt.format(probe);              // YYYY-MM-DD in tz
    const dow = WD[wdFmt.format(probe)] ?? 0;
    const todays = slots.filter((s) => s.day === dow).sort((a, b) => a.time.localeCompare(b.time));
    for (const s of todays) {
      // Offset evaluated at that day's noon so DST transitions resolve correctly.
      const off = offsetAt(timeZone, new Date(`${ymd}T12:00:00Z`));
      const t = new Date(`${ymd}T${s.time}:00${off}`);
      if (t > after && out.length < count) out.push(t);
    }
  }
  return out;
}

// Next free queue time for a workspace: the first slot after both "now" and
// the latest already-scheduled post (so queued posts stack onto open slots).
export async function nextQueueTime(workspaceId, { sqlite }) {
  const { slots, tz } = await getWorkspaceSlots(workspaceId);
  if (!slots.length) return { error: 'No queue slots configured — set them via the Calendar ⚙ slots editor.' };
  let after = new Date();
  try {
    const row = sqlite.prepare(
      "SELECT MAX(scheduled_at) m FROM social_posts WHERE workspace_id = ? AND status IN ('scheduled','pending') AND scheduled_at IS NOT NULL"
    ).get(workspaceId);
    if (row?.m && row.m * 1000 > after.getTime()) after = new Date(row.m * 1000);
  } catch { /* fall back to now */ }
  const [t] = upcomingSlotTimes(slots, tz, after, 1);
  return t ? { time: t, tz } : { error: 'No upcoming slot found.' };
}
