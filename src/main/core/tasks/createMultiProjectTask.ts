import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { err, ok, Result } from '@shared/result';
import type {
  CreateMultiProjectTaskParams,
  CreateTaskError,
  CreateTaskSuccess,
  TaskLifecycleStatus,
} from '@shared/tasks';
import { workspaceKey } from '@shared/workspace-key';
import { getProjectById } from '@main/core/projects/operations/getProjects';
import { projectManager } from '@main/core/projects/project-manager';
import { appSettingsService } from '@main/core/settings/settings-service';
import { getWorkspace } from '@main/core/workspaces/operations/getWorkspace';
import { db } from '@main/db/client';
import { taskProjects, tasks } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { mapTaskRowToTask } from './core';
import { toStoredBranch } from './stored-branch';

function mapProvisionError(message: string): CreateTaskError {
  return { type: 'provision-failed', message };
}

export async function createMultiProjectTask(
  params: CreateMultiProjectTaskParams
): Promise<Result<CreateTaskSuccess, CreateTaskError>> {
  const { projectBranchSources, taskBranch } = params;
  const initialStatus: TaskLifecycleStatus = 'in_progress';

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
  // Structure: {defaultWorktreeDir}/{workspaceName}/{taskName}/{projectName}
  const localProjectSettings = await appSettingsService.get('localProject');
  const defaultWorktreeDir = localProjectSettings.defaultWorktreeDirectory ?? '';
  const taskBaseDir = path.join(defaultWorktreeDir, workspaceName, params.name);

  // Create task record
  const [taskRow] = await db
    .insert(tasks)
    .values({
      id: params.id,
      projectId: projectBranchSources[0].projectId, // Keep for backward compatibility
      workspaceId: params.workspaceId,
      workDir: taskBaseDir, // Store task base directory for multi-project tasks
      name: params.name,
      taskBranch,
      status: initialStatus,
      sourceBranch: toStoredBranch({ type: 'local', branch: projectBranchSources[0].sourceBranch }),
      updatedAt: sql`CURRENT_TIMESTAMP`,
      statusChangedAt: sql`CURRENT_TIMESTAMP`,
      lastInteractedAt: sql`CURRENT_TIMESTAMP`,
    })
    .returning();

  const task = mapTaskRowToTask(taskRow, []);

  // Track worktree paths for each project
  const worktreePaths: Map<string, string> = new Map();

  // Create branches and worktrees for each project
  for (const source of projectBranchSources) {
    const project = projectManager.getProject(source.projectId);
    if (!project) continue;

    // Get project info for naming the worktree subdirectory
    const projectInfo = await getProjectById(source.projectId);
    const projectName = projectInfo?.name ?? source.projectId;

    // Create branch for this project
    const repoInfo = await project.repository.getRepositoryInfo();
    if (repoInfo.isUnborn) {
      return err({
        type: 'initial-commit-required',
        branch: source.sourceBranch,
      });
    }

    const createResult = await project.repository.createBranch(
      taskBranch,
      source.sourceBranch,
      false
    );
    if (!createResult.success) {
      return err({ type: 'branch-create-failed', branch: taskBranch, error: createResult.error });
    }

    // Create worktree directly at: {defaultWorktreeDir}/{workspaceName}/{taskName}/{projectName}/
    // No taskBranch subdirectory - all projects' worktrees are at the same level for easy context sharing
    const projectWorkDir = path.join(taskBaseDir, projectName);

    // Provision worktree for this project
    const provisionResult = await project.provisionTask(task, [], [], projectWorkDir);
    if (!provisionResult.success) {
      return err(mapProvisionError(provisionResult.error.type));
    }

    // Store the actual worktree path from the workspace registry
    const wsId = workspaceKey(taskBranch);
    const workspace = project.getWorkspace(wsId);
    worktreePaths.set(source.projectId, workspace?.path ?? projectWorkDir);
  }

  // Create task-project associations with worktree paths
  await db.insert(taskProjects).values(
    projectBranchSources.map((source) => ({
      taskId: params.id,
      projectId: source.projectId,
      worktreePath: worktreePaths.get(source.projectId) ?? null,
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

  return ok({ task });
}
