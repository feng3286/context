import { db } from '@main/db/client';
import { workspaces, workspaceProjects } from '@main/db/schema';
import type { CreateWorkspaceParams, Workspace } from '@shared/workspaces';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function createWorkspace(params: CreateWorkspaceParams): Promise<Workspace> {
  const [row] = await db
    .insert(workspaces)
    .values({
      id: params.id,
      name: params.name,
      workDir: params.workDir ?? null,
    })
    .returning();

  const workspace = mapWorkspaceRowToWorkspace(row);

  // Add projects if specified
  if (params.projectIds?.length) {
    await db.insert(workspaceProjects).values(
      params.projectIds.map((projectId) => ({
        workspaceId: params.id,
        projectId,
      }))
    );
  }

  return workspace;
}