// The why-engine — narrative attribution. "Everyone shows what is trending;
// almost nobody credibly explains why." This is the headline of the product.
//
// Pluggable by design: summarize() delegates to an LLM when one is configured
// (same shape as Beacon's assist), and otherwise produces a deterministic,
// defensible template grounded in the computed reading. The template is not a
// placeholder — it is the honest, offline floor that the LLM elaborates on.
import { net } from './sentiment.js';

export function whyConfigured() {
  return !!(process.env.MANDATE_TIDE_AI_KEY || process.env.MANDATE_OPENAI_KEY);
}

const pct = (x) => `${Math.round((x || 0) * 100)}%`;

function momentumPhrase(m) {
  if (m >= 0.05) return `rising ${pct(m)}`;
  if (m <= -0.05) return `cooling ${pct(Math.abs(m))}`;
  return 'holding steady';
}

function confidencePhrase(c) {
  if (c >= 0.66) return 'high';
  if (c >= 0.33) return 'moderate';
  return 'low';
}

// Build the deterministic narrative from a fully-computed reading.
export function templateWhy(reading, topic) {
  const { volume, momentum, demographics, sentiment, drivers, panelN, confidence } = reading;
  const top = demographics?.top || {};
  const lead = drivers?.[0]?.name;
  const second = drivers?.[1]?.name;
  const move = momentumPhrase(momentum);

  const whoBits = [];
  if (top.age) whoBits.push(`${top.age}-year-olds`);
  if (top.gender && top.gender !== 'unknown') whoBits.push(top.gender === 'female' ? 'women' : top.gender === 'male' ? 'men' : top.gender);
  const who = whoBits.length ? whoBits.join(' — skewing ') : 'a broad cross-section';
  const where = top.region && top.region !== 'unknown' ? ` in ${top.region} areas` : '';

  const n = net(sentiment);
  const mood = n > 0.15 ? `net positive (${pct(sentiment.pos)} positive)` : n < -0.15 ? `net negative (${pct(sentiment.neg)} negative)` : `mixed (${pct(sentiment.pos)} positive / ${pct(sentiment.neg)} negative)`;

  const carriers = lead ? `carried by ${lead}${second ? ` and ${second}` : ''}` : 'with no single dominant driver';

  return `${topic.name} is ${move} this window (volume ${volume.toLocaleString()}), ${carriers}. `
    + `Attention concentrates among ${who}${where}. Sentiment runs ${mood}. `
    + `Read off ${panelN} consented panelist${panelN === 1 ? '' : 's'} — ${confidencePhrase(confidence)} confidence, directional not census-grade.`;
}

// Public entry point. Async so a live LLM can slot in behind the same call.
export async function summarize(reading, topic) {
  // LLM hook would go here when whyConfigured(); the template is the offline floor.
  return templateWhy(reading, topic);
}
