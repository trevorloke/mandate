// AI caption assist via the Claude API. Gated behind ANTHROPIC_API_KEY — when
// unset, callers get a clear "not configured" error (like the gated platforms).
// Plain HTTPS (no SDK dependency).
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.MANDATE_AI_MODEL || 'claude-haiku-4-5-20251001';

export function aiConfigured() { return !!process.env.ANTHROPIC_API_KEY; }

const MODE_INSTRUCTION = {
  improve: 'Improve this social post: make it punchier and more engaging while keeping the original meaning and voice.',
  shorten: 'Shorten this social post to be well under the limit while keeping the key message.',
  hashtags: 'Return the post unchanged, then add 3–5 relevant, specific hashtags at the end.',
  rewrite: 'Rewrite this social post in a fresh way while keeping the core message.',
  generate: 'Write a compelling social post from this idea or topic.',
};

export async function generateCaption({ draft = '', mode = 'improve', platform = '', charLimit = null }) {
  if (!aiConfigured()) {
    const e = new Error('AI assist needs an API key. Set ANTHROPIC_API_KEY on the server.');
    e.code = 'no_key';
    throw e;
  }
  const instruction = MODE_INSTRUCTION[mode] || MODE_INSTRUCTION.improve;
  const limitNote = charLimit ? ` The result MUST be at most ${charLimit} characters.` : '';
  const platformNote = platform ? ` It will be posted on ${platform}.` : '';
  const system = 'You are a sharp social media copywriter for a political campaign tool. '
    + 'Return ONLY the post text — no preamble, no quotes, no commentary, no options. '
    + 'Match the platform\'s conventions and keep a natural human voice.';
  const user = `${instruction}${platformNote}${limitNote}\n\n${mode === 'generate' ? 'Idea/topic' : 'Post'}:\n${draft}`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `AI request failed (${res.status}).`);
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('AI returned no text.');
  return { text };
}
