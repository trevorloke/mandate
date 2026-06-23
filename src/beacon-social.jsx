// Beacon — real social surfaces (Connections, Composer, Outbox).
// These talk to /api/social and drive actual publishing to connected accounts.
import React from 'react';
import './beacon-social.css';
import { api } from './auth/api';
import { useAuth } from './auth/AuthContext';
import { useSocial } from './use-social';
import { fromCSV, readFileAsText } from './admin/csv';

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

// Highlight links / @mentions / #tags for preview rendering.
function renderRich(text) {
  const parts = [];
  const re = /(https?:\/\/[^\s]+|@[a-zA-Z0-9_.-]+|#[^\s#]+)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const cls = tok[0] === '#' ? 'bs-pv-tag' : tok[0] === '@' ? 'bs-pv-men' : 'bs-pv-link';
    parts.push(<span className={cls} key={m.index}>{tok}</span>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// A single platform-styled preview of the draft.
function PreviewCard({ account, body, media, thread }) {
  const limit = CHAR_LIMITS[account.platform];
  const text = thread && thread.length > 1 ? thread[0] : body;
  const over = limit && [...text].length > limit;
  return (
    <div className="bs-preview-card">
      <div className="bs-preview-hd">
        {account.avatarUrl
          ? <img className="bs-av" src={account.avatarUrl} alt="" style={{ width: 28, height: 28 }} />
          : <div className={'bs-av bs-av--ph bs-av--' + (PLAT[account.platform]?.cls || 'gen')} style={{ width: 28, height: 28 }}>{PLAT[account.platform]?.short}</div>}
        <div className="bs-preview-id">
          <b>{account.displayName || account.handle}</b>
          <span>{account.handle} · {platLabel(account.platform)}</span>
        </div>
      </div>
      <div className="bs-preview-body">{text ? renderRich(text) : <em className="bs-muted">(no text)</em>}</div>
      {media.length > 0 && (
        <div className={'bs-preview-media bs-preview-media--' + Math.min(media.length, 4)}>
          {media.slice(0, 4).map((mm) => <img key={mm.id} src={mm.url} alt="" />)}
        </div>
      )}
      <div className="bs-preview-ft">
        {thread && thread.length > 1 && <span className="bs-preview-thread">🧵 1/{thread.length}</span>}
        <span className={over ? 'bs-preview-over' : 'bs-muted'}>{[...text].length}{limit ? ` / ${limit}` : ''}{over ? ' · too long' : ''}</span>
      </div>
    </div>
  );
}

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
    <>
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
    <BBrandVoice />
    </>
  );
}

// Per-workspace AI brand voice — guidelines fed into every AI caption + reply.
function BBrandVoice() {
  const { user } = useAuth();
  const canEdit = !!user && ['admin', 'super_admin'].includes(user.role);
  const [text, setText] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [aiAvailable, setAiAvailable] = useState(false);

  useEffect(() => {
    api.socialBrandVoice().then((r) => { setText(r.brandVoice || ''); }).catch(() => {}).finally(() => setLoaded(true));
    api.socialProviders().then((r) => setAiAvailable(!!r.aiAvailable)).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api.socialSetBrandVoice(text); setText(r.brandVoice || ''); setMsg({ kind: 'ok', text: 'Saved — AI drafts and replies will use this.' }); }
    catch (e) { setMsg({ kind: 'err', text: e.message || 'Save failed' }); }
    finally { setBusy(false); }
  };

  return (
    <div className="bs-brandvoice">
      <h3 className="bs-h">✨ AI brand voice</h3>
      <p className="bs-muted">
        Guidelines applied to every AI caption and reply — tone, key messages, and words to avoid.
        {aiAvailable ? '' : ' Set ANTHROPIC_API_KEY on the server to enable AI drafting.'}
      </p>
      <textarea
        className="bs-compose-text" rows={6} disabled={!canEdit || busy}
        placeholder={'e.g. Warm, optimistic, plain-spoken. Champion working families and affordable housing. Never attack individuals; avoid jargon and ALL-CAPS.'}
        value={text} onChange={(e) => setText(e.target.value)}
      />
      {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}
      {canEdit
        ? <div style={{ marginTop: 8 }}><button className="bs-btn" onClick={save} disabled={busy || !loaded}>{busy ? 'Saving…' : 'Save brand voice'}</button></div>
        : <p className="bs-muted">Only admins can edit the brand voice.</p>}
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
  const [threadMode, setThreadMode] = useState(false);
  const [preview, setPreview] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [results, setResults] = useState(null);
  const [campaign, setCampaign] = useState('');

  const [templates, setTemplates] = useState([]);

  // In thread mode the body is split into a reply chain on lines of just '---'.
  const threadSegments = threadMode ? body.split(/^\s*---\s*$/m).map((s) => s.trim()).filter(Boolean) : null;
  const isThread = threadSegments && threadSegments.length > 1;

  useEffect(() => { api.socialTemplates().then((r) => setTemplates(r.templates || [])).catch(() => {}); }, []);

  const insertTemplate = (id) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setBody(t.body || '');
    setMedia((t.media || []).map((m) => ({ ...m, url: `/api/social/media/${m.id}` })));
  };
  // Replace each URL in the body with a tracked short link.
  const shortenLinks = async () => {
    const urls = [...new Set((body.match(/https?:\/\/[^\s]+/g) || []).map((u) => u.replace(/[.,;!?)\]]+$/, '')))];
    if (!urls.length) { setMsg({ kind: 'info', text: 'No links to shorten.' }); return; }
    const platform = connected.find((a) => targets.includes(a.id))?.platform || 'beacon';
    const utm = campaign.trim() ? { source: platform, medium: 'social', campaign: campaign.trim() } : null;
    let next = body;
    for (const u of urls) {
      try { const r = await api.socialShorten({ url: u, utm }); next = next.split(u).join(r.shortUrl); } catch { /* skip one */ }
    }
    setBody(next);
    setMsg({ kind: 'ok', text: `Shortened ${urls.length} link${urls.length > 1 ? 's' : ''}${utm ? ` · campaign "${campaign.trim()}"` : ''}.` });
  };

  // AI caption assist (improve/shorten/hashtags/rewrite/generate).
  const assist = async (mode) => {
    setAiBusy(true); setMsg(null);
    try {
      const platform = connected.find((a) => targets.includes(a.id))?.platform || '';
      const r = await api.socialAssist({ draft: body, mode, platform, charLimit: limit });
      setBody(r.text);
    } catch (e) {
      setMsg({ kind: /API key/i.test(e.message) ? 'info' : 'err', text: e.message });
    } finally { setAiBusy(false); }
  };

  const saveTemplate = async () => {
    const name = window.prompt('Template name:');
    if (!name) return;
    try {
      const r = await api.socialSaveTemplate({ name, body, media: media.map((m) => ({ id: m.id, mime: m.mime, alt: m.alt })) });
      setTemplates((ts) => [r.template, ...ts]);
      setMsg({ kind: 'ok', text: 'Saved to library.' });
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const connected = accounts.filter((a) => a.status === 'connected');
  const toggle = (id) => setTargets((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]);

  // Tightest character limit among selected platforms.
  const limit = useMemo(() => {
    const sel = connected.filter((a) => targets.includes(a.id));
    const vals = sel.map((a) => CHAR_LIMITS[a.platform]).filter(Boolean);
    return vals.length ? Math.min(...vals) : null;
  }, [targets, connected]);

  const over = limit != null && (isThread ? threadSegments.some((s) => [...s].length > limit) : [...body].length > limit);
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
      if (isThread) payload.thread = threadSegments;
      if (mode === 'now') payload.publishNow = true;
      else if (mode === 'queue') payload.queue = true;
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
        setMsg({ kind: 'ok', text: mode === 'draft' ? 'Saved as draft.' : mode === 'approval' ? 'Submitted for approval.' : mode === 'queue' ? 'Added to the queue (next free slot).' : 'Scheduled.' });
      }
      onPosted && onPosted();
      if (mode !== 'now') setTimeout(onClose, 700);
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Failed' }); }
    finally { setBusy(false); }
  };

  const SUBMIT_LABEL = { now: 'Publish now', queue: 'Add to queue', schedule: 'Schedule', draft: 'Save draft', approval: 'Submit for approval' };
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
            <div className="bs-compose-tpl">
              <select className="bs-tpl-select" value="" disabled={aiBusy} onChange={(e) => { if (e.target.value) assist(e.target.value); e.target.value = ''; }}>
                <option value="">{aiBusy ? '✨ thinking…' : '✨ AI assist…'}</option>
                <option value="improve">Improve</option>
                <option value="shorten">Shorten</option>
                <option value="hashtags">Add hashtags</option>
                <option value="rewrite">Rewrite</option>
                <option value="generate">Generate from idea</option>
              </select>
              <select className="bs-tpl-select" value="" onChange={(e) => { if (e.target.value) insertTemplate(e.target.value); e.target.value = ''; }}>
                <option value="">📋 Insert template…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" className="bs-btn bs-btn--ghost bs-btn--sm" onClick={saveTemplate} disabled={!body.trim() && media.length === 0}>save as template</button>
              <button type="button" className="bs-btn bs-btn--ghost bs-btn--sm" onClick={shortenLinks} disabled={!/https?:\/\//.test(body)}>🔗 shorten links</button>
              <input className="bs-tpl-select bs-campaign" placeholder="campaign (UTM)" value={campaign} onChange={(e) => setCampaign(e.target.value)} title="utm_campaign for shortened links" />
            </div>
            <textarea
              className="bs-compose-text"
              placeholder={threadMode ? "Write your thread. Separate each post with a line containing only ---" : "What's happening?"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={threadMode ? 8 : 5}
              autoFocus
            />
            <label className="bs-thread-toggle">
              <input type="checkbox" checked={threadMode} onChange={(e) => setThreadMode(e.target.checked)} />
              🧵 Thread {isThread && <span className="bs-thread-count">{threadSegments.length} posts</span>}
              <span style={{ marginLeft: 14 }}><input type="checkbox" checked={preview} onChange={(e) => setPreview(e.target.checked)} /> 👁 Preview</span>
            </label>
            {preview && (
              <div className="bs-preview">
                {connected.filter((a) => targets.includes(a.id)).length === 0
                  ? <p className="bs-muted">Select an account to preview.</p>
                  : connected.filter((a) => targets.includes(a.id)).map((a) => (
                    <PreviewCard key={a.id} account={a} body={body} media={media} thread={threadSegments} />
                  ))}
              </div>
            )}
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
                {isThread
                  ? `${threadSegments.length} posts${limit != null ? ` · max ${Math.max(...threadSegments.map((s) => [...s].length))}/${limit}` : ''}`
                  : (limit != null ? `${[...body].length} / ${limit}` : `${[...body].length}`)}
              </div>
            </div>

            <div className="bs-compose-when">
              {[['now', 'Publish now'], ['queue', 'Queue'], ['schedule', 'Schedule'], ['draft', 'Draft'], ['approval', 'Needs approval']].map(([m, lbl]) => (
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
  const [bulkOpen, setBulkOpen] = useState(false);

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
      {bulkOpen && <BBulkModal onClose={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); load(); }} />}
      <div className="bs-inbox__hd">
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
        <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setBulkOpen(true)}>⤓ Bulk schedule</button>
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
                  {t.status === 'failed' && t.nextRetryAt && <span className="bs-ob-retry" title={'attempt ' + (t.attempts || 1) + ' of 5'}>auto-retry queued</span>}
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

// Bulk schedule from a CSV (columns: body, accounts, scheduledAt, thread).
function BBulkModal({ onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [results, setResults] = useState(null);

  const ingest = (text) => {
    try {
      const parsed = fromCSV(text).map((r) => ({
        body: r.body ?? r.text ?? '', accounts: r.accounts ?? r.account ?? '',
        scheduledAt: r.scheduledAt ?? r.schedule ?? r.when ?? '', thread: r.thread ?? '',
      })).filter((r) => r.body || r.thread);
      setRows(parsed); setResults(null);
      setMsg(parsed.length ? null : { kind: 'err', text: 'No usable rows. Need a header row with a "body" column.' });
    } catch (e) { setMsg({ kind: 'err', text: 'Could not parse CSV: ' + e.message }); }
  };
  const onFile = async (e) => { const f = e.target.files?.[0]; if (f) ingest(await readFileAsText(f)); };

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.socialBulk(rows);
      setResults(r);
      setMsg({ kind: r.created ? 'ok' : 'err', text: `Queued ${r.created} post(s) across ${rows.length} row(s).` });
      if (r.created) setTimeout(onDone, 900);
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="bs-modal-backdrop" onClick={onClose}>
      <div className="bs-modal" onClick={(e) => e.stopPropagation()} style={{ width: 640 }}>
        <div className="bs-modal__hd">
          <div className="bs-modal__title">Bulk schedule</div>
          <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={onClose}>ESC</button>
        </div>
        <div className="bs-modal__body">
          <p className="bs-muted" style={{ marginTop: 0 }}>
            CSV columns: <b>body</b>, <b>accounts</b> (handle/platform, comma-separated), <b>scheduledAt</b> (ISO; blank = draft),
            optional <b>thread</b> (segments split by <code>||</code>).
          </p>
          <input type="file" accept=".csv,text/csv" onChange={onFile} className="bs-input" />
          <textarea className="bs-compose-text" rows={5} placeholder={'body,accounts,scheduledAt\n"Hello world!",@me.bsky.social,2026-06-01T17:00\n"Big news",bluesky;mastodon,'} onChange={(e) => ingest(e.target.value)} style={{ marginTop: 10 }} />
          {rows.length > 0 && (
            <div className="bs-bulk-preview">
              <div className="bs-h" style={{ margin: '10px 0 6px' }}>{rows.length} rows parsed</div>
              {rows.slice(0, 6).map((r, i) => (
                <div key={i} className="bs-bulk-row">
                  <span className="bs-bulk-row__body">{r.body || '(thread)'}</span>
                  <span className="bs-bulk-row__acct">{r.accounts || '—'}</span>
                  <span className="bs-bulk-row__when">{r.scheduledAt || 'draft'}</span>
                </div>
              ))}
              {rows.length > 6 && <div className="bs-muted">…and {rows.length - 6} more</div>}
            </div>
          )}
          {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}
          {results && (
            <div className="bs-results">
              {results.results.filter((x) => !x.ok).slice(0, 8).map((x) => (
                <div key={x.row} className="bs-result is-err">Row {x.row}: <span className="bs-result__err">{x.error}</span></div>
              ))}
            </div>
          )}
        </div>
        <div className="bs-modal__ft">
          <button className="bs-btn bs-btn--ghost" onClick={onClose}>Close</button>
          <button className="bs-btn" onClick={submit} disabled={busy || rows.length === 0}>{busy ? 'Queuing…' : `Schedule ${rows.length} rows`}</button>
        </div>
      </div>
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

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const fmtHour = (h) => `${String(h).padStart(2, '0')}:00`;

// Compact human duration from milliseconds (for worker uptime / intervals).
const fmtDur = (ms) => {
  if (!ms || ms < 0) return '0s';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return sec + 's';
  if (sec < 3600) return Math.floor(sec / 60) + 'm';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ' + Math.floor((sec % 3600) / 60) + 'm';
  return Math.floor(sec / 86400) + 'd ' + Math.floor((sec % 86400) / 3600) + 'h';
};

export function BPerformance() {
  const [data, setData] = useState(null);
  const [best, setBest] = useState(null);
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, b, l] = await Promise.all([
        api.socialAnalytics(),
        api.socialBestTimes().catch(() => null),
        api.socialLinks().catch(() => null),
      ]);
      setData(a); setBest(b); setLinks((l && l.links) || []);
    } catch { setData(null); }
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

      {best && best.samples > 0 && (
        <div className="bs-perf__best">
          <h4 className="bs-h">Best times to post <em className="bs-field__hint">· from your engagement history ({best.samples} posts, {best.tz})</em></h4>
          {best.suggestions.length > 0 && (
            <div className="bs-best-chips">
              {best.suggestions.map((s, i) => (
                <span key={i} className={'bs-best-chip' + (i === 0 ? ' is-top' : '')}>
                  {DAYS[s.day]} {fmtHour(s.hour)} <b>{fmtN(Math.round(s.avg))}</b> avg
                </span>
              ))}
            </div>
          )}
          <BestTimesHeatmap grid={best.grid} />
        </div>
      )}

      {(data.audience || []).length > 0 && (
        <div className="bs-perf__best">
          <h4 className="bs-h">Audience growth <em className="bs-field__hint">· followers, last 30 days</em></h4>
          <table className="bs-perf__table">
            <thead><tr><th>Account</th><th>Followers</th><th>30-day</th><th>Trend</th></tr></thead>
            <tbody>
              {data.audience.map((a) => (
                <tr key={a.accountId}>
                  <td><span className={'bs-prov__badge bs-prov__badge--' + (PLAT[a.platform]?.cls || 'gen')}>{PLAT[a.platform]?.short}</span> {a.handle}</td>
                  <td>{fmtN(a.followers)}</td>
                  <td className={a.delta > 0 ? 'bs-aud-up' : a.delta < 0 ? 'bs-aud-down' : ''}>{a.delta > 0 ? '+' : ''}{fmtN(a.delta)}</td>
                  <td><Sparkline series={a.series} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {links.length > 0 && (
        <div className="bs-perf__best">
          <h4 className="bs-h">Tracked links</h4>
          <table className="bs-perf__table">
            <thead><tr><th>Short link</th><th>Destination</th><th>Campaign</th><th>14-day</th><th>Clicks</th></tr></thead>
            <tbody>
              {links.slice(0, 12).map((l) => (
                <tr key={l.id}>
                  <td><a href={l.shortUrl} target="_blank" rel="noreferrer">/l/{l.slug}</a></td>
                  <td className="bs-link-dest" title={l.targetUrl}>{l.title || l.targetUrl}</td>
                  <td>{l.utm?.campaign || <span className="bs-muted">—</span>}</td>
                  <td><Sparkline series={l.series} /></td>
                  <td>{fmtN(l.clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Tiny clicks sparkline from a {YYYY-MM-DD: n} series (chronological).
function Sparkline({ series }) {
  const days = Object.keys(series || {}).sort();
  if (days.length === 0) return <span className="bs-muted">—</span>;
  const vals = days.map((k) => series[k]);
  const max = Math.max(1, ...vals);
  const w = 70, h = 16;
  const n = Math.max(vals.length - 1, 1);
  const pts = vals.map((v, i) => `${((i / n) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(' ');
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="bs-spark"><polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>;
}

// Compact 7×24 heatmap of average engagement by day-of-week × hour (UTC).
function BestTimesHeatmap({ grid }) {
  const map = {};
  let max = 0;
  for (const g of grid) { map[`${g.day}-${g.hour}`] = g.avg; if (g.avg > max) max = g.avg; }
  return (
    <div className="bs-heat">
      <div className="bs-heat__row bs-heat__row--head">
        <span className="bs-heat__day" />
        {Array.from({ length: 24 }, (_, h) => <span key={h} className="bs-heat__hh">{h % 6 === 0 ? h : ''}</span>)}
      </div>
      {DAYS.map((d, day) => (
        <div className="bs-heat__row" key={day}>
          <span className="bs-heat__day">{d}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const v = map[`${day}-${h}`];
            const op = v != null && max > 0 ? 0.12 + 0.88 * (v / max) : 0;
            return <span key={h} className="bs-heat__cell" title={v != null ? `${d} ${fmtHour(h)} · ${Math.round(v)} avg` : ''} style={v != null ? { background: `rgba(184,51,74,${op.toFixed(2)})` } : undefined} />;
          })}
        </div>
      ))}
    </div>
  );
}

// ── Engagement inbox ─────────────────────────────────────────────────
const INBOX_FILTERS = [['unread', 'Unread'], ['all', 'All'], ['replied', 'Replied'], ['archived', 'Archived']];
const timeAgo = (ts) => {
  if (!ts) return '';
  const s = Math.floor(Date.now() / 1000 - ts);
  if (s < 60) return 'now';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
};

function InboxItem({ it, team = [], aiAvailable = false, onReply, onRead, onArchive, onAssign }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [tone, setTone] = useState('friendly');
  const [drafting, setDrafting] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr(null);
    try { await onReply(it.id, text); setOpen(false); setText(''); }
    catch (e) { setErr(e.message || 'Reply failed'); }
    finally { setBusy(false); }
  };

  const draft = async () => {
    setDrafting(true); setErr(null);
    try { const r = await api.socialInboxSuggest(it.id, tone); setText(r.text || ''); }
    catch (e) { setErr(e.message || 'Could not draft a reply'); }
    finally { setDrafting(false); }
  };

  return (
    <div className={'bs-in-item bs-in-item--' + it.status}>
      <div className="bs-in-item__main">
        {it.authorAvatar
          ? <img className="bs-av" src={it.authorAvatar} alt="" style={{ width: 32, height: 32 }} />
          : <div className={'bs-av bs-av--ph bs-av--' + (PLAT[it.platform]?.cls || 'gen')} style={{ width: 32, height: 32 }}>{PLAT[it.platform]?.short}</div>}
        <div className="bs-in-item__body">
          <div className="bs-in-item__hd">
            <b>{it.authorName || it.authorHandle}</b>
            <span className="bs-in-item__handle">{it.authorHandle}</span>
            <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[it.platform]?.cls || 'gen')} style={{ width: 16, height: 16, fontSize: 8 }}>{PLAT[it.platform]?.short}</span>
            <span className="bs-in-item__type">{it.type}</span>
            {onAssign && (
              <select className="bs-in-assignee" value={it.assignedToId || ''} onChange={(e) => onAssign(it.id, e.target.value)} title="Assign">
                <option value="">Unassigned</option>
                {team.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            )}
            <span className="bs-in-item__time">{timeAgo(it.remoteCreatedAt)}</span>
          </div>
          <div className="bs-in-item__text">{it.text || <em className="bs-muted">(no text)</em>}</div>
          <div className="bs-in-item__actions">
            <button className="bs-btn bs-btn--sm" onClick={() => { setOpen((o) => !o); if (it.status === 'unread') onRead(it.id); }}>reply</button>
            {it.url && <a className="bs-in-item__link" href={it.url} target="_blank" rel="noreferrer">open ↗</a>}
            {it.status === 'unread' && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => onRead(it.id)}>mark read</button>}
            <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => onArchive(it.id)}>archive</button>
            {it.status === 'replied' && <span className="bs-in-item__replied">✓ replied</span>}
          </div>
          {open && (
            <div className="bs-in-reply">
              {aiAvailable && (
                <div className="bs-in-reply__ai">
                  <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={draft} disabled={drafting} title="Draft a reply with AI">
                    {drafting ? '✨ Drafting…' : '✨ Suggest reply'}
                  </button>
                  <select className="bs-in-assignee" value={tone} onChange={(e) => setTone(e.target.value)} title="Tone" disabled={drafting}>
                    <option value="friendly">Friendly</option>
                    <option value="professional">Professional</option>
                    <option value="grateful">Grateful</option>
                    <option value="deescalate">De-escalate</option>
                  </select>
                </div>
              )}
              <textarea className="bs-compose-text" rows={2} placeholder={`Reply to ${it.authorHandle}…`} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              {err && <div className="bs-msg bs-msg--err">{err}</div>}
              <div className="bs-in-reply__ft">
                <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setOpen(false)}>cancel</button>
                <button className="bs-btn bs-btn--sm" onClick={send} disabled={busy || !text.trim()}>{busy ? 'Sending…' : 'Send reply'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function BInbox() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('unread');
  const [mine, setMine] = useState(false);
  const [team, setTeam] = useState([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async (f, m) => {
    setLoading(true);
    try { const r = await api.socialInbox(f, m ? 'me' : undefined); setItems(r.items || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(filter, mine); }, [load, filter, mine]);
  useEffect(() => { api.socialTeam().then((r) => setTeam(r.team || [])).catch(() => {}); }, []);
  useEffect(() => { api.socialProviders().then((r) => setAiAvailable(!!r.aiAvailable)).catch(() => {}); }, []);

  const sync = async () => {
    setSyncing(true);
    try { await api.socialInboxSync(); await load(filter, mine); }
    catch { /* ignore */ }
    finally { setSyncing(false); }
  };
  const reload = () => load(filter, mine);
  const onReply = async (id, text) => { await api.socialInboxReply(id, text); reload(); };
  const onRead = async (id) => { try { await api.socialInboxRead(id); reload(); } catch { /* ignore */ } };
  const onArchive = async (id) => { try { await api.socialInboxArchive(id); reload(); } catch { /* ignore */ } };
  const onAssign = async (id, userId) => { try { await api.socialInboxAssign(id, userId || null); reload(); } catch { /* ignore */ } };

  return (
    <div className="bs-inbox">
      <div className="bs-inbox__hd">
        <div className="bs-ob-filters">
          {INBOX_FILTERS.map(([k, lbl]) => (
            <button key={k} className={'bs-ob-filter' + (filter === k ? ' is-on' : '')} onClick={() => setFilter(k)}>{lbl}</button>
          ))}
          <button className={'bs-ob-filter' + (mine ? ' is-on' : '')} onClick={() => setMine((v) => !v)}>Mine</button>
        </div>
        <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : '↻ sync'}</button>
      </div>
      {loading ? <p className="bs-muted">Loading…</p>
        : items.length === 0
          ? <p className="bs-muted">{mine ? 'Nothing assigned to you.' : filter === 'unread' ? 'No unread interactions. Replies and mentions to your connected accounts land here. Hit ↻ sync to pull the latest.' : `No ${filter} items.`}</p>
          : <div className="bs-in-list">{items.map((it) => <InboxItem key={it.id} it={it} team={team} aiAvailable={aiAvailable} onReply={onReply} onRead={onRead} onArchive={onArchive} onAssign={onAssign} />)}</div>}
    </div>
  );
}

// ── Content library (manage reusable templates) ─────────────────────
export function BLibrary() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // {id?, name, body}
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.socialTemplates(); setTemplates(r.templates || []); }
    catch { setTemplates([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing.name?.trim()) { setMsg({ kind: 'err', text: 'Name required' }); return; }
    try {
      if (editing.id) await api.socialUpdateTemplate(editing.id, { name: editing.name, body: editing.body });
      else await api.socialSaveTemplate({ name: editing.name, body: editing.body });
      setEditing(null); setMsg({ kind: 'ok', text: 'Saved.' }); load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const del = async (t) => {
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try { await api.socialDeleteTemplate(t.id); load(); } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  return (
    <div className="bs-lib">
      <div className="bs-inbox__hd">
        <h3 className="bs-h" style={{ margin: 0 }}>Content library</h3>
        <button className="bs-btn bs-btn--sm" onClick={() => setEditing({ name: '', body: '' })}>+ New template</button>
      </div>
      {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}

      {editing && (
        <div className="bs-lib-edit">
          <input className="bs-input" placeholder="Template name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <textarea className="bs-compose-text" rows={4} placeholder="Template body…" value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
          <div className="bs-in-reply__ft">
            <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setEditing(null)}>cancel</button>
            <button className="bs-btn bs-btn--sm" onClick={save}>save</button>
          </div>
        </div>
      )}

      {loading ? <p className="bs-muted">Loading…</p>
        : templates.length === 0 ? <p className="bs-muted">No templates yet. Save one from the composer ("save as template") or create one here — then insert it into any post.</p>
          : <div className="bs-lib-list">
              {templates.map((t) => (
                <div key={t.id} className="bs-lib-card">
                  <div className="bs-lib-card__main">
                    <div className="bs-lib-card__name">{t.name}{t.media?.length ? <span className="bs-lib-card__media"> · {t.media.length} image{t.media.length > 1 ? 's' : ''}</span> : ''}</div>
                    <div className="bs-lib-card__body">{t.body || <em className="bs-muted">(no text)</em>}</div>
                  </div>
                  <div className="bs-lib-card__actions">
                    <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setEditing({ id: t.id, name: t.name, body: t.body })}>edit</button>
                    <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => del(t)}>delete</button>
                  </div>
                </div>
              ))}
            </div>}
    </div>
  );
}

// ── RSS auto-import (feeds → drafts) ─────────────────────────────────
export function BFeeds() {
  const { accounts } = useSocial();
  const connected = accounts.filter((a) => a.status === 'connected');
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.socialFeeds(); setFeeds(r.feeds || []); }
    catch { setFeeds([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const add = async () => {
    if (!/^https?:\/\//.test(url)) { setMsg({ kind: 'err', text: 'Enter a valid feed URL.' }); return; }
    setBusy(true); setMsg(null);
    try { await api.socialAddFeed({ url, accountIds: sel }); setUrl(''); setSel([]); setMsg({ kind: 'ok', text: 'Feed added — new items will queue as drafts.' }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  };
  const check = async (f) => { try { const r = await api.socialCheckFeed(f.id); setMsg({ kind: 'ok', text: `Pulled ${r.created} new draft(s).` }); load(); } catch (e) { setMsg({ kind: 'err', text: e.message }); } };
  const del = async (f) => { if (!confirm('Remove this feed?')) return; try { await api.socialDeleteFeed(f.id); load(); } catch (e) { setMsg({ kind: 'err', text: e.message }); } };

  const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleString() : 'never';

  return (
    <div className="bs-lib" style={{ marginTop: 8 }}>
      <h3 className="bs-h" style={{ marginBottom: 10 }}>RSS auto-import <em className="bs-field__hint">· new items become drafts</em></h3>
      {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}
      <div className="bs-lib-edit">
        <input className="bs-input" placeholder="https://example.com/feed.xml" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="bs-targets">
          {connected.length === 0 ? <span className="bs-muted">Connect an account to draft for.</span>
            : connected.map((a) => (
              <label key={a.id} className={'bs-target' + (sel.includes(a.id) ? ' is-on' : '')}>
                <input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} />
                <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[a.platform]?.cls || 'gen')}>{PLAT[a.platform]?.short}</span>
                <span className="bs-target__name">{a.handle}</span>
              </label>
            ))}
        </div>
        <div className="bs-in-reply__ft">
          <button className="bs-btn bs-btn--sm" onClick={add} disabled={busy || !url || sel.length === 0}>Add feed</button>
        </div>
      </div>

      {loading ? <p className="bs-muted">Loading…</p>
        : feeds.length === 0 ? <p className="bs-muted">No feeds yet.</p>
          : <div className="bs-lib-list">
              {feeds.map((f) => (
                <div key={f.id} className="bs-lib-card">
                  <div className="bs-lib-card__main">
                    <div className="bs-lib-card__name">{f.title || f.url}</div>
                    <div className="bs-lib-card__body" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      checked {fmt(f.lastCheckedAt)} · {f.accountIds.length} account(s){f.lastError ? ` · ⚠ ${f.lastError}` : ''}
                    </div>
                  </div>
                  <div className="bs-lib-card__actions">
                    <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => check(f)}>check now</button>
                    <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => del(f)}>remove</button>
                  </div>
                </div>
              ))}
            </div>}
    </div>
  );
}

// ── Schedule calendar (week view, drag-to-reschedule) ───────────────
const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function startOfWeek(d) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  const off = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - off);
  return x;
}
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (dt) => `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
const toLocalInput = (dt) => `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}T${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

export function BScheduleCalendar() {
  const [groups, setGroups] = useState([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState(null); // {groupId, when}
  const [drag, setDrag] = useState(null);
  const [slotsOpen, setSlotsOpen] = useState(false);

  const load = useCallback(async () => {
    try { const r = await api.socialPosts(); setGroups(r.groups || []); } catch { setGroups([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d; });
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 7);

  const scheduled = groups.filter((g) => g.scheduledAt);
  const drafts = groups.filter((g) => g.status === 'draft' && !g.scheduledAt);
  const dayPosts = (d) => scheduled
    .filter((g) => { const t = new Date(g.scheduledAt * 1000); return t >= d && t < new Date(d.getTime() + 86400000); })
    .sort((a, b) => a.scheduledAt - b.scheduledAt);

  const reschedule = async (groupId, when) => {
    try { await api.socialReschedule(groupId, when.toISOString()); load(); }
    catch (e) { alert(e.message || 'Reschedule failed'); }
  };
  const onDrop = (day) => {
    if (!drag) return;
    const src = drag.scheduledAt ? new Date(drag.scheduledAt * 1000) : null;
    const when = new Date(day);
    when.setHours(src ? src.getHours() : 9, src ? src.getMinutes() : 0, 0, 0);
    setDrag(null);
    reschedule(drag.groupId, when);
  };

  const platBadges = (g) => [...new Set(g.targets.map((t) => t.platform))];
  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className="bs-cal2">
      {slotsOpen && <BSlotsEditor onClose={() => setSlotsOpen(false)} />}
      {editing && (
        <div className="bs-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="bs-modal" onClick={(e) => e.stopPropagation()} style={{ width: 360 }}>
            <div className="bs-modal__hd"><div className="bs-modal__title">Reschedule</div><button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setEditing(null)}>ESC</button></div>
            <div className="bs-modal__body">
              <input className="bs-input" type="datetime-local" value={editing.when} onChange={(e) => setEditing({ ...editing, when: e.target.value })} />
            </div>
            <div className="bs-modal__ft">
              <button className="bs-btn bs-btn--ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button className="bs-btn" onClick={() => { reschedule(editing.groupId, new Date(editing.when)); setEditing(null); }}>Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="bs-cal2__hd">
        <div className="bs-cal2__nav">
          <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() - 7); setWeekStart(d); }}>←</button>
          <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setWeekStart(startOfWeek(new Date()))}>This week</button>
          <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => { const d = new Date(weekStart); d.setDate(d.getDate() + 7); setWeekStart(d); }}>→</button>
        </div>
        <div className="bs-cal2__range">{weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – {new Date(weekEnd - 1).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
        <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => setSlotsOpen(true)}>⚙ queue slots</button>
      </div>

      <div className="bs-cal2__grid">
        {days.map((d, i) => (
          <div key={i} className={'bs-cal2__col' + (d.getTime() === today.getTime() ? ' is-today' : '')}
            onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(d)}>
            <div className="bs-cal2__col-hd">{DOW[i]} <span>{d.getDate()}</span></div>
            {dayPosts(d).map((g) => {
              const t = new Date(g.scheduledAt * 1000);
              return (
                <div key={g.groupId} className={'bs-cal2__chip bs-cal2__chip--' + g.status} draggable
                  onDragStart={() => setDrag({ groupId: g.groupId, scheduledAt: g.scheduledAt })}
                  onClick={() => setEditing({ groupId: g.groupId, when: toLocalInput(t) })}
                  title={g.body}>
                  <div className="bs-cal2__chip-hd">
                    <span className="bs-cal2__time">{hhmm(t)}</span>
                    {platBadges(g).map((p) => <span key={p} className={'bs-prov__badge bs-prov__badge--' + (PLAT[p]?.cls || 'gen')} style={{ width: 13, height: 13, fontSize: 7 }}>{PLAT[p]?.short}</span>)}
                  </div>
                  <div className="bs-cal2__chip-body">{g.body || '(image)'}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {drafts.length > 0 && (
        <div className="bs-cal2__tray">
          <div className="bs-h" style={{ margin: '0 0 8px' }}>Unscheduled drafts <em className="bs-field__hint">· drag onto a day to schedule</em></div>
          <div className="bs-cal2__tray-row">
            {drafts.map((g) => (
              <div key={g.groupId} className="bs-cal2__chip bs-cal2__chip--draft" draggable
                onDragStart={() => setDrag({ groupId: g.groupId, scheduledAt: null })} title={g.body}>
                <div className="bs-cal2__chip-hd">{platBadges(g).map((p) => <span key={p} className={'bs-prov__badge bs-prov__badge--' + (PLAT[p]?.cls || 'gen')} style={{ width: 13, height: 13, fontSize: 7 }}>{PLAT[p]?.short}</span>)}</div>
                <div className="bs-cal2__chip-body">{g.body || '(image)'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Keyword listening (real search across networks) ─────────────────
const SENT = { pos: { label: 'positive', cls: 'pos' }, neg: { label: 'negative', cls: 'neg' }, neu: { label: 'neutral', cls: 'neu' } };

export function BListening() {
  const [keywords, setKeywords] = useState([]);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({ pos: 0, neg: 0, neu: 0 });
  const [phrase, setPhrase] = useState('');
  const [kwFilter, setKwFilter] = useState('');
  const [sentFilter, setSentFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [msg, setMsg] = useState(null);

  const load = useCallback(async (kw, sent) => {
    setLoading(true);
    try {
      const [k, l] = await Promise.all([
        api.socialKeywords(),
        api.socialListening({ keyword: kw || undefined, sentiment: sent || undefined }),
      ]);
      setKeywords(k.keywords || []);
      setItems(l.items || []);
      setCounts(l.counts || { pos: 0, neg: 0, neu: 0 });
    } catch { setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(kwFilter, sentFilter); }, [load, kwFilter, sentFilter]);

  const add = async () => {
    const p = phrase.trim();
    if (!p) return;
    try { await api.socialAddKeyword(p); setPhrase(''); setMsg({ kind: 'ok', text: `Tracking "${p}" — first scan running.` }); load(kwFilter, sentFilter); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const remove = async (k) => {
    if (!confirm(`Stop tracking "${k.phrase}"?`)) return;
    try { await api.socialDeleteKeyword(k.id); if (kwFilter === k.id) setKwFilter(''); load(kwFilter === k.id ? '' : kwFilter, sentFilter); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const scan = async () => {
    setScanning(true); setMsg(null);
    try { const r = await api.socialListeningSync(); setMsg({ kind: 'ok', text: `Scan complete — ${r.added} new mention(s).` }); load(kwFilter, sentFilter); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setScanning(false); }
  };

  const total = counts.pos + counts.neg + counts.neu;

  return (
    <div className="bs-listen">
      <div className="bs-inbox__hd">
        <div className="bs-listen__add">
          <input className="bs-input" placeholder='Track a phrase… e.g. "Mount Pleasant" or a candidate name'
            value={phrase} onChange={(e) => setPhrase(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }} style={{ width: 320 }} />
          <button className="bs-btn bs-btn--sm" onClick={add} disabled={!phrase.trim()}>Track</button>
        </div>
        <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={scan} disabled={scanning || keywords.length === 0}>{scanning ? 'Scanning…' : '↻ scan now'}</button>
      </div>

      {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}

      <div className="bs-listen__bar">
        <div className="bs-ob-filters">
          <button className={'bs-ob-filter' + (kwFilter === '' ? ' is-on' : '')} onClick={() => setKwFilter('')}>All phrases</button>
          {keywords.map((k) => (
            <span key={k.id} className={'bs-ob-filter bs-listen__kw' + (kwFilter === k.id ? ' is-on' : '')}>
              <button className="bs-listen__kw-btn" onClick={() => setKwFilter(kwFilter === k.id ? '' : k.id)}>{k.phrase}</button>
              <button className="bs-listen__kw-x" onClick={() => remove(k)} title="stop tracking">×</button>
            </span>
          ))}
        </div>
        {total > 0 && (
          <div className="bs-listen__sent">
            {['pos', 'neu', 'neg'].map((s) => (
              <button key={s} className={'bs-sent-chip bs-sent-chip--' + s + (sentFilter === s ? ' is-on' : '')}
                onClick={() => setSentFilter(sentFilter === s ? '' : s)}>
                {SENT[s].label} {total ? Math.round((counts[s] / total) * 100) : 0}%
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? <p className="bs-muted">Loading…</p>
        : keywords.length === 0 ? <p className="bs-muted">Track a phrase above — Beacon scans Bluesky (public) and your connected Mastodon instances for live mentions, scores sentiment, and keeps watching every 10 minutes.</p>
          : items.length === 0 ? <p className="bs-muted">No mentions yet for this filter. Hit ↻ scan now.</p>
            : <div className="bs-in-list">
                {items.map((it) => (
                  <div key={it.id} className={'bs-in-item bs-listen__item bs-listen__item--' + (it.sentiment || 'neu')}>
                    <div className="bs-in-item__main">
                      {it.authorAvatar
                        ? <img className="bs-av" src={it.authorAvatar} alt="" style={{ width: 32, height: 32 }} />
                        : <div className={'bs-av bs-av--ph bs-av--' + (PLAT[it.platform]?.cls || 'gen')} style={{ width: 32, height: 32 }}>{PLAT[it.platform]?.short}</div>}
                      <div className="bs-in-item__body">
                        <div className="bs-in-item__hd">
                          <b>{it.authorName || it.authorHandle}</b>
                          <span className="bs-in-item__handle">{it.authorHandle}</span>
                          <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[it.platform]?.cls || 'gen')} style={{ width: 16, height: 16, fontSize: 8 }}>{PLAT[it.platform]?.short}</span>
                          <span className={'bs-sent-dot bs-sent-dot--' + (it.sentiment || 'neu')} title={SENT[it.sentiment]?.label || 'neutral'} />
                          <span className="bs-in-item__time">{timeAgo(it.remoteCreatedAt)}</span>
                        </div>
                        <div className="bs-in-item__text">{it.text}</div>
                        <div className="bs-in-item__actions">
                          {it.url && <a className="bs-in-item__link" href={it.url} target="_blank" rel="noreferrer">open ↗</a>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>}
    </div>
  );
}

// Queue-slot editor: weekly posting times used by composer "Queue" mode.
function BSlotsEditor({ onClose }) {
  const [slots, setSlots] = useState([]);
  const [tz, setTz] = useState('');
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('09:00');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const DAYS7 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  useEffect(() => { api.socialSlots().then((r) => { setSlots(r.slots || []); setTz(r.tz || ''); }).catch(() => {}); }, []);

  const add = () => {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
    if (slots.some((s) => s.day === day && s.time === time)) return;
    setSlots([...slots, { day, time }].sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)));
  };
  const remove = (s) => setSlots(slots.filter((x) => !(x.day === s.day && x.time === s.time)));
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await api.socialSetSlots(slots); setMsg({ kind: 'ok', text: 'Saved.' }); setTimeout(onClose, 600); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="bs-modal-backdrop" onClick={onClose}>
      <div className="bs-modal" onClick={(e) => e.stopPropagation()} style={{ width: 440 }}>
        <div className="bs-modal__hd"><div className="bs-modal__title">Queue slots</div><button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={onClose}>ESC</button></div>
        <div className="bs-modal__body">
          <p className="bs-muted" style={{ marginTop: 0 }}>Composer "Queue" drops each post into the next free slot ({tz} time).</p>
          <div className="bs-slots__add">
            <select className="bs-tpl-select" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAYS7.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
            <input className="bs-input" type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ width: 110 }} />
            <button className="bs-btn bs-btn--sm" onClick={add}>+ add</button>
          </div>
          <div className="bs-slots__list">
            {slots.length === 0 ? <p className="bs-muted">No slots yet — add a few (e.g. Mon/Wed/Fri 09:00 & 17:00).</p>
              : slots.map((s, i) => (
                <span key={i} className="bs-ob-filter bs-listen__kw">
                  <span>{DAYS7[s.day]} {s.time}</span>
                  <button className="bs-listen__kw-x" onClick={() => remove(s)}>×</button>
                </span>
              ))}
          </div>
          {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}
        </div>
        <div className="bs-modal__ft">
          <button className="bs-btn bs-btn--ghost" onClick={onClose}>Cancel</button>
          <button className="bs-btn" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save slots'}</button>
        </div>
      </div>
    </div>
  );
}

// ── System health (observability) ────────────────────────────────────
// Operator view of the publishing pipeline: worker liveness/heartbeats, queue
// depth, per-platform rate-limit budgets, account health, and recent failures.
// Polls /api/social/status every 15s so a wedged worker or growing backlog is
// visible at a glance.
const PASS_LABEL = {
  publish: 'Publishing', metrics: 'Metrics refresh', health: 'Account health',
  inbox: 'Inbox sync', feeds: 'Feed import', listening: 'Listening scan',
};

export function BHealth() {
  const [s, setS] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try { setS(await api.socialStatus()); setErr(null); }
    catch (e) { setErr(e.message || 'failed to load'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 15_000); // live refresh
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <p className="bs-muted" style={{ padding: 20 }}>Loading…</p>;
  if (err || !s) return <p className="bs-muted" style={{ padding: 20 }}>Couldn’t load system status. <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={load}>↻ retry</button></p>;

  const agoMs = (ms) => (ms ? timeAgo(Math.floor(ms / 1000)) : '—'); // worker times are ms
  const agoS = (sec) => (sec ? timeAgo(sec) : '—');                  // db times are seconds
  const w = s.worker || {};
  const q = s.queue || {};
  const passes = w.passes || {};
  const anyBadPass = Object.values(passes).some((p) => p.stale || p.ok === false);

  let level = 'ok', label = 'All systems operational';
  if (!w.running) { level = 'down'; label = 'Worker not running'; }
  else if (q.stuck > 0 || anyBadPass) { level = 'warn'; label = 'Degraded — needs attention'; }
  else if (q.overdue > 0 || (s.accounts?.summary?.error > 0)) { level = 'warn'; label = 'Minor issues'; }

  const cards = [
    { k: 'Scheduled', v: q.byStatus?.scheduled || 0 },
    { k: 'Due now', v: q.dueNow || 0 },
    { k: 'Overdue', v: q.overdue || 0, warn: q.overdue > 0 },
    { k: 'Retrying', v: q.retrying || 0 },
    { k: 'Failed', v: q.failedTerminal || 0, warn: q.failedTerminal > 0 },
    { k: 'Stuck', v: q.stuck || 0, warn: q.stuck > 0 },
  ];

  return (
    <div className="bs-health">
      <div className="bs-perf__hd">
        <h3 className="bs-h" style={{ margin: 0 }}>System health · publishing pipeline</h3>
        <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={load}>↻ refresh</button>
      </div>

      <div className={'bs-health__banner bs-health__banner--' + level}>
        <span className="bs-health__dot" />
        <b>{label}</b>
        {w.running && <span className="bs-muted" style={{ marginLeft: 'auto' }}>worker {w.id} · up {fmtDur(w.uptimeMs)}</span>}
      </div>

      <div className="bs-perf__kpis">
        {cards.map((c) => (
          <div className={'bs-perf__kpi' + (c.warn ? ' bs-health__kpi--warn' : '')} key={c.k}>
            <div className="bs-perf__kpi-val">{c.v}</div>
            <div className="bs-perf__kpi-lbl">{c.k}</div>
          </div>
        ))}
      </div>
      {q.nextScheduledAt && <p className="bs-muted" style={{ marginTop: 2 }}>Next scheduled post in {agoS(q.nextScheduledAt)}.</p>}

      <div className="bs-perf__cols">
        <div>
          <h4 className="bs-h">Background workers</h4>
          <table className="bs-perf__table">
            <thead><tr><th>Pass</th><th>Last run</th><th>Took</th><th>Status</th></tr></thead>
            <tbody>
              {Object.entries(passes).map(([name, p]) => {
                const st = !w.running ? 'stopped' : p.pending ? 'pending' : p.stale ? 'stale' : p.ok === false ? 'error' : 'ok';
                return (
                  <tr key={name}>
                    <td>{PASS_LABEL[name] || name} <span className="bs-muted">· every {fmtDur(p.intervalMs)}</span></td>
                    <td>{p.pending ? '—' : agoMs(p.lastRunAt)}</td>
                    <td>{p.lastDurationMs != null ? p.lastDurationMs + 'ms' : '—'}</td>
                    <td>
                      <span className={'bs-health__pill bs-health__pill--' + st}>{st}</span>
                      {p.error ? <span className="bs-muted" title={p.error}> · {p.error.slice(0, 36)}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h4 className="bs-h">Accounts</h4>
          <p className="bs-muted">{s.accounts?.summary?.connected || 0} connected · {s.accounts?.summary?.error || 0} error · {s.accounts?.summary?.total || 0} total</p>
          {(s.accounts?.list || []).filter((a) => a.status !== 'connected').map((a) => (
            <div key={a.id} className="bs-msg bs-msg--err" style={{ marginTop: 6 }}>
              <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[a.platform]?.cls || 'gen')}>{PLAT[a.platform]?.short}</span> {a.handle} — {a.lastError || a.status}
            </div>
          ))}
        </div>

        <div>
          <h4 className="bs-h">Rate-limit budget</h4>
          {(s.budgets || []).length === 0
            ? <p className="bs-muted">No connected platforms.</p>
            : s.budgets.map((b) => (
              <div key={b.platform} className="bs-health__budget">
                <div className="bs-health__budget-hd">
                  <span><span className={'bs-prov__badge bs-prov__badge--' + (PLAT[b.platform]?.cls || 'gen')}>{PLAT[b.platform]?.short}</span> {platLabel(b.platform)}</span>
                  <span className="bs-muted">{b.tokens}/{b.capacity}{b.refillPerMin ? ` · +${b.refillPerMin}/min` : ''}</span>
                </div>
                <div className="bs-health__bar"><div className="bs-health__bar-fill" style={{ width: Math.round((b.tokens / Math.max(1, b.capacity)) * 100) + '%' }} /></div>
              </div>
            ))}

          <h4 className="bs-h">Recent failures</h4>
          {(s.failures || []).length === 0
            ? <p className="bs-muted">None 🎉</p>
            : s.failures.map((f) => (
              <div key={f.id} className="bs-health__fail">
                <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[f.platform]?.cls || 'gen')}>{PLAT[f.platform]?.short}</span>
                <span className="bs-health__fail-msg" title={f.error}>{f.error || 'failed'}</span>
                <span className="bs-muted">×{f.attempts}{f.nextRetryAt ? ' · retry queued' : ''}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
