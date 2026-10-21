// Turfs + walk lists, events + RSVPs, donations (pledges, Stripe checkout and
// webhooks), and offline-safe contact logging.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { freshDb, Client } from './helpers.js';
import { getDb } from '../db/client.js';
import { app } from '../index.js';

let mgr, slug, ws;

const pub = async (method, path, body, headers = {}) => {
  const res = await app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    redirect: 'manual',
  });
  const ct = res.headers.get('content-type') || '';
  return { status: res.status, json: ct.includes('json') ? await res.json() : null, text: ct.includes('json') ? '' : await res.text(), headers: res.headers };
};

before(async () => {
  await freshDb();
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  mgr = new Client();
  const r = await mgr.signup({ workspaceName: 'Imagine Surrey', jurisdiction: 'bc-municipal' });
  slug = r.json.workspace.slug;
  ws = r.json.workspace.id;
});

// ── Turfs ──
test('turf: draw, stats, walk list in odd-up / even-back order, assignment scopes volunteers', async () => {
  const lat = 49.1327; const lng = -122.855;
  const mk = (name, address, dLng) => mgr.createPerson(name, { address, lat, lng: lng + dLng });
  const a = await mk('A One', '13213 72 Ave', 0.0000);
  await mk('B Two', '13225 72 Ave', 0.0003);
  await mk('C Three', '13224 72 Ave', 0.0003);
  await mk('D Four', '13212 72 Ave', 0.0000);
  await mgr.createPerson('Far Away', { address: '1 Other Rd', lat: 49.3, lng: -122.5 });
  const t = await mgr.action('turf.create', {
    name: 'Newton block', polygon: [[lat + 0.001, lng - 0.001], [lat + 0.001, lng + 0.002], [lat - 0.001, lng + 0.002], [lat - 0.001, lng - 0.001]],
  });
  assert.equal(t.status, 200);
  await mgr.action('contact.log', { person_id: a.id, channel: 'door', outcome: 'contacted', rating: '1' });
  const list = (await mgr.get('/api/turfs')).json.turfs;
  const turf = list.find((x) => x.id === t.json.turf.id);
  assert.equal(turf.doors, 4, 'far-away person excluded');
  assert.equal(turf.doorsDone, 1);
  const walk = await mgr.get(`/api/turfs/${turf.id}/walk`);
  assert.deepEqual(walk.json.doors.map((d) => d.address), ['13213 72 Ave', '13225 72 Ave', '13224 72 Ave', '13212 72 Ave'],
    'odd side up, even side back');
  assert.equal(walk.json.doors[0].done, true);
  const bad = await mgr.action('turf.create', { name: 'x', polygon: [[1, 2], [3, 4]] });
  assert.equal(bad.status, 400, 'a turf needs at least 3 points');

  // Volunteer: sees only assigned turfs; walk list of an unassigned turf is refused.
  const inv = await mgr.action('member.invite', { email: 'walker@example.org', role: 'volunteer' });
  const vol = new Client();
  await vol.post('/api/auth/join', { token: inv.json.joinUrl.split('/join/')[1], name: 'Walker', password: 'walker-pass-1' });
  assert.equal((await vol.get('/api/turfs')).json.turfs.length, 0);
  assert.equal((await vol.get(`/api/turfs/${turf.id}/walk`)).status, 403);
  const members = (await mgr.get('/api/members')).json.members;
  const walker = members.find((m) => m.name === 'Walker');
  assert.equal((await mgr.action('turf.assign', { turf_id: turf.id, user_id: walker.id })).status, 200);
  assert.equal((await vol.get('/api/turfs')).json.turfs.length, 1);
  assert.equal((await vol.get(`/api/turfs/${turf.id}/walk`)).status, 200);
  const brief = (await vol.get('/api/brief')).json;
  assert.equal(brief.myTurfs[0].name, 'Newton block');
  assert.equal((await vol.action('turf.create', { name: 'v', polygon: [[0, 0], [0, 1], [1, 1]] })).status, 403);
  assert.equal((await vol.get('/api/members')).status, 403);
});

// ── Events + RSVP ──
test('event: public page, RSVP with guests, capacity enforced, listing counts, bridge rsvp', async () => {
  const starts = new Date(Date.now() + 5 * 86400e3).toISOString();
  const e = await mgr.action('cevent.create', { slug: 'town-hall', title: 'Town hall: Imagine Newton', location: 'Newton Cultural Centre', starts_at: starts, capacity: 4 });
  assert.equal(e.status, 200);
  const dup = await mgr.action('cevent.create', { slug: 'town-hall', title: 'again', starts_at: starts });
  assert.equal(dup.status, 409);
  const page = await pub('GET', `/e/${slug}/town-hall`);
  assert.match(page.text, /Town hall: Imagine Newton/);
  const r1 = await pub('POST', `/e/${slug}/town-hall`, { name: 'Ann Attendee', email: 'ann@example.org', guests: 2 }, { accept: 'application/json' });
  assert.equal(r1.status, 200);
  const full = await pub('POST', `/e/${slug}/town-hall`, { name: 'Too Many', guests: 1 }, { accept: 'application/json' });
  assert.equal(full.status, 409, '3 going + 2 more > capacity 4');
  const one = await pub('POST', '/api/public/' + slug + '/signup', { kind: 'rsvp', event: 'town-hall', name: 'Bridge Guest' });
  assert.equal(one.status, 200, 'website bridge rsvp fills the last seat');
  const events = (await mgr.get('/api/campaign-events')).json.events;
  assert.equal(events[0].going, 4);
  const rsvps = (await mgr.get(`/api/campaign-events/${events[0].id}/rsvps`)).json.rsvps;
  assert.equal(rsvps.length, 2);
  assert.equal((await mgr.action('rsvp.setStatus', { id: rsvps[0].id, status: 'attended' })).status, 200);
  const tagged = (await mgr.get('/api/persons?tag=event:town-hall')).json.persons;
  assert.equal(tagged.length, 2, 'attendees land in People tagged by event');
  assert.ok((await mgr.get('/api/brief')).json.events.some((x) => x.slug === 'town-hall'));
});

// ── Donations ──
const donate = (fields) => pub('POST', `/d/${slug}`, new URLSearchParams(fields).toString(),
  { 'content-type': 'application/x-www-form-urlencoded' });
const eligible = { attest_individual: '1', attest_resident: '1', attest_own_funds: '1' };

test('donate page: attestations required, name + address required, cap refused up front, pledge recorded', async () => {
  const page = await pub('GET', `/d/${slug}`);
  assert.match(page.text, /Canadian citizen or permanent resident/);
  assert.match(page.text, /annual limit is \$1,250/);
  const noAttest = await donate({ amount: '100', name: 'Pat Donor', email: 'pat@example.org', address: '1 Main St' });
  assert.equal(noAttest.status, 400);
  assert.match(noAttest.text, /eligibility/);
  const noAddr = await donate({ amount: '100', name: 'Pat Donor', email: 'pat@example.org', ...eligible });
  assert.equal(noAddr.status, 400);
  const tooBig = await donate({ other: '2000', name: 'Pat Donor', email: 'pat@example.org', address: '1 Main St', ...eligible });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.text, /most one person can give/);
  const ok = await donate({ amount: '250', name: 'Pat Donor', email: 'pat@example.org', address: '1 Main St', ...eligible });
  assert.equal(ok.status, 200);
  assert.match(ok.text, /pledge of <b>\$250<\/b>/);
  const pledges = (await mgr.get('/api/pledges')).json.pledges;
  assert.equal(pledges[0].status, 'pledged');
  assert.equal(pledges[0].amount_cents, 25000);
  assert.equal((await mgr.get('/api/brief')).json.pledges.n, 1);

  // Treasurer confirms → it's a gift, through the cap engine.
  const rec = await mgr.action('pledge.receive', { id: pledges[0].id, method: 'etransfer', date: new Date().toISOString().slice(0, 10) });
  assert.equal(rec.status, 200);
  assert.equal(rec.json.gift.amount_cents, 25000);
  assert.equal((await mgr.action('pledge.receive', { id: pledges[0].id, date: '2026-01-01' })).status, 404, 'only once');

  // Second visit by the same email: the up-front check counts the first gift.
  const over = await donate({ other: '1100', name: 'Pat Donor', email: 'pat@example.org', address: '1 Main St', ...eligible });
  assert.equal(over.status, 400);
  assert.match(over.text, /up to \$1,000 more this year/);
});

const sign = (body, secret, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

test('stripe: checkout redirect, signed webhooks become gifts once, monthly invoices each count, bad signatures refused', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const realFetch = globalThis.fetch;
  const sessions = [];
  globalThis.fetch = async (url, init) => {
    if (String(url) === 'https://api.stripe.com/v1/checkout/sessions') {
      const params = new URLSearchParams(init.body.toString());
      sessions.push(params);
      return new Response(JSON.stringify({ id: `cs_${sessions.length}`, url: `https://checkout.stripe.test/cs_${sessions.length}` }), { status: 200 });
    }
    return realFetch(url, init);
  };
  try {
    const go = await donate({ amount: '100', name: 'Card Donor', email: 'card@example.org', address: '2 Main St', ...eligible });
    assert.equal(go.status, 303);
    assert.equal(go.headers.get('location'), 'https://checkout.stripe.test/cs_1');
    assert.equal(sessions[0].get('mode'), 'payment');
    assert.equal(sessions[0].get('line_items[0][price_data][currency]'), 'cad');
    assert.equal(sessions[0].get('line_items[0][price_data][unit_amount]'), '10000');
    const pledge = (await mgr.get('/api/pledges')).json.pledges.find((p) => p.email === 'card@example.org');
    assert.equal(pledge.status, 'pending');
    assert.equal(sessions[0].get('metadata[pledge_id]'), pledge.id);

    const evt = (id, type, object) => JSON.stringify({ id, type, created: Math.floor(Date.now() / 1000), data: { object } });
    const paid = evt('evt_1', 'checkout.session.completed', {
      id: 'cs_1', mode: 'payment', payment_status: 'paid', amount_total: 10000, payment_intent: 'pi_1',
      metadata: { pledge_id: pledge.id, workspace_id: ws },
    });
    const forged = await pub('POST', '/api/public/stripe/webhook', paid, { 'stripe-signature': sign(paid, 'whsec_wrong') });
    assert.equal(forged.status, 400);
    const stale = await pub('POST', '/api/public/stripe/webhook', paid, { 'stripe-signature': sign(paid, 'whsec_test', Math.floor(Date.now() / 1000) - 900) });
    assert.equal(stale.status, 400, 'replayed old signature refused');
    const ok = await pub('POST', '/api/public/stripe/webhook', paid, { 'stripe-signature': sign(paid, 'whsec_test') });
    assert.equal(ok.status, 200);
    assert.ok(ok.json.gift_id);
    const again = await pub('POST', '/api/public/stripe/webhook', paid, { 'stripe-signature': sign(paid, 'whsec_test') });
    assert.equal(again.json.duplicate, true, 'a retried delivery applies once');
    const gifts = (await mgr.get('/api/records/gift?limit=200')).json.records.filter((g) => g.person_name === 'Card Donor');
    assert.equal(gifts.length, 1);
    assert.equal(gifts[0].method, 'card');

    // Monthly: subscription session, then each invoice.paid is a gift.
    const goM = await donate({ amount: '25', monthly: '1', name: 'Monthly Card', email: 'monthly@example.org', address: '3 Main St', ...eligible });
    assert.equal(goM.status, 303);
    assert.equal(sessions[1].get('mode'), 'subscription');
    assert.equal(sessions[1].get('line_items[0][price_data][recurring][interval]'), 'month');
    const mp = (await mgr.get('/api/pledges')).json.pledges.find((p) => p.email === 'monthly@example.org');
    const started = evt('evt_2', 'checkout.session.completed', { id: 'cs_2', mode: 'subscription', subscription: 'sub_1', metadata: { pledge_id: mp.id, workspace_id: ws } });
    assert.equal((await pub('POST', '/api/public/stripe/webhook', started, { 'stripe-signature': sign(started, 'whsec_test') })).json.subscription, true);
    for (const [i, id] of [['1', 'evt_3'], ['2', 'evt_4']]) {
      const inv = evt(id, 'invoice.paid', { id: `in_${i}`, amount_paid: 2500, status_transitions: { paid_at: Math.floor(Date.now() / 1000) },
        parent: { subscription_details: { metadata: { pledge_id: mp.id, workspace_id: ws } } } });
      const r = await pub('POST', '/api/public/stripe/webhook', inv, { 'stripe-signature': sign(inv, 'whsec_test') });
      assert.ok(r.json.gift_id, `invoice ${i} → gift`);
    }
    const monthly = (await mgr.get('/api/records/gift?limit=200')).json.records.filter((g) => g.person_name === 'Monthly Card');
    assert.equal(monthly.length, 2);
    assert.ok(monthly.every((g) => g.cadence === 'monthly'));
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
  }
});

// ── Offline-safe knocks ──
test('a knock replayed with the same client_id is recorded once', async () => {
  const p = await mgr.createPerson('Offline Knock');
  const client_id = '0b6c3d8e-1f2a-4c5b-8d9e-0a1b2c3d4e5f';
  const first = await mgr.action('contact.log', { person_id: p.id, channel: 'door', outcome: 'contacted', rating: '2', client_id });
  const replay = await mgr.action('contact.log', { person_id: p.id, channel: 'door', outcome: 'contacted', rating: '2', client_id });
  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(replay.json.duplicate, true);
  const prof = (await mgr.get(`/api/persons/${p.id}`)).json;
  assert.equal(prof.contacts.length, 1);
  const db = await getDb();
  const n = (await db.query(`select count(*)::int as n from events where workspace_id = $1 and entity_type = 'contact' and payload->>'client_id' = $2`, [ws, client_id])).rows[0].n;
  assert.equal(n, 1, 'one event for one knock');
});
