import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// app.css first: page stylesheets (imported by App's pages) must load after
// the shared primitives so single-class page rules can override them.
import './app.css';
import App from './App.jsx';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => (error?.status === 401 || error?.status === 404 ? false : failureCount < 1),
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

// ── Opening the app with no signal ──
// The auth gate needs ['me']; with no network that fetch fails and would bounce
// a volunteer to the login screen (which also needs the network), stranding
// any knocks saved on the phone. So remember the signed-in user (name, email,
// workspace, role — no voter data) and, only when the phone is offline at
// startup, seed it so the app opens. Back online, it refetches as usual and a
// dead session still lands on login. Sign-out (queryClient.clear) or a 401
// forgets it.
const ME_KEY = 'starbase:me:v1';
const isMeKey = (key) => key.length === 1 && key[0] === 'me';
const forgetMe = () => { try { localStorage.removeItem(ME_KEY); } catch { /* storage blocked */ } };

if (typeof navigator !== 'undefined' && navigator.onLine === false) {
  try {
    const saved = JSON.parse(localStorage.getItem(ME_KEY) || 'null');
    if (saved?.user?.id && saved?.workspace?.id) queryClient.setQueryData(['me'], saved);
  } catch { /* nothing usable saved */ }
  // react-query assumes it starts online and only refetches on an
  // offline→online *change*. Opened with no signal there is no such change,
  // so screens whose fetch failed would stay failed once signal returns.
  // On the first 'online', refetch them, and re-check the sign-in (a dead
  // session then lands on login).
  window.addEventListener('online', () => {
    queryClient.refetchQueries({
      type: 'active',
      predicate: (q) => isMeKey(q.queryKey) || q.state.status === 'error' || q.isStale(),
    });
  }, { once: true });
}

queryClient.getQueryCache().subscribe((event) => {
  if (!isMeKey(event.query.queryKey)) return;
  if (event.type === 'removed') { forgetMe(); return; }
  if (event.type !== 'updated') return;
  const { status, data, error } = event.query.state;
  if (status === 'success' && data?.user?.id) {
    try { localStorage.setItem(ME_KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  } else if (status === 'error' && (error?.status === 401 || error?.status === 403)) {
    forgetMe();
  }
});

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </QueryClientProvider>,
);

// Service worker: app shell + map tiles for the field (public/sw.js). Only in
// production builds — in dev it would cache Vite's modules and fight HMR.
if (import.meta.env.PROD && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* app still works online */ });
  });
}
