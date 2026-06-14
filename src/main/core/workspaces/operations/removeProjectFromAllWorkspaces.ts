import { eq, inArray } from 'drizzle-orm';
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

  // Batch: get all tasks in these workspaces in a single query
  const wsTasks = await db
    .select({ id: tasks.id, workspaceId: tasks.workspaceId })
    .from(tasks)
    .where(inArray(tasks.workspaceId, workspaceIds));

  // Batch: get all task-project associations for this project
  const tpTasks = await db
    .select({ taskId: taskProjects.taskId })
    .from(taskProjects)
    .where(eq(taskProjects.projectId, projectId));

  // Build workspace -> task set map
  const wsTaskIdsByWs = new Map<string, Set<string>>();
  for (const t of wsTasks) {
    if (!wsTaskIdsByWs.has(t.workspaceId)) wsTaskIdsByWs.set(t.workspaceId, new Set());
    wsTaskIdsByWs.get(t.workspaceId)!.add(t.id);
  }

  const tpTaskIds = new Set(tpTasks.map((t) => t.taskId));

  let totalTaskCount = 0;

  // Count tasks that exist in both sets per workspace
  for (const wsId of workspaceIds) {
    const wsTaskIds = wsTaskIdsByWs.get(wsId) ?? new Set();
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
