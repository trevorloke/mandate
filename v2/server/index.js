// Mandate v2 server. Hono app: /api/auth (public), /api/* (workspace-scoped),
// static web build. Exported for in-process tests via app.request().
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';

export const app = new Hono();

app.get('/api/health', (c) => c.json({ ok: true, service: 'mandate-v2' }));
app.route('/api/auth', authRoutes);
app.route('/api', apiRoutes);

// Static web build (SPA fallback to index.html for URL routing).
app.use('*', serveStatic({ root: './web/dist' }));
app.get('*', serveStatic({ root: './web/dist', path: 'index.html' }));

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const port = Number(process.env.PORT) || 3200;
  serve({ fetch: app.fetch, port }, () => {
    console.log(`mandate v2 on :${port}`);
  });
}
