// Fetches computed business metrics for the current workspace.
// Shared module-level cache so every KPI strip triggers at most one request.
import { useEffect, useState } from 'react';
import { api } from './api';
import { useAuth } from './AuthContext';

let cache = null;          // { metrics }
let cacheWs = null;
let cacheAt = 0;
let inflight = null;
const subs = new Set();
const TTL_MS = 60_000;

function load(ws) {
  if (inflight) return inflight;
  inflight = api.businessMetrics()
    .then((r) => { cache = r.metrics || {}; cacheWs = ws; cacheAt = Date.now(); inflight = null; for (const s of subs) s(cache); return cache; })
    .catch(() => { inflight = null; return null; });
  return inflight;
}

export function invalidateMetrics() {
  cache = null; cacheAt = 0;
  if (subs.size) load(cacheWs);
}

export function useBusinessMetrics() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState(cache || {});

  useEffect(() => {
    if (!user) return;
    subs.add(setMetrics);
    if (cacheWs !== user.workspaceId) { cache = null; cacheAt = 0; cacheWs = user.workspaceId; }
    const stale = !cache || Date.now() - cacheAt > TTL_MS;
    if (stale) load(user.workspaceId);
    else setMetrics(cache);
    return () => { subs.delete(setMetrics); };
  }, [user?.workspaceId]);

  return metrics || {};
}
