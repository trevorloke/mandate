// Generic module data editor.
// Shows a grid of (module · kind) buckets seeded from the prototype data.
// Click into one to view, edit JSON records, add new ones.
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import { getSchema } from './schemas';
import TypedForm from './TypedForm';
import { toCSV, fromCSV, downloadFile, readFileAsText } from './csv';
import CommentThread from './CommentThread';
import { EntityCrossref } from '../directory';
import SharePanel from './SharePanel';

// Catalogue of (module, kind) buckets the user can populate.
// Modeled after the prototype's data shape.
export const MODULE_KINDS = [
  { module: 'ground',    kinds: [
    { kind: 'voter',      label: 'Voters' },
    { kind: 'canvasser',  label: 'Canvassers' },
    { kind: 'shift',      label: 'Shifts' },
    { kind: 'pd',         label: 'Polling districts' },
    { kind: 'script',     label: 'Scripts' },
  ]},
  { module: 'people', kinds: [
    { kind: 'volunteer',  label: 'Volunteers' },
  ]},
  { module: 'beacon', kinds: [
    { kind: 'account',    label: 'Social accounts' },
    { kind: 'post',       label: 'Posts' },
    { kind: 'mention',    label: 'Listening mentions' },
    { kind: 'press_outlet', label: 'Press outlets' },
  ]},
  { module: 'raise', kinds: [
    { kind: 'donor',      label: 'Donors' },
    { kind: 'prospect',   label: 'Prospects' },
    { kind: 'pledge',     label: 'Pledges' },
    { kind: 'gift',       label: 'Gifts' },
  ]},
  { module: 'ledger', kinds: [
    { kind: 'journal',    label: 'Journal entries' },
    { kind: 'account',    label: 'Chart of accounts' },
    { kind: 'bill',       label: 'Bills (AP)' },
    { kind: 'filing',     label: 'Filings' },
    { kind: 'asset',      label: 'Assets' },
  ]},
  { module: 'coalition', kinds: [
    { kind: 'org',         label: 'Coalition orgs' },
    { kind: 'endorsement', label: 'Endorsement ledger' },
    { kind: 'ask',         label: 'Asks pipeline' },
    { kind: 'comm',        label: 'Communications' },
  ]},
  { module: 'civic', kinds: [
    { kind: 'bill',       label: 'Bills (legislation)' },
    { kind: 'case',       label: 'Casework' },
    { kind: 'promise',    label: 'Promises' },
    { kind: 'speech',     label: 'Speeches' },
  ]},
  { module: 'opposition', kinds: [
    { kind: 'target',     label: 'Targets' },
    { kind: 'claim',      label: 'Claims' },
    { kind: 'evidence',   label: 'Evidence' },
    { kind: 'lead',       label: 'Leads' },
  ]},
  { module: 'site', kinds: [
    { kind: 'page',       label: 'Pages' },
    { kind: 'experiment', label: 'Experiments' },
    { kind: 'form',       label: 'Forms' },
  ]},
  { module: 'events', kinds: [
    { kind: 'event',      label: 'Events' },
    { kind: 'venue',      label: 'Venues' },
    { kind: 'host',       label: 'Hosts' },
  ]},
  { module: 'academy', kinds: [
    { kind: 'course',     label: 'Courses' },
    { kind: 'article',    label: 'Articles' },
    { kind: 'faculty',    label: 'Faculty' },
  ]},
  { module: 'command', kinds: [
    { kind: 'channel',    label: 'Channels' },
    { kind: 'message',    label: 'Messages' },
  ]},
  { module: 'conductor', kinds: [
    { kind: 'ask',        label: 'Cross-module asks' },
  ]},
];

// Generate a default record for "New record". If the schema declares an
// idPrefix, pre-fill the id (or schema.idField, e.g. 'slug' for coalition.org)
// so the user doesn't have to invent a unique identifier for every entry.
function genIdValue(schema) {
  if (!schema?.idPrefix) return '';
  return `${schema.idPrefix}-${Math.random().toString(36).slice(2, 8)}`;
}
function newRecord(schema) {
  if (!schema?.idPrefix) return { isNew: true, data: {} };
  const field = schema.idField || 'id';
  return { isNew: true, data: { [field]: genIdValue(schema) } };
}

export default function AdminData() {
  const { has } = useAuth();
  const [counts, setCounts] = useState({});
  const [active, setActive] = useState(null);  // {module, kind, label}

  // Load record counts for each (module, kind) bucket
  const loadCounts = async () => {
    const next = {};
    for (const m of MODULE_KINDS) {
      for (const k of m.kinds) {
        try {
          const { records } = await api.listData(m.module, k.kind);
          next[`${m.module}.${k.kind}`] = records.length;
        } catch { next[`${m.module}.${k.kind}`] = 0; }
      }
    }
    setCounts(next);
  };

  useEffect(() => { loadCounts(); }, [active]);

  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);


  if (active) {
    return <BucketEditor module={active.module} kind={active.kind} label={active.label} onBack={() => setActive(null)} canEdit={has('editor')} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 }}>
        <p className="adm__msg" style={{ margin: 0, flex: 1 }}>
          Each module has typed buckets. Records are stored as JSON, scoped to your workspace.
          {has('editor') ? '' : <em> You have read-only access.</em>}
          {' '}<b style={{ color: 'var(--ink-3)' }}>{totalRecords.toLocaleString()}</b> total records across all buckets.
        </p>
      </div>


      {MODULE_KINDS.map(m => (
        <div key={m.module} style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: 'var(--ink-5)', marginBottom: 12,
          }}>
            {m.module}
          </div>
          <div className="adm__data-grid">
            {m.kinds.map(k => {
              const total = counts[`${m.module}.${k.kind}`] ?? 0;
              return (
                <div key={k.kind} className="adm__data-card" onClick={() => setActive({ module: m.module, ...k })}>
                  <div className="adm__data-card-mod">{k.kind}</div>
                  <div className="adm__data-card-kinds">{k.label}</div>
                  <div className="adm__data-card-count">{total} {total === 1 ? 'record' : 'records'}</div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

const PAGE_SIZE = 25;

function BucketEditor({ module, kind, label, onBack, canEdit }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);  // {id?, data, isNew?}
  const [msg, setMsg] = useState(null);
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc'); // asc | desc
  const [page, setPage] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [selected, setSelected] = useState(new Set()); // _dbIds
  const [filters, setFilters] = useState({});         // schema-aware select/boolean filters
  const [advFilters, setAdvFilters] = useState([]);    // [{ key, op, value }] — power filters
  const [showAdvFilters, setShowAdvFilters] = useState(false);
  const [savedSearches, setSavedSearches] = useState([]);
  const fileRef = useRef(null);
  const schema = getSchema(module, kind);
  const saveKey = `mdt:savedSearches:${module}.${kind}`;

  // Load saved searches from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(saveKey);
      setSavedSearches(raw ? JSON.parse(raw) : []);
    } catch { setSavedSearches([]); }
  }, [saveKey]);

  const persistSearches = (next) => {
    setSavedSearches(next);
    try { localStorage.setItem(saveKey, JSON.stringify(next)); } catch {}
  };

  const saveCurrentSearch = () => {
    const name = prompt('Name for this search:');
    if (!name?.trim()) return;
    const entry = { name: name.trim(), q, filters: { ...filters }, advFilters: [...advFilters], sortKey, sortDir };
    const next = [...savedSearches.filter(s => s.name !== entry.name), entry];
    persistSearches(next);
  };
  const applySearch = (s) => {
    setQ(s.q || '');
    setFilters(s.filters || {});
    setAdvFilters(s.advFilters || []);
    setSortKey(s.sortKey || 'updatedAt');
    setSortDir(s.sortDir || 'desc');
    setPage(0);
  };
  const removeSearch = (name) => {
    persistSearches(savedSearches.filter(s => s.name !== name));
  };

  const hasActiveSearch = q || Object.values(filters).some(v => v != null && v !== '') || advFilters.length > 0;

  // All schema fields (for advanced filter key picker)
  const allFields = schema?.fields || [];

  const load = async () => {
    setLoading(true);
    try { const { records } = await api.listData(module, kind); setRecords(records); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    load();
    setPage(0); setQ(''); setSelected(new Set()); setFilters({});
  }, [module, kind]);

  // Filter + sort
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    let list = records;
    if (ql) {
      list = list.filter(r => (r.id + ' ' + JSON.stringify(r.data)).toLowerCase().includes(ql));
    }
    // Schema chip filters (equality, case-insensitive)
    const activeFilters = Object.entries(filters).filter(([_, v]) => v != null && v !== '');
    if (activeFilters.length) {
      list = list.filter(r => activeFilters.every(([k, v]) => {
        const rv = r.data?.[k];
        if (rv == null) return false;
        return String(rv).toLowerCase() === String(v).toLowerCase();
      }));
    }
    // Advanced filters: support operators
    const validAdv = advFilters.filter(f => f.key && f.op && (f.value !== '' && f.value != null || f.op === 'is_empty' || f.op === 'is_not_empty'));
    if (validAdv.length) {
      list = list.filter(r => validAdv.every(f => applyOp(r.data?.[f.key], f.op, f.value)));
    }
    // Sort
    list = [...list].sort((a, b) => {
      const av = sortKey === 'updatedAt' ? a.updatedAt : (a.data?.[sortKey] ?? '');
      const bv = sortKey === 'updatedAt' ? b.updatedAt : (b.data?.[sortKey] ?? '');
      const cmp = (av < bv) ? -1 : (av > bv) ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [records, q, sortKey, sortDir, filters, advFilters]);

  // Filter chip values: derive distinct values for select-type schema fields
  const filterableFields = useMemo(() => {
    if (!schema) return [];
    return schema.fields.filter(f => f.type === 'select' || f.type === 'boolean').slice(0, 4);
  }, [schema]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  useEffect(() => { if (page >= totalPages) setPage(0); }, [totalPages, page]);

  const save = async (rec, { andAnother = false } = {}) => {
    try {
      if (rec.isNew) await api.createData(module, kind, rec.data);
      else await api.updateData(module, kind, rec.id, rec.data);
      // Stay in the modal with a fresh blank record when adding many at once.
      setEditing(andAnother ? newRecord(schema) : null);
      setMsg({ kind: 'ok', text: 'Saved.' });
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const remove = async (id) => {
    if (!confirm('Delete this record?')) return;
    try { await api.deleteData(module, kind, id); setMsg({ kind: 'ok', text: 'Deleted.' }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const removeBulk = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} records? This cannot be undone.`)) return;
    let ok = 0, fail = 0;
    for (const id of ids) {
      try { await api.deleteData(module, kind, id); ok++; } catch { fail++; }
    }
    setSelected(new Set());
    setMsg({ kind: ok && !fail ? 'ok' : 'err', text: `Deleted ${ok} of ${ids.length}${fail ? ` (${fail} failed)` : ''}.` });
    load();
  };

  const exportSelected = () => {
    const subset = filtered.filter(r => selected.has(r.id));
    const fields = schema?.fields.map(f => f.key) || null;
    const csv = toCSV(subset.map(r => r.data), fields);
    const filename = `${module}-${kind}-selected-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(filename, csv);
  };

  const toggleSelect = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };
  const togglePageAll = () => {
    const pageIds = pageItems.map(r => r.id);
    const allSelected = pageIds.every(id => selected.has(id));
    const next = new Set(selected);
    if (allSelected) pageIds.forEach(id => next.delete(id));
    else pageIds.forEach(id => next.add(id));
    setSelected(next);
  };

  const exportCsv = () => {
    const fields = schema?.fields.map(f => f.key) || null;
    const csv = toCSV(filtered.map(r => r.data), fields);
    const filename = `${module}-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(filename, csv);
  };

  const downloadTemplate = () => {
    if (!schema) {
      setMsg({ kind: 'err', text: 'No schema — use Export to copy an existing record as a template.' });
      return;
    }
    const headers = schema.fields.map(f => f.key);
    const csv = toCSV([], headers);
    downloadFile(`${module}-${kind}-template.csv`, csv);
  };

  // Import rows in append or replace mode (no confirm() dialog).
  const importRows = async (rows, mode) => {
    if (!rows.length) { setMsg({ kind: 'err', text: 'No rows to import.' }); return; }
    try {
      setImporting(true);
      if (mode === 'append') {
        for (const r of rows) await api.createData(module, kind, r);
        setMsg({ kind: 'ok', text: `Appended ${rows.length} records.` });
      } else {
        await api.bulkData(module, kind, rows);
        setMsg({ kind: 'ok', text: `Replaced — ${rows.length} records loaded.` });
      }
      load();
    } catch (err) {
      setMsg({ kind: 'err', text: 'Import failed: ' + err.message });
    } finally {
      setImporting(false);
    }
  };

  // File picker with the mode baked in via fileRef.current.dataset.mode.
  const pickFile = (mode) => { fileRef.current.dataset.mode = mode; fileRef.current.click(); };
  const onFilePicked = async (e) => {
    const file = e.target.files?.[0];
    const mode = e.target.dataset.mode || 'append';
    if (!file) return;
    e.target.value = '';
    try {
      const text = await readFileAsText(file);
      await importRows(fromCSV(text), mode);
    } catch (err) {
      setMsg({ kind: 'err', text: 'Import failed: ' + err.message });
    }
  };

  const importPaste = async (mode) => {
    const text = (pasteText || '').trim();
    if (!text) { setMsg({ kind: 'err', text: 'Paste some CSV first.' }); return; }
    try {
      const rows = fromCSV(text);
      await importRows(rows, mode);
      setPasteText('');
      setImportOpen(false);
    } catch (err) {
      setMsg({ kind: 'err', text: 'Import failed: ' + err.message });
    }
  };

  // Display columns: schema fields prioritized; otherwise first non-object keys
  const displayFields = schema
    ? schema.fields.filter(f => !['textarea', 'tags'].includes(f.type)).slice(0, 4)
    : null;

  return (
    <div>
      <button className="adm__back" onClick={onBack}>← All buckets</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18, gap: 16 }}>
        <div>
          <div className="adm__plate">{module} · {kind}</div>
          <h3 className="adm__panel-title" style={{ margin: 0 }}>{label}</h3>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canEdit && (
            <>
              <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={onFilePicked} />
              <button className="adm__btn adm__btn--ghost" onClick={() => setImportOpen(o => !o)} disabled={importing}>
                {importing ? 'Importing…' : (importOpen ? '× Close import' : '⤓ Import')}
              </button>
            </>
          )}
          {records.length > 0 && (
            <button className="adm__btn adm__btn--ghost" onClick={exportCsv}>↑ Export CSV</button>
          )}
          {canEdit && !editing && (
            <button className="adm__btn" onClick={() => setEditing(newRecord(schema))}>+ New record</button>
          )}
        </div>
      </div>

      {canEdit && importOpen && (
        <div className="adm__panel" style={{ marginBottom: 18 }}>
          <div className="adm__panel-h">Import {label || kind}</div>
          <p style={{ margin: '8px 0 14px', color: 'var(--ink-4)', fontSize: 13 }}>
            <b>Append</b> adds rows to the existing {records.length}. <b>Replace</b> deletes everything in this bucket and loads the new rows. The first CSV row should be the header.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            <button className="adm__btn" onClick={() => pickFile('append')} disabled={importing}>⤓ Upload CSV → Append</button>
            <button className="adm__btn adm__btn--danger" onClick={() => pickFile('replace')} disabled={importing}>⤓ Upload CSV → Replace</button>
            {schema && (
              <button className="adm__btn adm__btn--ghost" onClick={downloadTemplate}>↓ Download template</button>
            )}
          </div>
          <label className="adm__field-label" style={{ display: 'block', marginBottom: 6 }}>Or paste CSV here</label>
          <textarea
            className="adm__field-textarea"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={schema ? schema.fields.map(f => f.key).join(',') + '\nvalue1,value2,…' : 'Paste rows here (first row = header)'}
            rows={6}
            spellCheck={false}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="adm__btn" onClick={() => importPaste('append')} disabled={importing || !pasteText.trim()}>Paste → Append</button>
            <button className="adm__btn adm__btn--danger" onClick={() => importPaste('replace')} disabled={importing || !pasteText.trim()}>Paste → Replace</button>
            <button className="adm__btn adm__btn--ghost" onClick={() => { setPasteText(''); setImportOpen(false); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Search + filter + count */}
      <div className="adm__bucket-bar">
        <input
          className="adm__bucket-search"
          placeholder={`Search ${records.length} ${(label || kind).toLowerCase()}…`}
          value={q}
          onChange={e => { setQ(e.target.value); setPage(0); }}
        />
        <div className="adm__bucket-meta">
          {hasActiveSearch
            ? <>{filtered.length} of {records.length} match</>
            : <>{records.length} {records.length === 1 ? 'record' : 'records'}</>}
        </div>
      </div>

      {/* Schema-aware filter chips */}
      {filterableFields.length > 0 && (
        <div className="adm__filters">
          {filterableFields.map(f => {
            const opts = f.type === 'boolean'
              ? [['true', 'yes'], ['false', 'no']]
              : f.options.map(o => [o, o]);
            const cur = filters[f.key] ?? '';
            return (
              <select
                key={f.key}
                className="adm__filter-chip"
                value={cur}
                onChange={e => { setFilters({ ...filters, [f.key]: e.target.value }); setPage(0); }}
              >
                <option value="">{f.label}: all</option>
                {opts.map(([val, lbl]) => <option key={val} value={val}>{f.label}: {lbl}</option>)}
              </select>
            );
          })}
          {Object.values(filters).some(v => v != null && v !== '') && (
            <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => { setFilters({}); setPage(0); }}>Clear filters</button>
          )}
        </div>
      )}

      {/* Saved searches */}
      {(savedSearches.length > 0 || hasActiveSearch) && (
        <div className="adm__filters">
          {savedSearches.map(s => (
            <span key={s.name} className="adm__saved-search">
              <button className="adm__filter-chip" onClick={() => applySearch(s)}>★ {s.name}</button>
              <button className="adm__saved-x" onClick={() => removeSearch(s.name)} title="Remove saved search">×</button>
            </span>
          ))}
          {hasActiveSearch && (
            <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={saveCurrentSearch}>+ Save this search</button>
          )}
        </div>
      )}

      {/* Advanced filters (power user) */}
      {schema && (
        <div className="adm__filters">
          <button
            className="adm__btn adm__btn--ghost adm__btn-sm"
            onClick={() => setShowAdvFilters(s => !s)}
          >
            {showAdvFilters ? '▾' : '▸'} Advanced filters{advFilters.length > 0 ? ` (${advFilters.length} active)` : ''}
          </button>
          {showAdvFilters && (
            <button
              className="adm__btn adm__btn--ghost adm__btn-sm"
              onClick={() => setAdvFilters(f => [...f, { key: allFields[0]?.key || 'id', op: 'eq', value: '' }])}
            >+ Add condition</button>
          )}
        </div>
      )}
      {showAdvFilters && advFilters.length > 0 && (
        <div className="adm__adv">
          {advFilters.map((af, i) => {
            const field = allFields.find(f => f.key === af.key);
            const ops = opsForField(field);
            return (
              <div className="adm__adv-row" key={i}>
                <select className="adm__filter-chip"
                  value={af.key}
                  onChange={e => updateAdvFilter(i, { key: e.target.value, op: 'eq', value: '' }, advFilters, setAdvFilters)}>
                  {allFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
                <select className="adm__filter-chip"
                  value={af.op}
                  onChange={e => updateAdvFilter(i, { op: e.target.value }, advFilters, setAdvFilters)}>
                  {ops.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
                {af.op !== 'is_empty' && af.op !== 'is_not_empty' && (
                  field?.type === 'select' ? (
                    <select className="adm__filter-chip"
                      value={af.value}
                      onChange={e => updateAdvFilter(i, { value: e.target.value }, advFilters, setAdvFilters)}>
                      <option value="">—</option>
                      {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : field?.type === 'boolean' ? (
                    <select className="adm__filter-chip"
                      value={af.value}
                      onChange={e => updateAdvFilter(i, { value: e.target.value }, advFilters, setAdvFilters)}>
                      <option value="">—</option>
                      <option value="true">yes</option>
                      <option value="false">no</option>
                    </select>
                  ) : (
                    <input className="adm__filter-chip" style={{ minWidth: 140 }}
                      placeholder="value"
                      value={af.value}
                      onChange={e => updateAdvFilter(i, { value: e.target.value }, advFilters, setAdvFilters)} />
                  )
                )}
                <button className="adm__saved-x" title="Remove" onClick={() => setAdvFilters(advFilters.filter((_, j) => j !== i))}>×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk actions bar — appears when 1+ rows selected */}
      {selected.size > 0 && (
        <div className="adm__bulkbar">
          <span><b>{selected.size}</b> {selected.size === 1 ? 'record' : 'records'} selected</span>
          <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={exportSelected}>↑ Export selected</button>
          {canEdit && <button className="adm__btn adm__btn--danger adm__btn-sm" onClick={removeBulk}>Delete {selected.size}</button>}
        </div>
      )}

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {editing && (
        <RecordForm
          module={module} kind={kind}
          record={editing}
          onCancel={() => setEditing(null)}
          onSubmit={save}
        />
      )}

      {loading ? <p className="adm__msg">Loading…</p> : filtered.length === 0 ? (
        <div className="adm__panel" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>
          <p style={{ fontStyle: 'italic', margin: 0 }}>
            {records.length === 0
              ? <>No records yet. {canEdit ? 'Add the first one above, or import a CSV.' : ''}</>
              : <>No records match "<b>{q}</b>".</>}
          </p>
        </div>
      ) : (
        <>
          <table className="adm__table adm__table--bucket">
            <thead>
              <tr>
                <th className="adm__check-col">
                  <input
                    type="checkbox"
                    checked={pageItems.length > 0 && pageItems.every(r => selected.has(r.id))}
                    onChange={togglePageAll}
                    title="Select all on this page"
                  />
                </th>
                {displayFields ? displayFields.map(f => (
                  <th key={f.key} onClick={() => toggleSort(f.key, sortKey, sortDir, setSortKey, setSortDir)} style={{ cursor: 'pointer' }}>
                    {f.label} {sortKey === f.key && (sortDir === 'asc' ? '▲' : '▼')}
                  </th>
                )) : (
                  <>
                    <th>ID</th>
                    <th>Preview</th>
                  </>
                )}
                <th onClick={() => toggleSort('updatedAt', sortKey, sortDir, setSortKey, setSortDir)} style={{ cursor: 'pointer' }}>
                  Updated {sortKey === 'updatedAt' && (sortDir === 'asc' ? '▲' : '▼')}
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map(r => (
                <tr key={r.id} className={selected.has(r.id) ? 'is-selected' : ''}>
                  <td className="adm__check-col">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleSelect(r.id)}
                    />
                  </td>
                  {displayFields ? displayFields.map(f => (
                    <td key={f.key} style={f.mono ? { fontFamily: 'var(--font-mono)', fontSize: 12 } : null}>
                      {formatCell(r.data?.[f.key], f.type)}
                    </td>
                  )) : (
                    <>
                      <td><code style={{ fontSize: 11, color: 'var(--ink-5)' }}>{r.id.slice(0, 12)}</code></td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>
                        {previewText(r.data)}
                      </td>
                    </>
                  )}
                  <td style={{ color: 'var(--ink-5)', fontSize: 12 }}>{new Date(r.updatedAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => setEditing({ id: r.id, data: r.data })}>{canEdit ? 'Edit' : 'View'}</button>
                    {canEdit && <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => remove(r.id)}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="adm__pager">
              <button className="adm__btn adm__btn--ghost adm__btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</button>
              <span>Page {page + 1} of {totalPages}</span>
              <button className="adm__btn adm__btn--ghost adm__btn-sm" disabled={page === totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function toggleSort(key, sortKey, sortDir, setSortKey, setSortDir) {
  if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
  else { setSortKey(key); setSortDir('asc'); }
}

function formatCell(v, type) {
  if (v == null || v === '') return <span style={{ color: 'var(--ink-6)' }}>—</span>;
  if (type === 'currency') return '$' + Number(v).toLocaleString();
  if (type === 'boolean') return v ? '✓' : '·';
  if (typeof v === 'object') return <span style={{ color: 'var(--ink-5)', fontSize: 11 }}>{JSON.stringify(v).slice(0, 30)}…</span>;
  return String(v).slice(0, 60);
}

function RecordForm({ module, kind, record, onCancel, onSubmit }) {
  const schema = getSchema(module, kind);
  const [mode, setMode] = useState(schema ? 'fields' : 'json');
  const [data, setData] = useState(record.data || {});
  const [json, setJson] = useState(JSON.stringify(record.data || {}, null, 2));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const switchTo = (m) => {
    setErr('');
    if (m === 'json') setJson(JSON.stringify(data, null, 2));
    else {
      try { setData(JSON.parse(json)); }
      catch (e) { setErr('Cannot switch — fix JSON first: ' + e.message); return; }
    }
    setMode(m);
  };

  const submit = async (e, { andAnother = false } = {}) => {
    if (e?.preventDefault) e.preventDefault();
    setErr(''); setBusy(true);
    let payload = data;
    if (mode === 'json') {
      try { payload = JSON.parse(json); }
      catch (e) { setErr('Invalid JSON: ' + e.message); setBusy(false); return; }
    } else if (schema) {
      // Validate required fields
      const missing = schema.fields.filter(f => f.required && (payload[f.key] == null || payload[f.key] === ''));
      if (missing.length) {
        setErr(`Required: ${missing.map(f => f.label).join(', ')}`);
        setBusy(false); return;
      }
    }
    try { await onSubmit({ ...record, data: payload }, { andAnother }); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm__panel" style={{ maxWidth: 'none' }}>
      <div className="adm__panel-h" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>{module} · {kind} · {record.isNew ? 'new' : 'edit'}</span>
        {schema && (
          <span className="adm__mode-toggle">
            <button type="button" className={mode === 'fields' ? 'on' : ''} onClick={() => switchTo('fields')}>Fields</button>
            <button type="button" className={mode === 'json' ? 'on' : ''} onClick={() => switchTo('json')}>JSON</button>
          </span>
        )}
      </div>
      <h3 className="adm__panel-title">
        {record.isNew ? 'Create' : 'Edit'} {schema?.label || `${module} · ${kind}`}
      </h3>
      {!record.isNew && record.id && <EntityCrossref module={module} kind={kind} recordId={record.id} />}
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        {mode === 'fields' && schema ? (
          <TypedForm schema={schema} value={data} onChange={setData} />
        ) : (
          <div className="adm__field">
            <label className="adm__field-label">Data (JSON)</label>
            <textarea className="adm__field-textarea" value={json} onChange={e => setJson(e.target.value)} spellCheck={false} />
          </div>
        )}
        <div className="adm__actions">
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Saving…' : (record.isNew ? 'Create' : 'Save')}</button>
          {record.isNew && (
            <button className="adm__btn adm__btn--ghost" type="button" disabled={busy} onClick={(e) => submit(e, { andAnother: true })}>Save & add another</button>
          )}
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>

      {/* Per-record sharing (visible to owner + admins) */}
      {!record.isNew && record.id && (
        <div style={{ marginTop: 18 }}>
          <SharePanel recordId={record.id} />
        </div>
      )}

      {/* Comments thread for existing records */}
      {!record.isNew && record.id && (
        <div style={{ marginTop: 18 }}>
          <CommentThread target={record.id} label="Comments on this record" />
        </div>
      )}
    </div>
  );
}

function previewText(data) {
  if (!data || typeof data !== 'object') return String(data);
  // Pick first 2-3 string-ish fields
  const entries = Object.entries(data).filter(([_, v]) => v != null && typeof v !== 'object');
  return entries.slice(0, 3).map(([k, v]) => `${k}: ${String(v).slice(0, 40)}`).join('  ·  ');
}

// ── Advanced filter operators ─────────────────────────────────────────
function opsForField(field) {
  const baseOps = [
    { v: 'eq',           label: '= equals' },
    { v: 'neq',          label: '≠ not equal' },
    { v: 'is_empty',     label: 'is empty' },
    { v: 'is_not_empty', label: 'is not empty' },
  ];
  if (!field) return baseOps;
  if (field.type === 'number' || field.type === 'currency') {
    return [
      ...baseOps,
      { v: 'gt',  label: '> greater than' },
      { v: 'gte', label: '≥ at least' },
      { v: 'lt',  label: '< less than' },
      { v: 'lte', label: '≤ at most' },
    ];
  }
  if (field.type === 'text' || field.type === 'textarea') {
    return [
      ...baseOps,
      { v: 'contains',     label: 'contains' },
      { v: 'not_contains', label: 'does not contain' },
      { v: 'starts_with',  label: 'starts with' },
    ];
  }
  return baseOps;
}

function applyOp(value, op, target) {
  switch (op) {
    case 'is_empty':     return value == null || value === '';
    case 'is_not_empty': return value != null && value !== '';
    case 'eq':           return String(value ?? '').toLowerCase() === String(target).toLowerCase();
    case 'neq':          return String(value ?? '').toLowerCase() !== String(target).toLowerCase();
    case 'gt':           return Number(value) >  Number(target);
    case 'gte':          return Number(value) >= Number(target);
    case 'lt':           return Number(value) <  Number(target);
    case 'lte':          return Number(value) <= Number(target);
    case 'contains':     return String(value ?? '').toLowerCase().includes(String(target).toLowerCase());
    case 'not_contains': return !String(value ?? '').toLowerCase().includes(String(target).toLowerCase());
    case 'starts_with':  return String(value ?? '').toLowerCase().startsWith(String(target).toLowerCase());
    default:             return true;
  }
}

function updateAdvFilter(i, patch, list, setList) {
  setList(list.map((f, j) => j === i ? { ...f, ...patch } : f));
}
