// Helper to issue an in-app notification + realtime push.
import { randomBytes } from 'crypto';
import { db } from '../db/index.js';
import { notifications, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { broadcast } from './realtime.js';

const newId = () => 'n_' + randomBytes(12).toString('hex');

export async function notify({ userId, kind, title, body = null, link = null }) {
  const id = newId();
  await db.insert(notifications).values({ id, userId, kind, title, body, link });
  // Find the user's workspace to scope the realtime broadcast
  const u = (await db.select().from(users).where(eq(users.id, userId)).limit(1))[0];
  if (u) {
    broadcast(u.workspaceId, 'notification.new', { id, userId, kind, title, body, link });
  }
  return id;
}
