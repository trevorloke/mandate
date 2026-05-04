import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../auth/api';

export default function AdminAudit() {
  const [log, setLog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    (async () => {
      try { const { log } = await api.audit(500); setLog(log); }
      finally { setLoading(false); }
    })();
  }, []);

  const actions = useMemo(() => Array.from(new Set(log.map(r => r.action))).sort(), [log]);
  const actors  = useMemo(() => {
    const m = new Map();
    log.forEach(r => { if (r.userId) m.set(r.userId, r.actorName || r.actorEmail || r.userId); });
    return Array.from(m, ([id, name]) => ({ id, name })).sort((a,b) => a.name.localeCompare(b.name));
  }, [log]);

  const filtered = useMemo(() => log.filter(r => {
    if (actionFilter !== 'all' && r.action !== actionFilter) return false;
    if (actorFilter  !== 'all' && r.userId !== actorFilter) return false;
    return true;
  }), [log, actionFilter, actorFilter]);

  if (loading) return <p className="adm__msg">Loading…</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p className="adm__msg" style={{ margin: 0 }}>
          {filtered.length === log.length
            ? <>Last {log.length} actions, most recent first.</>
            : <>{filtered.length} of {log.length} match.</>}
        </p>
        <a className="adm__btn adm__btn--ghost adm__btn-sm" href="/api/audit/export" download>↑ Export CSV</a>
      </div>

      <div className="adm__filters">
        <select className="adm__filter-chip" value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="all">Action: all</option>
          {actions.map(a => <option key={a} value={a}>Action: {a}</option>)}
        </select>
        <select className="adm__filter-chip" value={actorFilter} onChange={e => setActorFilter(e.target.value)}>
          <option value="all">Actor: anyone</option>
          {actors.map(a => <option key={a.id} value={a.id}>Actor: {a.name}</option>)}
        </select>
        {(actionFilter !== 'all' || actorFilter !== 'all') && (
          <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => { setActionFilter('all'); setActorFilter('all'); }}>Clear</button>
        )}
      </div>

      <div className="adm__log">
        {filtered.length === 0 && <div className="adm__log-row"><span>No entries match.</span></div>}
        {filtered.map(r => {
          const isOpen = openId === r.id;
          const hasMeta = r.meta && Object.keys(r.meta).length > 0;
          const hasDiff = r.meta && r.meta.prev && r.meta.next;
          return (
            <React.Fragment key={r.id}>
              <div
                className="adm__log-row"
                style={{ cursor: hasMeta ? 'pointer' : 'default' }}
                onClick={() => hasMeta && setOpenId(isOpen ? null : r.id)}
              >
                <span className="adm__log-time">{new Date(r.createdAt).toLocaleString()}</span>
                <span className="adm__log-actor">{r.actorName || r.actorEmail || 'system'}</span>
                <span className="adm__log-action">{r.action}</span>
                <span className="adm__log-meta">
                  {r.target && <span style={{ marginRight: 8, color: 'var(--ink-5)' }}>→ {r.target.slice(0, 28)}</span>}
                  {hasMeta && (isOpen ? '▾' : '▸')}
                </span>
              </div>
              {isOpen && hasMeta && (
                <div className="adm__log-detail">
                  {hasDiff
                    ? <DiffView prev={r.meta.prev} next={r.meta.next} />
                    : <pre className="adm__log-meta-pre">{JSON.stringify(r.meta, null, 2)}</pre>}
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function DiffView({ prev, next }) {
  const allKeys = Array.from(new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])).sort();
  const changed = allKeys.filter(k => JSON.stringify(prev?.[k]) !== JSON.stringify(next?.[k]));

  if (changed.length === 0) {
    return <div className="adm__msg">No field changes.</div>;
  }

  return (
    <div className="adm__diff">
      <div className="adm__diff-h">Field changes — {changed.length}</div>
      {changed.map(k => (
        <div key={k} className="adm__diff-row">
          <div className="adm__diff-key">{k}</div>
          <div className="adm__diff-prev">{format(prev?.[k])}</div>
          <span className="adm__diff-arrow">→</span>
          <div className="adm__diff-next">{format(next?.[k])}</div>
        </div>
      ))}
    </div>
  );
}

function format(v) {
  if (v == null) return <em style={{ color: 'var(--ink-6)' }}>—</em>;
  if (typeof v === 'object') return <code>{JSON.stringify(v).slice(0, 80)}</code>;
  return String(v).slice(0, 100);
}
