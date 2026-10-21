// Outreach: petitions with public pages, newsletter signup/unsubscribe,
// email blasts (newsletter + press), the website JSON bridge, workspace
// website backlink.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';
import { app } from '../index.js';

let c, slug;

const pub = async (method, path, body, headers = {}) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null, text = '';
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json')) json = await res.json(); else text = await res.text();
  return { status: res.status, json, text, headers: res.headers };
};

before(async () => {
  await freshDb();
  delete process.env.RESEND_API_KEY;
  c = new Client();
  const r = await c.signup({ workspaceName: 'Imagine Surrey' });
  slug = r.json.workspace.slug;
  await c.action('workspace.update', { website: 'https://imaginesurrey.ca' });
});

test('petition: create, public page renders with backlink, signature lands, person is tagged', async () => {
  const p = await c.action('petition.create', {
    slug: 'skytrain-to-newton', title: 'Bring SkyTrain to Newton', body: 'Surrey deserves rapid transit south of 72nd.',
  });
  assert.equal(p.status, 200);
  const dup = await c.action('petition.create', { slug: 'skytrain-to-newton', title: 'again' });
  assert.equal(dup.status, 409);
  const page = await pub('GET', `/p/${slug}/skytrain-to-newton`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Bring SkyTrain to Newton/);
  assert.match(page.text, /imaginesurrey\.ca/, 'public pages link back to the campaign website');
  assert.match(page.text, /0 signatures/);

  const sign = await pub('POST', `/p/${slug}/skytrain-to-newton`,
    { name: 'Harjit Gill', email: 'harjit@example.org', subscribe: true }, { accept: 'application/json' });
  assert.equal(sign.status, 200);
  const sigs = await c.get(`/api/petitions/${p.json.petition.id}/signatures`);
  assert.equal(sigs.json.signatures.length, 1);
  const people = await c.get('/api/persons?tag=petition');
  assert.equal(people.json.persons.length, 1);
  assert.ok(people.json.persons[0].tags.includes('petition:skytrain-to-newton'));
  const subs = await c.get('/api/subscriptions');
  assert.equal(subs.json.subscribed, 1, 'opted into the newsletter from the petition');
  const list = await c.get('/api/petitions');
  assert.equal(list.json.petitions[0].signatures, 1);
});

test('newsletter: public signup, dedupe on email, one-click unsubscribe, manual add', async () => {
  const s1 = await pub('POST', `/n/${slug}`, { name: 'Maya Chen', email: 'Maya@Example.org' }, { accept: 'application/json' });
  assert.equal(s1.status, 200);
  const s2 = await pub('POST', `/n/${slug}`, { email: 'maya@example.org' }, { accept: 'application/json' });
  assert.equal(s2.status, 200);
  let subs = await c.get('/api/subscriptions');
  assert.equal(subs.json.subscriptions.filter((s) => s.email === 'maya@example.org').length, 1, 'case-insensitive dedupe');
  const maya = subs.json.subscriptions.find((s) => s.email === 'maya@example.org');
  const un = await pub('GET', `/u/${maya.id}`);
  assert.equal(un.status, 200);
  assert.match(un.text, /Unsubscribed/);
  subs = await c.get('/api/subscriptions');
  assert.equal(subs.json.subscriptions.find((s) => s.email === 'maya@example.org').status, 'unsubscribed');
  const manual = await c.action('subscription.add', { email: 'board@example.org', name: 'Board Member' });
  assert.equal(manual.status, 200);
  const bad = await pub('POST', `/n/${slug}`, { email: 'not-an-email' });
  assert.equal(bad.status, 400);
});

test('blasts: newsletter goes to the subscribed list; press goes to media-tagged people; queued without a provider', async () => {
  await c.createPerson('Reporter One', { email: 'r1@news.example', tags: ['media'] });
  await c.createPerson('Reporter NoEmail', { tags: ['media'] });
  await c.createPerson('Not Media', { email: 'x@example.org', tags: ['VIP'] });

  const press = await c.action('blast.send', { kind: 'press', subject: 'Imagine Surrey unveils transit plan', body: 'FOR IMMEDIATE RELEASE …' });
  assert.equal(press.status, 200);
  assert.equal(press.json.blast.audience_count, 1, 'only media-tagged people with email');
  assert.equal(press.json.blast.status, 'queued');
  assert.match(press.json.blast.provider_note, /RESEND_API_KEY/);

  const news = await c.action('blast.send', { kind: 'newsletter', subject: 'This week', body: 'Hello friends' });
  assert.equal(news.json.blast.audience_count, 2, 'harjit (via petition) + board member; maya unsubscribed');

  const list = await c.get('/api/blasts');
  assert.equal(list.json.blasts.length, 2);
  assert.equal(list.json.mediaContacts, 1);
  assert.equal(list.json.emailConfigured, false);
});

test('empty audiences are refused with a plain reason', async () => {
  const fresh = new Client();
  await fresh.signup({ workspaceName: 'Empty Lists' });
  const r = await fresh.action('blast.send', { kind: 'press', subject: 's', body: 'b' });
  assert.equal(r.status, 400);
  assert.match(r.json.error, /tagged 'media'/);
});

test('website bridge: CORS preflight + JSON signups for newsletter, volunteer, petition', async () => {
  const pre = await app.request(`/api/public/${slug}/signup`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');

  const nl = await pub('POST', `/api/public/${slug}/signup`, { kind: 'newsletter', email: 'site-visitor@example.org', name: 'Site Visitor' });
  assert.equal(nl.status, 200);
  assert.equal(nl.headers.get('access-control-allow-origin'), '*');

  const vol = await pub('POST', `/api/public/${slug}/signup`, {
    kind: 'volunteer', name: 'Website Volunteer', phone: '604-555-0199', roles: ['doorknocking', 'translation'], note: 'Punjabi, weekends',
  });
  assert.equal(vol.status, 200);
  const prospects = await c.get('/api/persons?tag=volunteer-prospect');
  const wv = prospects.json.persons.find((p) => p.name === 'Website Volunteer');
  assert.ok(wv);
  const prof = await c.get(`/api/persons/${wv.id}`);
  assert.equal(prof.json.roles.length, 2);

  const pet = await pub('POST', `/api/public/${slug}/signup`, { kind: 'petition', petition: 'skytrain-to-newton', name: 'Website Signer' });
  assert.equal(pet.status, 200);
  const unknown = await pub('POST', `/api/public/${slug}/signup`, { kind: 'petition', petition: 'nope', name: 'x' });
  assert.equal(unknown.status, 404);
  const badKind = await pub('POST', `/api/public/${slug}/signup`, { kind: 'donate' });
  assert.equal(badKind.status, 400);
  const badWs = await pub('POST', `/api/public/not-a-workspace/signup`, { kind: 'newsletter', email: 'a@b.co' });
  assert.equal(badWs.status, 404);
});

test('public volunteer page renders every role; submissions dedupe by email', async () => {
  const page = await pub('GET', `/v/${slug}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Zone house captain/);
  assert.match(page.text, /Hi-rise building captain/);
  assert.match(page.text, /Burmashave/);
  await pub('POST', `/v/${slug}`, { name: 'Repeat Person', email: 'repeat@example.org', roles: 'phoning' }, { accept: 'application/json' });
  await pub('POST', `/v/${slug}`, { name: 'Repeat Person', email: 'repeat@example.org', roles: 'driver' }, { accept: 'application/json' });
  const found = await c.get('/api/persons?q=Repeat');
  assert.equal(found.json.persons.length, 1, 'same email → same person');
  const prof = await c.get(`/api/persons/${found.json.persons[0].id}`);
  assert.equal(prof.json.roles.length, 2);
});

test('public writes append to the event log under a system actor', async () => {
  const ev = await c.get('/api/events?since=0&limit=1000');
  assert.ok(ev.json.events.some((e) => e.action === 'public.signup' && e.actor_id === null));
  const verify = await c.get('/api/audit/verify');
  assert.equal(verify.json.ok, true);
});

test('with a provider: every newsletter carries the recipient’s own unsubscribe link; press does not', async () => {
  const sent = [];
  const realFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = async (url, init) => {
    if (String(url).startsWith('https://api.resend.com/')) {
      sent.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ id: 'msg' }), { status: 200 });
    }
    return realFetch(url, init);
  };
  try {
    const news = await c.action('blast.send', { kind: 'newsletter', subject: 'Footer check', body: 'Body text' });
    assert.equal(news.status, 200);
    assert.equal(news.json.blast.status, 'sent');
    const subs = (await c.get('/api/subscriptions')).json.subscriptions.filter((s) => s.status === 'subscribed');
    assert.equal(sent.length, subs.length);
    for (const s of subs) {
      const msg = sent.find((m) => m.to[0] === s.email);
      assert.ok(msg, `sent to ${s.email}`);
      assert.match(msg.text, /^Body text/);
      assert.ok(msg.text.includes(`/u/${s.id}`), 'own unsubscribe link');
      assert.match(msg.text, /Sent by Imagine Surrey/);
    }
    const links = sent.map((m) => m.text.match(/\/u\/([0-9a-f-]{36})/)[1]);
    assert.equal(new Set(links).size, links.length, 'links are per-recipient');

    sent.length = 0;
    const press = await c.action('blast.send', { kind: 'press', subject: 'Release', body: 'News' });
    assert.equal(press.json.blast.status, 'sent');
    assert.ok(sent.every((m) => !m.text.includes('/u/')), 'press has no newsletter unsubscribe link');
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.RESEND_API_KEY;
  }
});

test('volunteer form keeps every ticked role, each role\'s own detail, and the note once on the person', async () => {
  const form = new URLSearchParams();
  form.append('name', 'Hira Captain'); form.append('email', 'hira@example.org');
  for (const role of ['driver', 'highrise_captain', 'translation', 'community_committee']) form.append('roles', role);
  form.append('detail_highrise_captain', 'The Residences, 10333 133 St');
  form.append('detail_translation', 'Punjabi');
  form.append('detail_driver', 'ignored: drivers carry no detail');
  form.append('note', 'Weekends only');
  const post = (f) => app.request(`/v/${slug}`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: f.toString(),
  });
  const res = await post(form);
  assert.equal(res.status, 200);
  const id = (await c.get('/api/persons?q=Hira')).json.persons[0].id;
  let prof = (await c.get(`/api/persons/${id}`)).json;
  assert.deepEqual(Object.fromEntries(prof.roles.map((x) => [x.role, x.detail])), {
    driver: null, highrise_captain: 'The Residences, 10333 133 St', translation: 'Punjabi', community_committee: null,
  });
  assert.equal(prof.person.note, 'Weekends only', 'the note sits on the person, not on every role');

  await post(new URLSearchParams({ name: 'Hira Captain', email: 'hira@example.org', roles: 'phoning', note: 'Evenings too' }));
  prof = (await c.get(`/api/persons/${id}`)).json;
  assert.equal(prof.person.note, 'Weekends only\nEvenings too', 'a repeat signup adds to the note');

  const j = await pub('POST', `/api/public/${slug}/signup`, {
    kind: 'volunteer', name: 'Bridge Vol', roles: ['translation', 'food'], detail_translation: 'Tagalog', note: 'Saturdays',
  });
  assert.equal(j.status, 200);
  const bv = (await c.get('/api/persons?q=Bridge Vol')).json.persons[0];
  const bp = (await c.get(`/api/persons/${bv.id}`)).json;
  assert.deepEqual(Object.fromEntries(bp.roles.map((x) => [x.role, x.detail])), { translation: 'Tagalog', food: null });

  const page = (await pub('GET', `/v/${slug}`)).text;
  assert.match(page, /name="detail_highrise_captain"/);
  assert.match(page, /Building \(name or address\)/);
  assert.doesNotMatch(page, /name="detail_driver"/);
  assert.match(page, /More ways to help/);
});
