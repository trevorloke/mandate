// Admin shell — tab nav between sub-panels.
import React, { useState } from 'react';
import './admin.css';
import { useAuth } from '../auth/AuthContext';
import { useT } from '../i18n';
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
import AdminReports from './AdminReports';

const TAB_KEYS = [
  { k: 'home',       min: 'viewer' },
  { k: 'workspace',  min: 'viewer' },
  { k: 'workspaces', min: 'super_admin' },
  { k: 'users',      min: 'admin' },
  { k: 'data',       min: 'viewer' },
  { k: 'trash',      min: 'editor' },
  { k: 'tokens',     min: 'viewer' },
  { k: 'webhooks',   min: 'admin' },
  { k: 'forms',      min: 'admin' },
  { k: 'reports',    min: 'admin' },
  { k: 'sso',        min: 'admin' },
  { k: 'activity',   min: 'admin' },
  { k: 'audit',      min: 'admin' },
  { k: 'profile',    min: 'viewer' },
];

export default function Admin() {
  const { user, has } = useAuth();
  const t = useT();
  const visible = TAB_KEYS.filter(x => has(x.min));
  const [tab, setTab] = useState('home');

  return (
    <div className="adm">
      <header className="adm__head">
        <div>
          <div className="adm__plate">Mandate · Administration</div>
          <h1 className="adm__title">{t('admin.title').split('{em_access}')[0]}<em>{t('admin.title_em')}</em>{t('admin.title').split('{em_access}')[1] || ''}</h1>
          <p className="adm__sub">{t('admin.sub')}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="adm__plate">{t('admin.signed_in_as')}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, marginTop: 2 }}>
            {user.name} <span style={{ color: 'var(--ink-5)', fontSize: 13 }}>· {user.role.replace('_', ' ')}</span>
          </div>
        </div>
      </header>

      <nav className="adm__nav">
        {visible.map(x => (
          <button key={x.k} className={`adm__nav-btn ${tab === x.k ? 'is-on' : ''}`} onClick={() => setTab(x.k)}>
            {t(`admin.tabs.${x.k}`)} <small>{t(`admin.tab_hints.${x.k}`)}</small>
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
      {tab === 'reports' && has('admin') && <AdminReports />}
      {tab === 'sso' && has('admin') && <AdminOauth />}
      {tab === 'activity' && has('admin') && <AdminActivity />}
      {tab === 'audit' && has('admin') && <AdminAudit />}
      {tab === 'profile' && <AdminProfile />}
    </div>
  );
}
