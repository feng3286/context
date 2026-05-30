import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects, tasks, workspaceProjects } from '@main/db/schema';

/**
 * Check if a project can be safely removed from ALL workspaces it belongs to.
 * Uses the same intersection logic as canRemoveProjectFromWorkspace.
 */
export async function canRemoveProjectFromAllWorkspaces(
  projectId: string
): Promise<{ workspaceCount: number; taskCount: number }> {
  // Get all workspaces this project belongs to
  const wpRows = await db
    .select({ workspaceId: workspaceProjects.workspaceId })
    .from(workspaceProjects)
    .where(eq(workspaceProjects.projectId, projectId));

  if (wpRows.length === 0) {
    return { workspaceCount: 0, taskCount: 0 };
  }

  const workspaceIds = wpRows.map((r) => r.workspaceId);

  let totalTaskCount = 0;
  for (const wsId of workspaceIds) {
    // Same logic as canRemoveProjectFromWorkspace
    const wsTasks = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(eq(tasks.workspaceId, wsId));

    const tpTasks = await db
      .select({ taskId: taskProjects.taskId })
      .from(taskProjects)
      .where(eq(taskProjects.projectId, projectId));

    const wsTaskIds = new Set(wsTasks.map((t) => t.id));
    const tpTaskIds = new Set(tpTasks.map((t) => t.taskId));

    for (const id of tpTaskIds) {
      if (wsTaskIds.has(id)) totalTaskCount++;
    }
  }

  return { workspaceCount: wpRows.length, taskCount: totalTaskCount };
}

/**
 * Remove a project from ALL workspaces it belongs to.
 */
export async function removeProjectFromAllWorkspaces(projectId: string): Promise<void> {
  await db.delete(workspaceProjects).where(eq(workspaceProjects.projectId, projectId));
}
