// Admin shell — tab nav between sub-panels.
import React, { useState } from 'react';
import './admin.css';
import { useAuth } from '../auth/AuthContext';
import AdminHome from './AdminHome';
import AdminUsers from './AdminUsers';
import AdminWorkspace from './AdminWorkspace';
import AdminWorkspaces from './AdminWorkspaces';
import AdminProfile from './AdminProfile';
import AdminAudit from './AdminAudit';
import AdminData from './AdminData';
import AdminTokens from './AdminTokens';
import AdminTrash from './AdminTrash';
import AdminWebhooks from './AdminWebhooks';
import AdminActivity from './AdminActivity';
import AdminForms from './AdminForms';
import AdminOauth from './AdminOauth';

const TABS = [
  { k: 'home',       label: 'Overview',    hint: 'dashboard', min: 'viewer' },
  { k: 'workspace',  label: 'Workspace',   hint: 'identity',  min: 'viewer' },
  { k: 'workspaces', label: 'Workspaces',  hint: 'tenants',   min: 'super_admin' },
  { k: 'users',      label: 'Users',       hint: 'access',    min: 'admin' },
  { k: 'data',       label: 'Module data', hint: 'records',   min: 'viewer' },
  { k: 'trash',      label: 'Trash',       hint: 'restore',   min: 'editor' },
  { k: 'tokens',     label: 'API tokens',  hint: 'integrations', min: 'viewer' },
  { k: 'webhooks',   label: 'Webhooks',    hint: 'event push', min: 'admin' },
  { k: 'forms',      label: 'Forms',       hint: 'public submit', min: 'admin' },
  { k: 'sso',        label: 'SSO',         hint: 'oauth', min: 'admin' },
  { k: 'activity',   label: 'Activity',    hint: 'live feed', min: 'admin' },
  { k: 'audit',      label: 'Audit log',   hint: 'history',   min: 'admin' },
  { k: 'profile',    label: 'My account',  hint: 'profile',   min: 'viewer' },
];

export default function Admin() {
  const { user, has } = useAuth();
  const visible = TABS.filter(t => has(t.min));
  const [tab, setTab] = useState('home');

  return (
    <div className="adm">
      <header className="adm__head">
        <div>
          <div className="adm__plate">Mandate · Administration</div>
          <h1 className="adm__title">Settings &amp; <em>access</em></h1>
          <p className="adm__sub">Configure the workspace, manage users, populate module data.</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="adm__plate">Signed in as</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginTop: 2 }}>
            {user.name} <span style={{ color: 'var(--ink-5)', fontSize: 13 }}>· {user.role.replace('_', ' ')}</span>
          </div>
        </div>
      </header>

      <nav className="adm__nav">
        {visible.map(t => (
          <button key={t.k} className={`adm__nav-btn ${tab === t.k ? 'is-on' : ''}`} onClick={() => setTab(t.k)}>
            {t.label} <small>{t.hint}</small>
          </button>
        ))}
      </nav>

      {tab === 'home'       && <AdminHome onNav={setTab} />}
      {tab === 'workspace'  && <AdminWorkspace />}
      {tab === 'workspaces' && has('super_admin') && <AdminWorkspaces />}
      {tab === 'users' && has('admin') && <AdminUsers />}
      {tab === 'data' && <AdminData />}
      {tab === 'trash' && has('editor') && <AdminTrash />}
      {tab === 'tokens' && <AdminTokens />}
      {tab === 'webhooks' && has('admin') && <AdminWebhooks />}
      {tab === 'forms' && has('admin') && <AdminForms />}
      {tab === 'sso' && has('admin') && <AdminOauth />}
      {tab === 'activity' && has('admin') && <AdminActivity />}
      {tab === 'audit' && has('admin') && <AdminAudit />}
      {tab === 'profile' && <AdminProfile />}
    </div>
  );
}
