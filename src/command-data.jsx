// Mandate 2.0 — Command Center data
//
// All workspace lists, channel groups, message logs, thread snippets and
// slash-command lists are empty. Pages read live records from the DB via
// useLiveRecords; channels/messages now come from the conversation
// records the user actually has.

const CMD_WORKSPACES = [];
const CMD_GROUPS = [];
const CMD_MESSAGES = [];
const CMD_THREAD = [];
const CMD_MEMBERS_IN_ROOM = [];
const CMD_SLASH = [];

export { CMD_WORKSPACES, CMD_GROUPS, CMD_MESSAGES, CMD_THREAD, CMD_MEMBERS_IN_ROOM, CMD_SLASH };
