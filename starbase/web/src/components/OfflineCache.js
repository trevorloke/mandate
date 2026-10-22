// Phone copies: what a field screen last loaded, kept on this phone so a
// volunteer who loses signal can still see and work it — the map's doors,
// the Calls list, the shifts (list and each one opened), what this sign-in
// may do, and the map's tile settings. (Walk lists keep their own copy in
// pages/Turfs.jsx.)
//
//   const copy = phoneCopy(me, 'doors');            // before useQuery
//   const q = useQuery({ queryKey, queryFn, ...copy });
//   useKeepCopy(me, 'doors', q);                     // after it
//   showingCopy(q)  → the data on screen came from the phone, not the server
//
// Keyed by workspace + user, so another sign-in on a shared phone never reads
// them; a day old at most; each copy ≤ ~1.5 MB and all of them ≤ ~3 MB
// (oldest out first). Sign-out forgets them all (forgetPhoneCopies), and a
// different sign-in drops anyone else's (keepOnlyMine). Volunteers' copies
// hold only what the server already let them see (forViewer).
//
// Desk screens keep theirs through the same store (components/KeptCopies.js
// — no per-page code): copyKey / readCopy / writeCopy / removeCopy below,
// in this browser ('local', a day) or, for anything with money in it on a
// desk sign-in, in this tab only ('session' — gone when the tab closes).
// Sign-out forgets both.
import { useEffect } from 'react';

const PREFIX = 'starbase:copy:v1:';
// The walk list's own copies (pages/Turfs.jsx) are forgotten with these.
const FIELD_PREFIX = 'starbase:field:v1:';
const TTL = 24 * 3600 * 1000;
const ENTRY_MAX = 1_500_000; // characters of JSON
const TOTAL_MAX = 3_000_000;

const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const ss = () => { try { return globalThis.sessionStorage || null; } catch { return null; } };
const storeOf = (tier) => (tier === 'session' ? ss() : ls());
const scope = (me) => (me?.user?.id && me?.workspace?.id ? `${me.workspace.id}:${me.user.id}:` : null);
const keyFor = (me, name) => { const s = scope(me); return s ? `${PREFIX}${s}${name}` : null; };

function readEntry(key, store = ls()) {
  if (!store || !key) return null;
  try {
    const v = JSON.parse(store.getItem(key) || 'null');
    if (!v || v.data == null || !(Date.now() - v.at < TTL)) {
      if (v) store.removeItem(key);
      return null;
    }
    return v;
  } catch { return null; }
}

// { initialData, initialDataUpdatedAt } for useQuery. Lazy: the copy is read
// only when the query is first made (not on every render — the doors can be
// a megabyte), and gives undefined when there's none.
export function phoneCopy(me, name) {
  const key = keyFor(me, name);
  let v;
  const get = () => { if (v === undefined) v = readEntry(key); return v; };
  return { initialData: () => get()?.data, initialDataUpdatedAt: () => get()?.at };
}

const ours = (store = ls()) => {
  const out = [];
  if (!store) return out;
  try {
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k && k.startsWith(PREFIX)) out.push(k);
    }
  } catch { /* storage blocked */ }
  return out;
};

// group: { prefix, max } — copies under that prefix (a desk sign-in's) give
// way among themselves first, so they never push the field's copies out.
function writeEntry(key, data, at, store = ls(), group = null) {
  if (!store || !key) return;
  let text;
  try { text = JSON.stringify({ at, data }); } catch { return; }
  try {
    if (text.length > ENTRY_MAX) { store.removeItem(key); return; } // too big to keep
    // Make room: drop the oldest other copies until this one fits.
    const sized = (list) => list.map((k) => {
      const raw = store.getItem(k) || '';
      let when = 0;
      try { when = JSON.parse(raw).at || 0; } catch { /* unreadable: goes first */ }
      return { k, size: raw.length, when };
    }).sort((a, b) => a.when - b.when);
    const room = (list, max) => {
      let total = list.reduce((n, o) => n + o.size, 0) + text.length;
      while (total > max && list.length) {
        const o = list.shift();
        store.removeItem(o.k);
        total -= o.size;
      }
    };
    const others = ours(store).filter((k) => k !== key);
    if (group) room(sized(others.filter((k) => k.startsWith(group.prefix))), group.max);
    room(sized(ours(store).filter((k) => k !== key)), TOTAL_MAX);
    store.setItem(key, text);
  } catch {
    try { store.removeItem(key); } catch { /* storage blocked */ }
  }
}

const timers = new Map();
// Keep q's data on the phone (a second after it settles — the map refetches
// after every knock), and forget a copy the server now refuses (403/404).
export function useKeepCopy(me, name, q) {
  const key = keyFor(me, name);
  const { status, data, dataUpdatedAt, error } = q;
  useEffect(() => {
    if (!key || status !== 'success' || data == null || !dataUpdatedAt) return;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => { timers.delete(key); writeEntry(key, data, dataUpdatedAt); }, 800));
  }, [key, status, data, dataUpdatedAt]);
  const code = error?.status;
  useEffect(() => {
    if (key && (code === 403 || code === 404)) { try { ls()?.removeItem(key); } catch { /* blocked */ } }
  }, [key, code]);
}

// The screen is showing the phone's copy: no signal (the phone says so, or the
// fetch is paused), or the server didn't answer.
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;
export const showingCopy = (q) => Boolean(q?.data)
  && (offlineNow() || q.fetchStatus === 'paused' || (q.isError && !q.error?.status));

// Bumped at sign-out, so a load that was on its way for the last sign-in is
// never kept for the next (components/KeptCopies.js).
let generation = 0;
const forget = (keep) => {
  if (!keep) generation += 1;
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  for (const store of [ls(), ss()]) {
    if (!store) continue;
    try {
      // Every key first, then remove: removing while scanning can reorder them.
      const all = [];
      for (let i = 0; i < store.length; i += 1) all.push(store.key(i));
      for (const k of all) {
        if (!k || !(k.startsWith(PREFIX) || k.startsWith(FIELD_PREFIX))) continue;
        if (keep && k.slice(k.startsWith(PREFIX) ? PREFIX.length : FIELD_PREFIX.length).startsWith(keep)) continue;
        store.removeItem(k);
      }
    } catch { /* storage blocked */ }
  }
};

// Sign-out: every copy on this phone goes (walk lists too).
export const forgetPhoneCopies = () => forget(null);
// Signed in: copies belonging to anyone else on this phone go.
export const keepOnlyMine = (me) => { const s = scope(me); if (s) forget(s); };

// ── For components/KeptCopies.js (desk screens) ──
// tier: 'local' (this browser, a day) or 'session' (this tab only).
export const copyKey = keyFor;
export const copyScope = scope;
export const copyGeneration = () => generation;
export const readCopy = (key, tier = 'local') => readEntry(key, storeOf(tier));
export const removeCopy = (key, tier = 'local') => { try { storeOf(tier)?.removeItem(key); } catch { /* blocked */ } };
// Written a moment after it loaded (a list refetches after every tap), and
// only while the same sign-in is here (gen: copyGeneration() when it loaded).
export function writeCopy(key, data, at, { tier = 'local', group = null, gen } = {}) {
  if (!key) return;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    if (gen !== undefined && gen !== generation) return;
    writeEntry(key, data, at, storeOf(tier), group ? { prefix: `${PREFIX}${group.scope}${group.name}`, max: group.max } : null);
  }, 800));
}
