// Public short-link redirect with click tracking. Mounted at /l (outside /api),
// so short URLs look like https://host/l/ab12cd3.
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { socialLinks, socialLinkClicks } from '../db/schema.js';

const newId = (p) => p + randomBytes(12).toString('hex');
const app = new Hono();

app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = (await db.select().from(socialLinks).where(eq(socialLinks.slug, slug)).limit(1))[0];
  if (!row) return c.text('Link not found', 404);
  // Best-effort click tracking — never block the redirect on it.
  try {
    await db.update(socialLinks).set({ clicks: sql`clicks + 1`, lastClickAt: new Date() }).where(eq(socialLinks.id, row.id));
    await db.insert(socialLinkClicks).values({ id: newId('lc_'), linkId: row.id, referrer: c.req.header('referer') || null, ua: c.req.header('user-agent') || null });
  } catch { /* ignore tracking errors */ }
  return c.redirect(row.targetUrl, 302);
});

export default app;
