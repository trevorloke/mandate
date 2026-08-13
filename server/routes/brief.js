// Daily Brief — GET /api/brief synthesizes the whole campaign's state into
// persona-shaped, visual sections for Home ("where things stand + what needs
// attention"). Read-only, so any workspace member (viewer+) can fetch it.
//
// ?viewAs=<persona> lets admins preview another persona's brief; for everyone
// else the parameter is ignored.
import { Hono } from 'hono';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { buildBrief, effectivePersona, PERSONAS } from '../lib/brief.js';

const app = new Hono();

app.use('*', requireAuth);

app.get('/', requireRole('viewer'), async (c) => {
  const me = c.get('user');
  let persona = effectivePersona(me);
  const viewAs = c.req.query('viewAs');
  if (viewAs && PERSONAS.includes(viewAs) && (me.role === 'admin' || me.role === 'super_admin')) {
    persona = viewAs;
  }
  const sections = await buildBrief(me.workspaceId, persona);
  // buildBrief attaches `activation` as an own property of the sections array;
  // lift it to a top-level field since JSON.stringify drops array properties.
  return c.json({ persona, sections, activation: sections.activation, generatedAt: Date.now() });
});

export default app;
