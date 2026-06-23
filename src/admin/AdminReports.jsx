// AdminReports — schedule recurring CSV reports → email.
// Admin-only.
import { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { MODULE_KINDS } from './AdminData';

const KINDS = [
  { value: 'bucket_csv',       label: 'Bucket → CSV',     desc: 'Export all records of a (module, kind) bucket.' },
  { value: 'audit_log',        label: 'Audit log',        desc: 'Audit-log entries since the last run.' },
  { value: 'social_analytics', label: 'Social analytics', desc: 'Beacon published-post performance (CSV) emailed on a schedule.' },
];

const INTERVAL_PRESETS = [
  { mins: 15,    label: 'Every 15 min' },
  { mins: 60,    label: 'Hourly' },
  { mins: 360,   label: 'Every 6 hours' },
  { mins: 1440,  label: 'Daily' },
  { mins: 10080, label: 'Weekly' },
];

export default function AdminReports() {
  const [reports, setReports] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');

  const load = async () => {
    setErr('');
    try { const r = await api.listReports(); setReports(r.reports || []); }
    catch (e) { setErr(e.message); }
  };

  useEffect(() => { load(); }, []);

  const runNow = async (id) => {
    setBusy(true);
    try {
      const r = await api.runReportNow(id);
      setFlash(`Sent: ${r.summary} (${r.count} rows)`);
      setTimeout(() => setFlash(''), 5000);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const togglePause = async (rep) => {
    setBusy(true);
    try { await api.updateReport(rep.id, { active: !rep.active }); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const removeReport = async (id) => {
    if (!confirm('Delete this scheduled report?')) return;
    setBusy(true);
    try { await api.deleteReport(id); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
        <p className="adm__msg" style={{ margin: 0, flex: 1 }}>
          Schedule recurring exports of buckets or audit-log slices, emailed as CSV. The first send happens after the interval elapses, or immediately via "Run now".
        </p>
        <button className="adm__btn" onClick={() => setShowCreate(true)}>+ New report</button>
      </div>

      {flash && <div className="adm__msg adm__msg--ok" style={{ marginBottom: 12 }}>{flash}</div>}
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}

      {showCreate && (
        <ReportEditor
          onCancel={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}

      {reports.length === 0 ? (
        <p className="adm__empty">No scheduled reports yet.</p>
      ) : (
        <table className="adm__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Kind</th>
              <th>Interval</th>
              <th>To</th>
              <th>Last run</th>
              <th>Next run</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {reports.map(r => (
              <tr key={r.id} className={r.active ? '' : 'is-paused'}>
                <td><b>{r.name}</b></td>
                <td><code>{r.kind}</code>{r.kind === 'bucket_csv' && r.params?.module && <em style={{ color: 'var(--ink-5)' }}> · {r.params.module}/{r.params.kind}</em>}</td>
                <td>{intervalLabel(r.intervalMinutes)}</td>
                <td><code>{r.targetEmail}</code></td>
                <td>{r.lastRunAt ? fmt(r.lastRunAt) : '—'}</td>
                <td>{r.active ? (r.nextRunAt ? fmt(r.nextRunAt) : '—') : <em style={{ color: 'var(--ink-5)' }}>paused</em>}</td>
                <td>{
                  r.lastStatus === 'ok' ? <span className="adm__pill adm__pill--ok">ok</span> :
                  r.lastStatus === 'failed' ? <span className="adm__pill adm__pill--err" title={r.lastError}>failed</span> :
                  <em style={{ color: 'var(--ink-5)' }}>—</em>
                }</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" disabled={busy} onClick={() => runNow(r.id)}>Run now</button>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" style={{ marginLeft: 6 }} disabled={busy} onClick={() => togglePause(r)}>{r.active ? 'Pause' : 'Resume'}</button>
                  <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} disabled={busy} onClick={() => removeReport(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReportEditor({ onCancel, onSaved }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState('bucket_csv');
  const [bucketModule, setBucketModule] = useState('raise');
  const [bucketKind, setBucketKind] = useState('donor');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [targetEmail, setTargetEmail] = useState('');
  const [intervalMinutes, setIntervalMinutes] = useState(1440);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const params = kind === 'bucket_csv'
      ? { module: bucketModule, kind: bucketKind, includeDeleted }
      : {};
    try {
      await api.createReport({ name: name.trim(), kind, params, targetEmail: targetEmail.trim(), intervalMinutes, active: true });
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const moduleOpts = MODULE_KINDS.find(m => m.module === bucketModule)?.kinds || [];

  return (
    <div className="adm__panel-inset">
      <h3 className="adm__panel-title">New scheduled report</h3>
      <form onSubmit={submit} className="adm__form-grid">
        <div className="adm__field">
          <label className="adm__field-label">Name</label>
          <input className="adm__field-input" required value={name} onChange={e => setName(e.target.value)} placeholder="Daily donors digest" />
        </div>
        <div className="adm__field">
          <label className="adm__field-label">Send to (email)</label>
          <input className="adm__field-input" required type="email" value={targetEmail} onChange={e => setTargetEmail(e.target.value)} placeholder="finance@campaign.org" />
        </div>
        <div className="adm__field">
          <label className="adm__field-label">Kind</label>
          <select className="adm__field-input" value={kind} onChange={e => setKind(e.target.value)}>
            {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
          <p className="adm__field-hint">{KINDS.find(k => k.value === kind)?.desc}</p>
        </div>
        <div className="adm__field">
          <label className="adm__field-label">Cadence</label>
          <select className="adm__field-input" value={intervalMinutes} onChange={e => setIntervalMinutes(Number(e.target.value))}>
            {INTERVAL_PRESETS.map(p => <option key={p.mins} value={p.mins}>{p.label}</option>)}
          </select>
        </div>

        {kind === 'bucket_csv' && (
          <>
            <div className="adm__field">
              <label className="adm__field-label">Module</label>
              <select className="adm__field-input" value={bucketModule} onChange={e => { setBucketModule(e.target.value); const first = MODULE_KINDS.find(m => m.module === e.target.value)?.kinds[0]?.kind; if (first) setBucketKind(first); }}>
                {MODULE_KINDS.map(m => <option key={m.module} value={m.module}>{m.module}</option>)}
              </select>
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Bucket</label>
              <select className="adm__field-input" value={bucketKind} onChange={e => setBucketKind(e.target.value)}>
                {moduleOpts.map(k => <option key={k.kind} value={k.kind}>{k.label} ({k.kind})</option>)}
              </select>
            </div>
            <div className="adm__field" style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={includeDeleted} onChange={e => setIncludeDeleted(e.target.checked)} />
                <span className="adm__field-hint">Include soft-deleted records</span>
              </label>
            </div>
          </>
        )}

        {err && <div className="adm__msg adm__msg--err" style={{ gridColumn: '1 / -1' }}>{err}</div>}
        <div className="adm__actions" style={{ gridColumn: '1 / -1' }}>
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Schedule report'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function intervalLabel(mins) {
  const preset = INTERVAL_PRESETS.find(p => p.mins === mins);
  if (preset) return preset.label;
  if (mins < 60) return `Every ${mins} min`;
  if (mins < 1440) return `Every ${Math.round(mins / 60)} h`;
  return `Every ${Math.round(mins / 1440)} d`;
}

function fmt(d) {
  try { return new Date(d).toLocaleString(); } catch { return String(d); }
}
