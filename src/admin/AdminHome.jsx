// Admin home — overview stats, recent activity, quick actions.
import React, { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { SCHEMAS } from './schemas';

const KIND_LIST = [
  'ground.voter','ground.canvasser','ground.shift',
  'beacon.account','beacon.post','beacon.mention',
  'raise.donor','raise.prospect','raise.gift',
  'ledger.journal','ledger.bill','ledger.account',
  'coalition.org','coalition.endorsement','coalition.ask',
  'civic.bill','civic.case','civic.promise',
  'opposition.target','opposition.claim','opposition.evidence',
  'site.page','events.event','academy.course',
];

export default function AdminHome({ onNav }) {
  const { user, workspace, has } = useAuth();
  const [stats, setStats] = useState(null);
  const [audit, setAudit] = useState([]);
  const [users, setUsers] = useState([]);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    (async () => {
      // Fetch counts in parallel
      const counts = {};
      let total = 0;
      await Promise.all(KIND_LIST.map(async (mk) => {
        const [m, k] = mk.split('.');
        try {
          const { records } = await api.listData(m, k);
          counts[mk] = records.length;
          total += records.length;
        } catch { counts[mk] = 0; }
      }));
      setStats({ counts, total });

      if (has('admin')) {
        try { const { log } = await api.audit(15); setAudit(log); } catch {}
        try { const { users } = await api.listUsers(); setUsers(users); } catch {}
        try { const { metrics } = await api.metrics(); setMetrics(metrics); } catch {}
      }
    })();
  }, [has]);

  if (!stats) return <p className="adm__msg">Loading…</p>;

  // Find biggest buckets
  const populated = Object.entries(stats.counts)
    .filter(([_, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const top = populated.slice(0, 6);

  const activeUsers = users.filter(u => u.active).length;

  return (
    <div>
      {/* Hero stats */}
      <div className="adm__stats">
        <div className="adm__stat-card">
          <div className="adm__stat-lbl">Records</div>
          <div className="adm__stat-v">{stats.total.toLocaleString()}</div>
          <div className="adm__stat-sub">{populated.length} populated buckets</div>
        </div>
        {has('admin') && (
          <div className="adm__stat-card">
            <div className="adm__stat-lbl">Users</div>
            <div className="adm__stat-v">{users.length}</div>
            <div className="adm__stat-sub">{activeUsers} active{users.length - activeUsers > 0 ? ` · ${users.length - activeUsers} disabled` : ''}</div>
          </div>
        )}
        <div className="adm__stat-card">
          <div className="adm__stat-lbl">Workspace</div>
          <div className="adm__stat-v" style={{ fontSize: 22 }}>{workspace?.name || '—'}</div>
          <div className="adm__stat-sub">{workspace?.phase} · T-{workspace?.daysToVote}d</div>
        </div>
        <div className="adm__stat-card">
          <div className="adm__stat-lbl">Your role</div>
          <div className="adm__stat-v" style={{ fontSize: 22, textTransform: 'capitalize' }}>
            {user?.role.replace('_', ' ')}
          </div>
          <div className="adm__stat-sub">{user?.email}</div>
        </div>
      </div>

      {/* Live ops snapshot — admin only */}
      {has('admin') && metrics && (
        <div className="adm__panel" style={{ maxWidth: 'none' }}>
          <div className="adm__panel-h">Operations · last 24h</div>
          <div className="adm__ops-row">
            <div><span>Live sessions</span><b>{metrics.liveSessions}</b></div>
            <div><span>Active tokens</span><b>{metrics.activeTokens}</b></div>
            <div><span>SSE subscribers</span><b>{metrics.sseSubscribers}</b></div>
            <div><span>Webhook deliveries</span><b>{metrics.deliveries24h}</b>{metrics.failedDeliveries24h > 0 && <em style={{ color: '#8b2418' }}>· {metrics.failedDeliveries24h} failed</em>}</div>
            <div><span>Form submissions</span><b>{metrics.formSubmissions24h}</b></div>
            <div><span>Memory · uptime</span><b>{metrics.memoryUsage.heapUsedMB}MB · {Math.floor(metrics.uptimeSeconds / 60)}m</b></div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="adm__panel" style={{ maxWidth: 'none' }}>
        <div className="adm__panel-h">Quick actions</div>
        <div className="adm__quickbar">
          {has('editor') && <button onClick={() => onNav('data')}>↗ Module data</button>}
          {has('admin')  && <button onClick={() => onNav('users')}>↗ Manage users</button>}
          {has('admin')  && <button onClick={() => onNav('workspace')}>↗ Workspace settings</button>}
          {has('admin')  && <button onClick={() => onNav('audit')}>↗ Audit log</button>}
          <button onClick={() => onNav('profile')}>↗ My profile</button>
        </div>
      </div>

      {/* Activity + populated buckets */}
      <div className="adm__home-grid">
        {has('admin') && (
          <div className="adm__home-card">
            <div className="adm__home-card-h">
              <h3 className="adm__home-card-title">Recent activity</h3>
              <span className="adm__home-card-subtitle">Last 15 actions</span>
            </div>
            <div className="adm__home-feed">
              {audit.length === 0 && <div className="adm__msg">No activity yet.</div>}
              {audit.map(r => (
                <div className="adm__home-feed-row" key={r.id}>
                  <span className="adm__home-feed-time">{relTime(r.createdAt)}</span>
                  <span className="adm__home-feed-action">{r.action}</span>
                  <span className="adm__home-feed-actor">{r.actorName || 'system'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="adm__home-card">
          <div className="adm__home-card-h">
            <h3 className="adm__home-card-title">Top buckets</h3>
            <span className="adm__home-card-subtitle">By record count</span>
          </div>
          <div className="adm__home-feed">
            {top.length === 0 && (
              <div className="adm__msg">
                No records yet. {has('editor') ? <button className="adm__btn adm__btn--ghost" style={{ marginLeft: 8 }} onClick={() => onNav('data')}>Load prototype data</button> : ''}
              </div>
            )}
            {top.map(([key, n]) => {
              const [m, k] = key.split('.');
              const schema = SCHEMAS[key];
              return (
                <div className="adm__home-feed-row" key={key} style={{ gridTemplateColumns: '1fr auto auto' }}>
                  <span style={{ fontFamily: 'var(--font-serif)', fontSize: 14, color: 'var(--ink)' }}>
                    {schema?.label || k} <span style={{ color: 'var(--ink-5)' }}>· {m}</span>
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink-3)' }}>{n.toLocaleString()}</span>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => onNav('data')}>Open</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function relTime(t) {
  const d = new Date(t);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return d.toLocaleDateString();
}
