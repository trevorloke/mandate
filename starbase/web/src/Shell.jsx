// App chrome. The nav is the handful of things each role actually does:
//   desk (staff, treasurer, manager): Today · Map · People · Shifts · Money · Signs · Outreach
//   volunteer:                        Today · Map · Calls · Shifts
// Top bar on desktop, a big-label tab bar on phones (field mode lives on /map):
// every label whole at 390px, never cut off ("OUTREACH", not "OUTRE…").
// One account menu (the avatar) holds the name, the campaign, Team (managers)
// and Sign out. Keyboard: 'n' anywhere → log a gift (desk roles).
// Under the nav, a slim strip says when the phone is offline or knocks are
// still waiting in the outbox (src/offline.js), with a "Send now" button.
import { Suspense, useCallback, useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, initials } from './api.js';
import { pendingCount, useOutbox, useOutboxAutoFlush, clearOutbox } from './offline.js';
import './pages/offline.css';

// Staff, treasurers and managers. App.jsx guards the desk-only routes with it.
export const isDesk = (me) => Boolean(me?.role) && me.role !== 'volunteer';

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

// Simple line icons for the phone tab bar (24×24, stroke = currentColor).
const ICONS = {
  today: <><path d="M3.5 10.5 12 4l8.5 6.5" /><path d="M5.5 9v11h13V9" /><path d="M10 20v-5.5h4V20" /></>,
  map: <><path d="M12 21s-6.5-5.8-6.5-11a6.5 6.5 0 0 1 13 0c0 5.2-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.6-3.6 2.9-5.6 6-5.6s5.4 2 6 5.6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.6 14.4c2.3.2 3.9 1.9 4.4 5.1" /></>,
  calls: <path d="M6.5 3.5h3l1.6 4.3-2.1 1.4a10.5 10.5 0 0 0 5.8 5.8l1.4-2.1 4.3 1.6v3a2 2 0 0 1-2.1 2A15.5 15.5 0 0 1 4.5 5.6a2 2 0 0 1 2-2.1z" />,
  shifts: <><rect x="3.5" y="5" width="17" height="15.5" rx="1.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  money: <><circle cx="12" cy="12" r="8.5" /><path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.8.8-2.8 2s1.2 1.6 2.8 1.9 2.8.8 2.8 2.1-1.2 2.1-2.8 2.1c-1.3 0-2.4-.5-2.9-1.5M12 6v12" /></>,
  signs: <><rect x="4" y="4" width="16" height="10" rx="1" /><path d="M12 14v7M9 21h6" /></>,
  outreach: <><path d="M4 10v4h3l7 4.5v-13L7 10H4z" /><path d="M17 9.5a3.5 3.5 0 0 1 0 5M19.2 7a7 7 0 0 1 0 10" /></>,
};
const Icon = ({ name }) => (
  <svg className="tab-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    {ICONS[name]}
  </svg>
);

const NAV_DESK = [
  { to: '/',         label: 'Today',    end: true, icon: 'today' },
  { to: '/map',      label: 'Map',      icon: 'map' },
  { to: '/people',   label: 'People',   icon: 'people' },
  { to: '/shifts',   label: 'Shifts',   icon: 'shifts' },
  { to: '/money',    label: 'Money',    icon: 'money' },
  { to: '/signs',    label: 'Signs',    icon: 'signs' },
  { to: '/outreach', label: 'Outreach', icon: 'outreach' },
];
// Volunteers request signs at the door card, so Signs isn't a tab for them.
const NAV_VOLUNTEER = [
  { to: '/',       label: 'Today',  end: true, icon: 'today' },
  { to: '/map',    label: 'Map',    icon: 'map' },
  { to: '/calls',  label: 'Calls',  icon: 'calls' },
  { to: '/shifts', label: 'Shifts', icon: 'shifts' },
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
  if (!online) text = pending > 0 ? `Offline — ${knocks(pending)} saved` : 'Offline — knocks save on this phone';
  else if (pending > 0) text = flushing ? `Sending ${knocks(pending)}…` : `${knocks(pending)} waiting to send`;

  return (
    <div className={`offline-strip${online ? '' : ' is-offline'}${text ? '' : ' is-refused'}`} role="status" aria-live="polite">
      <div className="offline-strip__inner">
        <span className="offline-strip__dot" aria-hidden="true" />
        {text && <span className="offline-strip__text">{text}</span>}
        {!online && pending > 0 && <span className="offline-strip__hint">Sends when you're back online</span>}
        {/* Not yellow: the screen under the strip keeps its one primary button. */}
        {online && pending > 0 && (
          <button type="button" className="btn offline-strip__btn" onClick={onSend} disabled={flushing}>
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
      <span className="eyebrow">Offline</span>
      <h1 className="offline-gate__title">Waiting for signal</h1>
      <p>Opens by itself when you&rsquo;re back online.</p>
      {pending > 0 && <p className="offline-gate__saved">{knocks(pending)} saved on this phone</p>}
    </main>
  );
}

// ── Account menu: avatar → name, campaign, Team (managers), Sign out ──
// A disclosure (button + panel), not a full ARIA menu: Tab moves through it,
// Escape or a tap outside closes it, and a new screen closes it too.
function AccountMenu({ me, signingOut, confirmLeft, onSignOut, onCancelSignOut }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const firstRef = useRef(null);
  const stayRef = useRef(null);
  const location = useLocation();

  const close = useCallback((refocus) => {
    setOpen(false);
    onCancelSignOut();
    if (refocus) btnRef.current?.focus();
  }, [onCancelSignOut]);

  useEffect(() => { close(false); }, [location.pathname, close]);
  useEffect(() => {
    if (!open) return undefined;
    firstRef.current?.focus();
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) close(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, close]);
  // The "send first?" question only lives while the menu is open.
  useEffect(() => {
    if (confirmLeft > 0) { setOpen(true); stayRef.current?.focus(); }
  }, [confirmLeft]);

  return (
    <div className="acct" ref={wrapRef}
      onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close(true); } }}>
      <button type="button" ref={btnRef} className="acct-btn" aria-expanded={open} aria-controls={panelId}
        aria-label={`Account — ${me.user.name}`} onClick={() => (open ? close(false) : setOpen(true))}>
        <span className="avatar" aria-hidden="true">{initials(me.user.name)}</span>
      </button>
      <div className="acct-panel" id={panelId} hidden={!open}>
        <div className="acct-who">
          <span className="acct-name">{me.user.name}</span>
          <span className="acct-ws">{me.workspace.name}</span>
        </div>
        {me.role === 'manager' && <NavLink to="/team" ref={firstRef} className="acct-item">Team</NavLink>}
        {confirmLeft > 0 ? (
          <div className="acct-confirm" role="group" aria-label="Sign out">
            <p>{knocks(confirmLeft)} not sent. Sign out and delete {confirmLeft === 1 ? 'it' : 'them'}?</p>
            <div className="acct-confirm__row">
              <button type="button" className="btn acct-danger" onClick={() => onSignOut(true)} disabled={signingOut}>
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
              <button type="button" ref={stayRef} className="btn btn-quiet" onClick={() => close(true)} disabled={signingOut}>Stay</button>
            </div>
          </div>
        ) : (
          <button type="button" ref={me.role === 'manager' ? undefined : firstRef} className="acct-item"
            onClick={() => onSignOut(false)} disabled={signingOut}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Shell({ me }) {
  if (!me?.user || !me?.workspace) return <WaitingForSignal />;
  return <SignedInShell me={me} />;
}

function SignedInShell({ me }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const desk = isDesk(me);
  const nav = desk ? NAV_DESK : NAV_VOLUNTEER;
  useEffect(() => {
    if (!desk) return undefined;
    const onKey = (e) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      navigate('/money?new=1');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, desk]);

  // Offline outbox: send queued knocks on reconnect / focus / every 30s, then
  // refresh every screen that shows what they changed.
  const online = useOnline();
  const outbox = useOutbox();
  const outboxRef = useRef(outbox);
  outboxRef.current = outbox;
  const [notice, setNotice] = useState(null);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmLeft, setConfirmLeft] = useState(0);
  const cancelSignOut = useCallback(() => setConfirmLeft(0), []);
  const onFlushed = useCallback(() => {
    for (const queryKey of FLUSHED_KEYS) queryClient.invalidateQueries({ queryKey });
    // Knocks just went out, so the signal is back: an old "needs signal" note is stale.
    setNotice(null);
  }, [queryClient]);
  // "Sign out needs signal" / "Couldn't sign out — check your signal" are
  // about the signal: they go by themselves once the phone is back online.
  useEffect(() => { if (online) setNotice(null); }, [online]);
  useOutboxAutoFlush(onFlushed);
  const sendNow = async () => {
    const r = await outbox.flush();
    if (r.sent) onFlushed(r);
  };

  // Queued knocks are sent under whoever is signed in when they go out, so
  // they must leave before this person signs out — never with the next one.
  // Any still stuck: ask in place ("2 knocks not sent. Sign out? · Stay").
  const signOut = async (force) => {
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
      if (left > 0 && !force) {
        setConfirmLeft(left);
        return;
      }
      await apiPost('/auth/logout');
      queryClient.clear();
      if (left > 0) clearOutbox(); // the next person on this phone must not send them as theirs
      setConfirmLeft(0);
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
          <AccountMenu me={me} signingOut={signingOut} confirmLeft={confirmLeft}
            onSignOut={signOut} onCancelSignOut={cancelSignOut} />
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
      <nav className="tabbar" aria-label="Main (mobile)" data-count={nav.length}
        style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(min-content, 1fr))` }}>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon name={n.icon} />
            <span className="tab-label">{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
