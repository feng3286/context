import path from 'node:path';
import { eq } from 'drizzle-orm';
import type { ChatPendingSession } from '@shared/chat';
import { db } from '@main/db/client';
import { appSettings } from '@main/db/schema';

/**
 * Durable registry of chat sessions created in the UI that have no transcript
 * yet. Providers only write a transcript on the first message, so without this
 * a freshly created session would silently vanish on restart. Entries are
 * dropped when their transcript materializes or the session is deleted.
 */

const KEY = 'chats.pendingSessions';

export async function listPendingSessions(opts?: {
  cwdPrefix?: string;
}): Promise<ChatPendingSession[]> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).execute();
  let stubs: ChatPendingSession[] = [];
  if (row) {
    try {
      stubs = JSON.parse(row.value) as ChatPendingSession[];
    } catch {
      stubs = [];
    }
  }
  const prefix = opts?.cwdPrefix ? opts.cwdPrefix.toLowerCase() : null;
  if (!prefix) return stubs;
  return stubs.filter((s) => cwdMatches(s.cwd, prefix));
}

export async function addPendingSession(stub: ChatPendingSession): Promise<void> {
  const stubs = await listPendingSessions();
  if (stubs.some((s) => s.sessionId === stub.sessionId)) return;
  stubs.push(stub);
  await store(stubs);
}

export async function removePendingSessions(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const stubs = await listPendingSessions();
  const next = stubs.filter((s) => !ids.includes(s.sessionId));
  if (next.length === stubs.length) return;
  await store(next);
}

async function store(stubs: ChatPendingSession[]): Promise<void> {
  const serialized = JSON.stringify(stubs);
  await db
    .insert(appSettings)
    .values({ key: KEY, value: serialized })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: serialized } })
    .execute();
}

/** Same rule as the transcript index: the directory itself or any subdirectory. */
function cwdMatches(cwd: string, prefixLower: string): boolean {
  if (!cwd) return false;
  const lower = cwd.toLowerCase();
  return lower === prefixLower || lower.startsWith(prefixLower + path.sep.toLowerCase());
}
