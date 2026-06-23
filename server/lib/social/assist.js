// AI caption assist via the Claude API. Gated behind ANTHROPIC_API_KEY — when
// unset, callers get a clear "not configured" error (like the gated platforms).
// Plain HTTPS (no SDK dependency).
const API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.MANDATE_AI_MODEL || 'claude-haiku-4-5-20251001';

export function aiConfigured() { return !!process.env.ANTHROPIC_API_KEY; }

function requireKey() {
  if (!aiConfigured()) {
    const e = new Error('AI assist needs an API key. Set ANTHROPIC_API_KEY on the server.');
    e.code = 'no_key';
    throw e;
  }
}

// Single Claude Messages call returning the concatenated text. Shared by the
// caption assist and the inbox reply drafter.
async function callClaude({ system, user, maxTokens = 1024 }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j?.error?.message || `AI request failed (${res.status}).`);
  const text = (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!text) throw new Error('AI returned no text.');
  return text;
}

const MODE_INSTRUCTION = {
  improve: 'Improve this social post: make it punchier and more engaging while keeping the original meaning and voice.',
  shorten: 'Shorten this social post to be well under the limit while keeping the key message.',
  hashtags: 'Return the post unchanged, then add 3–5 relevant, specific hashtags at the end.',
  rewrite: 'Rewrite this social post in a fresh way while keeping the core message.',
  generate: 'Write a compelling social post from this idea or topic.',
};

export async function generateCaption({ draft = '', mode = 'improve', platform = '', charLimit = null }) {
  requireKey();
  const instruction = MODE_INSTRUCTION[mode] || MODE_INSTRUCTION.improve;
  const limitNote = charLimit ? ` The result MUST be at most ${charLimit} characters.` : '';
  const platformNote = platform ? ` It will be posted on ${platform}.` : '';
  const system = 'You are a sharp social media copywriter for a political campaign tool. '
    + 'Return ONLY the post text — no preamble, no quotes, no commentary, no options. '
    + 'Match the platform\'s conventions and keep a natural human voice.';
  const user = `${instruction}${platformNote}${limitNote}\n\n${mode === 'generate' ? 'Idea/topic' : 'Post'}:\n${draft}`;
  return { text: await callClaude({ system, user }) };
}

// Draft a reply to an inbox interaction (mention/reply/comment) in a chosen tone.
const REPLY_TONE = {
  friendly:    'warm, friendly and conversational',
  professional:'professional, measured and on-message',
  grateful:    'appreciative and gracious',
  deescalate:  'calm, empathetic and de-escalating — acknowledge the concern without being defensive',
};
export async function suggestReply({ text = '', authorHandle = '', platform = '', type = 'mention', tone = 'friendly', charLimit = null }) {
  requireKey();
  const toneNote = REPLY_TONE[tone] || REPLY_TONE.friendly;
  const limitNote = charLimit ? ` Keep it under ${charLimit} characters.` : '';
  const system = 'You are a community manager replying on behalf of a political campaign. '
    + `Write a single ${toneNote} reply to the message below. `
    + 'Return ONLY the reply text — no preamble, no quotes, no options, no hashtags unless natural. '
    + `Be specific and human; never sound like a bot.${limitNote}`;
  const platformNote = platform ? ` (on ${platform})` : '';
  const user = `Someone (${authorHandle || 'a user'}) sent this ${type}${platformNote}:\n"""${text || '(no text)'}"""\n\nWrite the reply.`;
  return { text: await callClaude({ system, user, maxTokens: 512 }) };
}
