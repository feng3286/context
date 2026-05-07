import { eq } from 'drizzle-orm';
import type { Workspace } from '@shared/workspaces';
import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!row) return null;
  return mapWorkspaceRowToWorkspace(row);
}
