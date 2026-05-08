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
  const project = projectManager.getProject(task.projectId);
  if (!project) throw new Error(`Project not found: ${task.projectId}`);

  const existingTask = project.getTask(taskId);

  if (existingTask) {
    const wsId = workspaceKey(existingTask.taskBranch);
    return { path: project.getWorkspace(wsId)?.path ?? '', workspaceId: wsId };
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

  // For workspace tasks, look up the existing worktree path from task_projects table
  let workDir: string | undefined;
  let taskBaseDir: string | undefined;

  // Get all task-project associations for multi-project tasks
  const taskProjectRows = await db
    .select()
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId));

  if (task.workspaceId) {
    // Multi-project task: worktree paths are computed as {task.workDir}/{project.name}
    workDir = task.workDir;
    // For conversations, use the task base directory (parent of all worktrees)
    taskBaseDir = task.workDir;

    // Ensure workspaces are provisioned in ALL associated projects' providers
    const workspaceId = workspaceKey(task.taskBranch);
    for (const row of taskProjectRows) {
      const rowProject = projectManager.getProject(row.projectId);
      if (rowProject && task.workDir) {
        // Compute worktree path: {task.workDir}/{project.name}
        const [projectRow] = await db
          .select({ name: projects.name })
          .from(projects)
          .where(eq(projects.id, row.projectId))
          .limit(1);
        const worktreePath = path.join(task.workDir, projectRow?.name ?? row.projectId);
        await rowProject.ensureWorkspace(workspaceId, worktreePath);
      }
    }
  } else {
    // Single-project task: workDir will be resolved by the project provider
    workDir = undefined;
    taskBaseDir = undefined;
  }

  const result = await project.provisionTask(
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
    project_id: task.projectId,
    task_id: task.id,
    workspace_id: task.workspaceId,
  });

  const wsId = workspaceKey(task.taskBranch);
  return { path: project.getWorkspace(wsId)?.path ?? '', workspaceId: wsId };
}
