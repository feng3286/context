import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { err, ok, Result } from '@shared/result';
import type {
  CreateMultiProjectTaskParams,
  CreateTaskError,
  CreateTaskSuccess,
  CreateTaskWarning,
  Task,
  TaskLifecycleStatus,
} from '@shared/tasks';
import { getProjectById } from '@main/core/projects/operations/getProjects';
import { projectManager } from '@main/core/projects/project-manager';
import { appSettingsService } from '@main/core/settings/settings-service';
import { getWorkspace } from '@main/core/workspaces/operations/getWorkspace';
import { db } from '@main/db/client';
import { taskProjects, tasks } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { log } from '@main/lib/logger';
import { mapTaskRowToTask } from './core';
import { resolveTaskBranchName } from './resolveTaskBranchName';

function generateBranchSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function mapProvisionError(message: string): CreateTaskError {
  return { type: 'provision-failed', message };
}

/** Track a provisioned project so we can roll it back on failure. */
type ProvisionedProject = {
  projectId: string;
  branchName: string;
  worktreePath?: string;
};

async function rollbackProjects(provisioned: ProvisionedProject[]): Promise<void> {
  for (let i = provisioned.length - 1; i >= 0; i--) {
    const p = provisioned[i];
    // Remove worktree
    if (p.worktreePath) {
      try {
        const project = projectManager.getProject(p.projectId);
        if (project) {
          await project.removeWorktreeAtPath(p.worktreePath);
        }
      } catch (e) {
        log.warn('rollback: failed to remove worktree', {
          worktreePath: p.worktreePath,
          error: e,
        });
      }
    }
    // Delete branch (force to handle partially-merged branches)
    try {
      const project = projectManager.getProject(p.projectId);
      if (project) {
        await project.repository.deleteBranch(p.branchName, true);
      }
    } catch (e) {
      log.warn('rollback: failed to delete branch', {
        branch: p.branchName,
        error: e,
      });
    }
  }
}

export async function createMultiProjectTask(
  params: CreateMultiProjectTaskParams
): Promise<Result<CreateTaskSuccess, CreateTaskError>> {
  const { projectBranchSources, pushBranch } = params;
  const initialStatus: TaskLifecycleStatus = 'in_progress';
  let warning: CreateTaskWarning | undefined;

  // Generate suffix and get branchPrefix
  const suffix = generateBranchSuffix();
  const branchPrefix = (await appSettingsService.get('localProject')).branchPrefix ?? '';

  // Resolve the final task branch name with prefix and suffix
  const rawBranch = params.taskBranch.trim();
  const resolvedTaskBranch = resolveTaskBranchName({ rawBranch, branchPrefix, suffix });

  // Validate all projects exist
  for (const source of projectBranchSources) {
    const project = projectManager.getProject(source.projectId);
    if (!project) {
      return err({ type: 'project-not-found' });
    }
  }

  // Get workspace info for directory naming
  const workspace = await getWorkspace(params.workspaceId);
  const workspaceName = workspace?.name ?? 'workspace';

  // Determine the unified work directory for this task
  const localProjectSettings = await appSettingsService.get('localProject');
  const defaultWorktreeDir = localProjectSettings.defaultWorktreeDirectory ?? '';
  const taskBaseDir = path.join(defaultWorktreeDir, workspaceName, params.name);

  // Track provisioned projects for rollback on failure
  const provisioned: ProvisionedProject[] = [];

  // Build the task object (needed for provisionTask) without inserting to DB yet.
  // We use a temporary task-like object; the real DB insert happens
  // only after all git/worktree operations succeed.
  const now = new Date().toISOString();
  const temporaryTask: Task = {
    id: params.id,
    workspaceId: params.workspaceId,
    workDir: taskBaseDir,
    name: params.name,
    taskBranch: resolvedTaskBranch,
    status: initialStatus,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    isPinned: false,
    prs: [],
    conversations: {},
  };

  // Phase 1: Create branches and worktrees for each project (all async, outside DB transaction)
  try {
    for (const source of projectBranchSources) {
      const project = projectManager.getProject(source.projectId);
      if (!project) continue;

      const projectInfo = await getProjectById(source.projectId);
      const projectName = projectInfo?.name ?? source.projectId;

      // Check for unborn repo
      const repoInfo = await project.repository.getRepositoryInfo();
      if (repoInfo.isUnborn) {
        await rollbackProjects(provisioned);
        return err({
          type: 'initial-commit-required',
          branch: source.sourceBranch,
        });
      }

      // Create branch
      const createResult = await project.repository.createBranch(
        resolvedTaskBranch,
        source.sourceBranch,
        false
      );
      if (!createResult.success) {
        await rollbackProjects(provisioned);
        return err({
          type: 'branch-create-failed',
          branch: resolvedTaskBranch,
          error: createResult.error,
        });
      }

      provisioned.push({ projectId: source.projectId, branchName: resolvedTaskBranch });

      // Push branch to remote if requested (non-fatal: records warning instead of failing)
      if (pushBranch && !warning) {
        const [, configuredRemote] = await Promise.all([
          project.repository.getRemotes(),
          project.repository.getConfiguredRemote(),
        ]);
        const publishResult = await project.repository.publishBranch(
          resolvedTaskBranch,
          configuredRemote
        );
        if (!publishResult.success) {
          warning = {
            type: 'branch-publish-failed',
            branch: resolvedTaskBranch,
            remote: configuredRemote,
            error: publishResult.error,
          };
        }
      }

      // Create worktree
      const projectWorkDir = path.join(taskBaseDir, projectName);
      const provisionResult = await project.provisionTask(
        temporaryTask,
        [],
        [],
        projectWorkDir,
        taskBaseDir,
        projectBranchSources.length
      );
      if (!provisionResult.success) {
        await rollbackProjects(provisioned);
        return err(mapProvisionError(provisionResult.error.type));
      }

      // Record the worktree path for potential rollback
      const worktreePath = await project.getWorktreeForBranch(resolvedTaskBranch);
      provisioned[provisioned.length - 1].worktreePath = worktreePath;
    }
  } catch (error) {
    await rollbackProjects(provisioned);
    log.error('createMultiProjectTask: unexpected error during git/worktree setup', { error });
    return err({
      type: 'provision-failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // Phase 2: All git/worktree operations succeeded — insert into DB.
  // better-sqlite3 is single-threaded so no concurrent queries can interleave.
  // If the taskProjects insert fails, we clean up the orphan task row.
  let taskRow: typeof import('@main/db/schema').tasks.$inferSelect | undefined;
  let dbError: unknown;
  try {
    const rows = await db
      .insert(tasks)
      .values({
        id: params.id,
        workspaceId: params.workspaceId,
        workDir: taskBaseDir,
        name: params.name,
        taskBranch: resolvedTaskBranch,
        status: initialStatus,
        updatedAt: sql`CURRENT_TIMESTAMP`,
        statusChangedAt: sql`CURRENT_TIMESTAMP`,
        lastInteractedAt: sql`CURRENT_TIMESTAMP`,
      })
      .returning();

    taskRow = rows[0];
    if (!taskRow) {
      throw new Error('Task row not found after insert');
    }

    await db.insert(taskProjects).values(
      projectBranchSources.map((source) => ({
        taskId: params.id,
        projectId: source.projectId,
        sourceBranch: source.sourceBranch,
      }))
    );

    capture('task_created', {
      strategy: 'multi-project',
      has_initial_prompt: false,
      has_issue: 'none',
      provider: null,
      project_id: projectBranchSources[0].projectId,
      task_id: params.id,
      workspace_id: params.workspaceId,
      project_count: projectBranchSources.length,
    });
  } catch (e) {
    dbError = e;
  }

  if (dbError) {
    await rollbackProjects(provisioned);
    // Clean up orphaned task row if taskProjects insert failed after tasks insert
    try {
      await db.delete(tasks).where(eq(tasks.id, params.id));
    } catch {
      // Best-effort cleanup; if this fails too, the orphan row is acceptable damage
    }
    log.error('createMultiProjectTask: DB insert failed after git setup succeeded', {
      error: dbError,
    });
    return err({
      type: 'provision-failed',
      message: dbError instanceof Error ? dbError.message : String(dbError),
    });
  }

  const task = mapTaskRowToTask(taskRow!, []);
  return ok({ task, warning });
}