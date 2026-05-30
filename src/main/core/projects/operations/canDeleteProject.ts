import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects, workspaceProjects } from '@main/db/schema';

/**
 * Check if a project can be safely deleted (no remaining associations).
 * Returns counts of workspace_projects and task_projects rows referencing this project.
 */
export async function canDeleteProject(
  projectId: string
): Promise<{ workspaceCount: number; taskCount: number }> {
  const wpRows = await db
    .select({ workspaceId: workspaceProjects.workspaceId })
    .from(workspaceProjects)
    .where(eq(workspaceProjects.projectId, projectId));

  const tpRows = await db
    .select({ taskId: taskProjects.taskId })
    .from(taskProjects)
    .where(eq(taskProjects.projectId, projectId));

  return {
    workspaceCount: wpRows.length,
    taskCount: tpRows.length,
  };
}
