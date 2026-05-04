// Admin routes for managing public forms.
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { publicForms, auditLog } from '../db/schema.js';
import { and, eq, desc } from 'drizzle-orm';
import { requireAuth, requireRole } from '../middleware/auth.js';

const newId = (p='') => p + randomBytes(12).toString('hex');
const slugId = () => randomBytes(8).toString('hex');

const app = new Hono();
app.use('*', requireAuth);

// Sanitize for display (no secrets here)
const sanitize = (f) => {
  if (!f) return null;
  let allowed = [];
  try { allowed = JSON.parse(f.allowedFields || '[]'); } catch {}
  const { captchaSecret, ...rest } = f;
  return { ...rest, allowedFields: allowed, hasCaptchaSecret: !!captchaSecret };
};

app.get('/', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const rows = await db.select().from(publicForms)
    .where(eq(publicForms.workspaceId, me.workspaceId))
    .orderBy(desc(publicForms.createdAt));
  return c.json({ forms: rows.map(sanitize) });
});

app.post('/', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const { label, module, kind, allowedFields = [], redirectUrl, rateLimitPerMin = 10 } = body;
  if (!label?.trim()) return c.json({ error: 'label required' }, 400);
  if (!module || !kind) return c.json({ error: 'module and kind required' }, 400);

  // Sanitize allowedFields
  const fields = (Array.isArray(allowedFields) ? allowedFields : []).map(f => ({
    key: String(f.key || '').trim(),
    label: String(f.label || f.key || '').trim(),
    type: ['text', 'email', 'number', 'textarea', 'select', 'boolean'].includes(f.type) ? f.type : 'text',
    required: !!f.required,
    options: Array.isArray(f.options) ? f.options.map(String) : undefined,
  })).filter(f => f.key);
  if (fields.length === 0) return c.json({ error: 'at least one allowed field required' }, 400);

  const { captchaProvider, captchaSitekey, captchaSecret } = body;
  const validProvider = ['hcaptcha', 'turnstile'].includes(captchaProvider) ? captchaProvider : null;

  const id = newId('pf_');
  const slug = slugId();
  await db.insert(publicForms).values({
    id, workspaceId: me.workspaceId, label: label.trim(),
    slug, module, kind,
    allowedFields: JSON.stringify(fields),
    redirectUrl: redirectUrl?.trim() || null,
    rateLimitPerMin: Number(rateLimitPerMin) || 10,
    captchaProvider: validProvider,
    captchaSitekey: validProvider ? (captchaSitekey?.trim() || null) : null,
    captchaSecret:  validProvider ? (captchaSecret?.trim()  || null) : null,
    active: true,
  });

  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'form.create',
    target: id, meta: JSON.stringify({ label, module, kind }),
  });

  const fresh = (await db.select().from(publicForms).where(eq(publicForms.id, id)).limit(1))[0];
  return c.json({ ok: true, form: sanitize(fresh) });
});

app.put('/:id', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const row = (await db.select().from(publicForms)
    .where(and(eq(publicForms.id, id), eq(publicForms.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);

  const updates = {};
  if (typeof body.label === 'string' && body.label.trim()) updates.label = body.label.trim();
  if (typeof body.active === 'boolean') updates.active = body.active;
  if (typeof body.redirectUrl === 'string') updates.redirectUrl = body.redirectUrl.trim() || null;
  if (typeof body.rateLimitPerMin === 'number') updates.rateLimitPerMin = body.rateLimitPerMin;
  if (Array.isArray(body.allowedFields) && body.allowedFields.length) {
    updates.allowedFields = JSON.stringify(body.allowedFields);
  }
  if (typeof body.captchaProvider === 'string' || body.captchaProvider === null) {
    const v = ['hcaptcha', 'turnstile'].includes(body.captchaProvider) ? body.captchaProvider : null;
    updates.captchaProvider = v;
    if (v === null) { updates.captchaSitekey = null; updates.captchaSecret = null; }
  }
  if (typeof body.captchaSitekey === 'string') updates.captchaSitekey = body.captchaSitekey.trim() || null;
  if (typeof body.captchaSecret === 'string')  updates.captchaSecret  = body.captchaSecret.trim()  || null;
  if (Object.keys(updates).length === 0) return c.json({ ok: true });

  await db.update(publicForms).set(updates).where(eq(publicForms.id, id));
  await db.insert(auditLog).values({
    id: newId('a_'), userId: me.id, action: 'form.update', target: id,
  });
  const fresh = (await db.select().from(publicForms).where(eq(publicForms.id, id)).limit(1))[0];
  return c.json({ ok: true, form: sanitize(fresh) });
});

app.delete('/:id', requireRole('admin'), async (c) => {
  const me = c.get('user');
  const id = c.req.param('id');
  const row = (await db.select().from(publicForms)
    .where(and(eq(publicForms.id, id), eq(publicForms.workspaceId, me.workspaceId))).limit(1))[0];
  if (!row) return c.json({ error: 'not found' }, 404);
  await db.delete(publicForms).where(eq(publicForms.id, id));
  await db.insert(auditLog).values({ id: newId('a_'), userId: me.id, action: 'form.delete', target: id });
  return c.json({ ok: true });
});

export default app;
