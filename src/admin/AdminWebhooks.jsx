// Outbound webhooks — admin only.
import React, { useEffect, useState } from 'react';
import { api } from '../auth/api';
// (useEffect already imported above; keep)

const EVENT_OPTIONS = [
  { v: '*',             label: 'All events' },
  { v: 'data.create',   label: 'data.create' },
  { v: 'data.update',   label: 'data.update' },
  { v: 'data.delete',   label: 'data.delete' },
  { v: 'data.*',        label: 'All data events' },
  { v: 'test.ping',     label: 'test.ping' },
];

export default function AdminWebhooks() {
  const [hooks, setHooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [msg, setMsg] = useState(null);
  const [viewingDeliveries, setViewingDeliveries] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { webhooks } = await api.listWebhooks(); setHooks(webhooks); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async (data) => {
    try {
      const r = await api.createWebhook(data);
      setShowCreate(false);
      setRevealed({ id: r.id, secret: r.secret, label: data.label });
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const onToggle = async (h) => {
    try { await api.updateWebhook(h.id, { active: !h.active }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const onDelete = async (h) => {
    if (!confirm(`Delete webhook "${h.label}"?`)) return;
    try { await api.deleteWebhook(h.id); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const onTest = async (h) => {
    try {
      const r = await api.testWebhook(h.id);
      const ok = r.lastStatus >= 200 && r.lastStatus < 300;
      setMsg({ kind: ok ? 'ok' : 'err', text: `Test delivery → ${r.lastStatus || 'no response'}${r.lastError ? ' · ' + r.lastError : ''}` });
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  return (
    <div>
      <QueuePanel />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <p className="adm__msg" style={{ margin: 0, flex: 1 }}>
          Webhooks deliver events (data create/update/delete) to your URL. Each delivery is HMAC-SHA256 signed using the webhook's secret.
          Verify the <code>X-Mandate-Signature</code> header server-side.
        </p>
        <button className="adm__btn" onClick={() => setShowCreate(true)}>+ New webhook</button>
      </div>

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {revealed && (
        <div className="adm__panel" style={{ background: '#fff8e0', borderColor: '#d6c8ae' }}>
          <div className="adm__panel-h">Save this secret now</div>
          <h3 className="adm__panel-title">Secret for "{revealed.label}"</h3>
          <p className="adm__msg" style={{ marginBottom: 10 }}>It will not be shown again. Store it where your webhook receiver can read it.</p>
          <input
            className="adm__field-input adm__field-input--mono"
            readOnly value={revealed.secret}
            onClick={e => e.target.select()}
            style={{ fontSize: 13 }}
          />
          <div className="adm__actions">
            <button className="adm__btn" onClick={() => navigator.clipboard?.writeText(revealed.secret)}>Copy secret</button>
            <button className="adm__btn adm__btn--ghost" onClick={() => setRevealed(null)}>I've saved it</button>
          </div>
          <pre className="adm__codeblock">
{`# Verify in Node:
const sig = req.headers['x-mandate-signature']; // 'sha256=...'
const expected = 'sha256=' + crypto
  .createHmac('sha256', '${revealed.secret.slice(0, 12)}…')
  .update(rawBody).digest('hex');
if (sig !== expected) throw new Error('bad signature');`}
          </pre>
        </div>
      )}

      {showCreate && <NewHookForm onCancel={() => setShowCreate(false)} onSubmit={onCreate} />}

      {viewingDeliveries && (
        <DeliveryHistory hook={viewingDeliveries} onClose={() => setViewingDeliveries(null)} />
      )}

      {loading ? <p className="adm__msg">Loading…</p> : hooks.length === 0 ? (
        <div className="adm__panel" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>
          <p style={{ fontStyle: 'italic', margin: 0 }}>No webhooks. Create one to receive event notifications.</p>
        </div>
      ) : (
        <table className="adm__table">
          <thead>
            <tr>
              <th>Label</th><th>URL</th><th>Events</th>
              <th>Last delivery</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {hooks.map(h => (
              <tr key={h.id}>
                <td><b style={{ fontWeight: 500 }}>{h.label}</b></td>
                <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>{truncMid(h.url, 50)}</code></td>
                <td>
                  {(h.events || ['*']).map(e => (
                    <span key={e} className="adm__role-pill" style={{ marginRight: 4 }}>{e}</span>
                  ))}
                </td>
                <td style={{ fontSize: 12, color: 'var(--ink-5)' }}>
                  {h.lastDeliveryAt ? new Date(h.lastDeliveryAt).toLocaleTimeString() : '—'}
                </td>
                <td>
                  {h.lastStatus
                    ? <span className={`adm__role-pill`} style={statusStyle(h.lastStatus)}>{h.lastStatus}</span>
                    : <span style={{ color: 'var(--ink-5)' }}>—</span>}
                  {!h.active && <span className="adm__role-pill" style={{ marginLeft: 4 }}>paused</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => setViewingDeliveries(h)}>History</button>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onTest(h)}>Test</button>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onToggle(h)}>{h.active ? 'Pause' : 'Resume'}</button>
                  <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onDelete(h)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NewHookForm({ onCancel, onSubmit }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState(['*']);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const toggleEvent = (v) => {
    if (v === '*') { setEvents(['*']); return; }
    const next = events.includes(v) ? events.filter(x => x !== v) : [...events.filter(x => x !== '*'), v];
    setEvents(next.length ? next : ['*']);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try { await onSubmit({ label, url, events }); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Webhooks · new</div>
      <h3 className="adm__panel-title">Create webhook</h3>
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Label</label>
            <input className="adm__field-input" required autoFocus
              placeholder="e.g. Slack notifier · CRM sync"
              value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">URL</label>
            <input className="adm__field-input adm__field-input--mono" required
              placeholder="https://hooks.example.com/mandate"
              value={url} onChange={e => setUrl(e.target.value)} />
          </div>
        </div>
        <div className="adm__field">
          <label className="adm__field-label">Events</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 6 }}>
            {EVENT_OPTIONS.map(opt => (
              <label key={opt.v} className="adm__field-bool">
                <input type="checkbox" checked={events.includes(opt.v)} onChange={() => toggleEvent(opt.v)} />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="adm__actions">
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create webhook'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}

function DeliveryHistory({ hook, onClose }) {
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const r = await api.listWebhookDeliveries(hook.id); setDeliveries(r.deliveries); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [hook.id]);

  const onRetry = async (d) => {
    try { await api.retryWebhookDelivery(hook.id, d.id); setMsg({ kind: 'ok', text: 'Retry queued.' }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const statusStyle = (s) => {
    if (s === 'success')   return { color: '#234a2c', borderColor: '#b6cdb9', background: '#ecf5ed' };
    if (s === 'failed')    return { color: '#8b6018', borderColor: '#d6c8ae', background: '#fff8e0' };
    if (s === 'giving_up') return { color: '#8b2418', borderColor: '#c4a097', background: '#fbeae6' };
    return {};
  };

  return (
    <div className="adm__panel" style={{ maxWidth: 'none' }}>
      <div className="adm__panel-h" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>Webhook · history · {hook.label}</span>
        <button onClick={onClose} className="adm__back" style={{ margin: 0 }}>← Back</button>
      </div>
      <h3 className="adm__panel-title">Delivery log <em>— last 50 attempts</em></h3>
      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}
      {loading ? <p className="adm__msg">Loading…</p> : deliveries.length === 0 ? (
        <p className="adm__msg">No deliveries yet. Click Test to fire one.</p>
      ) : (
        <table className="adm__table">
          <thead>
            <tr>
              <th>When</th><th>Event</th><th>Attempt</th><th>HTTP</th><th>Status</th><th>Error</th><th></th>
            </tr>
          </thead>
          <tbody>
            {deliveries.map(d => (
              <tr key={d.id}>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-5)' }}>
                  {new Date(d.createdAt).toLocaleString()}
                </td>
                <td><span className="adm__role-pill">{d.event}</span></td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>#{d.attempt}</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{d.httpStatus || '—'}</td>
                <td><span className="adm__role-pill" style={statusStyle(d.status)}>{d.status}</span></td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#8b2418' }}>{d.error ? d.error.slice(0, 60) : '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {(d.status === 'failed' || d.status === 'giving_up') && (
                    <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => onRetry(d)}>Retry</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function truncMid(s, max) {
  if (s.length <= max) return s;
  const half = Math.floor((max - 1) / 2);
  return s.slice(0, half) + '…' + s.slice(-half);
}
function statusStyle(s) {
  if (s >= 200 && s < 300) return { color: '#234a2c', borderColor: '#b6cdb9', background: '#ecf5ed' };
  if (s >= 400) return { color: '#8b2418', borderColor: '#c4a097', background: '#fbeae6' };
  return {};
}

function QueuePanel() {
  const [stats, setStats] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setErr('');
    try { setStats(await api.webhookQueueStats()); }
    catch (e) { setErr(e.message); }
  };
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  const tickNow = async () => {
    setBusy(true);
    try { await api.webhookQueueTick(); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (!stats) return null;
  const { counts, activeWorkers, workerId, leaseMs, tickMs, batchSize } = stats;

  return (
    <div className="adm__panel" style={{ marginBottom: 18 }}>
      <div className="adm__panel-h">Webhooks · queue</div>
      <h3 className="adm__panel-title">Distributed delivery queue</h3>
      <p className="adm__msg" style={{ marginBottom: 12 }}>
        This server is worker <code>{workerId}</code>. Lease {leaseMs/1000}s · tick {tickMs/1000}s · batch {batchSize}.
        Multiple Node processes can run side-by-side; rows are claimed atomically so each delivery is processed exactly once.
      </p>

      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 8 }}>{err}</div>}

      <div className="adm__stats" style={{ marginBottom: 16 }}>
        <div className="adm__stat-card">
          <div className="adm__stat-lbl">Due now</div>
          <div className="adm__stat-v">{counts.due ?? 0}</div>
          <div className="adm__stat-sub">ready for retry</div>
        </div>
        <div className="adm__stat-card">
          <div className="adm__stat-lbl">In flight</div>
          <div className="adm__stat-v">{counts.in_flight ?? 0}</div>
          <div className="adm__stat-sub">being processed</div>
        </div>
        <div className="adm__stat-card">
          <div className="adm__stat-lbl">Waiting</div>
          <div className="adm__stat-v">{counts.waiting ?? 0}</div>
          <div className="adm__stat-sub">scheduled, not yet due</div>
        </div>
        <div className="adm__stat-card">
          <div className="adm__stat-lbl">Total delivered</div>
          <div className="adm__stat-v">{counts.success_total ?? 0}</div>
          <div className="adm__stat-sub">{counts.giving_up_total ?? 0} gave up · {counts.total ?? 0} total rows</div>
        </div>
      </div>

      {activeWorkers?.length > 0 && (
        <>
          <div className="adm__plate" style={{ marginBottom: 8 }}>Active workers</div>
          <table className="adm__table" style={{ marginBottom: 12 }}>
            <thead>
              <tr><th>Worker ID</th><th>In-flight</th><th>Lease expires</th></tr>
            </thead>
            <tbody>
              {activeWorkers.map(w => (
                <tr key={w.workerId}>
                  <td><code>{w.workerId}</code>{w.workerId === workerId && <em style={{ color: 'var(--ink-5)' }}> · this process</em>}</td>
                  <td>{w.in_flight}</td>
                  <td>{w.lease_expires_at ? new Date(w.lease_expires_at * 1000).toLocaleTimeString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <div className="adm__actions" style={{ marginTop: 0 }}>
        <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={tickNow} disabled={busy}>
          {busy ? 'Ticking…' : 'Run tick now'}
        </button>
      </div>
    </div>
  );
}
