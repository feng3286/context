import { and, eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { workspaceProjects } from '@main/db/schema';

export async function removeProjectFromWorkspace(
  workspaceId: string,
  projectId: string
): Promise<void> {
  await db
    .delete(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.workspaceId, workspaceId),
        eq(workspaceProjects.projectId, projectId)
      )
    );
}