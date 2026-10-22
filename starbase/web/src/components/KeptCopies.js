// Kept copies for the desk: the last copy this sign-in loaded of Today,
// People (and its search), a profile once opened, Shifts, Signs, Money and
// the Inbox, read back when there's no signal — with no code in the pages.
//
//   keptPersister      every query's fetch runs through it (main.jsx,
//                      defaultOptions.queries.persister). A load that worked
//                      is kept, a moment later; one that got no answer at all
//                      gives what's kept (or what's already on screen)
//                      instead of an error, so the screen draws as usual.
//   watchKeptCopies(queryClient)   (main.jsx) a screen opened while the
//                      browser is offline starts from its kept copy (react-
//                      query doesn't even try the network then); back online,
//                      every screen showing a copy loads again.
//   useKeptTime()      (Shell's strip) when what's on screen is from:
//                      { why: 'No signal' | 'No answer', at } or null.
//   keptPartial(data)  People's search with no signal, over a kept list that
//                      was cut off at its limit: the server may have more.
//
// What's kept, and where (planFor) — copies live in OfflineCache.js's store,
// keyed to this campaign + this person + their role, so another sign-in on a
// shared computer never reads them; sign-out forgets them all; at most a day
// old; desk copies share ~1.2 MB among themselves (oldest out) so they never
// push the field's copies out. Only what the server sent this sign-in is
// kept — the same answer the screen drew (forViewer already shaped a
// volunteer's) — never the outbox's changes laid over it.
//   this browser   People lists (searches are answered from them), Signs,
//                  Shifts, the Inbox and its threads; a volunteer's Today
//                  and profiles (the server sends them no money).
//   this tab only  on a desk sign-in, anything with money in it: Today
//                  (raised, gifts over the limit), profiles (gifts) and Money
//                  (gifts, pledges, receipts needing an address). Money is
//                  the most sensitive thing a campaign holds; a treasurer who
//                  walks away from a church-basement computer without signing
//                  out leaves no donor ledger behind once the tab is closed,
//                  while a wifi drop mid-session (the common case) still
//                  reads fine — and every money write needs signal anyway.
import { useCallback, useSyncExternalStore } from 'react';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../api.js';
import { copyGeneration, copyKey, copyScope, readCopy, removeCopy, writeCopy } from './OfflineCache.js';

const DESK_MAX = 1_200_000; // characters of JSON, all of one desk sign-in's copies
const offlineNow = () => typeof navigator !== 'undefined' && navigator.onLine === false;
const isDeskRole = (role) => Boolean(role) && role !== 'volunteer';
// No answer at all (not a refusal): the browser couldn't reach the server.
const noAnswer = (err) => !(err instanceof ApiError);

// data → when it was loaded from the server, for data shown from a copy (or
// kept on screen after a load got no answer).
const keptAt = new WeakMap();
const partial = new WeakSet();
export const keptPartial = (data) => Boolean(data) && partial.has(data);

// What a query's copy is called and where it lives, or null (not kept).
// Shifts keep the names the field already uses (pages/Shifts.jsx), so Today
// and Shifts read the same copy.
function planFor(key, me) {
  if (!Array.isArray(key) || !copyScope(me) || !me.role) return null;
  const desk = isDeskRole(me.role);
  const money = desk ? 'session' : 'local';
  const q = (name, tier) => ({ name: `q:${me.role}:${name}`, tier });
  const [k0, k1, k2] = key;
  switch (k0) {
    case 'brief': return key.length === 1 ? q('brief', money) : null;
    case 'person': return key.length === 2 && typeof k1 === 'string' ? q(`person:${k1}`, money) : null;
    // A search isn't kept (each one typed would be another copy, pushing the
    // whole list out): with no signal it's answered from the kept list.
    case 'persons': return k1 === 'list' && key.length === 3
      ? { ...q(`persons:${k2}`, 'local'), keep: !(new URLSearchParams(String(k2)).get('q') || '').trim() } : null;
    case 'signs': return key.length === 1 ? q('signs', 'local') : null;
    case 'texting': return (k1 === 'inbox' || k1 === 'thread') && key.length === 3 ? q(`texting:${k1}:${k2}`, 'local') : null;
    case 'shifts': return key.length === 1 ? { name: 'shifts', tier: 'local', field: true } : null;
    case 'shift': return key.length === 2 ? { name: `shift:${k1}`, tier: 'local', field: true } : null;
    // Money: desk roles only (the server refuses volunteers these) — the
    // ledger, pledges and receipts waiting for an address, as Money shows them.
    case 'records': return desk && k1 === 'gift' ? q('gifts', 'session') : null;
    case 'pledges': return desk && key.length === 1 ? q('pledges', 'session') : null;
    case 'receipts': return desk && k1 === 'needs' && key.length === 2 ? q('receipts:needs', 'session') : null;
    default: return null;
  }
}

// ── People's search over the kept list ──
// The People screen asks /persons?q=…&limit=300 (+ tag, rating, role, has,
// field). With no copy of this exact search: the same filters without the
// search words, or the whole list, filtered here the way the server filters.
const lower = (v) => String(v ?? '').toLowerCase();
function filterPersons(rows, p, { q = true, rest = true } = {}) {
  const words = lower(p.get('q')).trim();
  const tag = (p.get('tag') || '').trim();
  const rating = (p.get('rating') || '').trim();
  const has = (p.get('has') || '').trim();
  const codes = rating ? rating.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return rows.filter((r) => {
    if (q && words && ![r.name, r.address, r.phone, r.email].some((v) => lower(v).includes(words))) return false;
    if (!rest) return true;
    if (tag && !(Array.isArray(r.tags) && r.tags.includes(tag))) return false;
    if (codes.length && !codes.some((c) => (c === 'unrated' ? r.rating == null : r.rating === c))) return false;
    if (has === 'phone' && !r.phone) return false;
    if (has === 'email' && !r.email) return false;
    if (has === 'location' && (r.lat == null || r.lng == null)) return false;
    return true;
  });
}
function derivePersons(me, plan, qs) {
  const p = new URLSearchParams(qs);
  const limit = Number(p.get('limit')) || 25;
  const read = (s) => readCopy(copyKey(me, `q:${me.role}:persons:${s}`), plan.tier);
  const tries = [];
  if ((p.get('q') || '').trim()) {
    const same = new URLSearchParams(p);
    same.set('q', '');
    tries.push({ s: same.toString(), rest: false });
  }
  // The whole list (no filters) — unless it's by volunteer role or a
  // profile field (?field=), which a row doesn't carry: those say No signal
  // rather than show everyone under the filter's chip.
  if (!p.get('role') && !p.get('field')) tries.push({ s: new URLSearchParams({ q: '', limit: String(limit) }).toString(), rest: true });
  for (const t of tries) {
    if (t.s === qs) continue;
    const base = read(t.s);
    const rows = base?.data?.persons;
    if (!Array.isArray(rows)) continue;
    return {
      data: { ...base.data, persons: filterPersons(rows, p, { rest: t.rest }).slice(0, limit) },
      at: base.at,
      partial: rows.length >= limit,
    };
  }
  return null;
}

function readKept(plan, key, me) {
  const v = readCopy(copyKey(me, plan.name), plan.tier);
  if (v) return v;
  if (key[0] === 'persons' && isDeskRole(me.role)) return derivePersons(me, plan, key[2]);
  return null;
}

let client = null;
const meNow = () => client?.getQueryData(['me']) || null;

export async function keptPersister(queryFn, context, query) {
  const me = meNow();
  const plan = planFor(query.queryKey, me);
  if (!plan) return queryFn(context);
  const scope = copyScope(me);
  const gen = copyGeneration();
  try {
    const data = await queryFn(context);
    // Fresh from the server: what was on screen is no longer a copy (even if
    // it's the same object — react-query keeps it when nothing changed).
    if (query.state.data !== undefined) { keptAt.delete(query.state.data); partial.delete(query.state.data); }
    // A screen that keeps its own phone copy (OfflineCache phoneCopy) writes
    // it itself; anything else is kept here — for this sign-in only.
    if (plan.keep !== false && query.options.initialData === undefined && copyScope(meNow()) === scope && gen === copyGeneration()) {
      writeCopy(copyKey(me, plan.name), data, Date.now(), {
        tier: plan.tier, gen, group: plan.field ? null : { scope, name: 'q:', max: DESK_MAX },
      });
    }
    return data;
  } catch (err) {
    // Refused now (no longer theirs to see, or gone): forget the copy.
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) removeCopy(copyKey(me, plan.name), plan.tier);
    if (!noAnswer(err) || copyScope(meNow()) !== scope) throw err;
    const shown = query.state.data;
    if (shown !== undefined) {
      // Already on screen: keep showing it, said as from when it loaded. (A
      // field screen's own copy keeps its own way of saying so.)
      if (plan.field && !keptAt.has(shown)) throw err;
      if (!keptAt.has(shown)) keptAt.set(shown, query.state.dataUpdatedAt);
      return shown;
    }
    const kept = readKept(plan, query.queryKey, me);
    if (!kept) throw err;
    keptAt.set(kept.data, kept.at);
    if (kept.partial) partial.add(kept.data);
    return kept.data;
  }
}

export function watchKeptCopies(queryClient) {
  client = queryClient;
  const cache = queryClient.getQueryCache();
  // Opened with no signal: start from the copy. (Online, react-query fetches
  // and the persister above answers for a fetch that gets nowhere.)
  cache.subscribe((event) => {
    if (event.type !== 'added') return;
    const { query } = event;
    if (query.state.data !== undefined || (onlineManager.isOnline() && !offlineNow())) return;
    const me = meNow();
    const plan = planFor(query.queryKey, me);
    if (!plan) return;
    const kept = readKept(plan, query.queryKey, me);
    if (!kept) return;
    const data = query.setData(kept.data, { updatedAt: kept.at, manual: true });
    keptAt.set(data, kept.at);
    if (kept.partial) partial.add(data);
  });
  // Back online: whatever is showing a copy loads again.
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      queryClient.invalidateQueries({ predicate: (q) => q.state.data !== undefined && keptAt.has(q.state.data) });
    });
  }
}

// ── When what's on screen is from ──
// The screens on the strip's mind: what a desk or field screen draws (not
// the small reads every screen makes, like texting status).
const SHOWN = new Set(['brief', 'persons', 'person', 'signs', 'shifts', 'shift', 'records', 'pledges',
  'receipts', 'doors', 'turf', 'turfs']);
const shown = (key) => SHOWN.has(key[0]) || (key[0] === 'texting' && (key[1] === 'inbox' || key[1] === 'thread'));
function snapshotOf(queryClient) {
  const offline = offlineNow();
  let at = Infinity;
  for (const q of queryClient.getQueryCache().getAll()) {
    if (!q.getObserversCount() || q.state.data === undefined || !shown(q.queryKey)) continue;
    const kept = keptAt.get(q.state.data);
    // With signal, only a copy shown because a load got no answer counts.
    if (!offline && (kept === undefined || q.state.fetchStatus === 'fetching')) continue;
    const t = kept ?? q.state.dataUpdatedAt;
    if (t > 0 && t < at) at = t;
  }
  return Number.isFinite(at) ? `${offline ? 'No signal' : 'No answer'}|${at}` : '';
}

export function useKeptTime() {
  const queryClient = useQueryClient();
  const subscribe = useCallback((fn) => {
    let queued = false;
    // Told after the cache settles, never in the middle of another render.
    const later = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => { queued = false; fn(); }, 0);
    };
    const off = queryClient.getQueryCache().subscribe(later);
    window.addEventListener('online', later);
    window.addEventListener('offline', later);
    return () => {
      off();
      window.removeEventListener('online', later);
      window.removeEventListener('offline', later);
    };
  }, [queryClient]);
  const snap = useSyncExternalStore(subscribe, () => snapshotOf(queryClient), () => '');
  if (!snap) return null;
  const [why, at] = snap.split('|');
  return { why, at: Number(at) };
}
