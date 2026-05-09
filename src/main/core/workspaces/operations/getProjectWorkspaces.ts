import { eq } from 'drizzle-orm';
import type { Workspace } from '@shared/workspaces';
import { db } from '@main/db/client';
import { workspaceProjects, workspaces } from '@main/db/schema';

export async function getProjectWorkspaces(projectId: string): Promise<Workspace[]> {
  const rows = await db
    .select({ workspace: workspaces })
    .from(workspaceProjects)
    .innerJoin(workspaces, eq(workspaceProjects.workspaceId, workspaces.id))
    .where(eq(workspaceProjects.projectId, projectId));

  return rows.map((row) => ({
    id: row.workspace.id,
    name: row.workspace.name,
    createdAt: row.workspace.createdAt,
    updatedAt: row.workspace.updatedAt,
  }));
}
