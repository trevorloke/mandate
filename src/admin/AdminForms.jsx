// Public forms — admin defines schema + a public POST endpoint.
import { useEffect, useState } from 'react';
import { api } from '../auth/api';
import { getSchema } from './schemas';

const FIELD_TYPES = [
  { v: 'text',        label: 'Text' },
  { v: 'email',       label: 'Email' },
  { v: 'number',      label: 'Number' },
  { v: 'textarea',    label: 'Textarea' },
  { v: 'boolean',     label: 'Checkbox' },
  { v: 'date',        label: 'Date' },
  { v: 'select',      label: 'Select (options)' },
  { v: 'multiselect', label: 'Multi-select (options)' },
];

const PASSTHROUGH_TYPES = FIELD_TYPES.map((t) => t.v);

// Build the public field defs for a (module, kind) from its schema, keeping the
// rich types (multiselect/date) and presentation hints. Excludes the id field
// and any 'Internal' (staff-only) section.
function publicFieldsFor(module, kind, { skipInternal = true } = {}) {
  const schema = getSchema(module, kind);
  if (!schema) return [];
  return schema.fields
    .filter((f) => f.key !== 'id' && (!skipInternal || f.section !== 'Internal'))
    .map((f) => ({
      key: f.key,
      label: f.label,
      type: PASSTHROUGH_TYPES.includes(f.type) ? f.type : 'text',
      required: !!f.required,
      ...(f.options ? { options: f.options } : {}),
      ...(f.section ? { section: f.section } : {}),
      ...(f.half ? { half: true } : {}),
      ...(f.placeholder ? { placeholder: f.placeholder } : {}),
      ...(f.hint ? { hint: f.hint } : {}),
      ...(Number.isFinite(f.max) ? { max: f.max } : {}),
    }));
}

export default function AdminForms() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const { forms } = await api.listForms(); setForms(forms); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const onCreate = async (data) => {
    try {
      const r = await api.createForm(data);
      setShowCreate(false);
      setRevealed(r.form);
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  // One-click: provision the full Volunteer Information Form bound to
  // people.volunteer, so it's live and shareable without hand-building 100 fields.
  const onCreateVolunteerIntake = async () => {
    const allowedFields = publicFieldsFor('people', 'volunteer');
    if (!allowedFields.length) { setMsg({ kind: 'err', text: 'Volunteer schema not found.' }); return; }
    try {
      const r = await api.createForm({
        label: 'Volunteer intake',
        module: 'people', kind: 'volunteer',
        allowedFields,
        rateLimitPerMin: 10,
      });
      setShowCreate(false);
      setRevealed(r.form);
      load();
    } catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  const onToggle = async (f) => {
    try { await api.updateForm(f.id, { active: !f.active }); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };
  const onDelete = async (f) => {
    if (!confirm(`Delete form "${f.label}"? Existing submissions stay in module data.`)) return;
    try { await api.deleteForm(f.id); load(); }
    catch (e) { setMsg({ kind: 'err', text: e.message }); }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 18 }}>
        <p className="adm__msg" style={{ margin: 0, flex: 1 }}>
          Public forms accept anonymous submissions and store them as module records.
          Use them for donate forms, volunteer signups, RSVPs.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="adm__btn adm__btn--ghost" onClick={onCreateVolunteerIntake}>+ Volunteer intake</button>
          <button className="adm__btn" onClick={() => setShowCreate(true)}>+ New form</button>
        </div>
      </div>

      {msg && <div className={`adm__msg adm__msg--${msg.kind}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      {revealed && <RevealForm form={revealed} onClose={() => setRevealed(null)} />}

      {showCreate && <NewForm onCancel={() => setShowCreate(false)} onSubmit={onCreate} />}

      {loading ? <p className="adm__msg">Loading…</p> : forms.length === 0 ? (
        <div className="adm__panel" style={{ textAlign: 'center', color: 'var(--ink-4)' }}>
          <p style={{ fontStyle: 'italic', margin: 0 }}>No public forms yet.</p>
        </div>
      ) : (
        <table className="adm__table">
          <thead>
            <tr>
              <th>Label</th><th>Endpoint</th><th>Stores in</th>
              <th>Submissions</th><th>Last</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {forms.map(f => (
              <tr key={f.id}>
                <td><b style={{ fontWeight: 500 }}>{f.label}</b></td>
                <td><code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>/api/public/forms/{f.slug}</code></td>
                <td><span className="adm__role-pill">{f.module}.{f.kind}</span></td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{f.submissionCount}</td>
                <td style={{ fontSize: 12, color: 'var(--ink-5)' }}>{f.lastSubmissionAt ? new Date(f.lastSubmissionAt).toLocaleString() : '—'}</td>
                <td>
                  {f.active
                    ? <span className="adm__role-pill" style={{ color: '#234a2c', borderColor: '#b6cdb9', background: '#ecf5ed' }}>active</span>
                    : <span className="adm__role-pill">paused</span>}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" onClick={() => setRevealed(f)}>View</button>
                  <button className="adm__btn adm__btn--ghost adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onToggle(f)}>{f.active ? 'Pause' : 'Resume'}</button>
                  <button className="adm__btn adm__btn--danger adm__btn-sm" style={{ marginLeft: 6 }} onClick={() => onDelete(f)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function RevealForm({ form, onClose }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const pageUrl = `${origin}/f/${form.slug}`;
  const url = `${origin}/api/public/forms/${form.slug}`;
  const embed = buildEmbed(form, origin);

  return (
    <div className="adm__panel" style={{ background: '#fff8e0', borderColor: '#d6c8ae' }}>
      <div className="adm__panel-h">Form · "{form.label}"</div>
      <h3 className="adm__panel-title">Hosted page — share this link</h3>
      <input className="adm__field-input adm__field-input--mono" readOnly value={pageUrl}
        onClick={e => e.target.select()} style={{ fontSize: 12, marginBottom: 12 }} />
      <h3 className="adm__panel-title">Raw API endpoint (for embeds)</h3>
      <input className="adm__field-input adm__field-input--mono" readOnly value={url}
        onClick={e => e.target.select()} style={{ fontSize: 12, marginBottom: 12 }} />

      <div className="adm__panel-h" style={{ marginTop: 16 }}>Fields</div>
      <table className="adm__table" style={{ marginBottom: 12 }}>
        <thead><tr><th>Key</th><th>Label</th><th>Type</th><th>Required</th></tr></thead>
        <tbody>
          {form.allowedFields.map(f => (
            <tr key={f.key}>
              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{f.key}</td>
              <td>{f.label}</td>
              <td><span className="adm__role-pill">{f.type}</span></td>
              <td>{f.required ? '✓' : '·'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="adm__panel-h">Embed code</div>
      <p className="adm__msg" style={{ marginBottom: 6 }}>Drop this into any HTML page:</p>
      <pre className="adm__codeblock" style={{ marginBottom: 12 }}>{embed}</pre>

      <div className="adm__actions">
        <button className="adm__btn" onClick={() => navigator.clipboard?.writeText(embed)}>Copy embed</button>
        <button className="adm__btn adm__btn--ghost" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function buildEmbed(form, origin) {
  const safe = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const fieldsHtml = form.allowedFields.map(f => {
    const label = `<label style="display:block;font-size:12px;color:#666;margin:8px 0 4px">${safe(f.label)}${f.required ? ' *' : ''}</label>`;
    if (f.type === 'textarea') return `${label}<textarea name="${safe(f.key)}" rows="3" ${f.required ? 'required' : ''}></textarea>`;
    if (f.type === 'select')   return `${label}<select name="${safe(f.key)}" ${f.required ? 'required' : ''}>${(f.options || []).map(o => `<option>${safe(o)}</option>`).join('')}</select>`;
    if (f.type === 'boolean')  return `<label style="display:block;margin:8px 0"><input type="checkbox" name="${safe(f.key)}"> ${safe(f.label)}</label>`;
    const inputType = f.type === 'email' ? 'email' : f.type === 'number' ? 'number' : 'text';
    return `${label}<input type="${inputType}" name="${safe(f.key)}" ${f.required ? 'required' : ''}>`;
  }).join('\n  ');

  return `<form id="mandate-form-${safe(form.slug)}" style="max-width:480px;font-family:system-ui,sans-serif">
  ${fieldsHtml}
  <button type="submit" style="margin-top:12px;padding:10px 16px">Submit</button>
</form>
<script>
(function(){
  var f = document.getElementById('mandate-form-${safe(form.slug)}');
  f.addEventListener('submit', function(e){
    e.preventDefault();
    var data = {};
    new FormData(f).forEach(function(v,k){ data[k] = v; });
    fetch('${origin}/api/public/forms/${safe(form.slug)}', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(data)
    }).then(r => r.json()).then(r => {
      if (r.ok) {
        if (r.redirectUrl) location.href = r.redirectUrl;
        else f.innerHTML = '<p>Thanks!</p>';
      } else alert(r.error || 'submission failed');
    });
  });
})();
</script>`;
}

function NewForm({ onCancel, onSubmit }) {
  const [label, setLabel] = useState('');
  const [bucket, setBucket] = useState('raise.donor');   // module.kind
  const [fields, setFields] = useState([{ key: 'name', label: 'Name', type: 'text', required: true }]);
  const [redirect, setRedirect] = useState('');
  const [rate, setRate] = useState(10);
  const [captchaProvider, setCaptchaProvider] = useState('');  // '' | 'hcaptcha' | 'turnstile'
  const [captchaSitekey, setCaptchaSitekey] = useState('');
  const [captchaSecret, setCaptchaSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Try to suggest fields when bucket changes — pull from schema if available
  const onBucketChange = (v) => {
    setBucket(v);
    const [m, k] = v.split('.');
    const schema = getSchema(m, k);
    if (schema) {
      // Suggest 4 first non-id fields
      const suggested = schema.fields
        .filter(f => f.key !== 'id' && f.type !== 'tags' && f.type !== 'currency')
        .slice(0, 4)
        .map(f => ({
          key: f.key,
          label: f.label,
          type: PASSTHROUGH_TYPES.includes(f.type) ? f.type : 'text',
          required: !!f.required,
          options: f.options,
        }));
      if (suggested.length) setFields(suggested);
    }
  };

  const updateField = (i, patch) => setFields(fields.map((f, j) => j === i ? { ...f, ...patch } : f));
  const addField = () => setFields([...fields, { key: '', label: '', type: 'text', required: false }]);
  const removeField = (i) => setFields(fields.filter((_, j) => j !== i));

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    const [module, kind] = bucket.split('.');
    try {
      await onSubmit({
        label, module, kind,
        allowedFields: fields,
        redirectUrl: redirect || null,
        rateLimitPerMin: Number(rate) || 10,
        captchaProvider: captchaProvider || null,
        captchaSitekey: captchaProvider ? captchaSitekey : null,
        captchaSecret:  captchaProvider ? captchaSecret  : null,
      });
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="adm__panel">
      <div className="adm__panel-h">Forms · new</div>
      <h3 className="adm__panel-title">Create public form</h3>
      {err && <div className="adm__msg adm__msg--err" style={{ marginBottom: 12 }}>{err}</div>}
      <form onSubmit={submit}>
        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Label</label>
            <input className="adm__field-input" required autoFocus
              placeholder="e.g. Donate · Volunteer signup · Spring gala RSVP"
              value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Submissions stored as</label>
            <select className="adm__field-select" value={bucket} onChange={e => onBucketChange(e.target.value)}>
              <optgroup label="Raise">
                <option value="raise.donor">raise · donor</option>
                <option value="raise.gift">raise · gift</option>
                <option value="raise.prospect">raise · prospect</option>
              </optgroup>
              <optgroup label="Ground">
                <option value="ground.voter">ground · voter</option>
                <option value="ground.canvasser">ground · canvasser</option>
              </optgroup>
              <optgroup label="People">
                <option value="people.volunteer">people · volunteer</option>
              </optgroup>
              <optgroup label="Civic">
                <option value="civic.case">civic · case</option>
              </optgroup>
              <optgroup label="Coalition">
                <option value="coalition.org">coalition · org</option>
              </optgroup>
              <optgroup label="Events">
                <option value="events.event">events · event</option>
              </optgroup>
            </select>
          </div>
        </div>

        <div className="adm__field-row">
          <div className="adm__field">
            <label className="adm__field-label">Redirect URL (optional)</label>
            <input className="adm__field-input" placeholder="https://your-site.com/thanks"
              value={redirect} onChange={e => setRedirect(e.target.value)} />
          </div>
          <div className="adm__field">
            <label className="adm__field-label">Rate limit (submissions / min / IP)</label>
            <input className="adm__field-input adm__field-input--mono" type="number" min={1}
              value={rate} onChange={e => setRate(e.target.value)} />
          </div>
        </div>

        <div className="adm__field-label" style={{ marginTop: 8 }}>Fields collected</div>
        <table className="adm__table" style={{ marginTop: 6, marginBottom: 12 }}>
          <thead><tr><th>Key</th><th>Label</th><th>Type</th><th>Required</th><th></th></tr></thead>
          <tbody>
            {fields.map((f, i) => (
              <tr key={i}>
                <td><input className="adm__field-input adm__field-input--mono" placeholder="email" value={f.key} onChange={e => updateField(i, { key: e.target.value })} /></td>
                <td><input className="adm__field-input" placeholder="Email" value={f.label} onChange={e => updateField(i, { label: e.target.value })} /></td>
                <td><select className="adm__field-select" value={f.type} onChange={e => updateField(i, { type: e.target.value })}>
                  {FIELD_TYPES.map(t => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select></td>
                <td><input type="checkbox" checked={!!f.required} onChange={e => updateField(i, { required: e.target.checked })} /></td>
                <td style={{ textAlign: 'right' }}>
                  {fields.length > 1 && <button className="adm__btn adm__btn--ghost adm__btn-sm" type="button" onClick={() => removeField(i)}>×</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" className="adm__btn adm__btn--ghost adm__btn-sm" onClick={addField}>+ Add field</button>

        <div className="adm__field-row" style={{ marginTop: 18 }}>
          <div className="adm__field">
            <label className="adm__field-label">Captcha (anti-spam)</label>
            <select className="adm__field-select" value={captchaProvider} onChange={e => setCaptchaProvider(e.target.value)}>
              <option value="">Off</option>
              <option value="hcaptcha">hCaptcha</option>
              <option value="turnstile">Cloudflare Turnstile</option>
            </select>
          </div>
          {captchaProvider && (
            <>
              <div className="adm__field">
                <label className="adm__field-label">Site key (public)</label>
                <input className="adm__field-input adm__field-input--mono" value={captchaSitekey} onChange={e => setCaptchaSitekey(e.target.value)} required />
              </div>
              <div className="adm__field">
                <label className="adm__field-label">Secret (server-side)</label>
                <input className="adm__field-input adm__field-input--mono" type="password" value={captchaSecret} onChange={e => setCaptchaSecret(e.target.value)} required />
              </div>
            </>
          )}
        </div>

        <div className="adm__actions" style={{ marginTop: 16 }}>
          <button className="adm__btn" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create form'}</button>
          <button className="adm__btn adm__btn--ghost" type="button" onClick={onCancel}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
