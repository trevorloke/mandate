// Social provider registry. Every provider exposes the same adapter interface:
//   connect(input) -> account            (credential providers: Bluesky/Mastodon)
//   oauth + identity()                    (OAuth providers: X/LinkedIn/Meta)
//   publish(account, post) -> { remoteId, url, credentials? }
//
// `connect` mode tells the UI how to attach an account:
//   'credentials' — user pastes handle/token into a form
//   'oauth'       — redirect dance, gated behind a configured developer app
import * as bluesky from './bluesky.js';
import * as mastodon from './mastodon.js';
import * as x from './x.js';
import * as linkedin from './linkedin.js';
import * as meta from './meta.js';

export const PROVIDERS = {
  bluesky: {
    id: 'bluesky', label: 'Bluesky', open: true, connect: 'credentials', charLimit: bluesky.CHAR_LIMIT,
    connectFields: [
      { key: 'identifier', label: 'Handle', placeholder: 'name.bsky.social' },
      { key: 'appPassword', label: 'App password', type: 'password', hint: 'bsky.app → Settings → App Passwords (not your main password)' },
    ],
    adapter: bluesky,
  },
  mastodon: {
    id: 'mastodon', label: 'Mastodon', open: true, connect: 'credentials', charLimit: mastodon.CHAR_LIMIT,
    connectFields: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://mastodon.social' },
      { key: 'accessToken', label: 'Access token', type: 'password', hint: 'Your instance → Preferences → Development → New application (scope: write:statuses)' },
    ],
    adapter: mastodon,
  },
  x: {
    id: 'x', label: 'X / Twitter', open: false, requiresApp: true, connect: 'oauth', charLimit: x.CHAR_LIMIT,
    appHelp: 'developer.x.com → Project & App → OAuth 2.0 (Web App, Confidential client). Posting requires a paid API tier.',
    oauth: x.oauth, adapter: x,
  },
  linkedin: {
    id: 'linkedin', label: 'LinkedIn', open: false, requiresApp: true, connect: 'oauth', charLimit: linkedin.CHAR_LIMIT,
    appHelp: 'linkedin.com/developers → create an app, add the "Sign In with OpenID Connect" and "Share on LinkedIn" products.',
    oauth: linkedin.oauth, adapter: linkedin,
  },
  meta: {
    id: 'meta', label: 'Meta (Facebook Page)', open: false, requiresApp: true, connect: 'oauth', charLimit: meta.CHAR_LIMIT,
    appHelp: 'developers.facebook.com → create an app (Business type), add Facebook Login. Posting to a Page needs pages_manage_posts (App Review for production).',
    oauth: meta.oauth, adapter: meta,
  },
};

export function getProvider(id) { return PROVIDERS[id] || null; }

// Public catalogue for the connect UI (no adapters/secrets).
export function providerCatalog() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id, label: p.label, open: !!p.open, requiresApp: !!p.requiresApp,
    connect: p.connect, charLimit: p.charLimit || null,
    connectFields: p.connectFields || null, appHelp: p.appHelp || null,
  }));
}
