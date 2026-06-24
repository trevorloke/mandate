import React, { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';

const ALL_MODULES = [
  { k: 'ground',     label: 'Ground',     desc: 'Voter universes · canvass · field' },
  { k: 'beacon',     label: 'Beacon',     desc: 'Social · publishing · listening · press' },
  { k: 'raise',      label: 'Raise',      desc: 'Donors · prospects · gifts' },
  { k: 'ledger',     label: 'Ledger',     desc: 'Books · journal · filings · compliance' },
  { k: 'coalition',  label: 'Coalition',  desc: 'Endorsements · orgs · asks' },
  { k: 'civic',      label: 'Civic',      desc: 'Bills · cases · promises · hansard' },
  { k: 'opposition', label: 'Opposition', desc: 'Targets · claims · evidence · rebuttals' },
  { k: 'site',       label: 'Site',       desc: 'Pages · CMS · experiments' },
  { k: 'events',     label: 'Events',     desc: 'Schedule · venues · hosts · shifts' },
  { k: 'academy',    label: 'Academy',    desc: 'Courses · faculty · reading' },
  { k: 'command',    label: 'Command',    desc: 'War-room chat · channels' },
  { k: 'tide',       label: 'Tide',       desc: 'Attention chart · panel · sentiment · why' },
];

export default function AdminWorkspace() {
  const { workspace, setWorkspace, has } = useAuth();
  const [form, setForm] = useState({});
  const [moduleEnabled, setModuleEnabled] = useState({});
  const [trashDays, setTrashDays] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (workspace) {
      setForm({
        name: workspace.name || '',
        kind: workspace.kind || '',
        candidate: workspace.candidate || '',
        party: workspace.party || '',
        phase: workspace.phase || '',
        daysToVote: workspace.daysToVote || 0,
        tz: workspace.tz || 'PT',
      });
      // Module enable map: default true for any not yet set
      const stored = workspace.settings?.modules || {};
      const next = {};
      ALL_MODULES.forEach(m => { next[m.k] = stored[m.k] !== false; });
      setModuleEnabled(next);

      // Retention
      setTrashDays(Number(workspace.settings?.retention?.trashDays) || 0);
    }
  }, [workspace]);

  const canEdit = has('admin');

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      const settings = {
        ...(workspace?.settings || {}),
        modules: moduleEnabled,
        retention: { trashDays: Number(trashDays) || 0 },
      };
      const updated = await api.updateWorkspace({
        ...form,
        daysToVote: Number(form.daysToVote),
        settings,
      });
      setWorkspace(updated.workspace);
      setMsg({ kind: 'ok', text: 'Workspace updated.' });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  const toggleModule = (k) => setModuleEnabled(m => ({ ...m, [k]: !m[k] }));

  if (!workspace) return <p className="adm__msg">Loading…</p>;

  return (
    <div>
      <div className="adm__panel">
        <div className="adm__panel-h">Workspace · profile</div>
        <h3 className="adm__panel-title">Identity</h3>

        <form onSubmit={submit}>
          <div className="adm__field">
            <label className="adm__field-label">Workspace name</label>
            <input className="adm__field-input" disabled={!canEdit} value={form.name || ''} onChange={set('name')} />
          </div>

          <div className="adm__field-row">
            <div className="adm__field">
              <label className="adm__field-label">Kind</label>
              <input className="adm__field-input" disabled={!canEdit} value={form.kind || ''} onChange={set('kind')} placeholder="PROVINCIAL · MLA" />
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Phase</label>
              <select className="adm__field-select" disabled={!canEdit} value={form.phase || ''} onChange={set('phase')}>
                <option value="">—</option>
                <option>Pre-launch</option>
                <option>Recruitment</option>
                <option>Persuasion</option>
                <option>GOTV</option>
                <option>Post-election</option>
              </select>
            </div>
          </div>

          <div className="adm__field-row">
            <div className="adm__field">
              <label className="adm__field-label">Candidate</label>
              <input className="adm__field-input" disabled={!canEdit} value={form.candidate || ''} onChange={set('candidate')} />
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Party</label>
              <input className="adm__field-input" disabled={!canEdit} value={form.party || ''} onChange={set('party')} />
            </div>
          </div>

          <div className="adm__field-row">
            <div className="adm__field">
              <label className="adm__field-label">Days to vote</label>
              <input className="adm__field-input" type="number" disabled={!canEdit} value={form.daysToVote || 0} onChange={set('daysToVote')} />
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Timezone</label>
              <input className="adm__field-input" disabled={!canEdit} value={form.tz || ''} onChange={set('tz')} />
            </div>
          </div>

          {canEdit && (
            <div className="adm__actions">
              <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              {msg && <span className={`adm__msg adm__msg--${msg.kind}`}>{msg.text}</span>}
            </div>
          )}
          {!canEdit && <p className="adm__msg" style={{ marginTop: 12 }}>You have read-only access. Ask an admin to edit workspace settings.</p>}
        </form>
      </div>

      <div className="adm__panel">
        <div className="adm__panel-h">Workspace · modules</div>
        <h3 className="adm__panel-title">Enabled modules</h3>
        <p className="adm__msg" style={{ marginBottom: 14 }}>
          Disabled modules are hidden from the navigation for everyone in this workspace.
          {!canEdit && <em> Read-only.</em>}
        </p>
        <div className="adm__modgrid">
          {ALL_MODULES.map(m => (
            <label key={m.k} className={'adm__modcard' + (moduleEnabled[m.k] ? ' is-on' : ' is-off')}>
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={!!moduleEnabled[m.k]}
                onChange={() => toggleModule(m.k)}
              />
              <div>
                <div className="adm__modcard-h">{m.label}</div>
                <div className="adm__modcard-d">{m.desc}</div>
              </div>
              <span className="adm__modcard-state">{moduleEnabled[m.k] ? 'on' : 'off'}</span>
            </label>
          ))}
        </div>
        {canEdit && (
          <div className="adm__actions">
            <button className="adm__btn" onClick={submit} disabled={busy} type="button">
              {busy ? 'Saving…' : 'Save modules'}
            </button>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="adm__panel">
          <div className="adm__panel-h">Workspace · retention</div>
          <h3 className="adm__panel-title">Trash retention</h3>
          <p className="adm__msg" style={{ marginBottom: 12 }}>
            Auto-purge soft-deleted records once they have been in the trash this many days.
            Set <b>0</b> to keep forever (records still need to be purged manually).
          </p>
          <div className="adm__field-row" style={{ maxWidth: 420 }}>
            <div className="adm__field">
              <label className="adm__field-label">Auto-purge after (days)</label>
              <input className="adm__field-input adm__field-input--mono" type="number" min={0}
                value={trashDays} onChange={e => setTrashDays(e.target.value)} />
            </div>
          </div>
          <div className="adm__actions">
            <button className="adm__btn" onClick={submit} disabled={busy} type="button">
              {busy ? 'Saving…' : 'Save retention'}
            </button>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="adm__panel">
          <div className="adm__panel-h">Workspace · backup</div>
          <h3 className="adm__panel-title">Export &amp; import</h3>
          <p className="adm__msg" style={{ marginBottom: 12 }}>
            Snapshot includes workspace identity + all module records (excluding trash).
          </p>
          <div className="adm__actions">
            <a className="adm__btn" href="/api/workspace/backup/export" download>↓ Download snapshot</a>
            <button className="adm__btn adm__btn--ghost" type="button"
                    onClick={() => document.getElementById('mdt-backup-import').click()}>
              ↑ Import snapshot
            </button>
            <input id="mdt-backup-import" type="file" accept=".json" style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
                try {
                  const text = await file.text();
                  const snapshot = JSON.parse(text);
                  const append = confirm('Import this snapshot?\n\n[OK] = APPEND records to existing workspace.\n[Cancel] = REPLACE all existing records.');
                  const r = await api.importBackup(snapshot, append ? 'append' : 'replace');
                  setMsg({ kind: 'ok', text: `Imported ${r.recordsImported} records (${r.mode}).` });
                } catch (err) {
                  setMsg({ kind: 'err', text: 'Import failed: ' + err.message });
                }
              }} />
          </div>
        </div>
      )}

      <div className="adm__panel">
        <div className="adm__panel-h">Workspace · system</div>
        <h3 className="adm__panel-title">Identifiers</h3>
        <table className="adm__table">
          <tbody>
            <tr><td style={{ width: 200, color: 'var(--ink-5)' }}>Workspace ID</td><td><code>{workspace.id}</code></td></tr>
            <tr><td style={{ color: 'var(--ink-5)' }}>Created</td><td>{new Date(workspace.createdAt).toLocaleString()}</td></tr>
            <tr><td style={{ color: 'var(--ink-5)' }}>Last updated</td><td>{new Date(workspace.updatedAt).toLocaleString()}</td></tr>
          </tbody>
        </table>
      </div>

      <div className="adm__panel" style={{ borderColor: '#c4a097' }}>
        <div className="adm__panel-h" style={{ color: '#8b2418' }}>Workspace · danger zone</div>
        <h3 className="adm__panel-title">Wipe records</h3>
        <p className="adm__msg" style={{ marginBottom: 14 }}>
          Permanently delete every module record (donors, voters, prospects, etc.) in this workspace. Users, settings, audit log, and webhooks are preserved.
          Useful if you signed up to explore and now want to start with a clean slate.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="adm__btn adm__btn--danger" onClick={async () => {
            const yes = confirm('Permanently DELETE every module record in this workspace?\n\nThis cannot be undone.');
            if (!yes) return;
            try {
              const r = await api.wipeWorkspace();
              setMsg({ kind: 'ok', text: `Deleted ${r.deleted} records. The workspace is now empty.` });
              const { invalidateLive } = await import('../auth/useLiveRecords');
              invalidateLive();
            } catch (e) {
              setMsg({ kind: 'err', text: 'Wipe failed: ' + e.message });
            }
          }}>
            Wipe all records
          </button>
          <button className="adm__btn adm__btn--danger" onClick={async () => {
            const yes = confirm('Wipe records AND reset the onboarding wizard?\n\nThis deletes every module record and re-runs the onboarding wizard at your next page load. Your account stays active.');
            if (!yes) return;
            try {
              const r = await api.wipeWorkspace();
              await api.updateWorkspace({
                settings: { ...(workspace?.settings || {}), onboarded: false },
              });
              setMsg({ kind: 'ok', text: `Deleted ${r.deleted} records and reset onboarding. Reload to see the wizard.` });
              const { invalidateLive } = await import('../auth/useLiveRecords');
              invalidateLive();
              setTimeout(() => window.location.reload(), 1500);
            } catch (e) {
              setMsg({ kind: 'err', text: 'Reset failed: ' + e.message });
            }
          }}>
            Wipe + restart onboarding
          </button>
        </div>
      </div>
    </div>
  );
}
