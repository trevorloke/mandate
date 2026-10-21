// App chrome: top nav (Today / People / Money / Filings), workspace name,
// user initials, sign out. Keyboard: 'n' anywhere → log a gift.
import { useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiPost, initials } from './api.js';

const isTyping = (el) =>
  el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);

export default function Shell({ me }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;
      e.preventDefault();
      navigate('/money?new=1');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const signOut = async () => {
    await apiPost('/auth/logout');
    queryClient.clear();
    navigate('/login');
  };

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <NavLink to="/" className="brand">Mandate</NavLink>
          <nav className="links" aria-label="Main">
            <NavLink to="/" end>Today</NavLink>
            <NavLink to="/people">People</NavLink>
            <NavLink to="/money">Money</NavLink>
            <NavLink to="/filings">Filings</NavLink>
          </nav>
          <span className="spacer" />
          <span className="ws">{me.workspace.name}</span>
          <span className="avatar" title={me.user.name}>{initials(me.user.name)}</span>
          <button type="button" className="btn btn-quiet" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="page">
        <Outlet context={{ me }} />
      </main>
    </>
  );
}
