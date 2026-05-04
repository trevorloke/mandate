// Captcha verifier — supports hCaptcha and Cloudflare Turnstile.
// Both have similar siteverify HTTP APIs.
//
// Usage:
//   const ok = await verifyCaptcha({ provider: 'hcaptcha', secret, token, ip });
//   if (!ok) reject();

const ENDPOINTS = {
  // Override in tests with env vars MANDATE_CAPTCHA_HCAPTCHA_URL / _TURNSTILE_URL
  hcaptcha:  process.env.MANDATE_CAPTCHA_HCAPTCHA_URL  || 'https://api.hcaptcha.com/siteverify',
  turnstile: process.env.MANDATE_CAPTCHA_TURNSTILE_URL || 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
};

export async function verifyCaptcha({ provider, secret, token, ip }) {
  if (!provider || !secret) return true;        // captcha disabled → pass through
  if (!token) return false;
  const url = ENDPOINTS[provider];
  if (!url) throw new Error(`unknown captcha provider: ${provider}`);

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token);
  if (ip) body.set('remoteip', ip);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.success === true;
  } catch {
    return false;
  }
}
