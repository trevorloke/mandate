// 2FA enrollment + management panel.
import React, { useState } from 'react';
import { api } from '../auth/api';

export default function TotpPanel({ user, onChange }) {
  const [phase, setPhase] = useState('idle');   // idle | setup | verifying | done | disable
  const [setupData, setSetupData] = useState(null); // { secret, otpauth, qr }
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const startSetup = async () => {
    setErr(''); setBusy(true);
    try {
      const r = await api.totpSetup();
      setSetupData(r);
      setPhase('setup');
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const enable = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api.totpEnable(code);
      setRecoveryCodes(r.recoveryCodes);
      setPhase('done');
      setCode('');
      onChange?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const disable = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api.totpDisable(password, code);
      setPhase('idle');
      setPassword(''); setCode('');
      setMsg({ kind: 'ok', text: '2FA disabled.' });
      onChange?.();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const downloadCodes = () => {
    const blob = new Blob([
      `Mandate · Recovery codes for ${user.email}\n\n` +
      `Each code can be used once if you lose access to your authenticator.\nKeep them in a safe place.\n\n` +
      recoveryCodes.join('\n')
    ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'mandate-recovery-codes.txt';
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Account · two-factor auth</div>
      <h3 className="adm__panel-title">
        2FA · {user.totpEnabled ? <span style={{ color: '#234a2c', fontStyle: 'italic' }}>enabled</span> : <span style={{ color: 'var(--ink-5)', fontStyle: 'italic' }}>off</span>}
      </h3>

      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {/* Recovery codes shown ONCE after enabling */}
      {phase === 'done' && recoveryCodes && (
        <div style={{ background: '#fff8e0', border: '1px solid #d6c8ae', padding: 16, borderRadius: 2, marginBottom: 16 }}>
          <div className="adm__panel-h">Save these recovery codes</div>
          <h4 style={{ margin: '0 0 8px', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 400 }}>One-time recovery codes</h4>
          <p className="adm__msg" style={{ marginBottom: 10 }}>
            Each code can be used <b>once</b> if you lose your authenticator. We won't show them again.
          </p>
          <pre className="adm__codeblock" style={{ marginBottom: 12 }}>{recoveryCodes.join('\n')}</pre>
          <div className="adm__actions">
            <button className="adm__btn" onClick={downloadCodes}>Download as .txt</button>
            <button className="adm__btn adm__btn--ghost" onClick={() => navigator.clipboard?.writeText(recoveryCodes.join('\n'))}>Copy</button>
            <button className="adm__btn adm__btn--ghost" onClick={() => { setPhase('idle'); setRecoveryCodes(null); }}>Done</button>
          </div>
        </div>
      )}

      {/* Idle state */}
      {phase === 'idle' && !user.totpEnabled && (
        <>
          <p className="adm__msg" style={{ marginBottom: 14 }}>
            Add a second factor to your sign-in. Use any TOTP authenticator (Google Authenticator, 1Password, Authy, etc.).
          </p>
          <button className="adm__btn" onClick={startSetup} disabled={busy}>{busy ? 'Setting up…' : 'Enable 2FA'}</button>
        </>
      )}

      {/* User has 2FA on — disable / regen */}
      {phase === 'idle' && user.totpEnabled && (
        <>
          <p className="adm__msg" style={{ marginBottom: 14 }}>Two-factor authentication is required at sign-in for this account.</p>
          <div className="adm__actions">
            <button className="adm__btn adm__btn--danger" onClick={() => setPhase('disable')}>Disable 2FA</button>
          </div>
        </>
      )}

      {/* Setup phase: show QR + secret + verify form */}
      {phase === 'setup' && setupData && (
        <form onSubmit={enable}>
          <div className="adm__field-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: '0 0 auto' }}>
              <img src={setupData.qr} alt="2FA QR code" style={{ width: 180, height: 180, border: '1px solid var(--rule)', padding: 8, background: '#fff' }} />
            </div>
            <div className="adm__field" style={{ flex: 1 }}>
              <label className="adm__field-label">1 · Scan with your authenticator</label>
              <p className="adm__msg" style={{ marginBottom: 8 }}>Or enter the secret manually:</p>
              <code className="adm__field-input adm__field-input--mono" style={{ display: 'block', padding: '8px 12px', background: 'var(--paper)', border: '1px solid var(--rule)', wordBreak: 'break-all' }}>
                {setupData.secret}
              </code>
              <label className="adm__field-label" style={{ marginTop: 14 }}>2 · Enter the 6-digit code from your app</label>
              <input className="adm__field-input adm__field-input--mono" type="text" inputMode="numeric"
                placeholder="123 456" required autoFocus
                value={code} onChange={e => setCode(e.target.value)} />
            </div>
          </div>
          <div className="adm__actions">
            <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify & enable'}</button>
            <button className="adm__btn adm__btn--ghost" type="button" onClick={() => { setPhase('idle'); setSetupData(null); }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Disable phase: requires password + current code */}
      {phase === 'disable' && (
        <form onSubmit={disable}>
          <div className="adm__field-row">
            <div className="adm__field">
              <label className="adm__field-label">Password</label>
              <input className="adm__field-input" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="adm__field">
              <label className="adm__field-label">Authenticator code (or recovery code)</label>
              <input className="adm__field-input adm__field-input--mono" required value={code} onChange={e => setCode(e.target.value)} />
            </div>
          </div>
          <div className="adm__actions">
            <button className="adm__btn adm__btn--danger" type="submit" disabled={busy}>{busy ? 'Disabling…' : 'Disable 2FA'}</button>
            <button className="adm__btn adm__btn--ghost" type="button" onClick={() => setPhase('idle')}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
