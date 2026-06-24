// The value-back "mirror" — what the panelist gets in return for joining. Their
// own attention mapped: where they sit relative to the conversation, what they're
// early or late to, and how their take compares to people like them. This is the
// reason someone links accounts and answers questions; the ground truth it yields
// is what the product sells. Consent-first, value-back — the opposite of Klout.
import { panelistEngagement, panelistPolarity } from './panel.js';
import { levelFor } from './profiling.js';
import { round2 } from './rng.js';

const parse = (s, fb) => { try { return JSON.parse(s); } catch { return fb; } };
const ageOf = (p) => p.ageBand ?? p.age_band;

const majority = (labels) => {
  const c = {}; for (const l of labels) c[l] = (c[l] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || 'neu';
};
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const moodWord = (pol) => (pol === 'pos' ? 'positive' : pol === 'neg' ? 'negative' : 'mixed');

// Build the mirror for one panelist against the live topic set + the rest of the
// panel. `topics` are engine-shaped ({id,name,slug,keywords,refreshHours}).
export function buildMirror({ panelist, topics, panel, at = Date.now() }) {
  const others = panel.filter((p) => p.id !== panelist.id);
  const cohort = others.filter((p) => ageOf(p) === ageOf(panelist) && p.region === panelist.region);
  const cohortLabel = [ageOf(panelist), panelist.region].filter(Boolean).join(' · ') || 'your cohort';

  const rows = topics.map((t) => {
    const mine = round2(panelistEngagement(panelist, t, at).score);
    const minePol = panelistPolarity(panelist, t, at);
    const cohortScores = cohort.map((p) => panelistEngagement(p, t, at).score);
    const panelScores = others.map((p) => panelistEngagement(p, t, at).score);
    const cohortAvg = round2(avg(cohortScores));
    const panelAvg = round2(avg(panelScores));
    const cohortPol = majority(cohort.map((p) => panelistPolarity(p, t, at)));

    const vsCohort = cohortAvg > 0 ? round2((mine - cohortAvg) / cohortAvg) : 0;
    const vsPanel = panelAvg > 0 ? round2((mine - panelAvg) / panelAvg) : 0;
    const timing = mine - panelAvg > 0.1 ? 'early' : mine - panelAvg < -0.1 ? 'late' : 'in step';
    const agreement = minePol === cohortPol ? 'with your cohort' : (minePol === 'neu' || cohortPol === 'neu') ? 'undecided' : 'against your cohort';

    return {
      topicId: t.id, name: t.name,
      mine, cohortAvg, panelAvg, vsCohort, vsPanel, timing,
      polarity: minePol, mood: moodWord(minePol), cohortMood: moodWord(cohortPol), agreement,
    };
  }).sort((a, b) => b.mine - a.mine);

  const signature = rows.slice(0, 3).map((r) => r.name);
  const early = rows.filter((r) => r.timing === 'early').map((r) => r.name);
  const contrarian = rows.filter((r) => r.agreement === 'against your cohort').map((r) => r.name);

  const completeness = panelist.profileCompleteness ?? panelist.profile_completeness ?? 0;
  const lead = rows[0];
  const summary = lead
    ? `You index highest on ${lead.name} — ${lead.timing === 'early' ? `you're early to it` : lead.timing === 'late' ? `you're late to it` : `you're in step with the room`}, and ${lead.agreement}. `
      + (early.length ? `You tend to catch ${early.length} topic${early.length === 1 ? '' : 's'} before people like you. ` : '')
      + (contrarian.length ? `You break from your cohort on ${contrarian.length}.` : `Your takes track your cohort.`)
    : 'Track some topics to see where you sit in the conversation.';

  return {
    panelist: {
      id: panelist.id,
      level: levelFor(panelist.points || 0),
      points: panelist.points || 0,
      completeness: round2(completeness),
      badges: parse(panelist.badgesJson ?? panelist.badges_json, []),
      cohortLabel, cohortSize: cohort.length,
    },
    topics: rows,
    signature, early, contrarian,
    summary,
  };
}
