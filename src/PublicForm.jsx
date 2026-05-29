// Public, unauthenticated form page. Mounted by App.jsx for the route
// /f/:slug — fetches the form schema from /api/public/forms/:slug and renders
// it (sections, multiselect, date, etc.), then submits anonymously.
import React, { useEffect, useState } from 'react';
import { api } from './auth/api';
import './PublicForm.css';

function Field({ f, value, onChange }) {
  const v = value;
  switch (f.type) {
    case 'textarea':
      return <textarea className="pf__input pf__textarea" value={v ?? ''} placeholder={f.placeholder || ''} onChange={(e) => onChange(e.target.value)} rows={4} />;
    case 'number':
      return <input className="pf__input" type="number" value={v ?? ''} placeholder={f.placeholder || ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'date':
      return <input className="pf__input" type="date" value={v ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <input className="pf__input" type="email" value={v ?? ''} placeholder={f.placeholder || ''} onChange={(e) => onChange(e.target.value)} />;
    case 'boolean':
      return (
        <label className="pf__check">
          <input type="checkbox" checked={!!v} onChange={(e) => onChange(e.target.checked)} />
          <span>{f.label}</span>
        </label>
      );
    case 'select':
      return (
        <select className="pf__input" value={v ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'multiselect': {
      const arr = Array.isArray(v) ? v : [];
      const atMax = f.max != null && arr.length >= f.max;
      const toggle = (opt) => {
        if (arr.includes(opt)) onChange(arr.filter((x) => x !== opt));
        else if (!atMax) onChange([...arr, opt]);
      };
      return (
        <div className="pf__multi">
          {(f.options || []).map((opt) => {
            const on = arr.includes(opt);
            const locked = !on && atMax;
            return (
              <label key={opt} className={'pf__chip' + (on ? ' is-on' : '') + (locked ? ' is-disabled' : '')}>
                <input type="checkbox" checked={on} disabled={locked} onChange={() => toggle(opt)} />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      );
    }
    default:
      return <input className="pf__input" type="text" value={v ?? ''} placeholder={f.placeholder || ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

export default function PublicForm({ slug }) {
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [status, setStatus] = useState('loading'); // loading | ready | submitting | done | notfound | error
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    api.getPublicForm(slug)
      .then((r) => { if (live) { setForm(r.form); setStatus('ready'); } })
      .catch(() => { if (live) setStatus('notfound'); });
    return () => { live = false; };
  }, [slug]);

  const set = (key, val) => setValues((prev) => ({ ...prev, [key]: val }));

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    // Client-side required check
    for (const f of form.fields) {
      const val = values[f.key];
      const empty = val == null || val === '' || (Array.isArray(val) && val.length === 0);
      if (f.required && empty) { setErr(`Please complete: ${f.label}`); return; }
    }
    setStatus('submitting');
    try {
      const r = await api.submitPublicForm(slug, values);
      if (r.redirectUrl) { window.location.href = r.redirectUrl; return; }
      setStatus('done');
    } catch (e2) {
      setErr(e2.message || 'Submission failed');
      setStatus('ready');
    }
  };

  if (status === 'loading') return <div className="pf"><div className="pf__card pf__muted">Loading…</div></div>;
  if (status === 'notfound') return <div className="pf"><div className="pf__card"><h1 className="pf__title">Form not found</h1><p className="pf__muted">This form may have been closed or the link is incorrect.</p></div></div>;
  if (status === 'done') return (
    <div className="pf">
      <div className="pf__card pf__card--done">
        <div className="pf__check-mark">✓</div>
        <h1 className="pf__title">Thank you.</h1>
        <p className="pf__muted">Your information has been received. We'll be in touch.</p>
      </div>
    </div>
  );

  // Group fields by section for rendering.
  const groups = [];
  let cur = null;
  for (const f of form.fields) {
    const sec = f.section || '';
    if (!cur || cur.name !== sec) { cur = { name: sec, fields: [] }; groups.push(cur); }
    cur.fields.push(f);
  }

  return (
    <div className="pf">
      <form className="pf__card" onSubmit={submit}>
        <h1 className="pf__title">{form.label}</h1>
        {groups.map((g, gi) => (
          <fieldset className="pf__group" key={gi}>
            {g.name && <legend className="pf__legend">{g.name}</legend>}
            <div className="pf__grid">
              {g.fields.map((f) => (
                <div className={'pf__field' + (f.half ? ' pf__field--half' : '') + (f.type === 'boolean' ? ' pf__field--bool' : '')} key={f.key}>
                  {f.type !== 'boolean' && (
                    <label className="pf__label">
                      {f.label}{f.required && <span className="pf__req">*</span>}
                      {f.hint && <em className="pf__hint"> · {f.hint}</em>}
                    </label>
                  )}
                  <Field f={f} value={values[f.key]} onChange={(val) => set(f.key, val)} />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        {err && <div className="pf__err">{err}</div>}
        <button className="pf__submit" type="submit" disabled={status === 'submitting'}>
          {status === 'submitting' ? 'Submitting…' : 'Submit'}
        </button>
      </form>
    </div>
  );
}
