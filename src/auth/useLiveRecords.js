// Hook to live-load module data records from the API.
// Falls back to a static fallback if API has nothing or errors.
// Module-level cache so multiple components hitting the same (module, kind) share one fetch.
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

const cache = new Map();      // key -> { data, ts }  (data is null if known-empty)
const inflight = new Map();   // key -> Promise
const subscribers = new Map();// key -> Set<setter>

const TTL_MS = 30_000;

function notifyAll(key, value) {
  cache.set(key, { data: value, ts: Date.now() });
  const subs = subscribers.get(key);
  if (subs) for (const s of subs) s(value);
}

async function fetchOnce(module, kind) {
  const key = `${module}.${kind}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    try {
      const { records } = await api.listData(module, kind);
      const live = (records && records.length > 0)
        ? records.map(r => ({ _dbId: r.id, ...r.data }))
        : null;
      notifyAll(key, live);
      return live;
    } catch {
      notifyAll(key, null);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p;
}

export function invalidateLive(module, kind) {
  if (module && kind) {
    const key = `${module}.${kind}`;
    cache.delete(key);
    // Re-fetch immediately if anyone is currently subscribed
    if (subscribers.get(key)?.size) fetchOnce(module, kind);
  } else {
    cache.clear();
    // Refetch all currently-subscribed buckets
    for (const key of subscribers.keys()) {
      const [m, k] = key.split('.');
      if (subscribers.get(key)?.size) fetchOnce(m, k);
    }
  }
}

// `fallback` is now ignored by default — fresh workspaces show empty arrays so
// modules can render proper empty states. Pass `useDemoFallback: true` opt-in
// in the rare component that genuinely wants the static demo when empty.
export function useLiveRecords(module, kind, fallback = [], { useDemoFallback = false } = {}) {
  const { user } = useAuth();
  const key = `${module}.${kind}`;
  const cached = cache.get(key);
  const initial = cached?.data;
  const [live, setLive] = useState(initial);

  useEffect(() => {
    if (!user) { setLive(null); return; }

    // Subscribe for updates
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(setLive);

    const cached = cache.get(key);
    const stale = !cached || (Date.now() - cached.ts > TTL_MS);
    if (stale) fetchOnce(module, kind);
    else setLive(cached.data);

    return () => {
      const s = subscribers.get(key);
      if (s) s.delete(setLive);
    };
  }, [module, kind, user?.workspaceId, key]);

  // Default: live records or empty array. Use the static fallback only when explicitly opted in.
  const records = (live && live.length > 0)
    ? live
    : (useDemoFallback ? fallback : []);
  const isEmpty = !records || records.length === 0;
  const refresh = () => { cache.delete(key); fetchOnce(module, kind); };
  return { records, loading: live === undefined, isEmpty, refresh };
}
