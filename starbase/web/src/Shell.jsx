// App chrome. The sidebar is deliberately short — the seven things a campaign
// actually does: Today · Map · People · Shifts · Money · Signs · Outreach.
// Top bar on desktop, bottom tab bar on phones (field mode lives on /map).
// Managers reach Team from the header. Keyboard: 'n' anywhere → log a gift.
// Under the nav, a slim strip says when the phone is offline or knocks are
// still waiting in the outbox (src/offline.js), with a "Send now" button.
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, initials } from './api.js';
import { pendingCount, useOutbox, useOutboxAutoFlush, clearOutbox } from './offline.js';
import './pages/offline.css';

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

const NAV = [
  { to: '/',         label: 'Today',    end: true },
  { to: '/map',      label: 'Map' },
  { to: '/people',   label: 'People' },
  { to: '/shifts',   label: 'Shifts' },
  { to: '/money',    label: 'Money',    desk: true },
  { to: '/signs',    label: 'Signs' },
  { to: '/outreach', label: 'Outreach', desk: true },
];

// Everything a sent knock can change (ratings, doors left, the brief).
const FLUSHED_KEYS = [['doors'], ['brief'], ['turfs'], ['turf'], ['person'], ['persons'], ['contacts']];

function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

const knocks = (n) => `${n} ${n === 1 ? 'knock' : 'knocks'}`;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function OfflineBanner({ online, outbox, onSend, notice, onDismissNotice }) {
  const { pending, flushing, lastError } = outbox;
  const [hiddenError, setHiddenError] = useState(null);
  // "Still offline" is the outbox's retry note; a refusal is worth showing
  // (once) even after the queue has emptied.
  const refused = lastError && !/still offline/i.test(lastError) ? lastError : null;
  const showRefused = Boolean(refused && refused !== hiddenError);
  if (online && pending === 0 && !showRefused && !notice) return null;

  let text;
  if (!online) text = pending > 0 ? `Offline — ${knocks(pending)} saved on this phone` : 'Offline — knocks are saved on this phone';
  else if (pending > 0) text = flushing ? `Sending ${knocks(pending)}…` : `${knocks(pending)} waiting to send`;

  return (
    <div className={`offline-strip${online ? '' : ' is-offline'}${text ? '' : ' is-refused'}`} role="status" aria-live="polite">
      <div className="offline-strip__inner">
        <span className="offline-strip__dot" aria-hidden="true" />
        {text && <span className="offline-strip__text">{text}</span>}
        {!online && pending > 0 && <span className="offline-strip__hint">Sends when you're back online</span>}
        {online && pending > 0 && (
          <button type="button" className="btn btn-primary offline-strip__btn" onClick={onSend} disabled={flushing}>
            {flushing ? 'Sending…' : 'Send now'}
          </button>
        )}
        {showRefused && (
          <span className="offline-strip__error">
            {refused}
            <button type="button" className="btn btn-quiet offline-strip__btn" onClick={() => setHiddenError(refused)}>
              Dismiss
            </button>
          </span>
        )}
        {notice && (
          <span className="offline-strip__error">
            {notice}
            <button type="button" className="btn btn-quiet offline-strip__btn" onClick={onDismissNotice}>
              Dismiss
            </button>
          </span>
        )}
      </div>
    </div>
  );
}

// RequireAuth renders the shell once ['me'] isn't loading. A check that went
// out with no signal is *paused* (not loading, no data, no error), so there
// is no user yet: say so instead of crashing. It resumes by itself when the
// signal comes back — then the app opens, or a dead session goes to login.
function WaitingForSignal() {
  const { pending } = useOutbox();
  return (
    <main className="page offline-gate">
      <span className="eyebrow">Starbase · offline</span>
      <h1 className="offline-gate__title">Waiting for signal</h1>
      <p>Starbase needs signal to check you&rsquo;re signed in. It opens by itself once you&rsquo;re back online.</p>
      {pending > 0 && <p className="offline-gate__saved">{knocks(pending)} saved on this phone — {pending === 1 ? 'it sends' : 'they send'} once you&rsquo;re signed in.</p>}
    </main>
  );
}

export default function Shell({ me }) {
  if (!me?.user || !me?.workspace) return <WaitingForSignal />;
  return <SignedInShell me={me} />;
}

function SignedInShell({ me }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const canMoney = me.role !== 'volunteer';
  const nav = NAV.filter((n) => canMoney || !n.desk); // volunteers: field screens only
  useEffect(() => {
    if (!canMoney) return undefined;
    const onKey = (e) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      navigate('/money?new=1');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, canMoney]);

  // Offline outbox: send queued knocks on reconnect / focus / every 30s, then
  // refresh every screen that shows what they changed.
  const online = useOnline();
  const outbox = useOutbox();
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;
  const [notice, setNotice] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const onFlushed = useCallback(() => {
    for (const queryKey of FLUSHED_KEYS) queryClient.invalidateQueries({ queryKey });
  }, [queryClient]);
  useOutboxAutoFlush(onFlushed);
  const sendNow = async () => {
    const r = await outbox.flush();
    if (r.sent) onFlushed(r);
  };

  // Queued knocks are sent under whoever is signed in when they go out, so
  // they must leave before this person signs out — never with the next one.
  const signOut = async () => {
    if (signingOut) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setNotice('Sign out needs signal — try again when you’re back online');
      return;
    }
    setNotice(null);
    setSigningOut(true);
    try {
      // An automatic send may already be running: let it finish, then send the rest.
      for (let i = 0; i < 40 && outboxRef.current.flushing; i += 1) await wait(250);
      if (pendingCount() > 0) {
        const r = await outbox.flush();
        if (r.sent) onFlushed(r);
      }
      const left = pendingCount();
      if (left > 0) {
        const ok = window.confirm(
          `${knocks(left)} couldn’t send yet. If you sign out now, ${left === 1 ? 'it is' : 'they are'} deleted from this phone.\n\nSign out anyway?`,
        );
        if (!ok) {
          setNotice('Sign out once your saved knocks have sent');
          return;
        }
      }
      await apiPost('/auth/logout');
      queryClient.clear();
      if (left > 0) clearOutbox(); // the next person on this phone must not send them as theirs
      navigate('/login');
    } catch {
      setNotice('Couldn’t sign out — check your signal and try again');
    } finally {
      setSigningOut(false);
    }
  };

  // The map sizes itself to the viewport minus the nav (measured on resize).
  // The strip lives inside the nav, so when the nav's height changes — strip
  // shown, hidden or wrapping — nudge the map (and Leaflet) to re-measure.
  const headerRef = useRef(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let last = el.getBoundingClientRect().height;
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height;
      if (h === last) return;
      last = h;
      window.dispatchEvent(new Event('resize'));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <>
      <header className="nav" ref={headerRef}>
        <div className="nav-inner">
          <NavLink to="/" className="brand">Starbase</NavLink>
          <nav className="links" aria-label="Main">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>
          <span className="spacer" />
          <span className="ws">{me.workspace.name}</span>
          {me.role === 'manager' && <NavLink to="/team" className="btn btn-quiet">Team</NavLink>}
          <span className="avatar" title={me.user.name}>{initials(me.user.name)}</span>
          <button type="button" className="btn btn-quiet" onClick={signOut} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
        <OfflineBanner
          online={online}
          outbox={outbox}
          onSend={sendNow}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
        />
      </header>
      <main className="page">
        <Suspense fallback={<p className="muted">Loading…</p>}>
          <Outlet context={{ me }} />
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Main (mobile)" style={{ gridTemplateColumns: `repeat(${nav.length}, 1fr)` }}>
        {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
      </nav>
    </>
  );
}
