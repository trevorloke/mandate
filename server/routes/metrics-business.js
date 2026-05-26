// Business-metrics endpoint — KPI values computed from the workspace's records,
// with deltas + sparklines derived from metric_snapshots. Any authenticated role.
import { Hono } from 'hono';
import { requireAuth } from '../middleware/auth.js';
import { metricsForWorkspace } from '../lib/metrics-compute.js';

const app = new Hono();
app.use('*', requireAuth);

app.get('/', async (c) => {
  const me = c.get('user');
  const metrics = await metricsForWorkspace(me.workspaceId);
  return c.json({ at: new Date().toISOString(), metrics });
});

export default app;
