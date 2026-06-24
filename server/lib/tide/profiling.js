// Gamified opt-in + progressive profiling. The panel only grows if people get
// something back and aren't asked for everything at once — so we ask a little at
// a time, reward each step, and gate the value-back "mirror" behind consent.
// Klout scored people without consent and gave nothing back; this is the inverse:
// consent-first, value-back, a little at a time.
import { clamp01, round2 } from './rng.js';

const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const get = (p, camel, snake) => p[camel] ?? p[snake];

export const INTEREST_POOL = ['housing', 'transit', 'schools', 'taxes', 'climate', 'jobs', 'healthcare', 'safety', 'small-business', 'childcare'];

// Ordered steps. `field` is the panelist property a step fills; `done(p)` decides
// whether it's already answered; `points`/`weight` drive gamification + the
// completeness score. `type` tells the UI how to render it.
export const STEPS = [
  {
    id: 'consent', type: 'consent', points: 10, weight: 1,
    title: 'Map your attention — anonymously',
    body: 'Link what you pay attention to and see where you sit in the conversation. We never sell who you are; demographics stay aggregate.',
    cta: 'I consent',
    done: (p) => !!get(p, 'consentAt', 'consent_at'),
  },
  {
    id: 'age', type: 'select', field: 'ageBand', points: 15, weight: 1,
    title: 'Which age band are you in?',
    options: ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'],
    done: (p) => !!get(p, 'ageBand', 'age_band'),
  },
  {
    id: 'gender', type: 'select', field: 'gender', points: 10, weight: 1,
    title: 'How do you identify?',
    options: ['female', 'male', 'nonbinary', 'prefer-not'],
    done: (p) => !!p.gender,
  },
  {
    id: 'region', type: 'select', field: 'region', points: 10, weight: 1,
    title: 'Where do you live?',
    options: ['urban', 'suburban', 'rural'],
    done: (p) => !!p.region,
  },
  {
    id: 'interests', type: 'multiselect', field: 'interests', points: 20, weight: 1.5, max: 5,
    title: 'What do you care about? (pick up to 5)',
    options: INTEREST_POOL,
    done: (p) => (Array.isArray(p.interests) ? p.interests : parse(p.interestsJson ?? p.interests_json, [])).length > 0,
  },
  {
    id: 'link', type: 'link', field: 'linkedAccounts', points: 25, weight: 1.5, optional: true,
    title: 'Link an account (optional)',
    body: 'Linking sharpens your mirror and your contribution. You can unlink anytime.',
    options: ['bluesky', 'mastodon', 'x', 'youtube'],
    done: (p) => (parse(get(p, 'linkedAccountsJson', 'linked_accounts_json'), [])).length > 0,
  },
  {
    id: 'newsHabit', type: 'select', field: 'demographics.newsHabit', points: 15, weight: 1,
    title: 'How closely do you follow the news?',
    options: ['constantly', 'daily', 'weekly', 'rarely'],
    done: (p) => !!parse(get(p, 'demographicsJson', 'demographics_json'), {}).newsHabit,
  },
];

const TOTAL_WEIGHT = STEPS.reduce((s, x) => s + x.weight, 0);

export const LEVELS = [
  { min: 0, name: 'Observer' },
  { min: 30, name: 'Tuned-in' },
  { min: 60, name: 'Insider' },
  { min: 90, name: 'Bellwether' },
  { min: 120, name: 'Oracle' },
];

export function levelFor(points) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (points >= LEVELS[i].min) idx = i;
  const next = LEVELS[idx + 1] || null;
  return { level: idx + 1, name: LEVELS[idx].name, points, nextAt: next ? next.min : null, nextName: next ? next.name : null };
}

// Completeness = answered weight / total weight.
export function completenessOf(panelist) {
  const filled = STEPS.filter((s) => s.done(panelist)).reduce((sum, s) => sum + s.weight, 0);
  return round2(clamp01(filled / TOTAL_WEIGHT));
}

// The next step to present (first not-yet-done), or null when the journey's done.
export function nextStep(panelist) {
  const s = STEPS.find((step) => !step.done(panelist));
  return s ? publicStep(s) : null;
}

// Strip server-only fields for the wire.
export function publicStep(s) {
  return { id: s.id, type: s.type, title: s.title, body: s.body || null, cta: s.cta || null, options: s.options || null, points: s.points, optional: !!s.optional, max: s.max || null };
}

const BADGE_RULES = [
  { id: 'consented', when: (p) => !!get(p, 'consentAt', 'consent_at'), label: 'Consented' },
  { id: 'connected', when: (p) => parse(get(p, 'linkedAccountsJson', 'linked_accounts_json'), []).length > 0, label: 'Connected' },
  { id: 'profile-complete', when: (p) => completenessOf(p) >= 1, label: 'Profile complete' },
];

// Validate + apply one step answer. Returns a flat patch of panelist updates plus
// the points awarded and any newly earned badges. `panelist` is the current row;
// the caller persists the returned `updates`.
export function applyStep(panelist, stepId, value) {
  const step = STEPS.find((s) => s.id === stepId);
  if (!step) return { error: 'unknown step' };

  // Build the would-be next state so we can recompute derived fields.
  const nextState = { ...panelist };
  const updates = {};

  if (step.type === 'consent') {
    if (panelist.consentAt || panelist.consent_at) return { error: 'already consented' };
    updates.consentAt = new Date();
    nextState.consentAt = updates.consentAt;
  } else if (step.type === 'multiselect') {
    let arr = Array.isArray(value) ? value.map((v) => String(v).toLowerCase()) : [];
    arr = [...new Set(arr.filter((v) => (step.options || []).includes(v)))].slice(0, step.max || 5);
    if (!arr.length) return { error: 'pick at least one' };
    updates.interestsJson = JSON.stringify(arr);
    nextState.interests = arr; nextState.interestsJson = updates.interestsJson;
  } else if (step.type === 'link') {
    const acct = String(value || '').toLowerCase();
    if (!(step.options || []).includes(acct)) return { error: 'unknown account' };
    const cur = parse(panelist.linkedAccountsJson ?? panelist.linked_accounts_json, []);
    const arr = [...new Set([...cur, acct])];
    updates.linkedAccountsJson = JSON.stringify(arr);
    nextState.linkedAccountsJson = updates.linkedAccountsJson;
  } else if (step.field && step.field.startsWith('demographics.')) {
    const key = step.field.split('.')[1];
    if (!(step.options || []).includes(String(value))) return { error: 'invalid option' };
    const demo = parse(panelist.demographicsJson ?? panelist.demographics_json, {});
    demo[key] = String(value);
    updates.demographicsJson = JSON.stringify(demo);
    nextState.demographicsJson = updates.demographicsJson;
  } else if (step.type === 'select') {
    if (!(step.options || []).includes(String(value))) return { error: 'invalid option' };
    updates[step.field] = String(value);
    nextState[step.field] = String(value);
  } else {
    return { error: 'unsupported step' };
  }

  // Derived: completeness, points, badges.
  const completeness = completenessOf(nextState);
  updates.profileCompleteness = completeness;
  const reward = step.points;
  updates.points = (panelist.points || 0) + reward;
  nextState.points = updates.points;
  updates.lastStepAt = new Date();

  const had = new Set(parse(panelist.badgesJson ?? panelist.badges_json, []));
  const newBadges = [];
  for (const b of BADGE_RULES) if (!had.has(b.id) && b.when(nextState)) { had.add(b.id); newBadges.push(b); }
  if (newBadges.length) updates.badgesJson = JSON.stringify([...had]);

  return {
    updates, reward, completeness,
    points: updates.points,
    level: levelFor(updates.points),
    newBadges: newBadges.map((b) => ({ id: b.id, label: b.label })),
    next: nextStep(nextState),
  };
}
