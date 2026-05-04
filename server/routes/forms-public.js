// Public form endpoints — no auth, slug-scoped, IP-rate-limited per form.
//   GET  /api/public/forms/:slug   → return form schema (label, fields)
//   POST /api/public/forms/:slug   → submit data; only `allowedFields` are stored
import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { publicForms, moduleData, auditLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { rateLimit } from '../middleware/ratelimit.js';
import { emitWebhook } from '../lib/webhooks.js';
import { broadcast } from '../lib/realtime.js';
import { verifyCaptcha } from '../lib/captcha.js';

const newId = (p='') => p + randomBytes(12).toString('hex');

const app = new Hono();

// ── Public form metadata: anyone can fetch this to render the form
app.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const row = (await db.select().from(publicForms).where(eq(publicForms.slug, slug)).limit(1))[0];
  if (!row || !row.active) return c.json({ error: 'form not found' }, 404);
  let fields = [];
  try { fields = JSON.parse(row.allowedFields || '[]'); } catch {}
  return c.json({
    form: {
      slug: row.slug,
      label: row.label,
      fields,
      redirectUrl: row.redirectUrl,
      captcha: row.captchaProvider ? { provider: row.captchaProvider, sitekey: row.captchaSitekey } : null,
    },
  });
});

// ── Public submit: rate-limited per IP per form
// We use a generic key including the slug.
app.post(
  '/:slug',
  async (c, next) => {
    const slug = c.req.param('slug');
    // Resolve form first to get its rateLimitPerMin
    const row = (await db.select().from(publicForms).where(eq(publicForms.slug, slug)).limit(1))[0];
    if (!row || !row.active) return c.json({ error: 'form not found' }, 404);
    c.set('form', row);
    // Apply per-form rate limit
    const limiter = rateLimit({
      key: `form:${slug}`,
      max: row.rateLimitPerMin,
      windowMs: 60_000,
    });
    return limiter(c, next);
  },
  async (c) => {
    const form = c.get('form');
    const body = await c.req.json().catch(() => ({}));

    // Captcha verification (if configured)
    if (form.captchaProvider) {
      const token = body._captcha || body.captcha || body['h-captcha-response'] || body['cf-turnstile-response'];
      const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip');
      const ok = await verifyCaptcha({
        provider: form.captchaProvider,
        secret: form.captchaSecret,
        token,
        ip,
      });
      if (!ok) return c.json({ error: 'captcha verification failed' }, 400);
    }

    let allowedFields = [];
    try { allowedFields = JSON.parse(form.allowedFields || '[]'); } catch {}

    // Validate + filter to allowed fields
    const data = {};
    for (const f of allowedFields) {
      let v = body[f.key];
      if (v === undefined || v === '') {
        if (f.required) return c.json({ error: `missing required field: ${f.key}` }, 400);
        continue;
      }
      if (f.type === 'number')  v = Number(v);
      if (f.type === 'boolean') v = !!v;
      if (f.type === 'select' && f.options && !f.options.includes(String(v))) {
        return c.json({ error: `invalid value for ${f.key}` }, 400);
      }
      data[f.key] = v;
    }
    // Stamp the submission with provenance
    data._submittedAt = new Date().toISOString();
    data._formSlug = form.slug;

    const recordId = 'd_' + randomBytes(12).toString('hex');
    await db.insert(moduleData).values({
      id: recordId,
      workspaceId: form.workspaceId,
      module: form.module,
      kind: form.kind,
      data: JSON.stringify(data),
    });

    await db.update(publicForms).set({
      submissionCount: form.submissionCount + 1,
      lastSubmissionAt: new Date(),
    }).where(eq(publicForms.id, form.id));

    await db.insert(auditLog).values({
      id: newId('a_'), userId: null, action: 'form.submit',
      target: form.id, meta: JSON.stringify({ slug: form.slug, recordId }),
    });

    // Broadcast to webhooks + SSE
    emitWebhook({ workspaceId: form.workspaceId, event: 'form.submit', payload: { slug: form.slug, recordId, data } }).catch(() => {});
    try { broadcast(form.workspaceId, 'data.create', { id: recordId, module: form.module, kind: form.kind, at: new Date().toISOString() }); } catch {}

    return c.json({ ok: true, redirectUrl: form.redirectUrl || null });
  },
);

export default app;
