// In-process SSE broadcaster for realtime client updates.
// Each workspace has a Set of subscriber writers; emit() pushes to all of them.
// Hono uses a streaming Response — we keep it open and write `event:` blocks.

const subscribersByWorkspace = new Map();   // workspaceId -> Set<writer>

function add(workspaceId, writer) {
  let set = subscribersByWorkspace.get(workspaceId);
  if (!set) { set = new Set(); subscribersByWorkspace.set(workspaceId, set); }
  set.add(writer);
}
function remove(workspaceId, writer) {
  const set = subscribersByWorkspace.get(workspaceId);
  if (set) {
    set.delete(writer);
    if (set.size === 0) subscribersByWorkspace.delete(workspaceId);
  }
}

// Public: broadcast a JSON-serializable event to a workspace
export function broadcast(workspaceId, event, data) {
  const set = subscribersByWorkspace.get(workspaceId);
  if (!set) return;
  const block =
    `event: ${event}\n` +
    `data: ${JSON.stringify(data)}\n\n`;
  for (const writer of set) {
    try { writer.write(block); }
    catch { remove(workspaceId, writer); }
  }
}

// Connect a new SSE writer for a workspace. Returns a cleanup fn.
export function connect(workspaceId, writer) {
  add(workspaceId, writer);
  return () => remove(workspaceId, writer);
}

export function subscriberCount(workspaceId) {
  return subscribersByWorkspace.get(workspaceId)?.size || 0;
}
