// Beacon — real social surfaces (Connections, Composer, Outbox).
// These talk to /api/social and drive actual publishing to connected accounts.
import React from 'react';
import './beacon-social.css';
import { api } from './auth/api';
import { useAuth } from './auth/AuthContext';
import { useSocial } from './use-social';

const { useState, useEffect, useCallback, useMemo } = React;

const PLAT = {
  bluesky:   { label: 'Bluesky',   short: 'BS', cls: 'bsky' },
  mastodon:  { label: 'Mastodon',  short: 'MA', cls: 'masto' },
  x:         { label: 'X',         short: 'X',  cls: 'x' },
  meta:      { label: 'Meta',      short: 'MT', cls: 'meta' },
  linkedin:  { label: 'LinkedIn',  short: 'LI', cls: 'li' },
  instagram: { label: 'Instagram', short: 'IG', cls: 'ig' },
};

const CHAR_LIMITS = { bluesky: 300, mastodon: 500, x: 280, meta: 2200, linkedin: 3000, instagram: 2200 };
const platLabel = (p) => PLAT[p]?.label || p;

function Avatar({ account, size = 34 }) {
  const p = PLAT[account.platform] || {};
  return account.avatarUrl
    ? <img className="bs-av" src={account.avatarUrl} alt="" style={{ width: size, height: size }} />
    : <div className={'bs-av bs-av--ph bs-av--' + (p.cls || 'gen')} style={{ width: size, height: size }}>{p.short || '?'}</div>;
}

// ── Connections ──────────────────────────────────────────────────────
export function BConnections() {
  const { accounts, providers, loading, refresh } = useSocial();
  const [picked, setPicked] = useState(null);     // credential provider being connected
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [settingsFor, setSettingsFor] = useState(null); // platform whose dev-app we're editing

  const prov = providers.find((p) => p.id === picked);

  const startConnect = (p) => { setPicked(p.id); setForm({}); setMsg(null); };

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      await api.socialConnect({ platform: picked, ...form });
      setPicked(null); setForm({});
      setMsg({ kind: 'ok', text: 'Account connected.' });
      refresh();
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Connection failed' }); }
    finally { setBusy(false); }
  };

  const disconnect = async (a) => {
    if (!confirm(`Disconnect ${a.handle || a.displayName}? Scheduled posts to it will fail.`)) return;
    try { await api.socialDisconnect(a.id); refresh(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const recheck = async (a) => {
    setMsg(null);
    try {
      const r = await api.socialVerify(a.id);
      setMsg(r.ok ? { kind: 'ok', text: `${a.handle} is healthy.` } : { kind: 'err', text: r.error || 'Token check failed' });
      refresh();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  // OAuth providers connect via a full-page redirect to the platform.
  const oauthConnect = (p) => { window.location.assign(api.socialConnectStartUrl(p.id, '/')); };

  if (settingsFor) {
    return <BSocialSettings platform={settingsFor} providers={providers} onBack={() => { setSettingsFor(null); refresh(); }} />;
  }

  return (
    <div className="bs-conn">
      <div className="bs-conn__col">
        <h3 className="bs-h">Connected accounts</h3>
        {loading ? <p className="bs-muted">Loading…</p> : accounts.length === 0 ? (
          <p className="bs-muted">No accounts connected yet. Connect one on the right to start publishing for real.</p>
        ) : accounts.map((a) => (
          <div key={a.id} className={'bs-acct-row' + (a.status !== 'connected' ? ' is-error' : '')}>
            <Avatar account={a} />
            <div className="bs-acct-row__main">
              <div className="bs-acct-row__name">{a.displayName || a.handle}</div>
              <div className="bs-acct-row__sub">{platLabel(a.platform)} · {a.handle}{a.status !== 'connected' ? ` · ${a.status}` : ''}</div>
              {a.lastError && <div className="bs-acct-row__err">{a.lastError}</div>}
            </div>
            <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => recheck(a)}>check</button>
            <button className="bs-btn bs-btn--ghost" onClick={() => disconnect(a)}>Disconnect</button>
          </div>
        ))}
      </div>

      <div className="bs-conn__col">
        <h3 className="bs-h">Connect an account</h3>
        {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}

        {!picked ? (
          <div className="bs-prov-grid">
            {providers.map((p) => {
              const ready = p.connect === 'credentials' || p.configured;
              return (
                <div key={p.id} className={'bs-prov' + (ready ? '' : ' is-gated')}>
                  <div className="bs-prov__top">
                    <div className={'bs-prov__badge bs-prov__badge--' + (PLAT[p.id]?.cls || 'gen')}>{PLAT[p.id]?.short || '?'}</div>
                    <div className="bs-prov__label">{p.label}</div>
                  </div>
                  {p.connect === 'credentials' ? (
                    <button className="bs-btn bs-btn--sm" onClick={() => startConnect(p)}>Connect</button>
                  ) : p.configured ? (
                    <div className="bs-prov__row">
                      <button className="bs-btn bs-btn--sm" onClick={() => oauthConnect(p)}>Connect</button>
                      <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setSettingsFor(p.id)}>app ⚙</button>
                    </div>
                  ) : (
                    <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setSettingsFor(p.id)}>Set up app →</button>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bs-connect-form">
            <div className="bs-connect-form__hd">
              <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[picked]?.cls || 'gen')}>{PLAT[picked]?.short}</span>
              <b>{prov?.label}</b>
              <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setPicked(null)}>← back</button>
            </div>
            {(prov?.connectFields || []).map((f) => (
              <label key={f.key} className="bs-field">
                <span className="bs-field__label">{f.label}</span>
                <input
                  className="bs-input"
                  type={f.type === 'password' ? 'password' : 'text'}
                  placeholder={f.placeholder || ''}
                  value={form[f.key] || ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
                {f.hint && <span className="bs-field__hint">{f.hint}</span>}
              </label>
            ))}
            <button className="bs-btn" onClick={submit} disabled={busy}>{busy ? 'Connecting…' : 'Connect'}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// Developer-app credential editor for an OAuth platform.
function BSocialSettings({ platform, providers, onBack }) {
  const prov = providers.find((p) => p.id === platform) || { label: platform };
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasSecret, setHasSecret] = useState(false);
  const [redirectUri, setRedirectUri] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.socialApps().then((r) => {
      setRedirectUri(r.redirectUri || '');
      const a = r.apps?.[platform];
      if (a) { setClientId(a.clientId || ''); setHasSecret(!!a.hasSecret); }
    }).catch(() => {});
  }, [platform]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const body = { clientId };
      if (clientSecret) body.clientSecret = clientSecret;
      await api.socialSaveApp(platform, body);
      setMsg({ kind: 'ok', text: 'Saved. You can now connect.' });
      setHasSecret(hasSecret || !!clientSecret);
      setClientSecret('');
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="bs-settings">
      <div className="bs-connect-form__hd">
        <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[platform]?.cls || 'gen')}>{PLAT[platform]?.short}</span>
        <b>{prov.label} — developer app</b>
        <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={onBack}>← back</button>
      </div>

      {prov.appHelp && <p className="bs-muted" style={{ marginTop: 8 }}>{prov.appHelp}</p>}

      <label className="bs-field">
        <span className="bs-field__label">Redirect URI — register this exact URL in your app</span>
        <input className="bs-input" readOnly value={redirectUri} onClick={(e) => e.target.select()} />
      </label>
      <label className="bs-field">
        <span className="bs-field__label">Client ID</span>
        <input className="bs-input" value={clientId} onChange={(e) => setClientId(e.target.value)} />
      </label>
      <label className="bs-field">
        <span className="bs-field__label">Client secret {hasSecret && <em className="bs-field__hint">· saved — leave blank to keep</em>}</span>
        <input className="bs-input" type="password" placeholder={hasSecret ? '••••••••' : ''} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} />
      </label>

      {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}
      <button className="bs-btn" onClick={save} disabled={busy || !clientId}>{busy ? 'Saving…' : 'Save app'}</button>
    </div>
  );
}

// ── Composer (modal) ─────────────────────────────────────────────────
export function BComposer({ accounts, onClose, onPosted }) {
  const [body, setBody] = useState('');
  const [targets, setTargets] = useState(() => accounts.map((a) => a.id)); // default: all
  const [mode, setMode] = useState('now');     // 'now' | 'schedule'
  const [when, setWhen] = useState('');
  const [media, setMedia] = useState([]);      // [{ id, url, mime }]
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [results, setResults] = useState(null);

  const connected = accounts.filter((a) => a.status === 'connected');
  const toggle = (id) => setTargets((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]);

  // Tightest character limit among selected platforms.
  const limit = useMemo(() => {
    const sel = connected.filter((a) => targets.includes(a.id));
    const vals = sel.map((a) => CHAR_LIMITS[a.platform]).filter(Boolean);
    return vals.length ? Math.min(...vals) : null;
  }, [targets, connected]);

  const over = limit != null && [...body].length > limit;
  // Instagram requires an image.
  const igSelected = connected.some((a) => a.platform === 'instagram' && targets.includes(a.id));
  const igNeedsImage = igSelected && media.length === 0;

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setUploading(true); setMsg(null);
    try {
      for (const f of files.slice(0, 4 - media.length)) {
        const r = await api.socialUploadMedia(f);
        setMedia((m) => [...m, r.media]);
      }
    } catch (err) { setMsg({ kind: 'err', text: err.message || 'Upload failed' }); }
    finally { setUploading(false); }
  };
  const removeMedia = (id) => setMedia((m) => m.filter((x) => x.id !== id));

  // When a future time is supplied for draft/approval, it's the intended
  // post-publish/approval schedule.
  const submit = async () => {
    setBusy(true); setMsg(null); setResults(null);
    try {
      const payload = { body, targets, media: media.map((m) => ({ id: m.id, mime: m.mime, alt: m.alt })) };
      if (mode === 'now') payload.publishNow = true;
      else if (mode === 'schedule') payload.scheduledAt = new Date(when).toISOString();
      else if (mode === 'draft') { payload.saveDraft = true; if (when) payload.scheduledAt = new Date(when).toISOString(); }
      else if (mode === 'approval') { payload.submitForApproval = true; if (when) payload.scheduledAt = new Date(when).toISOString(); }
      const r = await api.socialCompose(payload);
      if (r.results) {
        setResults(r.results);
        const failed = r.results.filter((x) => !x.ok);
        setMsg(failed.length
          ? { kind: 'err', text: `${r.results.length - failed.length} published, ${failed.length} failed.` }
          : { kind: 'ok', text: `Published to ${r.results.length} account(s).` });
      } else {
        setMsg({ kind: 'ok', text: mode === 'draft' ? 'Saved as draft.' : mode === 'approval' ? 'Submitted for approval.' : 'Scheduled.' });
      }
      onPosted && onPosted();
      if (mode !== 'now') setTimeout(onClose, 700);
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Failed' }); }
    finally { setBusy(false); }
  };

  const SUBMIT_LABEL = { now: 'Publish now', schedule: 'Schedule', draft: 'Save draft', approval: 'Submit for approval' };
  const canSubmit = (body.trim() || media.length) && targets.length && !over && !busy && !uploading && !igNeedsImage && (mode !== 'schedule' || when);

  return (
    <div className="bs-modal-backdrop" onClick={onClose}>
      <div className="bs-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bs-modal__hd">
          <div className="bs-modal__title">Compose</div>
          <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={onClose}>ESC</button>
        </div>

        {connected.length === 0 ? (
          <div className="bs-modal__body">
            <p className="bs-muted">No connected accounts yet. Go to <b>Connections</b> and link a Bluesky or Mastodon account first.</p>
          </div>
        ) : (
          <div className="bs-modal__body">
            <textarea
              className="bs-compose-text"
              placeholder="What's happening?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              autoFocus
            />
            <div className="bs-media">
              {media.map((m) => (
                <div key={m.id} className="bs-media-item">
                  <div className="bs-thumb">
                    <img src={m.url} alt="" />
                    <button type="button" className="bs-thumb__x" onClick={() => removeMedia(m.id)}>×</button>
                  </div>
                  <input className="bs-alt" placeholder="alt text…" value={m.alt || ''}
                    onChange={(e) => setMedia((ms) => ms.map((x) => x.id === m.id ? { ...x, alt: e.target.value } : x))} />
                </div>
              ))}
              {media.length < 4 && (
                <label className={'bs-thumb bs-thumb--add' + (uploading ? ' is-busy' : '')}>
                  <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={onPickFiles} />
                  {uploading ? '…' : '+ image'}
                </label>
              )}
            </div>
            {igNeedsImage && <div className="bs-msg bs-msg--info">Instagram needs an image — add one above.</div>}

            <div className="bs-compose-meta">
              <div className="bs-targets">
                {connected.map((a) => (
                  <label key={a.id} className={'bs-target' + (targets.includes(a.id) ? ' is-on' : '')}>
                    <input type="checkbox" checked={targets.includes(a.id)} onChange={() => toggle(a.id)} />
                    <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[a.platform]?.cls || 'gen')}>{PLAT[a.platform]?.short}</span>
                    <span className="bs-target__name">{a.handle}</span>
                  </label>
                ))}
              </div>
              <div className={'bs-count' + (over ? ' is-over' : '')}>
                {limit != null ? `${[...body].length} / ${limit}` : `${[...body].length}`}
              </div>
            </div>

            <div className="bs-compose-when">
              {[['now', 'Publish now'], ['schedule', 'Schedule'], ['draft', 'Draft'], ['approval', 'Needs approval']].map(([m, lbl]) => (
                <label key={m} className={'bs-radio' + (mode === m ? ' is-on' : '')}>
                  <input type="radio" checked={mode === m} onChange={() => setMode(m)} /> {lbl}
                </label>
              ))}
              {(mode === 'schedule' || mode === 'draft' || mode === 'approval') && (
                <input className="bs-input bs-input--when" type="datetime-local" value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  title={mode === 'schedule' ? 'when to publish' : 'optional: when to publish once live/approved'} />
              )}
            </div>

            {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}
            {results && (
              <div className="bs-results">
                {results.map((r) => (
                  <div key={r.id} className={'bs-result' + (r.ok ? ' is-ok' : ' is-err')}>
                    <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[r.platform]?.cls || 'gen')}>{PLAT[r.platform]?.short}</span>
                    {r.ok
                      ? <a href={r.url} target="_blank" rel="noreferrer">Published ↗</a>
                      : <span className="bs-result__err">{r.error}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {connected.length > 0 && (
          <div className="bs-modal__ft">
            <button className="bs-btn bs-btn--ghost" onClick={onClose}>Close</button>
            <button className="bs-btn" onClick={submit} disabled={!canSubmit}>
              {busy ? 'Working…' : SUBMIT_LABEL[mode]}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Outbox (drafts, approvals, scheduled, published) ────────────────
const STATUS_FILTERS = [['all', 'All'], ['draft', 'Drafts'], ['pending', 'Approvals'], ['scheduled', 'Scheduled'], ['published', 'Published'], ['failed', 'Failed']];

export function BOutbox() {
  const { user } = useAuth();
  const isApprover = user && (user.role === 'admin' || user.role === 'super_admin');
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.socialPosts(); setGroups(r.groups || []); }
    catch { setGroups([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = (fn) => async (...a) => { try { await fn(...a); load(); } catch (e) { alert(e.message || 'Action failed'); } };
  const cancel = act((groupId) => api.socialCancel(groupId));
  const retry = act((id) => api.socialRetry(id));
  const refreshMetrics = act((groupId) => api.socialRefreshMetrics(groupId));
  const submit = act((groupId) => api.socialSubmit(groupId));
  const approve = act((groupId) => api.socialApprove(groupId));
  const publishNow = act((groupId) => api.socialPublishNow(groupId));
  const reject = async (groupId) => {
    const reason = window.prompt('Reason for rejection (optional):', '');
    if (reason === null) return;
    try { await api.socialReject(groupId, reason); load(); } catch (e) { alert(e.message); }
  };

  if (loading) return <p className="bs-muted" style={{ padding: 20 }}>Loading…</p>;

  const shown = filter === 'all' ? groups : groups.filter((g) => g.status === filter);

  const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleString() : null;
  // Compact engagement string from a normalized metrics object.
  const engagement = (m) => {
    if (!m) return null;
    const parts = [];
    if (m.likes != null) parts.push(`♥ ${m.likes}`);
    if (m.reposts != null) parts.push(`↻ ${m.reposts}`);
    if (m.replies != null) parts.push(`💬 ${m.replies}`);
    if (m.comments != null) parts.push(`💬 ${m.comments}`);
    if (m.shares != null) parts.push(`⇪ ${m.shares}`);
    if (m.impressions != null) parts.push(`👁 ${m.impressions}`);
    return parts.join('  ');
  };

  return (
    <div className="bs-outbox">
      <div className="bs-ob-filters">
        {STATUS_FILTERS.map(([k, lbl]) => {
          const n = k === 'all' ? groups.length : groups.filter((g) => g.status === k).length;
          return (
            <button key={k} className={'bs-ob-filter' + (filter === k ? ' is-on' : '')} onClick={() => setFilter(k)}>
              {lbl}{n > 0 && <span className="bs-ob-filter__n">{n}</span>}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <p className="bs-muted">{filter === 'all' ? 'Nothing yet. Hit Compose to create your first post.' : `No ${filter} posts.`}</p>
      ) : shown.map((g) => {
        const gs = g.status;
        const anyScheduled = g.targets.some((t) => t.status === 'scheduled');
        const anyPublished = g.targets.some((t) => t.status === 'published');
        return (
          <div key={g.groupId} className={'bs-ob-card bs-ob-card--' + gs}>
            <div className="bs-ob-card__body">{g.body || <em className="bs-muted">(image only)</em>}</div>
            <div className="bs-ob-card__targets">
              {g.targets.map((t) => (
                <div key={t.id} className={'bs-ob-target bs-ob-target--' + t.status}>
                  <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[t.platform]?.cls || 'gen')}>{PLAT[t.platform]?.short}</span>
                  <span className="bs-ob-target__status">{t.status}</span>
                  {t.remoteUrl && <a href={t.remoteUrl} target="_blank" rel="noreferrer">view ↗</a>}
                  {engagement(t.metrics) && <span className="bs-ob-metrics">{engagement(t.metrics)}</span>}
                  {t.error && <span className="bs-ob-target__err" title={t.error}>{t.error}</span>}
                  {t.status === 'failed' && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => retry(t.id)}>retry</button>}
                </div>
              ))}
            </div>
            <div className="bs-ob-card__foot">
              {gs === 'pending' && <span className="bs-ob-tag">awaiting approval</span>}
              {gs === 'rejected' && <span className="bs-ob-tag bs-ob-tag--rej">rejected</span>}
              {(anyScheduled || g.scheduledAt) && (gs === 'scheduled' || gs === 'pending') && <span>for {fmt(g.scheduledAt)}</span>}

              {/* Draft / rejected → author actions */}
              {(gs === 'draft' || gs === 'rejected') && <button className="bs-btn bs-btn--sm" onClick={() => publishNow(g.groupId)}>publish now</button>}
              {(gs === 'draft' || gs === 'rejected') && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => submit(g.groupId)}>submit for approval</button>}

              {/* Pending → approver actions */}
              {gs === 'pending' && isApprover && <button className="bs-btn bs-btn--sm" onClick={() => approve(g.groupId)}>approve</button>}
              {gs === 'pending' && isApprover && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => reject(g.groupId)}>reject</button>}

              {anyPublished && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => refreshMetrics(g.groupId)}>↻ metrics</button>}
              {['draft', 'pending', 'rejected', 'scheduled', 'failed'].includes(gs) && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => cancel(g.groupId)}>cancel</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Performance (aggregate analytics across published posts) ─────────
const fmtN = (n) => {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return String(n);
};

export function BPerformance() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.socialAnalytics()); }
    catch { setData(null); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  if (loading) return <p className="bs-muted" style={{ padding: 20 }}>Loading…</p>;
  if (!data || data.postCount === 0) {
    return <p className="bs-muted" style={{ padding: 20 }}>No published posts yet. Once you publish, real engagement totals show up here. <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={load}>↻ refresh</button></p>;
  }

  const t = data.totals;
  const kpis = [
    { label: 'Published', val: data.postCount },
    { label: 'Engagement', val: t.engagement },
    { label: 'Likes', val: t.likes },
    { label: 'Reposts', val: t.reposts },
    { label: 'Replies/comments', val: (t.replies || 0) + (t.comments || 0) },
    { label: 'Impressions', val: t.impressions },
  ];

  return (
    <div className="bs-perf">
      <div className="bs-perf__hd">
        <h3 className="bs-h" style={{ margin: 0 }}>Performance · across all connected accounts</h3>
        <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={load}>↻ refresh</button>
      </div>

      <div className="bs-perf__kpis">
        {kpis.map((k) => (
          <div className="bs-perf__kpi" key={k.label}>
            <div className="bs-perf__kpi-val">{fmtN(k.val)}</div>
            <div className="bs-perf__kpi-lbl">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="bs-perf__cols">
        <div>
          <h4 className="bs-h">By platform</h4>
          <table className="bs-perf__table">
            <thead><tr><th>Platform</th><th>Posts</th><th>Likes</th><th>Reposts</th><th>Eng.</th></tr></thead>
            <tbody>
              {data.byPlatform.map((p) => (
                <tr key={p.platform}>
                  <td><span className={'bs-prov__badge bs-prov__badge--' + (PLAT[p.platform]?.cls || 'gen')}>{PLAT[p.platform]?.short}</span> {platLabel(p.platform)}</td>
                  <td>{p.posts}</td><td>{fmtN(p.likes)}</td><td>{fmtN(p.reposts)}</td><td>{fmtN(p.engagement)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <h4 className="bs-h">Top posts</h4>
          {data.top.length === 0 ? <p className="bs-muted">Engagement will rank posts here.</p> : (
            <div className="bs-perf__top">
              {data.top.map((p) => (
                <div className="bs-perf__toprow" key={p.id}>
                  <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[p.platform]?.cls || 'gen')}>{PLAT[p.platform]?.short}</span>
                  <span className="bs-perf__topbody">{(p.body || '(image)').slice(0, 80)}</span>
                  <span className="bs-perf__topeng">{fmtN(p.engagement)}</span>
                  {p.remoteUrl && <a href={p.remoteUrl} target="_blank" rel="noreferrer">↗</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
