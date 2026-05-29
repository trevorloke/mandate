// Social provider registry. Every provider exposes the same adapter interface:
//   connect(input) -> { platform, handle, displayName, avatarUrl, remoteId,
//                       instanceUrl, credentials }      (throws on failure)
//   publish(account, post) -> { remoteId, url, credentials? }   (throws on failure)
//
// Open providers (Bluesky, Mastodon) work today with user-supplied credentials.
// Gated providers (X, Meta, LinkedIn) need a developer app + platform review;
// their adapters are stubs until credentials are wired in Beacon → Settings.
import * as bluesky from './bluesky.js';
import * as mastodon from './mastodon.js';

function gatedStub(label) {
  return {
    connect: async () => { throw new Error(`${label} needs developer-app credentials. Add them in Beacon → Settings, then connect.`); },
    publish: async () => { throw new Error(`${label} is not connected yet.`); },
  };
}

export const PROVIDERS = {
  bluesky: {
    id: 'bluesky', label: 'Bluesky', open: true, charLimit: bluesky.CHAR_LIMIT,
    connectFields: [
      { key: 'identifier', label: 'Handle', placeholder: 'name.bsky.social' },
      { key: 'appPassword', label: 'App password', type: 'password', hint: 'bsky.app → Settings → App Passwords (not your main password)' },
    ],
    adapter: bluesky,
  },
  mastodon: {
    id: 'mastodon', label: 'Mastodon', open: true, charLimit: mastodon.CHAR_LIMIT,
    connectFields: [
      { key: 'instanceUrl', label: 'Instance URL', placeholder: 'https://mastodon.social' },
      { key: 'accessToken', label: 'Access token', type: 'password', hint: 'Your instance → Preferences → Development → New application (scope: write:statuses)' },
    ],
    adapter: mastodon,
  },
  x: {
    id: 'x', label: 'X / Twitter', open: false, requiresApp: true, charLimit: 280,
    adapter: gatedStub('X / Twitter'),
  },
  meta: {
    id: 'meta', label: 'Meta (Facebook + Instagram)', open: false, requiresApp: true, charLimit: 2200,
    adapter: gatedStub('Meta'),
  },
  linkedin: {
    id: 'linkedin', label: 'LinkedIn', open: false, requiresApp: true, charLimit: 3000,
    adapter: gatedStub('LinkedIn'),
  },
};

export function getProvider(id) { return PROVIDERS[id] || null; }

// Public catalogue for the connect UI (no adapters/secrets).
export function providerCatalog() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id, label: p.label, open: !!p.open, requiresApp: !!p.requiresApp,
    charLimit: p.charLimit || null, connectFields: p.connectFields || null,
  }));
}
