// DashboardBoard — per-user custom widget board.
// Renders inside admin Overview. Lets the user add/remove/reorder/edit widgets.
import { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { MODULE_KINDS } from './AdminData';
import './DashboardBoard.css';

const KIND_LABELS = {
  metric: 'Metric tile',
  list:   'Recent records',
  audit:  'Recent activity',
  note:   'Note / markdown',
};
const WIDTHS = [
  { key: 'third', label: '⅓' },
  { key: 'half',  label: '½' },
  { key: 'full',  label: '⌧ full' },
];

export default function DashboardBoard() {
  const [widgets, setWidgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);  // widget id or 'new'

  const load = async () => {
    setErr('');
    try { const r = await api.listWidgets(); setWidgets(r.widgets || []); }
    catch (e) { setErr(e.message); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= widgets.length) return;
    const items = widgets.map((w, idx) => ({ id: w.id, position: idx }));
    [items[i].position, items[j].position] = [items[j].position, items[i].position];
    await api.reorderWidgets(items);
    await load();
  };

  const remove = async (id) => {
    if (!confirm('Remove this widget?')) return;
    await api.deleteWidget(id);
    await load();
  };

  if (loading) return null;

  return (
    <section className="dash">
      <header className="dash__head">
        <h2 className="dash__title">My dashboard</h2>
        <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => setEditing('new')}>+ Add widget</button>
      </header>

      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}

      {editing === 'new' && (
        <WidgetEditor
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}

      {widgets.length === 0 ? (
        <div className="dash__empty">
          No widgets yet. Pin a metric, recent-records list, audit feed, or note above your usual overview.
        </div>
      ) : (
        <div className="dash__grid">
          {widgets.map((w, i) => (
            editing === w.id ? (
              <WidgetEditor key={w.id}
                widget={w}
                width={w.width}
                onCancel={() => setEditing(null)}
                onSaved={() => { setEditing(null); load(); }}
              />
            ) : (
              <Card key={w.id} widget={w}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                onEdit={() => setEditing(w.id)}
                onRemove={() => remove(w.id)}
                isFirst={i === 0}
                isLast={i === widgets.length - 1}
              />
            )
          ))}
        </div>
      )}
    </section>
  );
}

function Card({ widget, onMoveUp, onMoveDown, onEdit, onRemove, isFirst, isLast }) {
  return (
    <article className={`dash__card dash__card--${widget.width}`}>
      <header className="dash__card-head">
        <div className="dash__card-kind">{widget.kind}</div>
        <h3 className="dash__card-title">{widget.title}</h3>
        <div className="dash__card-actions">
          <button title="Move up"   disabled={isFirst} onClick={onMoveUp}>↑</button>
          <button title="Move down" disabled={isLast}  onClick={onMoveDown}>↓</button>
          <button title="Edit"      onClick={onEdit}>✎</button>
          <button title="Remove"    onClick={onRemove}>×</button>
        </div>
      </header>
      <div className="dash__card-body">
        <Renderer widget={widget} />
      </div>
    </article>
  );
}

function Renderer({ widget }) {
  const data = widget.data || {};
  if (data.error) return <div className="dash__err">{data.error}</div>;
  switch (widget.kind) {
    case 'metric':
      return (
        <div className="dash__metric">
          <div className="dash__metric-num">{Number(data.count ?? 0).toLocaleString()}</div>
          <div className="dash__metric-delta">
            {data.delta24h > 0 ? `+${data.delta24h} in 24h` :
             data.delta24h === 0 ? 'no change in 24h' :
             `${data.delta24h} in 24h`}
          </div>
        </div>
      );
    case 'list':
      return data.records?.length ? (
        <ul className="dash__list">
          {data.records.map(r => (
            <li key={r.id}>
              <b>{firstField(r.data)}</b>
              <em>{describeFields(r.data)}</em>
            </li>
          ))}
        </ul>
      ) : <p className="dash__empty-inline">No records.</p>;
    case 'audit':
      return data.entries?.length ? (
        <ul className="dash__audit">
          {data.entries.map(e => (
            <li key={e.id}>
              <span className="dash__audit-when">{relTime(e.createdAt)}</span>
              <code>{e.action}</code>
              <span className="dash__audit-who">· {e.userName}</span>
            </li>
          ))}
        </ul>
      ) : <p className="dash__empty-inline">No recent activity.</p>;
    case 'note':
      return <div className="dash__note" dangerouslySetInnerHTML={{ __html: minimalMd(data.text || '') }} />;
    default:
      return <em>unknown widget kind</em>;
  }
}

function WidgetEditor({ widget, onSaved, onCancel }) {
  const isNew = !widget;
  const [kind, setKind] = useState(widget?.kind || 'metric');
  const [title, setTitle] = useState(widget?.title || '');
  const [width, setWidth] = useState(widget?.width || 'half');
  const [params, setParams] = useState(widget?.params || {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (isNew) await api.createWidget({ kind, title: title.trim(), params, width });
      else       await api.updateWidget(widget.id, { title: title.trim(), params, width });
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // Default-pick a sensible (module, kind) tuple for metric/list widgets.
  const defaultBucket = () => MODULE_KINDS[0]?.kinds[0] && { module: MODULE_KINDS[0].module, kind: MODULE_KINDS[0].kinds[0].kind };
  if ((kind === 'metric' || kind === 'list') && !params.module) {
    const d = defaultBucket();
    if (d) setParams({ ...params, ...d });
  }

  const moduleOpts = MODULE_KINDS.find(m => m.module === params.module)?.kinds || [];

  return (
    <form className="dash__editor" onSubmit={submit}>
      <h3 className="adm__panel-title" style={{ marginTop: 0 }}>{isNew ? 'New widget' : 'Edit widget'}</h3>
      <div className="adm__form-grid">
        {isNew && (
          <div className="adm__field">
            <label className="adm__field-label">Kind</label>
            <select className="adm__field-input" value={kind} onChange={e => { setKind(e.target.value); setParams({}); }}>
              {Object.entries(KIND_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
        )}
        <div className="adm__field">
          <label className="adm__field-label">Title</label>
          <input className="adm__field-input" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Donors this week" />
        </div>
        <div className="adm__field">
          <label className="adm__field-label">Width</label>
          <select className="adm__field-input" value={width} onChange={e => setWidth(e.target.value)}>
            {WIDTHS.map(w => <option key={w.key} value={w.key}>{w.label}</option>)}
          </select>
        </div>

        {(kind === 'metric' || kind === 'list') && (
          <>
            <div className="adm__field">
              <label className="adm__field-label">Module</label>
              <select className="adm__field-input" value={params.module || ''} onChange={e => {
                const first = MODULE_KINDS.find(m => m.module === e.target.value)?.kinds[0]?.kind;
                setParams({ ...params, module: e.target.value, kind: first });
              }}>
                {MODULE_KINDS.map(m => <option key={m.module} value={m.module}>{m.module}</option>)}
              </select>
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Bucket</label>
              <select className="adm__field-input" value={params.kind || ''} onChange={e => setParams({ ...params, kind: e.target.value })}>
                {moduleOpts.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
              </select>
            </div>
            {kind === 'list' && (
              <div className="adm__field">
                <label className="adm__field-label">Limit</label>
                <input type="number" min="1" max="25" className="adm__field-input"
                  value={params.limit ?? 5} onChange={e => setParams({ ...params, limit: Number(e.target.value) })} />
              </div>
            )}
          </>
        )}

        {kind === 'audit' && (
          <div className="adm__field">
            <label className="adm__field-label">Limit</label>
            <input type="number" min="1" max="25" className="adm__field-input"
              value={params.limit ?? 8} onChange={e => setParams({ ...params, limit: Number(e.target.value) })} />
          </div>
        )}

        {kind === 'note' && (
          <div className="adm__field" style={{ gridColumn: '1 / -1' }}>
            <label className="adm__field-label">Text (markdown: **bold**, *italic*, line breaks)</label>
            <textarea className="adm__field-textarea" rows={6}
              value={params.text || ''} onChange={e => setParams({ ...params, text: e.target.value })} />
          </div>
        )}

        {err && <div className="adm__msg adm__msg--err" style={{ gridColumn: '1 / -1' }}>{err}</div>}
        <div className="adm__actions" style={{ gridColumn: '1 / -1' }}>
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Saving…' : (isNew ? 'Add widget' : 'Save')}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </form>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────
function firstField(data) {
  if (!data) return '';
  for (const k of ['name', 'title', 'label', 'subject']) if (data[k]) return String(data[k]);
  for (const [, v] of Object.entries(data)) if (typeof v === 'string') return v;
  return '(record)';
}
function describeFields(data) {
  if (!data) return '';
  const skip = new Set(['name', 'title', 'label', 'subject']);
  const parts = [];
  for (const [k, v] of Object.entries(data)) {
    if (skip.has(k)) continue;
    if (v === null || typeof v === 'object') continue;
    parts.push(`${k}: ${String(v).slice(0, 30)}`);
    if (parts.length >= 2) break;
  }
  return parts.join(' · ');
}
function relTime(ts) {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}
// Tiny safe-ish markdown subset: bold, italic, line breaks. Escape HTML.
function minimalMd(text) {
  const esc = String(text).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}
