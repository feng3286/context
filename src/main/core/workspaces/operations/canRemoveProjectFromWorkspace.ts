import { and, eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects, tasks } from '@main/db/schema';

/**
 * Check if a project can be safely removed from a workspace.
 * Returns the count of tasks in this workspace that reference the project.
 */
export async function canRemoveProjectFromWorkspace(
  workspaceId: string,
  projectId: string
): Promise<{ taskCount: number }> {
  // Step 1: get all task IDs in this workspace
  const wsTasks = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId));

  // Step 2: get all task IDs that reference this project
  const tpTasks = await db
    .select({ taskId: taskProjects.taskId })
    .from(taskProjects)
    .where(eq(taskProjects.projectId, projectId));

  const wsTaskIds = new Set(wsTasks.map((t) => t.id));
  const tpTaskIds = new Set(tpTasks.map((t) => t.taskId));

  // Intersection
  let commonCount = 0;
  for (const id of tpTaskIds) {
    if (wsTaskIds.has(id)) commonCount++;
  }

  return { taskCount: commonCount };
}
