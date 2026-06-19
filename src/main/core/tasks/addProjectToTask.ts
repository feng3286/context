import path from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { err, ok, Result } from '@shared/result';
import type { Task, TaskLifecycleStatus } from '@shared/tasks';
import { projectManager } from '@main/core/projects/project-manager';
import { db } from '@main/db/client';
import { projects, taskProjects, tasks, workspaceProjects } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { generateAgentsMd } from './generateAgentsMd';

type AddProjectToTaskParams = {
  taskId: string;
  projectId: string;
  sourceBranch: string;
  pushBranch?: boolean;
};

type AddProjectError =
  | { type: 'task-not-found' }
  | { type: 'project-not-found' }
  | { type: 'already-bound' }
  | { type: 'workspace-mismatch' }
  | { type: 'branch-create-failed'; branch: string; error: string }
  | { type: 'provision-failed'; message: string }
  | { type: 'db-error'; message: string };

async function rollbackProject(
  projectId: string,
  branchName: string,
  worktreePath?: string
): Promise<void> {
  if (worktreePath) {
    try {
      const project = projectManager.getProject(projectId);
      if (project) {
        await project.removeWorktreeAtPath(worktreePath);
      }
    } catch (e) {
      log.warn('addProjectToTask rollback: failed to remove worktree', {
        worktreePath,
        error: e,
      });
    }
  }
  try {
    const project = projectManager.getProject(projectId);
    if (project) {
      await project.repository.deleteBranch(branchName, true);
    }
  } catch (e) {
    log.warn('addProjectToTask rollback: failed to delete branch', {
      branch: branchName,
      error: e,
    });
  }
}

export async function addProjectToTask(
  params: AddProjectToTaskParams
): Promise<Result<{ success: true }, AddProjectError>> {
  const { taskId, projectId, sourceBranch, pushBranch } = params;

  // 1. Validate task exists
  const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, taskId));
  if (!taskRow) return err({ type: 'task-not-found' });

  // 2. Validate project exists
  const [projectRow] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!projectRow) return err({ type: 'project-not-found' });

  // 3. Validate project belongs to the task's workspace (via workspaceProjects join table)
  const [wpRow] = await db
    .select()
    .from(workspaceProjects)
    .where(
      and(
        eq(workspaceProjects.workspaceId, taskRow.workspaceId),
        eq(workspaceProjects.projectId, projectId)
      )
    );
  if (!wpRow) return err({ type: 'workspace-mismatch' });

  // 4. Check if already bound
  const [existing] = await db
    .select()
    .from(taskProjects)
    .where(and(eq(taskProjects.taskId, taskId), eq(taskProjects.projectId, projectId)));
  if (existing) return err({ type: 'already-bound' });

  // For adding a project to an existing task, use the task's existing branch.
  // If the task has no branch (created without branch creation), we work directly from the source branch.
  const resolvedTaskBranch = taskRow.taskBranch ?? '';
  const hasTaskBranch = !!resolvedTaskBranch;

  const project = projectManager.getProject(projectId);
  if (!project) return err({ type: 'project-not-found' });

  const projectName = projectRow.name;

  // Phase 1: Create git branch (only if task has a branch)
  if (hasTaskBranch) {
    const repoInfo = await project.repository.getRepositoryInfo();
    if (repoInfo.isUnborn) {
      return err({
        type: 'branch-create-failed',
        branch: resolvedTaskBranch,
        error: 'Repository has no commits',
      });
    }

    const createResult = await project.repository.createBranch(
      resolvedTaskBranch,
      sourceBranch,
      false
    );
    if (!createResult.success) {
      const branchErr = createResult.error;
      const errorMsg =
        branchErr.type === 'already_exists'
          ? `Branch '${resolvedTaskBranch}' already exists`
          : branchErr.type === 'error'
            ? branchErr.message
            : branchErr.type === 'invalid_base'
              ? `Invalid base branch '${branchErr.from}'`
              : `Invalid branch name '${branchErr.name}'`;
      return err({
        type: 'branch-create-failed',
        branch: resolvedTaskBranch,
        error: errorMsg,
      });
    }
  }

  let worktreePath: string | undefined;
  try {
    // Optional push (only if task has a branch)
    if (hasTaskBranch && pushBranch) {
      const configuredRemote = await project.repository.getConfiguredRemote();
      const publishResult = await project.repository.publishBranch(
        resolvedTaskBranch,
        configuredRemote ?? ''
      );
      if (!publishResult.success) {
        log.warn('addProjectToTask: failed to publish branch', {
          branch: resolvedTaskBranch,
          error: publishResult.error,
        });
      }
    }

    // Phase 2: Provision worktree
    // When no taskBranch, use sourceBranch for provisioning
    const effectiveTaskBranch = hasTaskBranch ? resolvedTaskBranch : sourceBranch;
    const temporaryTask: Task = {
      id: taskId,
      workspaceId: taskRow.workspaceId,
      workDir: taskRow.workDir ?? undefined,
      name: taskRow.name,
      taskBranch: effectiveTaskBranch,
      status: taskRow.status as TaskLifecycleStatus,
      createdAt: taskRow.createdAt,
      updatedAt: taskRow.updatedAt,
      statusChangedAt: taskRow.statusChangedAt,
      isPinned: !!taskRow.isPinned,
      prs: [],
      conversations: {},
    };

    const taskBaseDir = taskRow.workDir!;
    const projectWorkDir = path.join(taskBaseDir, projectName);

    const provisionResult = await project.provisionTask(
      temporaryTask,
      [],
      [],
      projectWorkDir,
      taskBaseDir,
      2, // at least 2 projects now
      true // forceCreateWorktree: always create worktree at customWorkDir
    );
    if (!provisionResult.success) {
      if (hasTaskBranch) {
        await rollbackProject(projectId, resolvedTaskBranch);
      }
      const errMsg =
        ('message' in provisionResult.error ? provisionResult.error.message : undefined) ??
        provisionResult.error.type;
      return err({ type: 'provision-failed', message: errMsg });
    }

    worktreePath = await project.getWorktreeForBranch(effectiveTaskBranch);
  } catch (error) {
    // Rollback worktree + branch regardless of hasTaskBranch,
    // since worktree may have been created from sourceBranch
    await rollbackProject(
      projectId,
      hasTaskBranch ? resolvedTaskBranch : sourceBranch,
      worktreePath
    );
    return err({
      type: 'provision-failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Phase 3: DB insert
  try {
    await db.insert(taskProjects).values({
      taskId,
      projectId,
      sourceBranch,
    });

    // Update task's updatedAt
    await db
      .update(tasks)
      .set({ updatedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(tasks.id, taskId));

    // Generate AGENTS.md if this is now a multi-project task
    const projectCountRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(taskProjects)
      .where(eq(taskProjects.taskId, taskId));
    const projectCount = projectCountRows[0]?.count ?? 0;
    if (projectCount > 1 && taskRow.workDir) {
      const allProjectRows = await db
        .select({ projectId: taskProjects.projectId, sourceBranch: taskProjects.sourceBranch })
        .from(taskProjects)
        .where(eq(taskProjects.taskId, taskId));

      // Filter out null sourceBranch for generateAgentsMd
      const projectBranchSources = allProjectRows
        .filter((r): r is { projectId: string; sourceBranch: string } => r.sourceBranch !== null)
        .map((r) => ({ projectId: r.projectId, sourceBranch: r.sourceBranch }));

      await generateAgentsMd(taskRow.workDir, projectBranchSources).catch((e) => {
        log.warn('addProjectToTask: failed to generate AGENTS.md', { error: String(e) });
      });
    }
  } catch (e) {
    // Rollback worktree + branch regardless of hasTaskBranch,
    // since worktree was created from sourceBranch when no taskBranch
    await rollbackProject(
      projectId,
      hasTaskBranch ? resolvedTaskBranch : sourceBranch,
      worktreePath
    );
    log.error('addProjectToTask: DB insert failed', { error: e });
    return err({ type: 'db-error', message: e instanceof Error ? e.message : String(e) });
  }

  return ok({ success: true });
}
