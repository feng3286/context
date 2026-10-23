import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { appSettings } from '@main/db/schema';

/**
 * Per-session metadata the app owns on top of the providers' transcripts:
 * display-title overrides (rename / branch labels). Keyed by session id —
 * transcripts themselves are never edited, so a deleted override simply
 * falls back to the provider-derived title on the next index scan.
 */

export interface ChatSessionOverride {
  /** Display title; empty/undefined = derive from the transcript. */
  title?: string;
  /** Set when this session was branched from another one. */
  forkedFrom?: string;
}

type SessionOverrides = Record<string, ChatSessionOverride>;

const KEY = 'chats.sessionOverrides';

export async function getSessionOverrides(): Promise<SessionOverrides> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).execute();
  if (!row) return {};
  try {
    return JSON.parse(row.value) as SessionOverrides;
  } catch {
    return {};
  }
}

async function store(overrides: SessionOverrides): Promise<void> {
  const value = JSON.stringify(overrides);
  await db
    .insert(appSettings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .execute();
}

export async function setSessionOverride(
  sessionId: string,
  override: ChatSessionOverride | null
): Promise<void> {
  const overrides = await getSessionOverrides();
  if (!override) {
    if (!overrides[sessionId]) return;
    delete overrides[sessionId];
  } else {
    overrides[sessionId] = { ...overrides[sessionId], ...override };
  }
  await store(overrides);
}
