import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';

export async function deleteWorkspace(id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id));
}