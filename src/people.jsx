import React from 'react';
import './people.css';
import { VOLUNTEERS } from './people-data';
import { useLiveRecords } from './auth/useLiveRecords';
import { getSchema } from './admin/schemas';
import { ageOf } from './util';
import EmptyModule from './EmptyModule';

// Mandate 2.0 — People module
// Volunteer roster + a dossier rendered straight from the people.volunteer
// schema, so the detail view always matches the intake form field-for-field.

const { useState: pUS } = React;

const SCHEMA = getSchema('people', 'volunteer');

const fullName = (v) => [v.first, v.last].filter(Boolean).join(' ') || v.id || 'Unnamed';
const recKey = (v) => v._dbId ?? v.id;

// Turn a stored field value into something displayable, or null to skip.
function displayValue(field, val) {
  if (val == null || val === '') return null;
  if (Array.isArray(val)) return val.length ? val : null;
  if (field.type === 'boolean') return val ? ['Yes'] : null; // only surface true flags
  return String(val);
}

// Group the schema's non-empty fields by section for the dossier.
function dossierSections(v) {
  const out = [];
  let cur = null;
  for (const f of SCHEMA.fields) {
    if (f.key === 'id' || f.key === 'first' || f.key === 'last') continue; // in header
    const sec = f.section || 'Other';
    if (!cur || cur.name !== sec) { cur = { name: sec, rows: [] }; out.push(cur); }
    const dv = displayValue(f, v[f.key]);
    if (dv != null) cur.rows.push({ f, dv });
  }
  return out.filter((s) => s.rows.length);
}

function Dossier({ v }) {
  const sections = dossierSections(v);
  const age = ageOf(v);
  return (
    <div className="ppl-dossier">
      <div className="ppl-dossier__head">
        <div className="ppl-dossier__name">{fullName(v)}</div>
        <div className="ppl-dossier__meta">
          {[age != null ? age + ' yrs' : null, v.riding, v.status].filter(Boolean).join(' · ') || '—'}
        </div>
      </div>
      {sections.map((s) => (
        <div className="ppl-sec" key={s.name}>
          <div className="ppl-sec__title">{s.name}</div>
          <div className="ppl-sec__rows">
            {s.rows.map(({ f, dv }) => (
              <div className="ppl-row" key={f.key}>
                <div className="ppl-row__label">{f.label}</div>
                <div className="ppl-row__val">
                  {Array.isArray(dv)
                    ? <div className="ppl-chips">{dv.map((x, i) => <span className="ppl-chip" key={i}>{x}</span>)}</div>
                    : dv}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function People() {
  const { records: vols, isEmpty } = useLiveRecords('people', 'volunteer', VOLUNTEERS);
  const [sel, setSel] = pUS(null);
  const [q, setQ] = pUS('');
  const [status, setStatus] = pUS('all');

  if (isEmpty) return <EmptyModule module="People" label="People" accent="var(--m-people)" />;

  const ql = q.trim().toLowerCase();
  const filtered = vols.filter((v) => {
    if (status !== 'all' && (v.status || 'prospect') !== status) return false;
    if (ql) {
      const hay = [v.first, v.last, v.email1, v.city, v.riding,
        ...(v.preferredRoles || []), ...(v.skills || []), ...(v.languages || [])]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(ql)) return false;
    }
    return true;
  });

  const effSel = sel ?? (filtered[0] && recKey(filtered[0])) ?? null;
  const open = vols.find((v) => recKey(v) === effSel) || filtered[0] || null;

  const count = (pred) => vols.filter(pred).length;
  const stats = [
    { label: 'Volunteers', val: vols.length },
    { label: 'Active', val: count((v) => v.status === 'active') },
    { label: 'Prospects', val: count((v) => (v.status || 'prospect') === 'prospect') },
    { label: 'Want to run', val: count((v) => v.wantsToRun) },
    { label: 'Can drive', val: count((v) =>
        (v.preferredRoles || []).some((r) => /driving/i.test(r)) ||
        (v.workExperience || []).includes('Professional driver')) },
  ];

  return (
    <div className="ppl">
      <div className="ppl__stats">
        {stats.map((s) => (
          <div className="ppl__stat" key={s.label}>
            <div className="ppl__stat-val">{s.val}</div>
            <div className="ppl__stat-lbl">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="ppl__body">
        <div className="ppl__list">
          <div className="ppl__controls">
            <input
              className="ppl__search"
              placeholder="Search name, email, role, skill…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select className="ppl__filter" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="prospect">Prospect</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="declined">Declined</option>
            </select>
          </div>
          <div className="ppl__roster">
            {filtered.length === 0
              ? <div className="ppl__none">No volunteers match.</div>
              : filtered.map((v) => {
                  const key = recKey(v);
                  return (
                    <div
                      key={key}
                      className={'ppl__item' + (key === effSel ? ' is-on' : '')}
                      onClick={() => setSel(key)}
                    >
                      <div className="ppl__item-name">{fullName(v)}</div>
                      <div className="ppl__item-sub">
                        {[v.riding, (v.preferredRoles || [])[0], v.status].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>

        <div className="ppl__detail">
          {open ? <Dossier v={open} /> : <div className="ppl__none">Select a volunteer.</div>}
        </div>
      </div>
    </div>
  );
}

export default People;
