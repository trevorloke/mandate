// Simple View — one clean screen per data module, replacing the dense
// multi-tab pro app by default. Bucket chips → searchable table → detail
// overlay with inline edit/delete for editors. Quick Add handles creation via
// the global `mandate:quickadd` CustomEvent.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './auth/api';
import { useAuth } from './auth/AuthContext';
import { invalidateLive } from './auth/useLiveRecords';
import { getSchema } from './admin/schemas';
import TypedForm from './admin/TypedForm';
import { SIMPLE_BUCKETS, MODULE_META } from './simple-map';
import './SimpleModule.css';

const ROW_STEP = 25;

// "+ Add <singular>" — prefer the schema label; else naive de-pluralize.
function singularLabel(schema, label) {
  if (schema?.label) return schema.label;
  if (label.endsWith('s') && !label.endsWith('ss')) return label.slice(0, -1);
  return label;
}

function rowTs(r) {
  return r.updatedAt || r.createdAt || null;
}

// Render a single value for the table / detail grid. Returns null for empties
// so the detail grid can skip them entirely.
function formatValue(v, type) {
  if (v == null || v === '') return null;
  if (type === 'currency') return '$' + Number(v).toLocaleString();
  if (type === 'boolean' || typeof v === 'boolean') {
    return (v === true || v === 'true') ? 'Yes' : 'No';
  }
  if (Array.isArray(v)) return v.length ? v.map(String).join(', ') : null;
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export default function SimpleModule({ route }) {
  const buckets = SIMPLE_BUCKETS[route];
  const { user, has } = useAuth();
  const canEdit = !!user && has('editor');
  const meta = MODULE_META[route];
  const storeKey = `mdt:sbucket:${route}`;

  const [active, setActive] = useState(() => {
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved && buckets?.some(b => b.kind === saved)) return saved;
    } catch { /* private mode */ }
    return buckets?.[0]?.kind || null;
  });
  const [rows, setRows] = useState({});      // kind -> [{id, data, updatedAt}]
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(ROW_STEP);
  const [detail, setDetail] = useState(null); // record row or null

  // One listData per bucket, cached per mount; counts come from the same load.
  const loadAll = useCallback(async () => {
    if (!buckets || !user) return;
    setLoading(true);
    const next = {};
    await Promise.all(buckets.map(async (b) => {
      try {
        const { records } = await api.listData(route, b.kind);
        next[b.kind] = records || [];
      } catch {
        next[b.kind] = [];
      }
    }));
    setRows(next);
    setLoading(false);
  }, [route, buckets, user]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Refresh when the window regains focus (e.g. after Quick Add closed).
  useEffect(() => {
    const onFocus = () => loadAll();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadAll]);

  // Route changed while mounted → re-resolve the active bucket.
  useEffect(() => {
    let next = buckets?.[0]?.kind || null;
    try {
      const saved = localStorage.getItem(storeKey);
      if (saved && buckets?.some(b => b.kind === saved)) next = saved;
    } catch { /* private mode */ }
    setActive(next);
    setQ('');
    setLimit(ROW_STEP);
    setDetail(null);
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  const bucket = buckets?.find(b => b.kind === active) || buckets?.[0];
  const schema = bucket ? getSchema(route, bucket.kind) : null;
  const list = useMemo(() => (bucket && rows[bucket.kind]) || [], [bucket, rows]);

  // Newest first: updatedAt/createdAt when present, else reverse insert order.
  const sorted = useMemo(() => {
    if (list.some(rowTs)) {
      return [...list].sort((a, b) => String(rowTs(b) || '').localeCompare(String(rowTs(a) || '')));
    }
    return [...list].reverse();
  }, [list]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return sorted;
    return sorted.filter(r => (r.id + ' ' + JSON.stringify(r.data)).toLowerCase().includes(ql));
  }, [sorted, q]);

  const visible = filtered.slice(0, limit);

  // Columns: schema's first 5 non-textarea/tags fields; schema-less bucket →
  // first primitive keys of the newest record.
  const columns = useMemo(() => {
    if (schema) {
      return schema.fields.filter(f => !['textarea', 'tags'].includes(f.type)).slice(0, 5);
    }
    const first = sorted.find(r => r.data && typeof r.data === 'object');
    if (!first) return [];
    return Object.keys(first.data)
      .filter(k => typeof first.data[k] !== 'object' || first.data[k] == null)
      .slice(0, 4)
      .map(k => ({ key: k, label: k, type: 'text' }));
  }, [schema, sorted]);

  if (!buckets || !bucket) return null;

  const pick = (kind) => {
    setActive(kind);
    setQ('');
    setLimit(ROW_STEP);
    try { localStorage.setItem(storeKey, kind); } catch { /* private mode */ }
  };

  const openQuickAdd = () => {
    window.dispatchEvent(new CustomEvent('mandate:quickadd', {
      detail: { bucket: `${route}.${bucket.kind}` },
    }));
  };

  const closeDetail = () => {
    setDetail(null);
    loadAll();
  };

  const addLabel = `+ Add ${singularLabel(schema, bucket.label).toLowerCase()}`;
  const showAdd = canEdit && !!schema;

  return (
    <div className="sm">
      <header className="sm__head">
        <div className="sm__id">
          <div className="sm__eyebrow">
            <span className="sm__dot" style={{ background: `var(--m-${route}, var(--ink))` }} />
            {meta?.plain || route}
          </div>
          <h1 className="sm__title">{bucket.label}</h1>
        </div>
        <div className="sm__head-actions">
          <button className="sm__refresh" onClick={loadAll} title="Refresh" aria-label="Refresh">↻</button>
          {showAdd && <button className="sm__add" onClick={openQuickAdd}>{addLabel}</button>}
        </div>
      </header>

      <div className="sm__chips">
        {buckets.map(b => (
          <button
            key={b.kind}
            className={'sm__chip' + (b.kind === bucket.kind ? ' is-active' : '')}
            onClick={() => pick(b.kind)}
          >
            {b.label}
            <span className="sm__chip-n">{(rows[b.kind] || []).length}</span>
          </button>
        ))}
      </div>

      {list.length > 0 && (
        <div className="sm__bar">
          <input
            className="sm__search"
            placeholder={`Search ${list.length} ${bucket.label.toLowerCase()}…`}
            value={q}
            onChange={e => { setQ(e.target.value); setLimit(ROW_STEP); }}
          />
          <span className="sm__count">
            {q ? `${filtered.length} of ${list.length}` : list.length}
          </span>
        </div>
      )}

      {loading && list.length === 0 ? (
        <div className="sm__zero"><span className="sm__zero-msg">Loading…</span></div>
      ) : list.length === 0 ? (
        <div className="sm__zero">
          <span className="sm__zero-msg">No {bucket.label.toLowerCase()} yet.</span>
          {showAdd && <button className="sm__add" onClick={openQuickAdd}>{addLabel}</button>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="sm__zero"><span className="sm__zero-msg">No matches.</span></div>
      ) : (
        <>
          <div className="sm__table-wrap">
            <table className="sm__table">
              <thead>
                <tr>
                  {columns.map(c => <th key={c.key}>{c.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.id} onClick={() => setDetail(r)}>
                    {columns.map(c => (
                      <td key={c.key} className={c.mono ? 'is-mono' : ''}>
                        {formatValue(r.data?.[c.key], c.type) ?? <span className="sm__nil">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > limit && (
            <button className="sm__more" onClick={() => setLimit(l => l + ROW_STEP)}>
              Show more ({filtered.length - limit})
            </button>
          )}
        </>
      )}

      {detail && (
        <DetailOverlay
          route={route}
          kind={bucket.kind}
          schema={schema}
          singular={singularLabel(schema, bucket.label)}
          record={detail}
          canEdit={canEdit}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}

function DetailOverlay({ route, kind, schema, singular, record, canEdit, onClose }) {
  const [mode, setMode] = useState('view'); // view | edit
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(record.data || {});
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const fields = schema
    ? schema.fields.map(f => ({
        key: f.key, label: f.label, mono: f.mono,
        value: formatValue(record.data?.[f.key], f.type),
      }))
    : Object.entries(record.data || {}).map(([k, v]) => ({
        key: k, label: k, value: formatValue(v),
      }));
  const shown = fields.filter(f => f.value != null);

  const save = async () => {
    setErr('');
    if (schema) {
      const missing = schema.fields.filter(f => f.required && (draft[f.key] == null || draft[f.key] === ''));
      if (missing.length) {
        setErr(`Required: ${missing.map(f => f.label).join(', ')}`);
        return;
      }
    }
    setBusy(true);
    try {
      await api.updateData(route, kind, record.id, draft);
      invalidateLive(route, kind);
      onClose();
    } catch (e) {
      setErr(e.message || 'Save failed.');
      setBusy(false);
    }
  };

  const remove = async () => {
    setErr('');
    setBusy(true);
    try {
      await api.deleteData(route, kind, record.id);
      invalidateLive(route, kind);
      onClose();
    } catch (e) {
      setErr(e.message || 'Delete failed.');
      setBusy(false);
    }
  };

  return (
    <div className="sm__overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sm__panel" role="dialog" aria-modal="true" aria-label={singular}>
        <div className="sm__panel-head">
          <div className="sm__eyebrow">{singular}</div>
          <button className="sm__x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {err && <div className="sm__err">{err}</div>}

        {mode === 'edit' ? (
          <>
            <TypedForm schema={schema} value={draft} onChange={setDraft} />
            <div className="sm__panel-actions">
              <button className="sm__btn sm__btn--primary" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              <button
                className="sm__btn"
                disabled={busy}
                onClick={() => { setMode('view'); setDraft(record.data || {}); setErr(''); }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="sm__grid">
              {shown.length === 0 && <span className="sm__nil">No details.</span>}
              {shown.map(f => (
                <div className="sm__row" key={f.key}>
                  <span className="sm__label">{f.label}</span>
                  <span className={'sm__value' + (f.mono ? ' is-mono' : '')}>{f.value}</span>
                </div>
              ))}
            </div>
            {canEdit && (
              <div className="sm__panel-actions">
                {schema && (
                  <button className="sm__btn sm__btn--primary" onClick={() => { setMode('edit'); setErr(''); }}>
                    Edit
                  </button>
                )}
                {confirming ? (
                  <>
                    <button className="sm__btn sm__btn--danger" disabled={busy} onClick={remove}>
                      {busy ? 'Deleting…' : 'Confirm delete'}
                    </button>
                    <button className="sm__btn" disabled={busy} onClick={() => setConfirming(false)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button className="sm__btn sm__btn--danger-ghost" onClick={() => setConfirming(true)}>
                    Delete
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
