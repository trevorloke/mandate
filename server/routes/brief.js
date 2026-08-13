// Daily Brief — GET /api/brief synthesizes the whole campaign's state into
// ordered sections for Home ("where things stand + what needs attention").
// Read-only, so any workspace member (viewer+) can fetch it.
import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildBrief } from '../lib/brief.js';

const app = new Hono();

app.use('*', requireAuth);

app.get('/', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  const sections = await buildBrief(me.workspaceId);
  return c.json({ sections, generatedAt: Date.now() });
});

export default app;
