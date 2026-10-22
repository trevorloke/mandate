// The campaign's rating scale on this phone: useScale() → the scale every
// rating word is made from (shared/scale.js: ratingByCode(scale, code),
// ratingText(scale, code), …). The words on the buttons and the "Voting for?"
// list are the campaign's own (a manager's Rating scale screen).
//
// The field needs it with no signal, so the last one read is kept on the
// phone with the signed-in user's other copies (OfflineCache.js's key
// space: sign-out forgets it, another sign-in drops it). It never goes
// stale on its own: an old list beats the default list. Before anything is
// kept, the signed-in user's own workspace (['me'], itself kept for an
// offline start) carries the scale as last saved; with neither, the default.
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_SCALE, normalizeScale } from '@starbase/shared/scale';
import { apiGet } from '../api.js';

// OfflineCache.js's prefix and scope, so forgetPhoneCopies() / keepOnlyMine()
// clear this one with the rest.
const PREFIX = 'starbase:copy:v1:';
const keyFor = (me) => (me?.user?.id && me?.workspace?.id ? `${PREFIX}${me.workspace.id}:${me.user.id}:scale` : null);
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };

const readKept = (key) => {
  if (!key) return undefined;
  try {
    const v = JSON.parse(ls()?.getItem(key) || 'null');
    return v?.data?.scale ? v.data : undefined;
  } catch { return undefined; }
};
// Every RatingChip on a list reads the scale: write each answer once.
let kept = '';
const keep = (key, data, at) => {
  if (!key || kept === `${key}@${at}`) return;
  kept = `${key}@${at}`;
  try { ls()?.setItem(key, JSON.stringify({ at, data })); } catch { /* storage full or blocked */ }
};

// One normalized scale per answer, however many buttons read it.
const made = new WeakMap();
const scaleFrom = (data) => {
  if (!data?.scale) return DEFAULT_SCALE;
  let s = made.get(data);
  if (!s) { s = normalizeScale(data.scale); made.set(data, s); }
  return s;
};

export const SCALE_KEY = ['scale'];

export function useScale() {
  const qc = useQueryClient();
  const me = qc.getQueryData(['me']);
  const key = keyFor(me);
  const q = useQuery({
    queryKey: SCALE_KEY,
    queryFn: () => apiGet('/scale'),
    enabled: Boolean(me?.user?.id),
    // Asked again when a rating screen opens a minute or more later.
    staleTime: 60_000,
    initialData: () => readKept(key) ?? (me?.workspace?.settings?.scale ? { scale: me.workspace.settings.scale } : undefined),
    // What's kept is checked with the server as soon as there's signal.
    initialDataUpdatedAt: 0,
  });
  const { data, dataUpdatedAt, status } = q;
  useEffect(() => {
    if (status === 'success' && dataUpdatedAt > 0 && data?.scale) keep(key, data, dataUpdatedAt);
  }, [key, status, data, dataUpdatedAt]);
  return scaleFrom(data);
}
