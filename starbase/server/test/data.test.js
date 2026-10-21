// Data: CSV import (dedupe, merge, dry run), batch geocoding against the BC
// Address Geocoder (mocked), and the Imagine Surrey sample dataset.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb, Client } from './helpers.js';
import { getDb } from '../db/client.js';

let mgr, ws;

before(async () => {
  await freshDb();
  mgr = new Client();
  const r = await mgr.signup({ workspaceName: 'Imagine Surrey', jurisdiction: 'bc-municipal' });
  ws = r.json.workspace.id;
});

const imp = (rows, extra = {}) => mgr.post('/api/data/import', { rows, ...extra });

test('import: dry run previews without writing; real run creates, merges, and reports bad rows', async () => {
  await mgr.createPerson('Existing Email', { email: 'known@example.org' });
  const rows = [
    { first: 'Jas', last: 'Gill', phone: '604-555-0101', address: '13245 72 Ave', tags: 'newton; voter' },
    { name: 'Existing Email', email: 'KNOWN@example.org', phone: '604-555-0102' }, // merge: adds phone
    { name: 'Jas Gill', phone: '(604) 555-0101', email: 'jas@example.org' },      // same file: dedupe by name+phone
    { name: '', email: 'nobody@example.org' },                                    // invalid: no name
    { name: 'Bad Rating', rating: '7' },                                           // invalid: off-scale
    { name: 'Rated Voter', rating: '4d', address: '13300 72 Ave' },               // rating normalized to 4D
  ];
  const dry = await imp(rows, { dryRun: true, tag: 'list-2026' });
  assert.equal(dry.status, 200);
  assert.equal(dry.json.dryRun, true);
  assert.equal(dry.json.created, 2);
  assert.equal(dry.json.merged, 2);
  assert.equal(dry.json.invalid.length, 2);
  assert.equal((await mgr.get('/api/persons?q=Jas')).json.persons.length, 0, 'dry run wrote nothing');

  const real = await imp(rows, { tag: 'list-2026' });
  assert.equal(real.status, 200);
  assert.deepEqual([real.json.created, real.json.merged], [2, 2]);
  assert.match(real.json.invalid[0], /row 4: no name/);
  assert.match(real.json.invalid[1], /row 5: rating “7”/);
  const jas = (await mgr.get('/api/persons?q=Jas Gill')).json.persons;
  assert.equal(jas.length, 1, 'one Jas Gill');
  assert.equal(jas[0].email, 'jas@example.org', 'second row filled the blank email');
  assert.deepEqual(jas[0].tags.sort(), ['list-2026', 'newton', 'voter']);
  const known = (await mgr.get('/api/persons?q=Existing')).json.persons[0];
  assert.equal(known.phone, '604-555-0102', 'merge filled the missing phone');
  const rated = (await mgr.get('/api/persons?q=Rated')).json.persons[0];
  assert.equal(rated.rating, '4D');

  const again = await imp(rows);
  assert.equal(again.json.created, 0, 're-importing the same file creates no duplicates');
  const v = (await mgr.get('/api/audit/verify')).json;
  assert.equal(v.ok, true);
});

test('import refuses oversized batches and volunteers', async () => {
  const big = Array.from({ length: 2001 }, (_, i) => ({ name: `P ${i}` }));
  assert.equal((await imp(big)).status, 400);
  const inv = await mgr.action('member.invite', { email: 'v-import@example.org', role: 'volunteer' });
  const vol = new Client();
  await vol.post('/api/auth/join', { token: inv.json.joinUrl.split('/join/')[1], name: 'V', password: 'v-import-pass' });
  assert.equal((await vol.post('/api/data/import', { rows: [{ name: 'x' }] })).status, 403);
  assert.equal((await vol.post('/api/data/geocode', {})).status, 403);
  assert.equal((await vol.post('/api/data/sample', {})).status, 403);
});

test('geocode: precise BC matches are placed; vague and unknown are parked; outages retry', async () => {
  const p1 = await mgr.createPerson('Geo Precise', { address: '13450 104 Ave' });
  const p2 = await mgr.createPerson('Geo Vague', { address: 'Somewhere Rd' });
  const p3 = await mgr.createPerson('Geo Outage', { address: '9999 King George Blvd' });
  const realFetch = globalThis.fetch;
  const asked = [];
  let outage = true;
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    if (u.hostname !== 'geocoder.api.gov.bc.ca') return realFetch(url);
    const q = u.searchParams.get('addressString');
    asked.push(q);
    if (q.startsWith('13450 104 Ave')) {
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [-122.8466, 49.1906] },
        properties: { score: 98, matchPrecision: 'CIVIC_NUMBER', fullAddress: '13450 104 Ave, Surrey, BC' } }] }));
    }
    if (q.startsWith('Somewhere Rd')) {
      return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [-122.8, 49.1] },
        properties: { score: 40, matchPrecision: 'LOCALITY', fullAddress: 'Surrey, BC' } }] }));
    }
    if (outage) return new Response('busy', { status: 503 });
    return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [-122.84, 49.17] },
      properties: { score: 90, matchPrecision: 'CIVIC_NUMBER', fullAddress: '9999 King George Blvd, Surrey, BC' } }] }));
  };
  try {
    const r1 = (await mgr.post('/api/data/geocode', { limit: 50 })).json;
    assert.ok(asked.some((q) => q === '13450 104 Ave, Surrey, BC'), 'Surrey, BC appended when city is missing');
    assert.ok(r1.located >= 1);
    assert.ok(r1.errored >= 1);
    let prof = (await mgr.get(`/api/persons/${p1.id}`)).json.person;
    assert.equal(prof.lat, 49.1906);
    prof = (await mgr.get(`/api/persons/${p2.id}`)).json.person;
    assert.equal(prof.lat, null, 'a locality-level match is not a door');
    assert.equal((await mgr.get(`/api/persons/${p3.id}`)).json.person.lat, null);
    outage = false;
    const r2 = (await mgr.post('/api/data/geocode', { limit: 50 })).json;
    assert.ok(r2.located >= 1, 'outage rows retried on the next batch');
    assert.equal((await mgr.get(`/api/persons/${p3.id}`)).json.person.lat, 49.17);
    assert.ok(r2.unmatched >= 1, 'vague match reported as unmatched, not retried forever');
    const before = asked.filter((q) => q.startsWith('Somewhere')).length;
    await mgr.post('/api/data/geocode', { limit: 50 });
    assert.equal(asked.filter((q) => q.startsWith('Somewhere')).length, before, 'parked rows are not re-asked');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('sample data: loads a full Surrey campaign, safe contacts only, then clears without a trace', async () => {
  const fresh = new Client();
  await fresh.signup({ workspaceName: 'Sample WS', jurisdiction: 'bc-municipal' });
  const load = await fresh.post('/api/data/sample', {});
  assert.equal(load.status, 200);
  assert.ok(load.json.people >= 45);
  assert.equal((await fresh.post('/api/data/sample', {})).status, 409, 'loads once');

  const doors = (await fresh.get('/api/map/doors')).json;
  assert.ok(doors.persons.length >= 45, 'sample people are on the map');
  const lats = doors.persons.map((p) => p.lat); const lngs = doors.persons.map((p) => p.lng);
  assert.ok(Math.min(...lats) > 49.0 && Math.max(...lats) < 49.22, 'inside Surrey (lat)');
  assert.ok(Math.min(...lngs) > -122.92 && Math.max(...lngs) < -122.68, 'inside Surrey (lng)');
  const all = (await fresh.get('/api/persons?limit=2000')).json.persons;
  assert.ok(all.every((p) => !p.email || /\.example(\.org)?$|@example\.org$/.test(p.email)), 'only reserved example domains');
  assert.ok(all.every((p) => !p.phone || /^604-555-01\d\d$/.test(p.phone)), 'only fictional 555-01xx numbers');

  const brief = (await fresh.get('/api/brief')).json;
  assert.equal(brief.sampleLoaded, true);
  assert.ok(brief.field.week > 10);
  assert.ok(brief.flagged.length >= 1, 'the over-cap sample gift is flagged');
  assert.ok(brief.shifts.length >= 1 && brief.events.length >= 1);
  assert.equal(brief.myTurfs.length, 1);
  const media = (await fresh.get('/api/persons?tag=media')).json.persons;
  assert.equal(media.length, 3);
  const tiers = await Promise.all(['Maya Chen', 'Hannah Lee'].map(async (n) => {
    const p = (await fresh.get(`/api/persons?q=${encodeURIComponent(n)}`)).json.persons[0];
    return (await fresh.get(`/api/persons/${p.id}`)).json.donor.tier;
  }));
  assert.deepEqual(tiers, ['superstar', 'star']);
  const walk = (await fresh.get(`/api/turfs/${brief.myTurfs[0].id}/walk`)).json;
  assert.ok(walk.doors.length >= 7, 'Newton turf holds the Newton block');

  const mine = await fresh.createPerson('Real Person', { email: 'real@example.org' });
  const clear = await fresh.req('DELETE', '/api/data/sample');
  assert.equal(clear.status, 200);
  const left = (await fresh.get('/api/persons?limit=2000')).json.persons;
  assert.deepEqual(left.map((p) => p.id), [mine.id], 'only real data remains');
  const b2 = (await fresh.get('/api/brief')).json;
  assert.equal(b2.sampleLoaded, false);
  assert.equal(b2.shifts.length + b2.events.length + b2.myTurfs.length, 0);
  assert.equal((await fresh.get('/api/signs')).json.signs.length, 0);
  assert.equal((await fresh.get('/api/audit/verify')).json.ok, true);
  const db = await getDb();
  const gifts = (await db.query('select count(*)::int as n from gifts g join workspaces w on w.id = g.workspace_id where w.name = $1', ['Sample WS'])).rows[0].n;
  assert.equal(gifts, 0);
  void ws;
});
