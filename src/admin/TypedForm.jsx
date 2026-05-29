// Renders a form for a record based on its schema.
// Uses simple controlled inputs styled to match admin.
import React, { useState } from 'react';

export default function TypedForm({ schema, value, onChange }) {
  // Track tag input drafts (per-key) to allow space-separated entry
  const [tagDrafts, setTagDrafts] = useState({});

  const set = (key, v) => onChange({ ...value, [key]: v });

  // Fields may declare an optional `section`; we emit a header the first time
  // each section appears so long schemas (e.g. the volunteer intake) read as
  // grouped sections rather than one flat wall of inputs.
  let lastSection = null;

  return (
    <div className="adm__typed">
      {schema.fields.map((f) => {
        const showHeader = f.section && f.section !== lastSection;
        if (f.section) lastSection = f.section;
        return (
          <React.Fragment key={f.key}>
            {showHeader && <div className="adm__section">{f.section}</div>}
            <div className={'adm__field' + (f.half ? ' adm__field--half' : '')}>
              <label className="adm__field-label">
                {f.label}
                {f.required && <span className="adm__req">*</span>}
                {f.hint && <em className="adm__hint"> · {f.hint}</em>}
              </label>
              {renderInput(f, value, set, tagDrafts, setTagDrafts)}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function renderInput(f, value, set, tagDrafts, setTagDrafts) {
  const v = value?.[f.key];
  const cls = `adm__field-input${f.mono ? ' adm__field-input--mono' : ''}`;

  switch (f.type) {
    case 'text':
      return (
        <input
          className={cls}
          type="text"
          value={v ?? ''}
          placeholder={f.placeholder || ''}
          onChange={(e) => set(f.key, e.target.value)}
        />
      );
    case 'textarea':
      return (
        <textarea
          className="adm__field-textarea adm__field-textarea--prose"
          value={v ?? ''}
          placeholder={f.placeholder || ''}
          rows={4}
          onChange={(e) => set(f.key, e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          className={cls + ' adm__field-input--mono'}
          type="number"
          step={f.step ?? 1}
          min={f.min}
          max={f.max}
          value={v ?? ''}
          placeholder={f.placeholder || ''}
          onChange={(e) => set(f.key, e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'currency':
      return (
        <div className="adm__field-currency">
          <span className="adm__field-prefix">$</span>
          <input
            className={cls + ' adm__field-input--mono'}
            type="number"
            step="0.01"
            value={v ?? ''}
            placeholder="0.00"
            onChange={(e) => set(f.key, e.target.value === '' ? null : Number(e.target.value))}
          />
        </div>
      );
    case 'percent':
      return (
        <input
          className={cls + ' adm__field-input--mono'}
          type="number"
          step={f.step ?? 0.1}
          min={f.min}
          max={f.max}
          value={v ?? ''}
          placeholder={f.placeholder || '0'}
          onChange={(e) => set(f.key, e.target.value === '' ? null : Number(e.target.value))}
        />
      );
    case 'date':
      return (
        <input
          className={cls + ' adm__field-input--mono'}
          type="date"
          value={v ?? ''}
          onChange={(e) => set(f.key, e.target.value || null)}
        />
      );
    case 'select':
      return (
        <select
          className="adm__field-select"
          value={v ?? ''}
          onChange={(e) => set(f.key, e.target.value)}
        >
          <option value="">—</option>
          {f.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    case 'boolean':
      return (
        <label className="adm__field-bool">
          <input
            type="checkbox"
            checked={!!v}
            onChange={(e) => set(f.key, e.target.checked)}
          />
          <span>{v ? 'yes' : 'no'}</span>
        </label>
      );
    case 'tags': {
      const arr = Array.isArray(v) ? v : [];
      const draft = tagDrafts[f.key] ?? '';
      const commit = () => {
        const t = draft.trim();
        if (!t) return;
        if (!arr.includes(t)) set(f.key, [...arr, t]);
        setTagDrafts({ ...tagDrafts, [f.key]: '' });
      };
      return (
        <div className="adm__field-tags">
          {arr.map((t, i) => (
            <span key={i} className="adm__tag">
              {t}
              <button
                type="button"
                onClick={() => set(f.key, arr.filter((x) => x !== t))}
                aria-label="Remove tag"
              >×</button>
            </span>
          ))}
          <input
            type="text"
            className="adm__tag-input"
            placeholder="add tag…"
            value={draft}
            onChange={(e) => setTagDrafts({ ...tagDrafts, [f.key]: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commit();
              }
              if (e.key === 'Backspace' && !draft && arr.length) {
                set(f.key, arr.slice(0, -1));
              }
            }}
            onBlur={commit}
          />
        </div>
      );
    }
    case 'multiselect': {
      const arr = Array.isArray(v) ? v : [];
      const atMax = f.max != null && arr.length >= f.max;
      const toggle = (opt) => {
        if (arr.includes(opt)) set(f.key, arr.filter((x) => x !== opt));
        else if (!atMax) set(f.key, [...arr, opt]);
      };
      return (
        <div className="adm__field-multi">
          {(f.options || []).map((opt) => {
            const on = arr.includes(opt);
            const locked = !on && atMax;
            return (
              <label
                key={opt}
                className={'adm__multi-opt' + (on ? ' is-on' : '') + (locked ? ' is-disabled' : '')}
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={locked}
                  onChange={() => toggle(opt)}
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }
    default:
      return (
        <input
          className={cls}
          type="text"
          value={v ?? ''}
          onChange={(e) => set(f.key, e.target.value)}
        />
      );
  }
}
