// Offline outbox for field work. Field volunteers lose signal mid-block; a
// knock, a new door, a pin, a sign request or a shift sign-up must never be
// lost or recorded twice.
//
//   queueAction(name, input, meta?)
//                      → { queued: false, result, client_id } when the server took it,
//                        { queued: true, signedOut?, client_id } when it's saved to send later.
//                      Throws the server's refusal (a 4xx) like action() does.
//   logContact(input, meta?)  the same for contact.log (the door card, walk
//                      list, Calls and profile all knock through it).
//   flushOutbox()      → replays waiting items in order (safe to call anytime).
//   useOutbox()        → { pending, refused, flushing, lastError, items, flush }.
//   dismissItem(cid) / retryItem(cid)   a refused item: drop it, or send it again.
//   undoQueued(cid)    a sign request still on the phone: take it back.
//   clearOutbox()      → discard this sign-in's items (sign-out on a shared phone).
//   setOutboxOwner(me) → whose items these are (Shell): each item belongs to
//                        the sign-in that saved it and is only shown to and
//                        sent by that sign-in — never as someone else's.
//   applyOutbox(doors) → the map's /api/map/doors payload with what's still on
//                        the phone laid over it (new people, pins, signs, ratings).
//   onOutboxSent(fn)   → told about each item once the server has it.
//
// One FIFO queue — order matters: a person added offline, then knocked, must
// reach the server in that order — so a new item goes behind anything still
// waiting, even with signal. Every item carries a client-made id the server
// dedupes on (contact.log and sign.place: client_id; person.create: id), so a
// replay after a dropped response is recorded exactly once; shift.join /
// shift.leave answer a replay with "already on it" / "not on it" and
// sign.cancel with "not found", which the replay reads as done. Only network
// failures queue — a 4xx on the first try is returned as an error, because
// replaying it would fail the same way forever. A 4xx on a replay is kept
// (refused, with the server's reason) until someone dismisses or retries it:
// never silently dropped.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { SIGN_KINDS } from '@starbase/shared/canvass';
import { action, ApiError } from './api.js';

// The writes a phone may do with no signal (the door card, walk list, Calls,
// the map's pins and Shifts).
export const FIELD_ACTIONS = ['contact.log', 'person.create', 'person.locate', 'sign.place', 'sign.cancel', 'shift.join', 'shift.leave'];

const KEY = 'starbase:outbox:v2';
const V1_KEY = 'starbase:outbox:v1'; // knocks only (before this outbox)
const listeners = new Set();
const sentListeners = new Set();
let flushing = null; // the running flush (a promise), or null
let owner = null;    // "workspace:user" of whoever is signed in (setOutboxOwner)
let lastError = null;
let signedOutNow = false;
// What the server answered for items sent by a flush, by client id, so a
// caller who queued behind others (or a later Undo) can still read it.
const results = new Map();
const keep = (cid, result) => {
  results.set(cid, result);
  while (results.size > 100) results.delete(results.keys().next().value);
};

export const newClientId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

const storage = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const fromV1 = (k) => {
  const { queued_at: at, ...input } = k;
  const cid = input.client_id || newClientId();
  return { cid, name: 'contact.log', input: { ...input, client_id: cid }, meta: {}, at: at || new Date().toISOString(), tries: 0, state: 'pending' };
};
const read = () => {
  const ls = storage();
  if (!ls) return [];
  try {
    const items = JSON.parse(ls.getItem(KEY) || '[]');
    const old = JSON.parse(ls.getItem(V1_KEY) || '[]');
    const list = Array.isArray(items) ? items.filter((i) => i && i.cid && i.name) : [];
    if (Array.isArray(old) && old.length) {
      const have = new Set(list.map((i) => i.cid));
      for (const k of old) if (k?.person_id && !have.has(k.client_id)) list.push(fromV1(k));
      ls.setItem(KEY, JSON.stringify(list));
      ls.removeItem(V1_KEY);
    }
    return list;
  } catch { return []; }
};
let memory = read();
// An item is this sign-in's when it says so (older items, saved before items
// had owners, count as whoever is signed in).
const mine = (i) => !owner || !i.owner || i.owner === owner;
let visible = memory;
let snap = null;
const makeSnap = () => {
  visible = memory.filter(mine);
  const pending = visible.filter((i) => i.state === 'pending').length;
  snap = {
    pending,
    refused: visible.length - pending,
    flushing: Boolean(flushing),
    lastError,
    signedOut: signedOutNow,
    items: visible,
    flush: flushOutbox,
  };
};
makeSnap();
const changed = () => { makeSnap(); listeners.forEach((fn) => fn()); };
const write = (items) => {
  memory = items;
  try { storage()?.setItem(KEY, JSON.stringify(items)); } catch { /* storage full: keep in memory */ }
  changed();
};
const update = (cid, patch) => write(memory.map((i) => (i.cid === cid ? { ...i, ...patch } : i)));
const remove = (cid) => write(memory.filter((i) => i.cid !== cid));
const find = (cid) => memory.find((i) => i.cid === cid) || null;

const isNetworkFailure = (err) => !(err instanceof ApiError) || err.status >= 500 || err.status === 0;
// A lapsed sign-in is not a bad item: keep it and send after signing in.
const isSignedOut = (err) => err instanceof ApiError && err.status === 401;
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const pendingCount = () => visible.filter((i) => i.state === 'pending').length;
// Everything not on the server yet, refused included (sign-out asks about these).
export const unsentCount = () => visible.length;

// Called while the shell renders, so screens drawn after it read the right
// items at once; anything already listening is told just after the render.
export function setOutboxOwner(me) {
  const next = me?.user?.id && me?.workspace?.id ? `${me.workspace.id}:${me.user.id}` : null;
  if (next === owner) return;
  owner = next;
  lastError = null;
  signedOutNow = false;
  makeSnap();
  queueMicrotask(() => listeners.forEach((fn) => fn()));
}

// Sign-out on a shared phone: the next person must not send these as theirs.
export function clearOutbox() {
  lastError = null;
  signedOutNow = false;
  results.clear();
  write(memory.filter((i) => !mine(i)));
}

// The id the server dedupes on, made here so a replay is the same write.
const withClientId = (name, input) => {
  if (name === 'person.create') return input.id ? input : { ...input, id: newClientId() };
  if (name === 'contact.log' || name === 'sign.place') return input.client_id ? input : { ...input, client_id: newClientId() };
  return input;
};
const cidOf = (name, input) => (name === 'person.create' ? input.id
  : name === 'contact.log' || name === 'sign.place' ? input.client_id : newClientId());

// A replay of something the server already did answers "already": that IS done.
const alreadyDone = (name, err) => err instanceof ApiError && (
  (name === 'shift.join' && err.status === 409 && /already on this shift/i.test(err.message))
  || (name === 'shift.leave' && err.status === 404 && /not on this shift/i.test(err.message))
  || (name === 'sign.cancel' && err.status === 404));

async function send(item, { replay }) {
  try {
    return await action(item.name, item.input);
  } catch (err) {
    if (replay && alreadyDone(item.name, err)) return { already: true };
    throw err;
  }
}

const told = (item, result) => {
  for (const fn of sentListeners) {
    try { fn({ name: item.name, input: item.input, meta: item.meta, result }); } catch { /* a listener's bug is not the outbox's */ }
  }
};
export function onOutboxSent(fn) {
  sentListeners.add(fn);
  return () => sentListeners.delete(fn);
}

// meta: { who } — the name the sheet shows ("Knock · Maya Chen · 2:14 pm");
// person.locate also keeps { person } so the pin still shows after a reload.
export async function queueAction(name, input, meta = {}) {
  if (!FIELD_ACTIONS.includes(name)) throw new Error(`${name} can't be saved offline`);
  const body = withClientId(name, input);
  const item = { cid: cidOf(name, body), name, input: body, meta, at: new Date().toISOString(), tries: 0, state: 'pending', owner };
  if (offlineNow()) {
    write([...memory, item]);
    return { queued: true, client_id: item.cid };
  }
  // Something is still waiting: go behind it (order matters), then see
  // whether this flush got it through.
  if (pendingCount() > 0) {
    write([...memory, item]);
    await flushOutbox();
    const left = find(item.cid);
    if (!left) {
      const result = results.get(item.cid);
      results.delete(item.cid);
      return { queued: false, result, client_id: item.cid };
    }
    if (left.state === 'refused') {
      // Refused on its first try: the screen says so in place, as for a direct send.
      remove(item.cid);
      throw new ApiError(left.error?.status || 400, left.error?.message || 'refused');
    }
    return { queued: true, signedOut: signedOutNow, client_id: item.cid };
  }
  try {
    const result = await send(item, { replay: false });
    told(item, result);
    return { queued: false, result, client_id: item.cid };
  } catch (err) {
    if (!isNetworkFailure(err) && !isSignedOut(err)) throw err;
    // It may have reached the server (the answer got lost): tries says so.
    write([...memory, { ...item, tries: 1 }]);
    return { queued: true, signedOut: isSignedOut(err), client_id: item.cid };
  }
}

export const logContact = (input, meta = {}) => queueAction('contact.log', input, meta);

async function runFlush() {
  let sent = 0;
  lastError = null;
  signedOutNow = false;
  changed();
  for (;;) {
    const next = memory.find((i) => i.state === 'pending' && mine(i));
    if (!next) break;
    update(next.cid, { tries: (next.tries || 0) + 1 });
    try {
      let done = next;
      let result = await send(next, { replay: true });
      // A sign request taken back (Undo) after it may already have gone —
      // even while it was on its way just now: the request lands, then its
      // cancel goes straight after.
      if (next.name === 'sign.place' && find(next.cid)?.undo && result?.sign?.id) {
        told(next, result);
        done = { ...next, name: 'sign.cancel', input: { id: result.sign.id }, undo: false, tries: 1 };
        update(next.cid, done);
        result = await send(done, { replay: true });
      }
      keep(next.cid, result);
      remove(next.cid);
      told(done, result);
      sent += 1;
    } catch (err) {
      if (isNetworkFailure(err)) { lastError = 'Still offline — will retry'; break; }
      if (isSignedOut(err)) { lastError = 'Sign in again to send what’s saved'; signedOutNow = true; break; }
      // Refused: kept, with the server's reason, until dismissed or retried.
      update(next.cid, { state: 'refused', error: { status: err.status, message: err.message || 'refused' } });
    }
  }
  return { sent, left: pendingCount() };
}

export function flushOutbox() {
  if (flushing) return flushing;
  if (pendingCount() === 0) return Promise.resolve({ sent: 0, left: 0 });
  flushing = runFlush().finally(() => { flushing = null; changed(); });
  changed();
  return flushing;
}

export function dismissItem(cid) {
  remove(cid);
}

export function retryItem(cid) {
  const it = find(cid);
  if (!it) return Promise.resolve({ sent: 0, left: pendingCount() });
  update(cid, { state: 'pending', error: null });
  return offlineNow() ? Promise.resolve({ sent: 0, left: pendingCount() }) : flushOutbox();
}

// Take back a sign request saved on this phone:
//   'removed' — it never left the phone; now it never will.
//   'queued'  — it may have reached the server, so its cancel follows it.
//   { sent }  — it already went (sent's result has the sign): cancel that one.
//   null      — nothing to take back.
export function undoQueued(cid) {
  const it = find(cid);
  if (!it) {
    const sentResult = results.get(cid);
    return sentResult ? { sent: sentResult } : null;
  }
  if (it.name !== 'sign.place') return null;
  // tries counts every send that may have reached the server; a refused one
  // never did.
  if (!it.tries || it.state === 'refused') {
    remove(cid);
    return 'removed';
  }
  update(cid, { undo: true, state: 'pending', error: null });
  return 'queued';
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => snap;

export function useOutbox() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// Mount once (Shell): flush on reconnect, on focus, and every 30s while
// pending — sooner (3s, 6s, 12s…) while the signal is coming and going.
export function useOutboxAutoFlush(onFlushed) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let soon = null;
    let delay = 3000;
    const go = async () => {
      clearTimeout(soon);
      if (!pendingCount() || offlineNow()) return;
      const r = await flushOutbox();
      if (r.sent && onFlushed) onFlushed(r);
      setTick((t) => t + 1);
      if (r.left > 0 && !offlineNow() && delay < 30000) { soon = setTimeout(go, delay); delay *= 2; } else delay = 3000;
    };
    const reconnect = () => { delay = 3000; go(); };
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', go);
    const id = setInterval(go, 30000);
    go();
    return () => {
      clearTimeout(soon);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', go);
      clearInterval(id);
    };
  }, [onFlushed]);
  return tick;
}

// ── What the sheet says about an item ──
const SIGN_WORD = Object.fromEntries(SIGN_KINDS.map((s) => [s.code, s.label]));
const CHANNEL_WORD = { door: 'Knock', phone: 'Call', text: 'Text' };
// "2:14 pm" today, "Oct 18" before that — the phone's own clock.
export const clockText = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (d.toDateString() !== new Date().toDateString()) {
    return d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
  }
  const h = d.getHours();
  return `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};
// "Knock · Maya Chen · 2:14 pm", "New person · Ana Souza · 2:16 pm".
// nameOf(personId) fills in a name the item didn't keep.
export function itemText(item, nameOf = () => '') {
  const i = item.input || {};
  const who = item.meta?.who || (i.person_id ? nameOf(i.person_id) : '') || (item.name === 'person.locate' ? nameOf(i.id) : '');
  let what;
  switch (item.name) {
    case 'contact.log':
      what = i.rating || i.outcome !== 'contacted' || !i.note ? (CHANNEL_WORD[i.channel] || 'Knock') : 'Note';
      break;
    case 'person.create': what = 'New person'; break;
    case 'person.locate': what = 'Pin'; break;
    case 'sign.place': what = item.undo ? `${SIGN_WORD[i.kind] || 'Sign'} · undo` : (SIGN_WORD[i.kind] || 'Sign'); break;
    case 'sign.cancel': what = 'Sign undo'; break;
    case 'shift.join': what = 'Count me in'; break;
    case 'shift.leave': what = 'Can’t make it'; break;
    default: what = 'Saved';
  }
  const name = item.name === 'person.create' ? i.name : who;
  return [what, name, clockText(item.at)].filter(Boolean).join(' · ');
}

// ── Laid over what the screens loaded ──

// The latest knock still waiting, per person — the walk list's overlay after
// a reload: { rating, outcome, at, queued: true }.
export function pendingKnocks(items = visible) {
  const out = {};
  for (const it of items) {
    if (it.state !== 'pending' || it.name !== 'contact.log' || it.input?.channel !== 'door' || !it.input.person_id) continue;
    const pid = it.input.person_id;
    out[pid] = { rating: it.input.rating || out[pid]?.rating || null, outcome: it.input.outcome, at: it.at, queued: true };
  }
  return out;
}

// A person added on this phone, in the shape the map and walk list use.
const pendingPerson = (it) => ({
  id: it.input.id,
  name: it.input.name,
  phone: it.input.phone ?? null,
  email: null,
  address: it.input.address ?? null,
  unit: it.input.unit ?? null,
  lat: Number(it.input.lat),
  lng: Number(it.input.lng),
  rating: null,
  rated_at: null,
  tags: [],
  pending: true,
});

// Same ray-casting test the server uses for walk lists (server/lib/geo.js).
function inRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i].map(Number);
    const [yj, xj] = ring[j].map(Number);
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// People added on this phone (not sent yet) whose pin is inside a turf.
export function pendingPeopleIn(ring, items = visible) {
  if (!Array.isArray(ring) || ring.length < 3) return [];
  return items
    .filter((it) => it.state === 'pending' && it.name === 'person.create' && it.input?.lat != null && it.input?.lng != null)
    .map(pendingPerson)
    .filter((p) => inRing(p.lat, p.lng, ring));
}

// The map's doors payload ({ persons, signs, unlocated }) with this phone's
// unsent work on top: new people (pending: true), dropped pins, sign
// requests (pending: true) and their undos, and ratings.
export function applyOutbox(data, items = visible) {
  if (!data) return data;
  const waiting = items.filter((i) => i.state === 'pending');
  if (!waiting.length) return data;
  let persons = [...(data.persons || [])];
  let signs = [...(data.signs || [])];
  let unlocated = data.unlocated || 0;
  for (const it of waiting) {
    const i = it.input || {};
    if (it.name === 'person.create' && i.lat != null && i.lng != null) {
      if (!persons.some((p) => p.id === i.id)) persons.push(pendingPerson(it));
    } else if (it.name === 'person.locate') {
      const at = persons.findIndex((p) => p.id === i.id);
      if (at >= 0) persons[at] = { ...persons[at], lat: i.lat, lng: i.lng };
      else if (it.meta?.person) {
        const p = it.meta.person;
        persons.push({
          id: i.id, name: p.name, phone: p.phone ?? null, email: p.email ?? null, address: p.address ?? null,
          unit: p.unit ?? null, lat: i.lat, lng: i.lng, rating: p.rating ?? null, rated_at: p.rated_at ?? null, tags: p.tags || [],
        });
        if (p.address) unlocated = Math.max(0, unlocated - 1);
      }
    } else if (it.name === 'sign.place' && !it.undo) {
      signs.push({
        id: `pending:${it.cid}`, cid: it.cid, person_id: i.person_id || null, address: i.address || null,
        lat: i.lat ?? null, lng: i.lng ?? null, kind: i.kind, status: i.status || 'requested', pending: true,
      });
    } else if (it.name === 'sign.cancel') {
      signs = signs.filter((s) => s.id !== i.id);
    } else if (it.name === 'contact.log' && i.rating) {
      persons = persons.map((p) => (p.id === i.person_id ? { ...p, rating: i.rating, rated_at: it.at } : p));
    }
  }
  return { ...data, persons, signs, unlocated };
}
