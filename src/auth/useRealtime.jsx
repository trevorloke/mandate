// Realtime client — connects to SSE event stream once per session and:
//   - invalidates the live-data cache when records change
//   - exposes an event bus for components that want to listen to specific events
//
// Auto-reconnects with backoff. Stops if the user signs out.
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { invalidateLive } from './useLiveRecords';
import { useAuth } from './AuthContext';

const RealtimeCtx = createContext({ connected: false, lastEvent: null, on: () => () => {} });

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const listenersRef = useRef(new Map()); // event -> Set<fn>

  const emit = (event, data) => {
    setLastEvent({ event, data, at: Date.now() });
    const set = listenersRef.current.get(event);
    if (set) for (const fn of set) { try { fn(data); } catch {} }
    const wildcard = listenersRef.current.get('*');
    if (wildcard) for (const fn of wildcard) { try { fn({ event, data }); } catch {} }
  };

  const on = (event, fn) => {
    let set = listenersRef.current.get(event);
    if (!set) { set = new Set(); listenersRef.current.set(event, set); }
    set.add(fn);
    return () => set.delete(fn);
  };

  useEffect(() => {
    if (!user) { setConnected(false); return; }
    let es = null;
    let stopped = false;
    let backoff = 500;

    const connect = () => {
      if (stopped) return;
      try {
        es = new EventSource('/api/events/stream');
        es.addEventListener('open', () => { setConnected(true); backoff = 500; });
        es.addEventListener('error', () => {
          setConnected(false);
          es?.close();
          if (!stopped) {
            backoff = Math.min(backoff * 2, 15_000);
            setTimeout(connect, backoff);
          }
        });
        es.addEventListener('hello', (e) => { try { emit('hello', JSON.parse(e.data)); } catch {} });
        es.addEventListener('ping', () => { /* keepalive */ });

        for (const ev of ['data.create', 'data.update', 'data.delete']) {
          es.addEventListener(ev, (e) => {
            let d = {}; try { d = JSON.parse(e.data); } catch {}
            // Auto-invalidate the matching live cache bucket
            if (d.module && d.kind) invalidateLive(d.module, d.kind);
            emit(ev, d);
          });
        }
        for (const ev of ['notification.new']) {
          es.addEventListener(ev, (e) => {
            let d = {}; try { d = JSON.parse(e.data); } catch {}
            emit(ev, d);
          });
        }
      } catch {
        setConnected(false);
      }
    };

    connect();

    return () => {
      stopped = true;
      es?.close();
    };
  }, [user?.workspaceId]);

  return (
    <RealtimeCtx.Provider value={{ connected, lastEvent, on }}>
      {children}
    </RealtimeCtx.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeCtx);
