// User menu — avatar dropdown with profile, admin, logout.
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../auth/AuthContext';
import './UserMenu.css';

export default function UserMenu({ onAdmin }) {
  const { user, workspace, logout, has } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    if (open) document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (!user) return null;

  return (
    <div className="usrm" ref={ref}>
      <button className="mdt__avatar usrm__avatar" onClick={() => setOpen(o => !o)}>
        {user.initials || 'MR'}
      </button>
      {open && (
        <div className="usrm__pop">
          <div className="usrm__head">
            <div className="usrm__name">{user.name}</div>
            <div className="usrm__email">{user.email}</div>
            <div className="usrm__role">
              <span>{user.role.replace('_', ' ')}</span>
              {workspace && <em> · {workspace.name}</em>}
            </div>
          </div>
          <div className="usrm__sep" />
          <button className="usrm__item" onClick={() => { setOpen(false); onAdmin(); }}>
            <span className="usrm__k">My account</span>
            <span className="usrm__h">Profile · password</span>
          </button>
          {has('admin') && (
            <button className="usrm__item" onClick={() => { setOpen(false); onAdmin(); }}>
              <span className="usrm__k">Admin</span>
              <span className="usrm__h">Workspace · users · data</span>
            </button>
          )}
          <div className="usrm__sep" />
          <button className="usrm__item usrm__item--danger" onClick={() => { setOpen(false); logout(); }}>
            <span className="usrm__k">Sign out</span>
            <span className="usrm__h">End session</span>
          </button>
        </div>
      )}
    </div>
  );
}
