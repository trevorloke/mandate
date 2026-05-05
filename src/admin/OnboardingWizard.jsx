// Onboarding wizard — gates a fresh workspace until the user configures their
// campaign and chooses a starter-data option. Mounted from App.jsx when
// `workspace.settings.onboarded !== true` AND user is super_admin.
//
// Steps: welcome → campaign → modules → team (optional) → data → done
import React, { useState } from 'react';
import { api } from '../auth/api';
import { useAuth } from '../auth/AuthContext';
import './OnboardingWizard.css';

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
];

const KIND_OPTIONS = [
  { k: 'PROVINCIAL · MLA',   label: 'Provincial / state legislature' },
  { k: 'FEDERAL · MP',       label: 'Federal / national parliament' },
  { k: 'MUNICIPAL · MAYOR',  label: 'Municipal — mayoral' },
  { k: 'MUNICIPAL · COUNCIL',label: 'Municipal — council seat' },
  { k: 'PRIMARY',            label: 'Party primary / nomination' },
  { k: 'BALLOT',             label: 'Ballot initiative / referendum' },
  { k: 'OTHER',              label: 'Other' },
];

const TZ_OPTIONS = [
  'PT', 'MT', 'CT', 'ET', 'AT', 'NT',  // Canadian / US
  'GMT', 'BST', 'CET', 'EET', 'IST',
];

const STEPS = ['welcome', 'campaign', 'modules', 'team', 'data', 'done'];

export default function OnboardingWizard({ onComplete }) {
  const { workspace, setWorkspace, refresh } = useAuth();
  const [step, setStep] = useState('welcome');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [pendingWs, setPendingWs] = useState(null);  // saved-but-not-applied workspace state

  // Campaign details (pre-filled from signup if available)
  const [kind, setKind] = useState(workspace?.kind || '');
  const [candidate, setCandidate] = useState(workspace?.candidate || '');
  const [party, setParty] = useState(workspace?.party || '');
  const [phase, setPhase] = useState(workspace?.phase || 'Pre-launch');
  const [daysToVote, setDaysToVote] = useState(workspace?.daysToVote || 180);
  const [tz, setTz] = useState(workspace?.tz || 'PT');

  // Module selection
  const [modules, setModules] = useState(() => {
    const stored = workspace?.settings?.modules || {};
    const o = {};
    ALL_MODULES.forEach(m => { o[m.k] = stored[m.k] !== false; });
    return o;
  });

  // Team invites (optional, in-wizard)
  const [invites, setInvites] = useState([{ email: '', name: '', role: 'editor' }]);

  // Starter data choice
  const [starter, setStarter] = useState('sample');  // 'empty' | 'sample' | 'import'
  const [importFile, setImportFile] = useState(null);

  const stepIdx = STEPS.indexOf(step);
  const totalSteps = STEPS.length - 1;  // 'done' isn't counted in progress

  const goNext = () => {
    setErr('');
    const next = STEPS[stepIdx + 1];
    if (next) setStep(next);
  };
  const goBack = () => {
    setErr('');
    const prev = STEPS[stepIdx - 1];
    if (prev) setStep(prev);
  };

  const finish = async () => {
    setBusy(true);
    setErr('');
    try {
      // 1. Save workspace details + module flags + onboarded flag
      const settings = {
        ...(workspace?.settings || {}),
        modules,
        onboarded: true,
      };
      const r = await api.updateWorkspace({
        kind, candidate, party, phase, daysToVote: Number(daysToVote) || 180, tz,
        settings,
      });
      // Defer the local-state update — applying it now would unmount this
      // component (App.jsx checks settings.onboarded === true) and the user
      // would never see the "You're set" confirmation.
      if (r.workspace) setPendingWs(r.workspace);

      // 2. Send team invites (if any)
      const validInvites = invites.filter(i => i.email && i.name);
      if (validInvites.length) {
        await api.bulkInviteUsers(validInvites).catch(() => {});
      }

      // 3. Apply starter-data choice
      if (starter === 'sample') {
        const { seedDemoData } = await import('./seed');
        await seedDemoData().catch(() => {});
      } else if (starter === 'import' && importFile) {
        const text = await importFile.text();
        const snapshot = JSON.parse(text);
        await api.importBackup(snapshot, 'replace').catch(() => {});
      }
      // 'empty' → no action

      setStep('done');
    } catch (e) {
      setErr(e.message || 'Onboarding failed');
    }
    setBusy(false);
  };

  const close = () => {
    // Apply the saved workspace state now — App will see onboarded:true and unmount us.
    if (pendingWs) setWorkspace(pendingWs);
    onComplete && onComplete();
  };

  const enabledCount = Object.values(modules).filter(Boolean).length;

  return (
    <div className="onb">
      <div className="onb__card">
        <header className="onb__head">
          <div className="onb__brand"><b>M</b><span>mandate</span></div>
          {step !== 'done' && (
            <div className="onb__progress">
              <span className="onb__progress-step">Step {stepIdx + 1} of {totalSteps}</span>
              <div className="onb__progress-bar">
                <div className="onb__progress-fill" style={{ width: `${((stepIdx + 1) / totalSteps) * 100}%` }} />
              </div>
            </div>
          )}
        </header>

        {step === 'welcome' && (
          <div className="onb__step">
            <h1 className="onb__title">Welcome to Mandate.</h1>
            <p className="onb__lede">
              You just created the workspace for <em>{workspace?.name}</em>. The next few steps
              will set up the basics so the app fits your campaign — kind of office, candidate,
              days until vote, which modules you want enabled, and whether to start empty or with
              sample data so you can explore.
            </p>
            <p className="onb__lede" style={{ marginTop: 12 }}>
              You can change everything later in <b>Admin → Workspace</b>. Should take about 90 seconds.
            </p>
            <div className="onb__actions">
              <button className="onb__btn" onClick={goNext}>Begin →</button>
            </div>
          </div>
        )}

        {step === 'campaign' && (
          <div className="onb__step">
            <h1 className="onb__title">Campaign basics.</h1>
            <p className="onb__lede">A few details about the office and the timeline.</p>

            <div className="onb__field">
              <label className="onb__label">Office / kind</label>
              <select className="onb__input" value={kind} onChange={e => setKind(e.target.value)}>
                <option value="">— pick one —</option>
                {KIND_OPTIONS.map(k => <option key={k.k} value={k.k}>{k.label}</option>)}
              </select>
            </div>

            <div className="onb__field-row">
              <div className="onb__field">
                <label className="onb__label">Candidate</label>
                <input className="onb__input" value={candidate} onChange={e => setCandidate(e.target.value)} placeholder="Amara Tanaka" />
              </div>
              <div className="onb__field">
                <label className="onb__label">Party / banner</label>
                <input className="onb__input" value={party} onChange={e => setParty(e.target.value)} placeholder="Meridian Forward" />
              </div>
            </div>

            <div className="onb__field-row">
              <div className="onb__field">
                <label className="onb__label">Days until vote</label>
                <input type="number" min="1" max="2000" className="onb__input"
                  value={daysToVote} onChange={e => setDaysToVote(e.target.value)} />
                <p className="onb__hint">Drives the countdown bar in the top strip. Leave at 180 if unsure.</p>
              </div>
              <div className="onb__field">
                <label className="onb__label">Time zone</label>
                <select className="onb__input" value={tz} onChange={e => setTz(e.target.value)}>
                  {TZ_OPTIONS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
            </div>

            <div className="onb__field">
              <label className="onb__label">Phase</label>
              <select className="onb__input" value={phase} onChange={e => setPhase(e.target.value)}>
                <option>Pre-launch</option>
                <option>Persuasion</option>
                <option>Mobilization</option>
                <option>GOTV</option>
                <option>Post-election</option>
              </select>
            </div>

            <div className="onb__actions">
              <button className="onb__btn onb__btn--ghost" onClick={goBack}>← Back</button>
              <button className="onb__btn" onClick={goNext} disabled={!kind || !candidate}>Next →</button>
            </div>
          </div>
        )}

        {step === 'modules' && (
          <div className="onb__step">
            <h1 className="onb__title">Modules.</h1>
            <p className="onb__lede">
              Turn off the modules you don't need — they'll be hidden from the top nav.
              You can re-enable any of them later.
            </p>

            <div className="onb__modules">
              {ALL_MODULES.map(m => (
                <label key={m.k} className={`onb__mod ${modules[m.k] ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={modules[m.k]}
                    onChange={e => setModules({ ...modules, [m.k]: e.target.checked })} />
                  <div>
                    <div className="onb__mod-label">{m.label}</div>
                    <div className="onb__mod-desc">{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>

            <p className="onb__hint" style={{ marginTop: 8 }}>{enabledCount} of {ALL_MODULES.length} enabled.</p>

            <div className="onb__actions">
              <button className="onb__btn onb__btn--ghost" onClick={goBack}>← Back</button>
              <button className="onb__btn" onClick={goNext} disabled={enabledCount === 0}>Next →</button>
            </div>
          </div>
        )}

        {step === 'team' && (
          <div className="onb__step">
            <h1 className="onb__title">Invite your team.</h1>
            <p className="onb__lede">
              Optional — you can do this later from <b>Admin → Users</b>. Each row creates a
              single-use invite link. Skip if it's just you for now.
            </p>

            <div className="onb__invites">
              {invites.map((inv, i) => (
                <div key={i} className="onb__invite-row">
                  <input className="onb__input" placeholder="name@example.com" value={inv.email}
                    onChange={e => setInvites(invites.map((x, j) => j === i ? { ...x, email: e.target.value } : x))} />
                  <input className="onb__input" placeholder="Full name" value={inv.name}
                    onChange={e => setInvites(invites.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
                  <select className="onb__input" value={inv.role}
                    onChange={e => setInvites(invites.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}>
                    <option value="viewer">viewer</option>
                    <option value="editor">editor</option>
                    <option value="admin">admin</option>
                  </select>
                  {invites.length > 1 && (
                    <button className="onb__icon-btn" type="button"
                      onClick={() => setInvites(invites.filter((_, j) => j !== i))}>×</button>
                  )}
                </div>
              ))}
              <button className="onb__btn onb__btn--ghost" type="button"
                onClick={() => setInvites([...invites, { email: '', name: '', role: 'editor' }])}>
                + Add another
              </button>
            </div>

            <div className="onb__actions">
              <button className="onb__btn onb__btn--ghost" onClick={goBack}>← Back</button>
              <button className="onb__btn" onClick={goNext}>Next →</button>
            </div>
          </div>
        )}

        {step === 'data' && (
          <div className="onb__step">
            <h1 className="onb__title">Starter data.</h1>
            <p className="onb__lede">How would you like to begin?</p>

            <div className="onb__choices">
              <label className={`onb__choice ${starter === 'empty' ? 'is-on' : ''}`}>
                <input type="radio" name="starter" checked={starter === 'empty'} onChange={() => setStarter('empty')} />
                <div>
                  <div className="onb__choice-label">Start empty</div>
                  <div className="onb__choice-desc">Begin with a clean workspace — no records anywhere. Add your real donors, voters, etc. in <b>Admin → Module data</b>.</div>
                </div>
              </label>

              <label className={`onb__choice ${starter === 'sample' ? 'is-on' : ''}`}>
                <input type="radio" name="starter" checked={starter === 'sample'} onChange={() => setStarter('sample')} />
                <div>
                  <div className="onb__choice-label">Load sample data <span className="onb__tag">explore</span></div>
                  <div className="onb__choice-desc">Populate every module with realistic demo records (~30 across donors, voters, prospects, gifts, posts, bills, etc.) so you can see what a fully-loaded campaign looks like. Every record is yours — edit, delete, or wipe via the danger zone.</div>
                </div>
              </label>

              <label className={`onb__choice ${starter === 'import' ? 'is-on' : ''}`}>
                <input type="radio" name="starter" checked={starter === 'import'} onChange={() => setStarter('import')} />
                <div>
                  <div className="onb__choice-label">Import from a backup</div>
                  <div className="onb__choice-desc">Upload a Mandate workspace JSON snapshot. Every record from the snapshot becomes part of this workspace.</div>
                  {starter === 'import' && (
                    <input type="file" accept=".json" className="onb__file"
                      onChange={e => setImportFile(e.target.files?.[0] || null)} />
                  )}
                </div>
              </label>
            </div>

            {err && <div className="onb__err">{err}</div>}

            <div className="onb__actions">
              <button className="onb__btn onb__btn--ghost" onClick={goBack}>← Back</button>
              <button className="onb__btn" onClick={finish}
                disabled={busy || (starter === 'import' && !importFile)}>
                {busy ? 'Setting up…' : 'Finish setup →'}
              </button>
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className="onb__step onb__step--done">
            <div className="onb__check">✓</div>
            <h1 className="onb__title">You're set.</h1>
            <p className="onb__lede">
              {starter === 'sample'
                ? "Sample data is loading in the background. By the time you click through to a module, it'll be there."
                : starter === 'import'
                  ? 'Snapshot imported. Your records are in.'
                  : 'Workspace is empty. Head to Admin → Module data to add your first records.'}
            </p>
            <div className="onb__actions">
              <button className="onb__btn" onClick={close}>Open Mandate →</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
