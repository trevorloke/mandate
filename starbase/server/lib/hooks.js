// Extension points the core calls and feature modules (server/ext/*) fill.
// Kept free of imports so any module can use it without import cycles.
//
//   events(tx, meta, events)        every runAction, just before its events
//                                   are chained — meta { workspaceId,
//                                   actorId, action }, events [{ entityType,
//                                   entityId, op, payload }]. A hook may emit
//                                   more events with meta.emit(...) and they
//                                   join the same transaction and chain.
//   contactLogged(tx, ctx, { contact, input, reply }, emit)
//                                   after contact.log stores a contact (or
//                                   finishes the visit's earlier one); input
//                                   carries any extras such as survey answers;
//                                   fields put on reply go back to the caller.
//   brief(db, ctx, brief)           GET /api/brief, just before it is sent:
//                                   a feature may correct the counts it owns
//                                   (texts sent through the app, say).
const registry = { events: [], contactLogged: [], brief: [] };

export const onHook = (name, fn) => {
  if (!registry[name]) throw new Error(`unknown hook ${name}`);
  registry[name].push(fn);
};

export const hasHook = (name) => (registry[name] || []).length > 0;

export const runHooks = async (name, ...args) => {
  for (const fn of registry[name] || []) await fn(...args);
};
