// App chrome. The sidebar is deliberately short — the seven things a campaign
// actually does: Today · Map · People · Shifts · Money · Signs · Outreach.
// Top bar on desktop, bottom tab bar on phones (field mode lives on /map).
// Managers reach Team from the header. Keyboard: 'n' anywhere → log a gift.
import { Suspense, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, initials } from './api.js';

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

export default function Shell({ me }) {
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

  const signOut = async () => {
    await apiPost('/auth/logout');
    queryClient.clear();
    navigate('/login');
  };

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="brand">Starbase</NavLink>
          <nav className="links" aria-label="Main">
            {nav.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label}</NavLink>)}
          </nav>
          <span className="spacer" />
          <span className="ws">{me.workspace.name}</span>
          {me.role === 'manager' && <NavLink to="/team" className="btn btn-quiet">Team</NavLink>}
          <span className="avatar" title={me.user.name}>{initials(me.user.name)}</span>
          <button type="button" className="btn btn-quiet" onClick={signOut}>Sign out</button>
        </div>
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
