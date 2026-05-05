import React, { useState, useEffect } from 'react';
import './auth.css';
import { useAuth } from './AuthContext';
import { api } from './api';
import { useT, useLocale, LOCALES } from '../i18n';

export default function Login({ onSwitchToSignup }) {
  const { login, setupComplete, refresh } = useAuth();
  const t = useT();
  const [locale, setLocale] = useLocale();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [forgotMsg, setForgotMsg] = useState(null);
  const [totpRequired, setTotpRequired] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [oauthProviders, setOauthProviders] = useState([]);
  const [passkeySupported, setPasskeySupported] = useState(false);

  // Load OAuth providers, plus surface ?oauth_error if redirected back
  useEffect(() => {
    api.publicOauthProviders().then(r => setOauthProviders(r.providers || [])).catch(() => {});
    import('@simplewebauthn/browser').then(({ browserSupportsWebAuthn }) => {
      setPasskeySupported(browserSupportsWebAuthn());
    }).catch(() => {});
    const u = new URL(window.location.href);
    const oe = u.searchParams.get('oauth_error');
    if (oe) {
      setErr(oe);
      u.searchParams.delete('oauth_error');
      window.history.replaceState({}, '', u.toString());
    }
  }, []);

  const passkeySignIn = async () => {
    setErr(''); setBusy(true);
    try {
      // Pass email if filled; if empty, server returns broad options for discoverable creds.
      await api.passkeyLogin(email || undefined);
      await refresh();
    } catch (e) {
      setErr(e.message?.includes('NotAllowed') ? t('auth.signin.passkey_cancelled') : (e.message || t('auth.signin.passkey_fail')));
    } finally { setBusy(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login(email, password, totpRequired ? totpCode : undefined);
    } catch (e) {
      // If server says 2FA required, switch to 2FA prompt without scary error message
      if (e.data?.requires_2fa) {
        setTotpRequired(true);
        if (totpRequired) setErr(e.message || 'Invalid 2FA code');
      } else {
        setErr(e.message || 'Sign in failed');
      }
    }
    finally { setBusy(false); }
  };

  const requestReset = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const r = await api.requestPasswordReset(email);
      // For prototype: show URL on screen. In production: this stays generic.
      setForgotMsg(r.resetUrl
        ? { kind: 'ok', text: `Reset link generated. (Prototype: copy this) ${window.location.origin}${r.resetUrl}` }
        : { kind: 'ok', text: 'If that email is registered, a reset link has been sent.' });
    } catch (e) {
      setForgotMsg({ kind: 'ok', text: 'If that email is registered, a reset link has been sent.' });
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-screen">
      <div className="auth-screen__form-side">
        <div className="auth-screen__brand"><b>M</b><span>mandate</span></div>

        {!forgotMode ? (
          <>
            <h1 className="auth-screen__title">{t('auth.signin.title')}</h1>
            <p className="auth-screen__sub">{t('auth.signin.sub')}</p>

            <form className="auth-form" onSubmit={submit} autoComplete="on">
              {err && <div className="auth-form__error">{err}</div>}
              <div className="auth-form__row">
                <label className="auth-form__label" htmlFor="email">{t('auth.signin.email')}</label>
                <input id="email" type="email" autoComplete="email" required autoFocus
                  className="auth-form__input"
                  placeholder="you@mandate.app"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="auth-form__row">
                <label className="auth-form__label" htmlFor="password">{t('auth.signin.password')}</label>
                <input id="password" type="password" autoComplete="current-password" required
                  className="auth-form__input"
                  placeholder="••••••••"
                  value={password} onChange={e => setPassword(e.target.value)} />
              </div>
              {totpRequired && (
                <div className="auth-form__row">
                  <label className="auth-form__label" htmlFor="totp">{t('auth.signin.totp')}</label>
                  <input id="totp" inputMode="numeric" autoComplete="one-time-code" required autoFocus
                    className="auth-form__input"
                    placeholder="6-digit code · or recovery code"
                    value={totpCode} onChange={e => setTotpCode(e.target.value)} />
                  <span className="auth-form__hint">{t('auth.signin.totp_hint')}</span>
                </div>
              )}
              <button className="auth-form__btn" disabled={busy} type="submit">
                {busy ? t('auth.signin.btn_signing_in') : (totpRequired ? t('auth.signin.btn_verify') : t('auth.signin.btn_signin'))}
              </button>
              {(passkeySupported || oauthProviders.length > 0) && !totpRequired && (
                <div className="auth-form__divider"><span>{t('auth.signin.or')}</span></div>
              )}
              {passkeySupported && !totpRequired && (
                <button type="button"
                  className="auth-form__btn auth-form__btn--ghost"
                  disabled={busy}
                  onClick={passkeySignIn}>
                  🔑 {t('auth.signin.passkey')}
                </button>
              )}
              {oauthProviders.length > 0 && !totpRequired && (
                oauthProviders.map(p => (
                  <a key={p.id} className="auth-form__btn auth-form__btn--ghost auth-form__btn--oauth"
                     href={`/api/auth/oauth/start/${p.id}`}>
                    <span className={`auth-form__oauth-mark auth-form__oauth-mark--${p.kind}`}></span>
                    {t('auth.signin.with_provider', { provider: p.label })}
                  </a>
                ))
              )}
              <div className="auth-screen__footer">
                <button type="button" onClick={() => { setForgotMode(true); setErr(''); setForgotMsg(null); }}>{t('auth.signin.forgot')}</button>
                {!setupComplete && (
                  <>
                    <span>·</span>
                    <button type="button" onClick={onSwitchToSignup}>{t('auth.signin.setup_link')}</button>
                  </>
                )}
                <span>·</span>
                <select className="auth-form__locale" value={locale} onChange={e => setLocale(e.target.value)} aria-label={t('common.language')}>
                  {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </form>
          </>
        ) : (
          <>
            <h1 className="auth-screen__title">{t('auth.reset.title')}</h1>
            <p className="auth-screen__sub">{t('auth.reset.sub')}</p>

            <form className="auth-form" onSubmit={requestReset}>
              {forgotMsg && <div className={`auth-form__error`} style={{ background: '#ecf5ed', color: '#234a2c', borderLeftColor: '#0d4f3c', wordBreak: 'break-all' }}>{forgotMsg.text}</div>}
              <div className="auth-form__row">
                <label className="auth-form__label">{t('auth.signin.email')}</label>
                <input className="auth-form__input" type="email" required autoFocus
                  placeholder="you@mandate.app"
                  value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <button className="auth-form__btn" disabled={busy} type="submit">
                {busy ? t('auth.reset.btn_busy') : t('auth.reset.btn')}
              </button>
              <div className="auth-screen__footer">
                <button type="button" onClick={() => { setForgotMode(false); setForgotMsg(null); }}>{t('auth.reset.back_to_signin')}</button>
              </div>
            </form>
          </>
        )}
      </div>

      <aside className="auth-screen__editorial">
        <div className="auth-editorial__strip"><span><i /> Persuasion · T-127d to vote</span></div>
        <div>
          <p className="auth-editorial__quote">
            "The campaign is a chamber of <em>verbs.</em> Mandate is how you keep them all moving in one direction."
          </p>
          <div className="auth-editorial__attr">— Hub captain handbook</div>
        </div>
        <div className="auth-editorial__strip">
          <span>Ground</span><span>Beacon</span><span>Raise</span><span>Ledger</span><span>Coalition</span><span>Civic</span>
        </div>
      </aside>
    </div>
  );
}
