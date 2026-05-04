// PasskeyPanel — register and manage WebAuthn credentials for the current user.
// Shown inside Account · profile.
import { useEffect, useState } from 'react';
import { api } from '../auth/api';

const fmt = (d) => { try { return new Date(d).toLocaleString(); } catch { return ''; } };

export default function PasskeyPanel() {
  const [list, setList] = useState([]);
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');
  const [renaming, setRenaming] = useState(null);  // id being renamed
  const [renameTo, setRenameTo] = useState('');

  const load = async () => {
    setErr('');
    try { const r = await api.listPasskeys(); setList(r.passkeys || []); }
    catch (e) { setErr(e.message); }
  };

  useEffect(() => {
    import('@simplewebauthn/browser').then(({ browserSupportsWebAuthn }) => {
      setSupported(browserSupportsWebAuthn());
    }).catch(() => setSupported(false));
    load();
  }, []);

  const register = async () => {
    setErr(''); setFlash(''); setBusy(true);
    try {
      const label = window.prompt('Name this passkey (e.g. "iPhone", "MacBook Touch ID"):', 'My device');
      if (!label) { setBusy(false); return; }
      await api.passkeyRegister(label);
      setFlash('Passkey registered.');
      setTimeout(() => setFlash(''), 4000);
      await load();
    } catch (e) {
      setErr(e.message?.includes('NotAllowed') ? 'Cancelled.' : e.message);
    }
    setBusy(false);
  };

  const remove = async (id, label) => {
    if (!confirm(`Remove "${label}"? You'll need to re-register on that device to use it.`)) return;
    setBusy(true);
    try { await api.deletePasskey(id); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const startRename = (p) => { setRenaming(p.id); setRenameTo(p.label); };
  const saveRename = async (id) => {
    setBusy(true);
    try { await api.renamePasskey(id, renameTo.trim()); setRenaming(null); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Account · passkeys</div>
      <h3 className="adm__panel-title">Passkeys</h3>
      <p className="adm__msg" style={{ marginBottom: 14 }}>
        Sign in with Touch ID, Face ID, Windows Hello, or a hardware security key — no password needed.
        Phishing-resistant by design: your private key never leaves your device.
      </p>

      {!supported && (
        <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>
          Your browser doesn't support WebAuthn.
        </div>
      )}

      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      {flash && <div className="adm__msg adm__msg--ok" style={{ marginBottom: 12 }}>{flash}</div>}

      {list.length === 0 ? (
        <p className="adm__empty">No passkeys yet.</p>
      ) : (
        <table className="adm__table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Backed up</th>
              <th>Last used</th>
              <th>Created</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(p => (
              <tr key={p.id}>
                <td>
                  {renaming === p.id ? (
                    <span style={{ display: 'inline-flex', gap: 6 }}>
                      <input className="adm__field-input" value={renameTo} onChange={e => setRenameTo(e.target.value)} style={{ width: 200, padding: '4px 8px' }} autoFocus />
                      <button className="adm__btn adm__btn-sm" onClick={() => saveRename(p.id)} disabled={busy || !renameTo.trim()}>Save</button>
                      <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => setRenaming(null)}>Cancel</button>
                    </span>
                  ) : <b>{p.label}</b>}
                </td>
                <td><code>{p.deviceType || '—'}</code></td>
                <td>{p.backedUp ? <span className="adm__pill adm__pill--ok">yes</span> : <em style={{ color: 'var(--ink-5)' }}>no</em>}</td>
                <td>{p.lastUsedAt ? fmt(p.lastUsedAt) : <em style={{ color: 'var(--ink-5)' }}>never</em>}</td>
                <td>{fmt(p.createdAt)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {renaming !== p.id && (
                    <>
                      <button className="adm__btn adm__btn--ghost adm__btn-sm" disabled={busy} onClick={() => startRename(p)}>Rename</button>
                      <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} disabled={busy} onClick={() => remove(p.id, p.label)}>Remove</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="adm__actions" style={{ marginTop: 16 }}>
        <button className="adm__btn" disabled={!supported || busy} onClick={register}>
          {busy ? 'Working…' : '+ Register a passkey'}
        </button>
      </div>
    </div>
  );
}
