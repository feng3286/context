import fs from 'node:fs';
import path from 'node:path';
import { and, eq } from 'drizzle-orm';
import { taskDeletedChannel } from '@shared/events/taskEvents';
import { projectManager } from '@main/core/projects/project-manager';
import { viewStateService } from '@main/core/view-state/view-state-service';
import { db } from '@main/db/client';
import { projects, taskProjects, tasks } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { capture } from '@main/lib/telemetry';

/**
 * Remove a worktree directory directly using filesystem operations.
 * Used when the project is not available in projectManager.
 */
async function removeWorktreeDirectly(worktreePath: string): Promise<boolean> {
  try {
    if (!fs.existsSync(worktreePath)) {
      log.info('deleteTask: worktree path does not exist', { worktreePath });
      return true;
    }

    await fs.promises.rm(worktreePath, { recursive: true, force: true });
    log.info('deleteTask: removed worktree directly via filesystem', { worktreePath });
    return true;
  } catch (e) {
    log.warn('deleteTask: direct worktree removal failed', { worktreePath, error: String(e) });
    return false;
  }
}

export async function deleteTask(taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;
  const sourceBranch = task.sourceBranch ?? undefined;
  const workDir = task.workDir ?? undefined;

  // Get all task-project associations
  const taskProjectRows = await db
    .select()
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId));

  const primaryProjectId = taskProjectRows.length > 0 ? taskProjectRows[0].projectId : null;

  // Tear down task in ALL associated project providers (skip if no project associations)
  if (taskProjectRows.length > 0) {
    for (const row of taskProjectRows) {
      const rowProject = projectManager.getProject(row.projectId);
      if (rowProject) {
        const teardownResult = await rowProject.teardownTask(taskId).catch((e) => {
          log.warn('deleteTask: teardown failed for project', {
            taskId,
            projectId: row.projectId,
            error: String(e),
          });
          return null;
        });
        if (teardownResult && !teardownResult.success) {
          log.warn('deleteTask: teardown failed for project', {
            taskId,
            projectId: row.projectId,
            error: teardownResult.error.message,
          });
        }
      }
    }
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));
  void viewStateService.del(`task:${taskId}`);
  events.emit(taskDeletedChannel, { taskId, workspaceId: task.workspaceId });
  if (primaryProjectId) {
    capture('task_deleted', { project_id: primaryProjectId, task_id: taskId });
  }

  // Clean up worktrees (only if there are project associations)
  if (taskProjectRows.length > 0 && task.workDir) {
    // Remove worktrees under task.workDir/{project.name} for each associated project
    for (const row of taskProjectRows) {
      const rowProject = projectManager.getProject(row.projectId);
      const [projectRow] = await db
        .select({ name: projects.name })
        .from(projects)
        .where(eq(projects.id, row.projectId))
        .limit(1);
      const worktreePath = path.join(task.workDir, projectRow?.name ?? row.projectId);
      if (rowProject) {
        try {
          await rowProject.removeWorktreeAtPath(worktreePath);
          log.info('deleteTask: removed worktree', {
            taskId,
            projectId: row.projectId,
            worktreePath,
          });
        } catch (e) {
          log.warn('deleteTask: worktree removal failed, trying direct removal', {
            taskId,
            projectId: row.projectId,
            worktreePath,
            error: String(e),
          });
          await removeWorktreeDirectly(worktreePath);
        }
      } else {
        log.info('deleteTask: project not in projectManager, using direct removal', {
          taskId,
          projectId: row.projectId,
          worktreePath,
        });
        await removeWorktreeDirectly(worktreePath);
      }
    }

    // Remove the parent task directory itself
    try {
      await fs.promises.rm(task.workDir, { recursive: true, force: true });
      log.info('deleteTask: removed task root directory', { taskWorkDir: task.workDir });
    } catch (e) {
      log.warn('deleteTask: failed to remove task root directory', {
        taskWorkDir: task.workDir,
        error: String(e),
      });
    }

    // Delete branches for each associated project
    if (task.taskBranch) {
      for (const row of taskProjectRows) {
        const rowProject = projectManager.getProject(row.projectId);
        if (rowProject && sourceBranch && task.taskBranch !== sourceBranch.branch) {
          try {
            const branchDelete = await rowProject.repository.deleteBranch(task.taskBranch);
            if (branchDelete && !branchDelete.success) {
              log.warn('deleteTask: branch deletion failed', {
                taskId,
                projectId: row.projectId,
                error: branchDelete.error,
              });
            }
          } catch (e) {
            log.warn('deleteTask: branch deletion failed', {
              taskId,
              projectId: row.projectId,
              error: String(e),
            });
          }
        }
      }
    }
  }
  // No workDir - use branch-based lookup with primary project
  else if (task.taskBranch && primaryProjectId) {
    const project = projectManager.getProject(primaryProjectId);
    if (project) {
      // Prefer saved workDir if available
      if (workDir) {
        try {
          await project.removeWorktreeAtPath(workDir);
          log.info('deleteTask: removed worktree using saved path', {
            taskId,
            workDir,
          });
        } catch (e) {
          log.warn('deleteTask: worktree removal failed, trying direct removal', {
            taskId,
            workDir,
            error: String(e),
          });
          await removeWorktreeDirectly(workDir);
        }
      } else {
        // Fallback: check if other tasks share the same branch before removing
        const siblings = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(eq(tasks.workspaceId, task.workspaceId), eq(tasks.taskBranch, task.taskBranch))
          )
          .limit(1);

        if (siblings.length === 0) {
          await project.removeTaskWorktree(task.taskBranch).catch((e) => {
            log.warn('deleteTask: worktree removal failed', { taskId, error: String(e) });
          });
        }
      }

      // Delete branch if no other tasks use it
      if (sourceBranch && task.taskBranch !== sourceBranch.branch) {
        const siblings = await db
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(eq(tasks.workspaceId, task.workspaceId), eq(tasks.taskBranch, task.taskBranch))
          )
          .limit(1);

        if (siblings.length === 0) {
          const branchDelete = await project.repository.deleteBranch(task.taskBranch).catch((e) => {
            log.warn('deleteTask: branch deletion failed', { taskId, error: String(e) });
            return null;
          });
          if (branchDelete && !branchDelete.success) {
            log.warn('deleteTask: branch deletion failed', { taskId, error: branchDelete.error });
          }
        }
      }
    }
  } else if (workDir) {
    // Project not available - try direct removal
    await removeWorktreeDirectly(workDir);
  }
}
