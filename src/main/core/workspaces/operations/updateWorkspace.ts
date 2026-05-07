import { eq, sql } from 'drizzle-orm';
import type { UpdateWorkspaceParams, Workspace } from '@shared/workspaces';
import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function updateWorkspace(
  id: string,
  params: UpdateWorkspaceParams
): Promise<Workspace> {
  const [row] = await db
    .update(workspaces)
    .set({
      name: params.name,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(workspaces.id, id))
    .returning();

  return mapWorkspaceRowToWorkspace(row);
}
