// Question kinds, answer validation, and the contactLogged hook that stores
// answers given with a door knock or a call.
//
//   choice   one of the options            value: "Transit"
//   choices  one or more of the options    value: ["Transit", "Housing"]
//   yesno    yes or no                     value: true | false
//   scale    1 to 5                        value: 3
//   text     a short answer                value: "Wants a bike lane on 72 Ave"
//
// An answer is stored only if its question is in the caller's workspace and
// the value fits the question; anything else refuses the whole contact
// (400), so a screen never says "saved" for an answer that wasn't. Answers to
// a question that has since been removed, or a survey since turned off or
// archived, are still kept: the person really said it (a knock saved offline
// can arrive after the desk's edit). Choice labels taken off a question stay
// valid for the same reason (retired_options).
import { newId } from '../../lib/events.js';
import { httpError } from '../../actions/util.js';

export const KINDS = ['choice', 'choices', 'yesno', 'scale', 'text'];
export const CHOICE_KINDS = ['choice', 'choices'];
export const TEXT_MAX = 500;
export const OPTION_MAX = 200; // contact.log caps each picked choice at 200
export const OPTIONS_MAX = 20;
export const SCALE = [1, 2, 3, 4, 5];

export const parseJ = (v, d) => (typeof v === 'string' ? JSON.parse(v) : (v ?? d));
const labels = (v) => (Array.isArray(parseJ(v, [])) ? parseJ(v, []) : []);

// The value as it will be stored, or undefined when it doesn't fit.
export const checkValue = (q, value) => {
  const allowed = new Set([...labels(q.options), ...labels(q.retired_options)]);
  switch (q.kind) {
    case 'choice':
      return typeof value === 'string' && allowed.has(value) ? value : undefined;
    case 'choices':
      return Array.isArray(value) && value.length > 0 && new Set(value).size === value.length
        && value.every((v) => typeof v === 'string' && allowed.has(v)) ? value : undefined;
    case 'yesno':
      return typeof value === 'boolean' ? value : undefined;
    case 'scale':
      return Number.isInteger(value) && SCALE.includes(value) ? value : undefined;
    case 'text': {
      if (typeof value !== 'string') return undefined;
      const t = value.trim();
      return t && t.length <= TEXT_MAX ? t : undefined;
    }
    default:
      return undefined;
  }
};

// How an answer reads on a screen or in a CSV cell.
// Stored values come back from the database already parsed (jsonb); a text
// answer is a plain string, so it is never JSON.parse'd again.
export const showValue = (kind, v) => {
  if (kind === 'yesno') return v === true ? 'Yes' : v === false ? 'No' : '';
  if (Array.isArray(v)) return v.join(', ');
  return v == null ? '' : String(v);
};

// contactLogged hook (lib/hooks.js): runs inside contact.log's transaction.
export const storeAnswers = async (tx, ctx, { contact, input }, emit) => {
  const answers = Array.isArray(input?.answers) ? input.answers : [];
  if (!answers.length) return;
  const ids = answers.map((a) => a.question_id);
  if (new Set(ids).size !== ids.length) throw httpError(400, 'one answer per question');
  const rows = (await tx.query(
    `select id, survey_id, kind, text, options, retired_options from survey_questions
     where workspace_id = $1 and id in (select (jsonb_array_elements_text($2::jsonb))::uuid)`,
    [ctx.workspaceId, JSON.stringify(ids)],
  )).rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const checked = answers.map((a) => {
    const q = byId.get(a.question_id);
    if (!q) throw httpError(400, 'that question is not in this campaign');
    const value = checkValue(q, a.value);
    if (value === undefined) throw httpError(400, `that answer doesn't fit "${q.text}"`);
    return { q, value };
  });
  for (const { q, value } of checked) {
    const id = newId();
    await tx.query(
      `insert into survey_responses (id, workspace_id, survey_id, question_id, contact_id, person_id, value, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ctx.workspaceId, q.survey_id, q.id, contact.id, input.person_id, JSON.stringify(value), ctx.user?.id || null],
    );
    emit('survey_response', id, 'create', {
      id, contact_id: contact.id, person_id: input.person_id, survey_id: q.survey_id, question_id: q.id, value,
    });
  }
};
