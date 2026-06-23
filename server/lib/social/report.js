// Social analytics export — shared by the direct CSV download endpoint and the
// scheduled-reports engine (kind: 'social_analytics'). One source of truth so the
// emailed report and the on-demand download are identical.
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { socialPosts } from '../../db/schema.js';

const safe = (s) => { try { return JSON.parse(s || '{}'); } catch { return {}; } };
const engOf = (m) => (m.likes || 0) + (m.reposts || 0) + (m.replies || 0) + (m.comments || 0) + (m.shares || 0);

export const ANALYTICS_HEADERS = [
  'publishedAt', 'platform', 'engagement', 'likes', 'reposts', 'replies',
  'comments', 'shares', 'impressions', 'url', 'body',
];

// One row per published post, richest-engagement first.
export async function socialAnalyticsRows(workspaceId) {
  const rows = await db.select().from(socialPosts)
    .where(and(eq(socialPosts.workspaceId, workspaceId), eq(socialPosts.status, 'published')));
  return rows.map((p) => {
    const m = safe(p.metricsJson);
    return {
      publishedAt: p.publishedAt?.toISOString?.() || '',
      platform: p.platform,
      engagement: engOf(m),
      likes: m.likes || 0, reposts: m.reposts || 0, replies: m.replies || 0,
      comments: m.comments || 0, shares: m.shares || 0, impressions: m.impressions || 0,
      url: p.remoteUrl || '',
      body: String(p.body || '').replace(/\s+/g, ' ').slice(0, 160),
    };
  }).sort((a, b) => b.engagement - a.engagement);
}

function csvEscape(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function socialAnalyticsCsvFromRows(rows) {
  const head = ANALYTICS_HEADERS.join(',');
  const body = rows.map((r) => ANALYTICS_HEADERS.map((h) => csvEscape(r[h])).join(',')).join('\n');
  return head + '\n' + body + (rows.length ? '\n' : '');
}

export async function socialAnalyticsCsv(workspaceId) {
  return socialAnalyticsCsvFromRows(await socialAnalyticsRows(workspaceId));
}
