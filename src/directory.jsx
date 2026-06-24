// Directory — the cross-module database made visible. Search the canonical
// people, organizations, and places, and open a 360° profile that shows every
// module touchpoint at once. One record, every module. Editing it here
// propagates everywhere.
import { useState, useEffect, useCallback } from 'react';
import './directory.css';
import { api } from './auth/api';
import { useAuth } from './auth/AuthContext';

const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const TYPES = ['', 'person', 'org', 'place'];
const TYPE_LABEL = { person: 'Person', org: 'Organization', place: 'Place' };

function ModuleChip({ m }) {
  return <span className="dir-modchip" style={{ background: `var(--m-${m}, #6a645a)` }}>{cap(m)}</span>;
}

// A compact, generic view of a linked record's notable fields.
function RecordFacts({ record }) {
  if (!record) return null;
  const skip = new Set(['id', 'createdAt', 'updatedAt']);
  const entries = Object.entries(record).filter(([k, v]) => !skip.has(k) && v != null && v !== '' && typeof v !== 'object').slice(0, 5);
  return (
    <div className="dir-facts">
      {entries.map(([k, v]) => <span key={k} className="dir-fact"><b>{k}</b> {String(v)}</span>)}
    </div>
  );
}

function ProfileDrawer({ id, onClose, onChanged, canEdit }) {
  const [profile, setProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api.entityProfile(id);
    setProfile(r.profile);
    setForm({ name: r.profile.entity.name, email: r.profile.entity.email || '', phone: r.profile.entity.phone || '' });
  }, [id]);
  useEffect(() => { load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  if (!profile) return <div className="dir-drawer"><div className="dir-drawer__inner">Loading…</div></div>;
  const e = profile.entity;
  const mods = Object.keys(profile.modules);

  const save = async () => {
    setBusy(true);
    try { await api.entityUpdate(id, form, true); await load(); setEditing(false); onChanged?.(); }
    finally { setBusy(false); }
  };

  return (
    <div className="dir-drawer" onClick={onClose}>
      <div className="dir-drawer__inner" onClick={(ev) => ev.stopPropagation()}>
        <button className="dir-drawer__x" onClick={onClose}>×</button>
        <div className="dir-prof__hd">
          <span className={`dir-type dir-type--${e.type}`}>{TYPE_LABEL[e.type] || e.type}</span>
          {editing
            ? <input className="dir-input dir-input--big" value={form.name} onChange={(ev) => setForm({ ...form, name: ev.target.value })} />
            : <h2 className="dir-prof__name">{e.name}</h2>}
          <div className="dir-prof__meta">
            spans <b>{profile.moduleCount}</b> {profile.moduleCount === 1 ? 'module' : 'modules'} · <b>{profile.touchpointCount}</b> {profile.touchpointCount === 1 ? 'touchpoint' : 'touchpoints'}
          </div>
        </div>

        <div className="dir-prof__contact">
          {editing ? (
            <div className="dir-editrow">
              <input className="dir-input" placeholder="email" value={form.email} onChange={(ev) => setForm({ ...form, email: ev.target.value })} />
              <input className="dir-input" placeholder="phone" value={form.phone} onChange={(ev) => setForm({ ...form, phone: ev.target.value })} />
            </div>
          ) : (
            <>{e.email && <span className="dir-contact">{e.email}</span>}{e.phone && <span className="dir-contact">{e.phone}</span>}</>
          )}
          {canEdit && (editing
            ? <span className="dir-editbtns"><button className="dir-btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save & propagate'}</button><button className="dir-btn dir-btn--ghost" onClick={() => setEditing(false)}>Cancel</button></span>
            : <button className="dir-btn dir-btn--ghost" onClick={() => setEditing(true)}>Edit</button>)}
        </div>
        {editing && <p className="dir-syncnote">Saving rewrites this name and contact into every linked record across all {profile.moduleCount} modules.</p>}

        <div className="dir-prof__modules">
          {mods.map((m) => (
            <div key={m} className="dir-modsection">
              <div className="dir-modsection__hd"><ModuleChip m={m} /> <span className="dir-modsection__count">{profile.modules[m].length}</span></div>
              {profile.modules[m].map((tp) => (
                <div key={tp.linkId} className="dir-touch">
                  <span className="dir-touch__role">{tp.role || tp.kind}</span>
                  <RecordFacts record={tp.record} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Directory() {
  const { has } = useAuth();
  const canEdit = has ? has('editor') : true;
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [toast, setToast] = useState(null);

  const refresh = useCallback(async () => {
    try { const r = await api.entitiesList(q, type); setList(r.entities || []); } catch { /* surfaced elsewhere */ }
    finally { setLoading(false); }
  }, [q, type]);
  useEffect(() => { refresh(); }, [refresh]); // eslint-disable-line react-hooks/set-state-in-effect

  const rebuild = async () => {
    setRebuilding(true);
    try {
      const r = await api.entityRebuild();
      setToast(`Resolved ${r.totalEntities} entities · ${r.multiModule} span multiple modules`);
      await refresh();
    } finally { setRebuilding(false); }
  };

  return (
    <main className="directory" data-screen-label="Directory">
      <header className="dir-mast">
        <div>
          <div className="dir-plate">ONE RECORD · EVERY MODULE</div>
          <h1 className="dir-title">Directory</h1>
          <p className="dir-dek">The people, organizations, and places behind your campaign — resolved into one canonical record each, with every module touchpoint in one place.</p>
        </div>
        {canEdit && <button className="dir-btn dir-btn--big" disabled={rebuilding} onClick={rebuild}>{rebuilding ? 'Resolving…' : 'Resolve records'}</button>}
      </header>

      {toast && <div className="dir-toast" onClick={() => setToast(null)}>{toast}</div>}

      <div className="dir-controls">
        <input className="dir-input dir-search" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="dir-types">
          {TYPES.map((t) => <button key={t || 'all'} className={`dir-typebtn ${type === t ? 'is-on' : ''}`} onClick={() => setType(t)}>{t ? TYPE_LABEL[t] : 'All'}</button>)}
        </div>
      </div>

      {loading ? <p className="dir-msg">Loading…</p>
        : list.length === 0 ? (
          <div className="dir-empty">
            <p>No entities yet.</p>
            <p className="dir-empty__hint">Resolve your module records into canonical people and organizations to see one record span Ground, Raise, Coalition, Events, and more.</p>
            {canEdit && <button className="dir-btn dir-btn--big" disabled={rebuilding} onClick={rebuild}>{rebuilding ? 'Resolving…' : 'Resolve records now'}</button>}
          </div>
        ) : (
          <div className="dir-list">
            {list.map((e) => (
              <button key={e.id} className="dir-row" onClick={() => setOpenId(e.id)}>
                <span className={`dir-dot dir-dot--${e.type}`} />
                <span className="dir-row__name">{e.name}</span>
                <span className="dir-row__chips">{e.modules.map((m) => <ModuleChip key={m} m={m} />)}</span>
                <span className="dir-row__count">{e.touchpointCount}</span>
              </button>
            ))}
          </div>
        )}

      {openId && <ProfileDrawer id={openId} canEdit={canEdit} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </main>
  );
}

export { Directory };
