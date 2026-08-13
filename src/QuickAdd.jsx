// Global "Quick add" — create a record in any schema-backed bucket from the
// header, without a trip through Admin → Data. Reuses the admin TypedForm and
// the same idPrefix seeding convention as AdminData.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SCHEMAS } from './admin/schemas';
import TypedForm from './admin/TypedForm';
import { api } from './auth/api';
import { invalidateLive } from './auth/useLiveRecords';
import { useAuth } from './auth/AuthContext';
import { MOD2 } from './shell';
import './admin/admin.css';
import './QuickAdd.css';

// Same convention as AdminData.newRecord (not exported there): if the schema
// declares an idPrefix, pre-fill the id (or schema.idField) so the user never
// has to invent a unique identifier.
function genIdValue(schema) {
  if (!schema?.idPrefix) return '';
  return `${schema.idPrefix}-${Math.random().toString(36).slice(2, 8)}`;
}
function seedData(schema) {
  if (!schema?.idPrefix) return {};
  const field = schema.idField || 'id';
  return { [field]: genIdValue(schema) };
}

function moduleName(moduleKey) {
  return MOD2.find(m => m.k === moduleKey)?.n
    || moduleKey.charAt(0).toUpperCase() + moduleKey.slice(1);
}

export default function QuickAdd({ route, enabledModules }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [bucket, setBucket] = useState('raise.donor'); // `${module}.${kind}`
  const [data, setData] = useState({});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(null); // createData response when saved, else null

  // Every schema bucket whose module is enabled in this workspace.
  const buckets = useMemo(() => (
    Object.keys(SCHEMAS)
      .filter(key => enabledModules?.[key.split('.')[0]] !== false)
      .map(key => {
        const [module, kind] = key.split('.');
        return { key, module, kind, schema: SCHEMAS[key] };
      })
  ), [enabledModules]);

  const active = buckets.find(b => b.key === bucket) || buckets[0];

  // Open the modal — on `preferred` (a `${module}.${kind}` bucket key) when it
  // is a real, enabled schema bucket; otherwise on the route/default bucket.
  const openModal = useCallback((preferred) => {
    const valid = typeof preferred === 'string'
      && !!SCHEMAS[preferred]
      && buckets.some(b => b.key === preferred);
    const key = valid
      ? preferred
      : buckets.find(b => b.module === route)?.key
        || (buckets.some(b => b.key === 'raise.donor') ? 'raise.donor' : buckets[0]?.key);
    if (!key) return;
    setBucket(key);
    setData(seedData(SCHEMAS[key]));
    setErr('');
    setSaved(null);
    setOpen(true);
  }, [buckets, route]);
  const close = () => setOpen(false);

  // Global open: anywhere in the app can dispatch
  // `new CustomEvent('mandate:quickadd', { detail: { bucket } })`.
  useEffect(() => {
    const onQuickAdd = (e) => openModal(e?.detail?.bucket);
    window.addEventListener('mandate:quickadd', onQuickAdd);
    return () => window.removeEventListener('mandate:quickadd', onQuickAdd);
  }, [openModal]);

  const pickBucket = (key) => {
    setBucket(key);
    setData(seedData(SCHEMAS[key]));
    setErr('');
    setSaved(null);
  };

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!user || user.role === 'viewer' || buckets.length === 0) return null;

  const save = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!active) return;
    setErr('');
    const missing = active.schema.fields.filter(
      f => f.required && (data[f.key] == null || data[f.key] === '')
    );
    if (missing.length) {
      setErr(`Required: ${missing.map(f => f.label).join(', ')}`);
      return;
    }
    setBusy(true);
    try {
      const res = await api.createData(active.module, active.kind, data);
      invalidateLive(active.module, active.kind);
      setSaved(res || {});
    } catch (ex) {
      setErr(ex.message || 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const addAnother = () => {
    setData(seedData(active.schema));
    setErr('');
    setSaved(null);
  };

  return (
    <>
      <button className="qa__trigger" onClick={() => openModal()} title="Quick add a record">
        <span className="qa__trigger-plus">+</span>
        <span className="qa__trigger-label">Add</span>
      </button>

      {open && (
        <div className="qa__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div className="qa__modal" role="dialog" aria-modal="true" aria-label="Quick add">
            <div className="qa__head">
              <div>
                <div className="adm__plate">Quick add</div>
                <h3 className="adm__panel-title" style={{ margin: 0 }}>
                  New {active?.schema.label || 'record'}
                </h3>
              </div>
              <button className="qa__x" onClick={close} aria-label="Close">×</button>
            </div>

            <div className="adm__field">
              <label className="adm__field-label">Add to</label>
              <select
                className="adm__field-select"
                value={active?.key || ''}
                onChange={(e) => pickBucket(e.target.value)}
              >
                {buckets.map(b => (
                  <option key={b.key} value={b.key}>
                    {moduleName(b.module)} · {b.schema.label}
                  </option>
                ))}
              </select>
            </div>

            {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}

            {saved ? (
              <div className="qa__done">
                <div className="qa__done-mark">✓</div>
                <div className="qa__done-text">
                  {active?.schema.label} saved to {moduleName(active?.module)}.
                </div>
                {saved.directory && (
                  <div className="qa__done-dir">
                    {saved.directory.matchedExisting
                      ? `Linked to existing profile — ${saved.directory.entityName}`
                      : `New Directory profile — ${saved.directory.entityName}`}
                  </div>
                )}
                {saved.compliance?.flagged && (
                  <div className="qa__done-flag">{saved.compliance.reason}</div>
                )}
                <div className="adm__actions" style={{ justifyContent: 'center' }}>
                  <button className="adm__btn" type="button" onClick={addAnother}>+ Add another</button>
                  <button className="adm__btn adm__btn--ghost" type="button" onClick={close}>Done</button>
                </div>
              </div>
            ) : (
              <form onSubmit={save}>
                {active && <TypedForm schema={active.schema} value={data} onChange={setData} />}
                <div className="adm__actions">
                  <button className="adm__btn" type="submit" disabled={busy}>
                    {busy ? 'Saving…' : 'Create'}
                  </button>
                  <button className="adm__btn adm__btn--ghost" type="button" onClick={close}>Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
