// OIDC discovery + authorization code exchange.
// Pure HTTP — no extra deps.
import { db } from '../db/index.js';
import { oauthProviders } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const DISCOVERY_TTL_MS = 24 * 60 * 60 * 1000;   // 24h cache

const HARDCODED = {
  google: {
    authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    token_endpoint:         'https://oauth2.googleapis.com/token',
    userinfo_endpoint:      'https://openidconnect.googleapis.com/v1/userinfo',
  },
};

export async function getDiscovery(provider) {
  if (provider.kind === 'google') return HARDCODED.google;

  // Try cache
  if (provider.discoveryCache && provider.discoveryCacheAt) {
    const ageMs = Date.now() - new Date(provider.discoveryCacheAt).getTime();
    if (ageMs < DISCOVERY_TTL_MS) {
      try { return JSON.parse(provider.discoveryCache); } catch {}
    }
  }
  // Fetch + cache
  if (!provider.issuerUrl) throw new Error('issuer_url required for generic OIDC');
  const url = provider.issuerUrl.replace(/\/$/, '') + '/.well-known/openid-configuration';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  const meta = await res.json();
  await db.update(oauthProviders).set({
    discoveryCache: JSON.stringify(meta),
    discoveryCacheAt: new Date(),
  }).where(eq(oauthProviders.id, provider.id));
  return meta;
}

export function buildAuthorizeUrl(meta, provider, { state, nonce, redirectUri }) {
  const u = new URL(meta.authorization_endpoint);
  u.searchParams.set('client_id', provider.clientId);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', provider.scopes || 'openid email profile');
  u.searchParams.set('state', state);
  if (nonce) u.searchParams.set('nonce', nonce);
  // Force consent so refresh tokens are issued (Google specifically)
  if (provider.kind === 'google') u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export async function exchangeCodeForUser(meta, provider, { code, redirectUri }) {
  // 1. Token exchange
  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', code);
  body.set('redirect_uri', redirectUri);
  body.set('client_id', provider.clientId);
  body.set('client_secret', provider.clientSecret);

  const tokRes = await fetch(meta.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
    body,
  });
  if (!tokRes.ok) {
    const text = await tokRes.text();
    throw new Error(`token exchange failed: ${tokRes.status} ${text.slice(0, 200)}`);
  }
  const tok = await tokRes.json();
  if (!tok.access_token) throw new Error('no access_token in response');

  // 2. Fetch userinfo (or decode id_token claims if present)
  const uiRes = await fetch(meta.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  });
  if (!uiRes.ok) throw new Error(`userinfo failed: ${uiRes.status}`);
  const profile = await uiRes.json();

  // Normalize
  const email = (profile.email || '').toLowerCase().trim();
  const name = profile.name || profile.preferred_username || email.split('@')[0] || 'OAuth User';
  const sub = profile.sub || profile.id || email;
  const emailVerified = profile.email_verified !== false;

  if (!email) throw new Error('OIDC response had no email');
  return { email, name, sub, emailVerified, raw: profile };
}
