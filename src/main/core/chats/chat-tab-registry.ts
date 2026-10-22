import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { appSettings } from '@main/db/schema';

/**
 * Which agent chat tabs are open per task. Chat tabs are pure UI state (one
 * per agent); only the provider ids are persisted, ids regenerate on load.
 */

const KEY = 'chats.chatTabs';

export async function getChatTabs(): Promise<Record<string, string[]>> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, KEY)).execute();
  if (!row) return {};
  try {
    return JSON.parse(row.value) as Record<string, string[]>;
  } catch {
    return {};
  }
}

export async function setChatTabs(map: Record<string, string[]>): Promise<void> {
  const serialized = JSON.stringify(map);
  await db
    .insert(appSettings)
    .values({ key: KEY, value: serialized })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: serialized } })
    .execute();
}
