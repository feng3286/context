import path from 'node:path';
import { eq, inArray, sql } from 'drizzle-orm';
import type { BranchMismatchInfo } from '@shared/tasks';
import { mapConversationRowToConversation } from '@main/core/conversations/utils';
import { projectManager } from '@main/core/projects/project-manager';
import { formatProvisionTaskError } from '@main/core/projects/provision-task-error';
import { mapTerminalRowToTerminal } from '@main/core/terminals/core';
import { db } from '@main/db/client';
import { conversations, projects, taskProjects, tasks, terminals } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { mapTaskRowToTask } from './core';

export interface OpenTaskResult {
  path: string;
  workspaceId: string;
  branchMismatches: BranchMismatchInfo[];
}

export async function openTask(taskId: string): Promise<OpenTaskResult> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!row) throw new Error(`Task not found: ${taskId}`);

  const task = mapTaskRowToTask(row);
  if (!task.workDir) throw new Error(`Task has no workDir: ${taskId}`);

  const taskProjectRows = await db
    .select()
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId));

  if (taskProjectRows.length === 0) {
    throw new Error(`Task has no associated projects: ${taskId}`);
  }

  // Batch fetch all project names in a single query
  const projectIds = taskProjectRows.map((r) => r.projectId);
  const projectRows = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(inArray(projects.id, projectIds));
  const nameById = new Map(projectRows.map((r) => [r.id, r.name]));

  const wsId = task.id;
  const branchMismatches: BranchMismatchInfo[] = [];

  // Validate worktree branch for ALL associated projects
  for (const tpRow of taskProjectRows) {
    const rowProject = projectManager.getProject(tpRow.projectId);
    if (!rowProject) continue;

    const projectName = nameById.get(tpRow.projectId) ?? tpRow.projectId;
    const worktreePath = path.join(task.workDir!, projectName);

    const result = await rowProject.validateWorktreeBranch(
      task,
      worktreePath,
      tpRow.projectId
    );

    if (result.mismatch) {
      branchMismatches.push({
        projectId: tpRow.projectId,
        projectName,
        expectedBranch: result.mismatch.expected,
        actualBranch: result.mismatch.actual,
      });
    }

    await rowProject.ensureWorkspace(wsId, worktreePath);
  }

  // Check if already provisioned in memory
  const primaryProject = projectManager.getProject(taskProjectRows[0].projectId);
  if (!primaryProject) {
    throw new Error(`Project not found: ${taskProjectRows[0].projectId}`);
  }

  const existingTask = primaryProject.getTask(taskId);
  if (existingTask) {
    return { path: task.workDir, workspaceId: wsId, branchMismatches };
  }

  // Hydrate existing terminals and conversations from DB
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

  // Compute the correct worktree path for the primary project
  const primaryProjectName =
    nameById.get(taskProjectRows[0].projectId) ?? taskProjectRows[0].projectId;
  const primaryWorktreePath = path.join(task.workDir!, primaryProjectName);

  // Open the task on the primary project (no worktree creation/deletion)
  const result = await primaryProject.openTask(
    task,
    existingConversations,
    existingTerminals,
    primaryWorktreePath
  );
  if (!result.success) {
    throw new Error(`Failed to open task: ${formatProvisionTaskError(result.error)}`);
  }

  await db
    .update(tasks)
    .set({ lastInteractedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(tasks.id, taskId));
  capture('task_provisioned', {
    project_id: taskProjectRows[0].projectId,
    task_id: task.id,
    workspace_id: task.workspaceId,
    branch_mismatch_count: branchMismatches.length,
  });

  return { path: task.workDir, workspaceId: wsId, branchMismatches };
}
