// Beacon — real social surfaces (Connections, Composer, Outbox).
// These talk to /api/social and drive actual publishing to connected accounts.
import React from 'react';
import './beacon-social.css';
import { api } from './auth/api';
import { useSocial } from './use-social';

const { useState, useEffect, useCallback, useMemo } = React;

const PLAT = {
  bluesky:  { label: 'Bluesky',  short: 'BS', cls: 'bsky' },
  mastodon: { label: 'Mastodon', short: 'MA', cls: 'masto' },
  x:        { label: 'X',        short: 'X',  cls: 'x' },
  meta:     { label: 'Meta',     short: 'MT', cls: 'meta' },
  linkedin: { label: 'LinkedIn', short: 'LI', cls: 'li' },
};
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
  const [picked, setPicked] = useState(null);     // provider id being connected
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

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
            <button className="bs-btn bs-btn--ghost" onClick={() => disconnect(a)}>Disconnect</button>
          </div>
        ))}
      </div>

      <div className="bs-conn__col">
        <h3 className="bs-h">Connect an account</h3>
        {msg && <div className={'bs-msg bs-msg--' + msg.kind}>{msg.text}</div>}

        {!picked ? (
          <div className="bs-prov-grid">
            {providers.map((p) => (
              <button
                key={p.id}
                className={'bs-prov' + (p.open ? '' : ' is-gated')}
                onClick={() => p.open ? startConnect(p) : setMsg({ kind: 'info', text: `${p.label} needs a developer app + platform review. Open platforms (Bluesky, Mastodon) work today.` })}
              >
                <div className={'bs-prov__badge bs-prov__badge--' + (PLAT[p.id]?.cls || 'gen')}>{PLAT[p.id]?.short || '?'}</div>
                <div className="bs-prov__label">{p.label}</div>
                <div className="bs-prov__tag">{p.open ? 'Ready' : 'Needs setup'}</div>
              </button>
            ))}
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

// ── Composer (modal) ─────────────────────────────────────────────────
export function BComposer({ accounts, onClose, onPosted }) {
  const [body, setBody] = useState('');
  const [targets, setTargets] = useState(() => accounts.map((a) => a.id)); // default: all
  const [mode, setMode] = useState('now');     // 'now' | 'schedule'
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [results, setResults] = useState(null);

  const connected = accounts.filter((a) => a.status === 'connected');
  const toggle = (id) => setTargets((t) => t.includes(id) ? t.filter((x) => x !== id) : [...t, id]);

  // Tightest character limit among selected platforms.
  const limit = useMemo(() => {
    const sel = connected.filter((a) => targets.includes(a.id));
    const lims = { bluesky: 300, mastodon: 500, x: 280, meta: 2200, linkedin: 3000 };
    const vals = sel.map((a) => lims[a.platform]).filter(Boolean);
    return vals.length ? Math.min(...vals) : null;
  }, [targets, connected]);

  const over = limit != null && [...body].length > limit;

  const submit = async () => {
    setBusy(true); setMsg(null); setResults(null);
    try {
      const payload = { body, targets };
      if (mode === 'now') payload.publishNow = true;
      else payload.scheduledAt = new Date(when).toISOString();
      const r = await api.socialCompose(payload);
      if (r.results) {
        setResults(r.results);
        const failed = r.results.filter((x) => !x.ok);
        setMsg(failed.length
          ? { kind: 'err', text: `${r.results.length - failed.length} published, ${failed.length} failed.` }
          : { kind: 'ok', text: `Published to ${r.results.length} account(s).` });
      } else {
        setMsg({ kind: 'ok', text: 'Scheduled.' });
      }
      onPosted && onPosted();
      if (mode === 'schedule') setTimeout(onClose, 700);
    } catch (e) { setMsg({ kind: 'err', text: e.message || 'Failed' }); }
    finally { setBusy(false); }
  };

  const canSubmit = body.trim() && targets.length && !over && !busy && (mode === 'now' || when);

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
              <label className={'bs-radio' + (mode === 'now' ? ' is-on' : '')}>
                <input type="radio" checked={mode === 'now'} onChange={() => setMode('now')} /> Publish now
              </label>
              <label className={'bs-radio' + (mode === 'schedule' ? ' is-on' : '')}>
                <input type="radio" checked={mode === 'schedule'} onChange={() => setMode('schedule')} /> Schedule
              </label>
              {mode === 'schedule' && (
                <input className="bs-input bs-input--when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
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
              {busy ? 'Working…' : (mode === 'now' ? 'Publish now' : 'Schedule')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Outbox (real scheduled/published/failed) ────────────────────────
export function BOutbox() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.socialPosts(); setGroups(r.groups || []); }
    catch { setGroups([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const cancel = async (groupId) => { try { await api.socialCancel(groupId); load(); } catch { /* keep list as-is */ } };
  const retry = async (id) => { try { await api.socialRetry(id); load(); } catch { /* keep list as-is */ } };

  if (loading) return <p className="bs-muted" style={{ padding: 20 }}>Loading…</p>;
  if (!groups.length) return <p className="bs-muted" style={{ padding: 20 }}>Nothing published or scheduled yet. Hit <b>Compose</b> to send your first real post.</p>;

  const fmt = (ts) => ts ? new Date(ts * 1000).toLocaleString() : null;

  return (
    <div className="bs-outbox">
      {groups.map((g) => {
        const anyScheduled = g.targets.some((t) => t.status === 'scheduled');
        return (
          <div key={g.groupId} className="bs-ob-card">
            <div className="bs-ob-card__body">{g.body}</div>
            <div className="bs-ob-card__targets">
              {g.targets.map((t) => (
                <div key={t.id} className={'bs-ob-target bs-ob-target--' + t.status}>
                  <span className={'bs-prov__badge bs-prov__badge--' + (PLAT[t.platform]?.cls || 'gen')}>{PLAT[t.platform]?.short}</span>
                  <span className="bs-ob-target__status">{t.status}</span>
                  {t.remoteUrl && <a href={t.remoteUrl} target="_blank" rel="noreferrer">view ↗</a>}
                  {t.error && <span className="bs-ob-target__err" title={t.error}>{t.error}</span>}
                  {t.status === 'failed' && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => retry(t.id)}>retry</button>}
                </div>
              ))}
            </div>
            <div className="bs-ob-card__foot">
              {anyScheduled && <span>scheduled for {fmt(g.scheduledAt)}</span>}
              {anyScheduled && <button className="bs-btn bs-btn--ghost bs-btn--sm" onClick={() => cancel(g.groupId)}>cancel</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
