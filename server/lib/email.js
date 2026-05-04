// Email abstraction.
//
// Backends (set via MANDATE_EMAIL_BACKEND):
//   console (default) — log to stdout. Useful for local development.
//   resend            — HTTP API (https://resend.com). Requires MANDATE_RESEND_KEY.
//   smtp              — generic SMTP via nodemailer (requires nodemailer installed).
//                       Configure: MANDATE_SMTP_URL=smtp://user:pass@host:587
//   capture           — collect into in-memory ring buffer (for tests). Not for prod.
//
// Usage:
//   import { sendEmail } from '../lib/email.js';
//   await sendEmail({ to: 'you@x.com', subject: '...', text: '...', html: '<p>...</p>' });

const BACKEND = process.env.MANDATE_EMAIL_BACKEND || 'console';
const FROM_DEFAULT = process.env.MANDATE_EMAIL_FROM || 'Mandate <noreply@mandate.app>';

// Capture backend buffer (for tests / debugging)
const captured = [];
export function getCapturedEmails() { return [...captured]; }
export function clearCapturedEmails() { captured.length = 0; }

async function consoleBackend(opts) {
  console.log('───── EMAIL ─────');
  console.log('TO:     ', opts.to);
  console.log('FROM:   ', opts.from);
  console.log('SUBJECT:', opts.subject);
  if (opts.text) console.log('---\n' + opts.text);
  console.log('────────────────');
  return { ok: true, backend: 'console' };
}

async function captureBackend(opts) {
  captured.push({ ...opts, at: new Date().toISOString() });
  return { ok: true, backend: 'capture' };
}

async function resendBackend(opts) {
  const key = process.env.MANDATE_RESEND_KEY;
  if (!key) throw new Error('MANDATE_RESEND_KEY is not set');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { ok: true, backend: 'resend', id: data.id };
}

// SMTP via nodemailer — only loaded if used.
let smtpTransporter = null;
async function smtpBackend(opts) {
  if (!smtpTransporter) {
    let nodemailer;
    try { nodemailer = (await import('nodemailer')).default; }
    catch { throw new Error('nodemailer not installed — run `npm i nodemailer`'); }
    const url = process.env.MANDATE_SMTP_URL;
    if (!url) throw new Error('MANDATE_SMTP_URL is not set');
    smtpTransporter = nodemailer.createTransport(url);
  }
  const info = await smtpTransporter.sendMail({
    from: opts.from, to: opts.to, subject: opts.subject, text: opts.text, html: opts.html,
  });
  return { ok: true, backend: 'smtp', id: info.messageId };
}

const BACKENDS = {
  console: consoleBackend,
  capture: captureBackend,
  resend:  resendBackend,
  smtp:    smtpBackend,
};

export async function sendEmail(opts) {
  if (!opts || !opts.to || !opts.subject) {
    throw new Error('sendEmail: to and subject are required');
  }
  const fn = BACKENDS[BACKEND] || BACKENDS.console;
  const merged = { from: FROM_DEFAULT, ...opts };
  try {
    return await fn(merged);
  } catch (e) {
    console.error(`[email:${BACKEND}] backend failed:`, e.message);
    return { ok: false, error: e.message, backend: BACKEND };
  }
}

export const EMAIL_BACKEND = BACKEND;
