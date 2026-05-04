// Workspace activity feed — like the audit log but readable to all viewers,
// auto-refreshes via SSE on data events.
import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { useRealtime } from '../auth/useRealtime';

// Human-friendly action labels
const ACTION_LABEL = {
  'data.create':      'created',
  'data.update':      'updated',
  'data.delete':      'deleted',
  'data.restore':     'restored',
  'data.purge':       'purged',
  'data.bulk_replace':'bulk-replaced',
  'auth.login':       'signed in',
  'auth.logout_all':  'signed out everywhere',
  'invite.create':    'invited a teammate',
  'invite.accept':    'accepted an invite',
  'token.create':     'created an API token',
  'token.revoke':     'revoked an API token',
  'webhook.create':   'created a webhook',
  'webhook.update':   'updated a webhook',
  'webhook.delete':   'deleted a webhook',
  'workspace.update': 'updated workspace settings',
  'workspace.import': 'imported a snapshot',
  'workspace.export': 'exported a snapshot',
  'workspace.clone':  'cloned a workspace',
  'totp.enable':      'enabled 2FA',
  'totp.disable':     'disabled 2FA',
  'password.reset':   'reset their password',
};

export default function AdminActivity() {
  const { has } = useAuth();
  const { on, connected } = useRealtime();
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const canSeeFull = has('admin');

  const refresh = useCallback(async () => {
    if (!canSeeFull) { setLoading(false); return; }
    try {
      const r = await api.audit(100);
      setLog(r.log);
    } finally { setLoading(false); }
  }, [canSeeFull]);

  useEffect(() => { refresh(); }, [refresh]);

  // Live: re-fetch when any data event fires in this workspace
  useEffect(() => {
    if (!canSeeFull) return;
    const offs = ['data.create', 'data.update', 'data.delete'].map(ev => on(ev, () => refresh()));
    return () => offs.forEach(off => off?.());
  }, [canSeeFull, on, refresh]);

  if (!canSeeFull) {
    return (
      <div className="adm__panel" style={{ textAlign: 'center' }}>
        <p className="adm__msg" style={{ fontStyle: 'italic' }}>Activity feed is visible to admins only.</p>
      </div>
    );
  }
  if (loading) return <p className="adm__msg">Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
        <p className="adm__msg" style={{ margin: 0 }}>
          Live workspace activity — {log.length} most recent events.
        </p>
        <span className="adm__activity-status">
          <span className={'adm__live-dot' + (connected ? ' is-on' : '')} />
          {connected ? 'Live' : 'Reconnecting…'}
        </span>
      </div>

      <div className="adm__activity">
        {log.length === 0 && <div className="adm__panel" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>No activity yet.</div>}
        {log.map(r => {
          const verb = ACTION_LABEL[r.action] || r.action;
          const moduleKind = r.meta?.module && r.meta?.kind ? `${r.meta.module} · ${r.meta.kind}` : null;
          return (
            <div className="adm__activity-row" key={r.id}>
              <span className="adm__activity-time">{relTime(r.createdAt)}</span>
              <span className="adm__activity-actor">
                <b>{r.actorName || r.actorEmail || 'system'}</b>
              </span>
              <span className="adm__activity-verb">{verb}</span>
              <span className="adm__activity-target">
                {moduleKind && <span className="adm__role-pill">{moduleKind}</span>}
                {r.target && <code style={{ marginLeft: 6, fontSize: 11, color: 'var(--ink-5)' }}>{r.target.slice(0, 18)}</code>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function relTime(t) {
  const sec = Math.floor((Date.now() - new Date(t).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return new Date(t).toLocaleDateString();
}
