// Tide — the gamified opt-in journey + value-back mirror. This is the panel
// experience that makes people want to join: consent-first, a little at a time,
// each step rewarded, and a mirror they actually want to look at at the end.
// Rendered inside the Panel tab so operators see exactly what panelists get.
import { useState } from 'react';
import { api } from './auth/api';

const pct = (x) => `${Math.round((x || 0) * 100)}%`;
const signed = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;

// ── One profiling step, rendered by type ──
function StepCard({ step, onAnswer, busy }) {
  const [multi, setMulti] = useState([]);
  const toggle = (o) => setMulti((m) => (m.includes(o) ? m.filter((x) => x !== o) : (m.length < (step.max || 5) ? [...m, o] : m)));

  return (
    <div className="tj-step">
      <div className="tj-step__pts">+{step.points} pts</div>
      <h4 className="tj-step__title">{step.title}</h4>
      {step.body && <p className="tj-step__body">{step.body}</p>}

      {step.type === 'consent' && (
        <button className="tide-btn tide-btn--big" disabled={busy} onClick={() => onAnswer(undefined)}>{step.cta || 'I consent'}</button>
      )}

      {step.type === 'select' && (
        <div className="tj-opts">
          {step.options.map((o) => <button key={o} className="tj-opt" disabled={busy} onClick={() => onAnswer(o)}>{o}</button>)}
        </div>
      )}

      {step.type === 'link' && (
        <>
          <div className="tj-opts">
            {step.options.map((o) => <button key={o} className="tj-opt" disabled={busy} onClick={() => onAnswer(o)}>{o}</button>)}
          </div>
          {step.optional && <button className="tj-skip" disabled={busy} onClick={() => onAnswer('__skip__')}>Skip for now</button>}
        </>
      )}

      {step.type === 'multiselect' && (
        <>
          <div className="tj-opts">
            {step.options.map((o) => (
              <button key={o} className={`tj-opt ${multi.includes(o) ? 'is-on' : ''}`} disabled={busy} onClick={() => toggle(o)}>{o}</button>
            ))}
          </div>
          <button className="tide-btn" disabled={busy || !multi.length} onClick={() => onAnswer(multi)}>Continue ({multi.length})</button>
        </>
      )}
    </div>
  );
}

function ProgressRail({ completeness, points, level, badges }) {
  return (
    <div className="tj-rail">
      <div className="tj-rail__lvl">
        <span className="tj-rail__lvlname">{level?.name || 'Observer'}</span>
        <span className="tj-rail__pts">{points} pts{level?.nextAt != null ? ` · ${level.nextAt - points} to ${level.nextName}` : ''}</span>
      </div>
      <div className="tj-rail__bar"><span style={{ width: pct(completeness) }} /></div>
      <div className="tj-rail__meta">{pct(completeness)} profile complete</div>
      {!!badges.length && <div className="tj-badges">{badges.map((b) => <span key={b} className="tj-badge">★ {b.replace(/-/g, ' ')}</span>)}</div>}
    </div>
  );
}

// ── The value-back mirror ──
function MirrorView({ mirror, onRestart }) {
  const p = mirror.panelist;
  return (
    <div className="tj-mirror">
      <div className="tj-mirror__hd">
        <div>
          <div className="tj-mirror__eyebrow">YOUR ATTENTION MIRROR</div>
          <div className="tj-mirror__lvl">{p.level.name} · {p.points} pts · {pct(p.completeness)} complete</div>
        </div>
        <div className="tj-mirror__cohort">vs {p.cohortLabel} ({p.cohortSize})</div>
      </div>

      <p className="tj-mirror__summary">{mirror.summary}</p>

      {!!mirror.signature.length && (
        <div className="tj-mirror__sig">Your signature: {mirror.signature.map((s) => <span key={s} className="tide-kw">{s}</span>)}</div>
      )}

      <div className="tj-mirror__rows">
        {mirror.topics.map((t) => (
          <div key={t.topicId} className="tj-mrow">
            <div className="tj-mrow__name">{t.name}</div>
            <div className="tj-mrow__bars" title={`you ${pct(t.mine)} · cohort ${pct(t.cohortAvg)}`}>
              <div className="tj-mrow__bar"><span className="tj-mrow__me" style={{ width: pct(t.mine) }} /></div>
              <div className="tj-mrow__bar tj-mrow__bar--ghost"><span style={{ width: pct(t.cohortAvg) }} /></div>
            </div>
            <span className={`tj-tag tj-tag--${t.timing.replace(' ', '')}`}>{t.timing}</span>
            <span className="tj-mrow__idx" data-up={t.vsCohort > 0}>{signed(t.vsCohort)} vs cohort</span>
            <span className={`tj-mrow__agree tj-mrow__agree--${t.agreement === 'against your cohort' ? 'against' : 'with'}`}>{t.agreement}</span>
          </div>
        ))}
      </div>

      {!!mirror.early.length && <div className="tj-mirror__call">⚡ You catch <b>{mirror.early.join(', ')}</b> before people like you.</div>}
      {!!mirror.contrarian.length && <div className="tj-mirror__call">↔ You break from your cohort on <b>{mirror.contrarian.join(', ')}</b>.</div>}

      <button className="tide-btn tide-btn--ghost" onClick={onRestart}>Run the journey again</button>
    </div>
  );
}

// ── Orchestrator ──
export function PanelJourney({ canEdit, onChanged }) {
  const [phase, setPhase] = useState('idle');   // idle | step | done
  const [pid, setPid] = useState(null);
  const [step, setStep] = useState(null);
  const [stats, setStats] = useState({ points: 0, completeness: 0, level: null, badges: [] });
  const [reward, setReward] = useState(null);
  const [mirror, setMirror] = useState(null);
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      const j = await api.tidePanelStart();
      setPid(j.id); setStep(j.next); setStats({ points: j.points, completeness: j.completeness, level: null, badges: j.badges || [] });
      setReward(null); setMirror(null); setPhase('step');
    } finally { setBusy(false); }
  };

  const answer = async (value) => {
    if (value === '__skip__') value = undefined;
    setBusy(true);
    try {
      const r = await api.tidePanelStep(pid, { step: step.id, value });
      if (r.error) return;
      setStats((s) => ({ points: r.points, completeness: r.completeness, level: r.level, badges: [...new Set([...s.badges, ...r.newBadges.map((b) => b.id)])] }));
      setReward({ pts: r.reward, badges: r.newBadges });
      if (r.next) {
        setStep(r.next);
      } else {
        const m = await api.tidePanelMirror(pid);
        setMirror(m.mirror); setPhase('done');
        onChanged?.();
      }
    } finally { setBusy(false); }
  };

  if (!canEdit) return null;

  return (
    <div className="tj">
      <div className="tj__hd">
        <h3 className="tj__h">The join experience</h3>
        <p className="tj__dek">What a panelist sees: consent-first, a little at a time, rewarded each step, ending in a mirror they want to look at. This is how the panel — the moat — grows.</p>
      </div>

      {phase === 'idle' && (
        <button className="tide-btn tide-btn--big" disabled={busy} onClick={start}>{busy ? 'Starting…' : 'Walk through the journey'}</button>
      )}

      {phase === 'step' && step && (
        <div className="tj__body">
          <ProgressRail completeness={stats.completeness} points={stats.points} level={stats.level} badges={stats.badges} />
          {reward && <div className="tj-reward">+{reward.pts} pts{reward.badges.length ? ` · ${reward.badges.map((b) => `★ ${b.label}`).join(' ')}` : ''}</div>}
          <StepCard step={step} onAnswer={answer} busy={busy} />
        </div>
      )}

      {phase === 'done' && mirror && <MirrorView mirror={mirror} onRestart={start} />}
    </div>
  );
}
