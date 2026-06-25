// Media accessibility: human-authored alt text must reach every platform that
// supports it on publish — Facebook (alt_text_custom), Instagram (alt_text),
// LinkedIn (ugcPosts media description.text). Network mocked; we assert the
// outbound request bodies carry (or omit) the alt field. Bluesky/Mastodon/X
// already set alt and are covered by their own publish tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mockFetch, jsonResponse } from './helpers.js';

const meta = await import('../lib/social/meta.js');
const ig = await import('../lib/social/instagram.js');
const linkedin = await import('../lib/social/linkedin.js');

const app = { clientId: 'c', clientSecret: 's' };
const future = () => Date.now() + 3_600_000; // fresh token → no refresh side-trips
const parse = (opts) => JSON.parse(opts.body);

// ── Facebook ──────────────────────────────────────────────────────────────
const fbAccount = () => ({
  _app: app,
  credentials: { userToken: 'u', expiresAt: future(), pages: [{ id: 'p1', name: 'P', token: 'pt' }], pageId: 'p1' },
});

test('facebook single photo sends alt_text_custom', async () => {
  let photoBody = null;
  const restore = mockFetch((url, opts) => {
    if (url.includes('/p1/photos')) { photoBody = parse(opts); return jsonResponse({ id: 'ph1', post_id: 'post1' }); }
    return jsonResponse({});
  });
  try {
    const out = await meta.publish(fbAccount(), { body: 'hi', media: [{ url: 'http://x/a.png', alt: 'A red barn' }] });
    assert.equal(out.remoteId, 'post1');
    assert.equal(photoBody.alt_text_custom, 'A red barn');
    assert.equal(photoBody.caption, 'hi');
  } finally { restore(); }
});

test('facebook omits alt_text_custom when no alt text supplied', async () => {
  let photoBody = null;
  const restore = mockFetch((url, opts) => {
    if (url.includes('/p1/photos')) { photoBody = parse(opts); return jsonResponse({ id: 'ph1', post_id: 'post1' }); }
    return jsonResponse({});
  });
  try {
    await meta.publish(fbAccount(), { body: 'hi', media: [{ url: 'http://x/a.png' }] });
    assert.ok(!('alt_text_custom' in photoBody), 'no empty alt field is sent');
  } finally { restore(); }
});

test('facebook multi-photo sets alt_text_custom per image', async () => {
  const photoBodies = [];
  const restore = mockFetch((url, opts) => {
    if (url.includes('/p1/photos')) { photoBodies.push(parse(opts)); return jsonResponse({ id: `ph${photoBodies.length}` }); }
    if (url.includes('/p1/feed')) return jsonResponse({ id: 'post1' });
    return jsonResponse({});
  });
  try {
    await meta.publish(fbAccount(), {
      body: 'hi',
      media: [{ url: 'http://x/a.png', alt: 'first' }, { url: 'http://x/b.png', alt: 'second' }],
    });
    assert.equal(photoBodies.length, 2);
    assert.equal(photoBodies[0].alt_text_custom, 'first');
    assert.equal(photoBodies[1].alt_text_custom, 'second');
    assert.equal(photoBodies[0].published, false, 'multi-photo uploads are unpublished then attached');
  } finally { restore(); }
});

test('facebook clamps alt_text_custom to 1000 chars', async () => {
  let photoBody = null;
  const restore = mockFetch((url, opts) => {
    if (url.includes('/p1/photos')) { photoBody = parse(opts); return jsonResponse({ post_id: 'post1' }); }
    return jsonResponse({});
  });
  try {
    await meta.publish(fbAccount(), { body: 'hi', media: [{ url: 'http://x/a.png', alt: 'z'.repeat(1500) }] });
    assert.equal(photoBody.alt_text_custom.length, 1000);
  } finally { restore(); }
});

// ── Instagram ─────────────────────────────────────────────────────────────
const igAccount = () => ({
  _app: app,
  credentials: { igUserId: 'ig1', pageId: 'p1', pageToken: 'pt', userToken: 'u', expiresAt: future() },
});

test('instagram single image sends alt_text on the container', async () => {
  let containerBody = null;
  const restore = mockFetch((url, opts) => {
    if (url.includes('/ig1/media_publish')) return jsonResponse({ id: 'pub1' });
    if (url.includes('/ig1/media')) { containerBody = parse(opts); return jsonResponse({ id: 'cont1' }); }
    return jsonResponse({});
  });
  try {
    const out = await ig.publish(igAccount(), { body: 'cap', media: [{ url: 'http://x/a.png', alt: 'A skyline' }] });
    assert.equal(out.remoteId, 'pub1');
    assert.equal(containerBody.alt_text, 'A skyline');
    assert.equal(containerBody.caption, 'cap');
  } finally { restore(); }
});

test('instagram carousel sets alt_text on each child container', async () => {
  const childBodies = [];
  const restore = mockFetch((url, opts) => {
    if (url.includes('/ig1/media_publish')) return jsonResponse({ id: 'pub1' });
    if (url.includes('/ig1/media')) {
      const b = parse(opts);
      if (b.is_carousel_item) childBodies.push(b);
      return jsonResponse({ id: `c${childBodies.length || 'parent'}` });
    }
    return jsonResponse({});
  });
  try {
    await ig.publish(igAccount(), {
      body: 'cap',
      media: [{ url: 'http://x/a.png', alt: 'one' }, { url: 'http://x/b.png', alt: 'two' }],
    });
    assert.equal(childBodies.length, 2);
    assert.equal(childBodies[0].alt_text, 'one');
    assert.equal(childBodies[1].alt_text, 'two');
  } finally { restore(); }
});

test('instagram omits alt_text when none supplied', async () => {
  let containerBody = null;
  const restore = mockFetch((url, opts) => {
    if (url.includes('/ig1/media_publish')) return jsonResponse({ id: 'pub1' });
    if (url.includes('/ig1/media')) { containerBody = parse(opts); return jsonResponse({ id: 'cont1' }); }
    return jsonResponse({});
  });
  try {
    await ig.publish(igAccount(), { body: 'cap', media: [{ url: 'http://x/a.png' }] });
    assert.ok(!('alt_text' in containerBody));
  } finally { restore(); }
});

// ── LinkedIn ──────────────────────────────────────────────────────────────
const liAccount = () => ({
  _app: app,
  credentials: { accessToken: 't', memberUrn: 'urn:li:person:x', refreshToken: 'r', expiresAt: future() },
});

// Drive the two-step LinkedIn image upload (register → PUT) and capture the
// final ugcPosts body. `capture` receives the parsed share document.
function mockLinkedIn(capture) {
  return mockFetch((url, opts) => {
    if (url.includes('registerUpload')) {
      return jsonResponse({ value: { asset: 'urn:li:asset:1', uploadMechanism: {
        'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': { uploadUrl: 'http://up/1' },
      } } });
    }
    if (url === 'http://up/1') return new Response('', { status: 201 });
    if (url.includes('/v2/ugcPosts')) {
      capture(parse(opts));
      return new Response(JSON.stringify({ id: 'urn:li:share:1' }), {
        status: 201, headers: { 'content-type': 'application/json', 'x-restli-id': 'urn:li:share:1' },
      });
    }
    return jsonResponse({});
  });
}

test('linkedin attaches description.text (alt) to share media', async () => {
  let body = null;
  const restore = mockLinkedIn((b) => { body = b; });
  try {
    const out = await linkedin.publish(liAccount(), { body: 'post', media: [{ bytes: new Uint8Array([1, 2, 3]), alt: 'A diagram' }] });
    assert.equal(out.remoteId, 'urn:li:share:1');
    const share = body.specificContent['com.linkedin.ugc.ShareContent'];
    assert.equal(share.shareMediaCategory, 'IMAGE');
    assert.equal(share.media[0].media, 'urn:li:asset:1');
    assert.equal(share.media[0].description.text, 'A diagram');
  } finally { restore(); }
});

test('linkedin omits description when media has no alt text', async () => {
  let body = null;
  const restore = mockLinkedIn((b) => { body = b; });
  try {
    await linkedin.publish(liAccount(), { body: 'post', media: [{ bytes: new Uint8Array([1, 2, 3]) }] });
    const share = body.specificContent['com.linkedin.ugc.ShareContent'];
    assert.ok(!('description' in share.media[0]), 'no empty description object is sent');
  } finally { restore(); }
});
