// SSE endpoint — clients connect here to receive realtime updates for their workspace.
// Auth via existing cookie session OR Bearer token (?token=… not supported; SSE only sends cookies).
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { requireAuth } from '../middleware/auth.js';
import { connect } from '../lib/realtime.js';

const app = new Hono();
app.use('*', requireAuth);

app.get('/stream', (c) => {
  const me = c.get('user');
  return streamSSE(c, async (stream) => {
    // Send initial hello so the client knows the connection is up
    await stream.writeSSE({ event: 'hello', data: JSON.stringify({ workspace: me.workspaceId, at: new Date().toISOString() }) });

    // Adapter: realtime.connect expects a writer with .write(rawBlock)
    const writer = {
      write: (block) => stream.write(block),
    };
    const disconnect = connect(me.workspaceId, writer);

    // Heartbeat every 25s to keep proxies from killing the connection
    const heartbeat = setInterval(() => {
      stream.writeSSE({ event: 'ping', data: String(Date.now()) }).catch(() => {});
    }, 25_000);

    // Wait until the client disconnects (stream will be closed by Hono on abort)
    await new Promise((resolve) => {
      stream.onAbort(() => { clearInterval(heartbeat); disconnect(); resolve(); });
    });
  });
});

export default app;
