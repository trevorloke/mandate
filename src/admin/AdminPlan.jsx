// AdminPlan — workspace plan + usage bars + plan picker.
// Quota limits enforced server-side via assertQuota(). This UI is for visibility + upgrade.
import { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import './AdminPlan.css';

const QUOTA_LABELS = {
  records:           'Records',
  users:             'Users',
  scheduledReports:  'Scheduled reports',
  dashboardWidgets:  'Dashboard widgets',
  oauthProviders:    'SSO providers',
};
const FEATURE_LABELS = {
  passkeys:          'Passkeys (WebAuthn)',
  sso:               'SSO (OAuth/OIDC)',
  perRecordShares:   'Per-record sharing',
  i18n:              'Internationalization',
};

const fmt = (n) => n === null || n === undefined ? '∞' : Number(n).toLocaleString();

export default function AdminPlan() {
  const { user } = useAuth();
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [flash, setFlash] = useState('');

  const load = async () => {
    setErr('');
    try { setInfo(await api.getPlan()); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => { load(); }, []);

  const change = async (planKey) => {
    if (!confirm(`Change workspace plan to ${info.plans[planKey].label}?`)) return;
    setBusy(true);
    try {
      await api.setPlan(planKey);
      setFlash(`Plan changed to ${info.plans[planKey].label}.`);
      setTimeout(() => setFlash(''), 4000);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!info) return <p className="adm__msg">Loading…</p>;

  const isSuperAdmin = user?.role === 'super_admin';
  const currentPlan = info.plans[info.current];

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Workspace · plan</div>
      <h3 className="adm__panel-title">Plan & usage</h3>
      <p className="adm__msg" style={{ marginBottom: 16 }}>
        Current plan: <b>{currentPlan.label}</b> · {currentPlan.priceMo === 0 ? 'free' : `$${currentPlan.priceMo}/mo`}
        {info.planChangedAt && <> · changed {new Date(info.planChangedAt).toLocaleDateString()}</>}
      </p>

      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      {flash && <div className="adm__msg adm__msg--ok" style={{ marginBottom: 12 }}>{flash}</div>}

      <div className="plan__usage">
        {Object.entries(QUOTA_LABELS).map(([q, label]) => {
          const used = info.usage[q] ?? 0;
          const limit = currentPlan.limits[q];
          const pct = limit === null ? 0 : Math.min(100, Math.round(100 * used / Math.max(limit, 1)));
          const tone = limit === null ? 'ok' : pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';
          return (
            <div key={q} className="plan__row">
              <div className="plan__row-head">
                <span className="plan__row-label">{label}</span>
                <span className={`plan__row-num plan__row-num--${tone}`}>
                  {fmt(used)} <span className="plan__row-sep">/</span> {fmt(limit)}
                </span>
              </div>
              <div className="plan__bar">
                <div className={`plan__bar-fill plan__bar-fill--${tone}`} style={{ width: `${pct}%` }} />
              </div>
              {tone === 'over' && <p className="plan__hint">At limit — upgrade to add more.</p>}
              {tone === 'warn' && <p className="plan__hint plan__hint--warn">Approaching limit ({pct}% used).</p>}
            </div>
          );
        })}
      </div>

      <div className="plan__plans">
        {Object.entries(info.plans).map(([key, p]) => (
          <div key={key} className={`plan__card ${key === info.current ? 'is-current' : ''}`}>
            <div className="plan__card-head">
              <h4 className="plan__card-title">{p.label}</h4>
              <span className="plan__card-price">
                {p.priceMo === 0 ? 'free' : <>${p.priceMo}<small>/mo</small></>}
              </span>
            </div>
            <ul className="plan__limits">
              {Object.entries(QUOTA_LABELS).map(([q, label]) => (
                <li key={q}><b>{fmt(p.limits[q])}</b> {label.toLowerCase()}</li>
              ))}
            </ul>
            <ul className="plan__features">
              {Object.entries(FEATURE_LABELS).map(([f, label]) => (
                <li key={f} className={p.features[f] ? 'is-on' : 'is-off'}>
                  <span className="plan__feature-mark">{p.features[f] ? '✓' : '—'}</span> {label}
                </li>
              ))}
            </ul>
            <div className="plan__card-actions">
              {key === info.current ? (
                <span className="plan__current-tag">Current</span>
              ) : isSuperAdmin ? (
                <button className="adm__btn adm__btn--ghost adm__btn-sm" disabled={busy} onClick={() => change(key)}>
                  Switch to {p.label}
                </button>
              ) : (
                <span className="plan__hint" style={{ margin: 0 }}>super_admin only</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
