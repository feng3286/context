import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { workspaceKey } from '@shared/workspace-key';
import { mapConversationRowToConversation } from '@main/core/conversations/utils';
import { projectManager } from '@main/core/projects/project-manager';
import { formatProvisionTaskError } from '@main/core/projects/provision-task-error';
import { mapTerminalRowToTerminal } from '@main/core/terminals/core';
import { db } from '@main/db/client';
import { conversations, projects, taskProjects, tasks, terminals } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { mapTaskRowToTask } from './core';

export async function provisionTask(taskId: string) {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!row) throw new Error(`Task not found: ${taskId}`);

  const task = mapTaskRowToTask(row);

  // Get associated projects to find a primary project for provisioning
  const taskProjectRows = await db
    .select()
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId));

  if (taskProjectRows.length === 0) {
    throw new Error(`Task has no associated projects: ${taskId}`);
  }

  const primaryProject = projectManager.getProject(taskProjectRows[0].projectId);
  if (!primaryProject) {
    throw new Error(`Project not found: ${taskProjectRows[0].projectId}`);
  }

  const existingTask = primaryProject.getTask(taskId);
  const wsId = workspaceKey(task.taskBranch);

  // Ensure workspaces are registered in ALL associated projects' providers
  for (const tpRow of taskProjectRows) {
    const rowProject = projectManager.getProject(tpRow.projectId);
    if (rowProject) {
      let worktreePath: string | undefined;

      if (task.workDir) {
        const [projectRow] = await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, tpRow.projectId))
          .limit(1);
        worktreePath = path.join(task.workDir, projectRow?.name ?? tpRow.projectId);
      } else if (task.taskBranch) {
        worktreePath = await rowProject.getWorktreeForBranch(task.taskBranch);
      }

      if (worktreePath) {
        await rowProject.ensureWorkspace(wsId, worktreePath);
      }
    }
  }

  if (existingTask) {
    // For multi-project tasks, return workDir as the base path
    if (task.workDir) {
      return { path: task.workDir, workspaceId: wsId };
    }
    return { path: primaryProject.getWorkspace(wsId)?.path ?? '', workspaceId: wsId };
  }

  const [existingTerminals, existingConversations] = await Promise.all([
    db
      .select()
      .from(terminals)
      .where(eq(terminals.taskId, taskId))
      .then((rows) => rows.map(mapTerminalRowToTerminal)),
    db
      .select()
      .from(conversations)
      .where(eq(conversations.taskId, taskId))
      .then((rows) => rows.map((r) => mapConversationRowToConversation(r, true))),
  ]);

  const workDir = task.workDir;
  const taskBaseDir = task.workDir;

  const result = await primaryProject.provisionTask(
    task,
    existingConversations,
    existingTerminals,
    workDir,
    taskBaseDir
  );
  if (!result.success) {
    throw new Error(`Failed to provision task: ${formatProvisionTaskError(result.error)}`);
  }

  await db
    .update(tasks)
    .set({ lastInteractedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(tasks.id, taskId));
  capture('task_provisioned', {
    project_id: taskProjectRows[0].projectId,
    task_id: task.id,
    workspace_id: task.workspaceId,
  });

  // For multi-project tasks, return workDir as the base path
  if (task.workDir) {
    return { path: task.workDir, workspaceId: wsId };
  }
  return { path: primaryProject.getWorkspace(wsId)?.path ?? '', workspaceId: wsId };
}
