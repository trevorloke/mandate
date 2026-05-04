// Trash bin — soft-deleted module records, with restore + permanent delete.
import React, { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { getSchema } from './schemas';

export default function AdminTrash() {
  const { has } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [filter, setFilter] = useState('all'); // module key or 'all'

  const load = async () => {
    setLoading(true);
    try { const { records } = await api.listTrash(); setItems(records); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const restore = async (r) => {
    try { await api.restoreData(r.module, r.kind, r.id); setMsg({ kind: 'ok', text: 'Restored.' }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const purge = async (r) => {
    if (!has('admin')) return;
    if (!confirm('Permanently delete this record? This cannot be undone.')) return;
    try { await api.purgeTrashItem(r.id); setMsg({ kind: 'ok', text: 'Purged.' }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const emptyTrash = async () => {
    if (!has('admin')) return;
    if (!confirm(`Permanently delete all ${items.length} trashed records? This cannot be undone.`)) return;
    try { const r = await api.emptyTrash(); setMsg({ kind: 'ok', text: `Purged ${r.count} records.` }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const modules = Array.from(new Set(items.map(r => r.module))).sort();
  const filtered = filter === 'all' ? items : items.filter(r => r.module === filter);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 16 }}>
        <p className="adm__msg" style={{ margin: 0 }}>
          Records here have been deleted but kept for safety. Restore returns them to their bucket; purge removes them forever.
        </p>
        {has('admin') && items.length > 0 && (
          <button className="adm__btn adm__btn--danger" onClick={emptyTrash}>Empty trash ({items.length})</button>
        )}
      </div>

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {modules.length > 1 && (
        <div className="adm__filters">
          <select className="adm__filter-chip" value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="all">Module: all</option>
            {modules.map(m => <option key={m} value={m}>Module: {m}</option>)}
          </select>
        </div>
      )}

      {loading ? <p className="adm__msg">Loading…</p> : filtered.length === 0 ? (
        <div className="adm__panel" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>
          <p style={{ fontStyle: 'italic', margin: 0 }}>{items.length === 0 ? 'Trash is empty.' : 'No records match this filter.'}</p>
        </div>
      ) : (
        <table className="adm__table">
          <thead>
            <tr><th>Module</th><th>Kind</th><th>Preview</th><th>Deleted</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const schema = getSchema(r.module, r.kind);
              return (
                <tr key={r.id}>
                  <td><span className="adm__role-pill">{r.module}</span></td>
                  <td>{schema?.label || r.kind}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                    {previewText(r.data)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink-5)' }}>{new Date(r.deletedAt).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => restore(r)}>Restore</button>
                    {has('admin') && <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => purge(r)}>Purge</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function previewText(data) {
  if (!data || typeof data !== 'object') return String(data);
  const entries = Object.entries(data).filter(([_, v]) => v != null && typeof v !== 'object');
  return entries.slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 30)}`).join('  ·  ');
}
