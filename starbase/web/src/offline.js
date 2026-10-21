// Offline outbox for door knocks. Field volunteers lose signal mid-block; a
// knock must never be lost or double-counted.
//
//   logContact(input)  → { queued: false, result } when the server took it,
//                        { queued: true } when it's saved to send later.
//   flushOutbox()      → replays queued knocks in order (safe to call anytime).
//   useOutbox()        → { pending, flushing, lastError, flush } for banners.
//   clearOutbox()      → discard queued knocks (sign-out on a shared phone).
//
// Every knock gets a client_id up front; the server dedupes on it, so a
// replay after a dropped response is recorded exactly once. Only network
// failures queue — a 4xx (bad input, no permission) is returned as an error,
// because replaying it would fail the same way forever.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { action, ApiError } from './api.js';

const KEY = 'starbase:outbox:v1';
const listeners = new Set();
let flushing = false;
let lastError = null;

const read = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
};
const write = (items) => {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage full: keep in memory */ }
  memory = items;
  listeners.forEach((fn) => fn());
};
let memory = read();

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

const isNetworkFailure = (err) => !(err instanceof ApiError) || err.status >= 500 || err.status === 0;
// A lapsed sign-in is not a bad knock: keep it and send after signing in.
const isSignedOut = (err) => err instanceof ApiError && err.status === 401;

export const pendingCount = () => memory.length;

// Sign-out on a shared phone: the next person must not send these as theirs.
export function clearOutbox() {
  lastError = null;
  write([]);
}

export async function logContact(input) {
  const item = { ...input, client_id: input.client_id || uuid(), queued_at: new Date().toISOString() };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    write([...memory, item]);
    return { queued: true, client_id: item.client_id };
  }
  try {
    const { queued_at: _q, ...body } = item;
    const result = await action('contact.log', body);
    return { queued: false, result, client_id: item.client_id };
  } catch (err) {
    if (!isNetworkFailure(err) && !isSignedOut(err)) throw err;
    write([...memory, item]);
    return { queued: true, signedOut: isSignedOut(err), client_id: item.client_id };
  }
}

export async function flushOutbox() {
  if (flushing || memory.length === 0) return { sent: 0, left: memory.length };
  flushing = true; lastError = null; listeners.forEach((fn) => fn());
  let sent = 0;
  try {
    while (memory.length) {
      const [next, ...rest] = memory;
      const { queued_at: _q, ...body } = next;
      try {
        await action('contact.log', body);
      } catch (err) {
        if (isNetworkFailure(err)) { lastError = 'Still offline — will retry'; break; }
        if (isSignedOut(err)) { lastError = 'Sign in again to send your saved knocks'; break; }
        // Permanent failure (e.g. person deleted): drop it, but say so.
        lastError = `A queued knock was refused: ${err.message}`;
      }
      write(rest);
      sent += 1;
    }
  } finally {
    flushing = false;
    listeners.forEach((fn) => fn());
  }
  return { sent, left: memory.length };
}

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const snapshot = () => `${memory.length}|${flushing}|${lastError || ''}`;

export function useOutbox() {
  const snap = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [, n, f, e] = snap.match(/^(\d+)\|(true|false)\|(.*)$/) || [];
  return { pending: Number(n) || 0, flushing: f === 'true', lastError: e || null, flush: flushOutbox };
}

// Mount once (Shell): flush on reconnect, on focus, and every 30s while pending.
export function useOutboxAutoFlush(onFlushed) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const go = async () => {
      if (!memory.length) return;
      const r = await flushOutbox();
      if (r.sent && onFlushed) onFlushed(r);
      setTick((t) => t + 1);
    };
    window.addEventListener('online', go);
    window.addEventListener('focus', go);
    const id = setInterval(go, 30000);
    go();
    return () => {
      window.removeEventListener('online', go);
      window.removeEventListener('focus', go);
      clearInterval(id);
    };
  }, [onFlushed]);
  return tick;
}
