import { db } from '@main/db/client';
import { workspaceProjects } from '@main/db/schema';

export async function addProjectToWorkspace(workspaceId: string, projectId: string): Promise<void> {
  await db.insert(workspaceProjects).values({
    workspaceId,
    projectId,
  });
}
