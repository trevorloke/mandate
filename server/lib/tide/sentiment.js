// Lightweight lexicon sentiment — scores a piece of text to pos | neu | neg.
// Deliberately tiny and dependency-free: it exists so the seeded source and any
// public-web samples can be classified offline. A real deployment swaps this for
// a model behind the same { pos, neu, neg } contract.
const POS = ['win', 'wins', 'support', 'great', 'good', 'love', 'hope', 'gain', 'gains', 'breakthrough', 'praise', 'boost', 'strong', 'progress', 'celebrate', 'positive', 'agree', 'trust'];
const NEG = ['loss', 'lose', 'fail', 'failure', 'bad', 'hate', 'fear', 'cut', 'cuts', 'scandal', 'crisis', 'attack', 'weak', 'decline', 'angry', 'outrage', 'negative', 'oppose', 'distrust', 'fraud'];

const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);

// Classify a single string → 'pos' | 'neu' | 'neg'.
export function classify(text) {
  let score = 0;
  for (const w of norm(text)) {
    if (POS.includes(w)) score++;
    else if (NEG.includes(w)) score--;
  }
  return score > 0 ? 'pos' : score < 0 ? 'neg' : 'neu';
}

// Reduce a list of polarity labels to normalized { pos, neu, neg } fractions.
export function distribution(labels) {
  const c = { pos: 0, neu: 0, neg: 0 };
  for (const l of labels) c[l] = (c[l] || 0) + 1;
  const n = labels.length || 1;
  return { pos: c.pos / n, neu: c.neu / n, neg: c.neg / n };
}

// Net sentiment in [-1, 1] from a { pos, neu, neg } distribution.
export const net = (d) => (d?.pos || 0) - (d?.neg || 0);

// Human label for a distribution, used by the why-engine.
export function moodLabel(d) {
  const n = net(d);
  if (n > 0.15) return 'net positive';
  if (n < -0.15) return 'net negative';
  return 'mixed';
}
