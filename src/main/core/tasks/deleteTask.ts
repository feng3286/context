import fs from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { taskDeletedChannel } from '@shared/events/taskEvents';
import { disposeCatFileBatchesUnder } from '@main/core/git/impl/cat-file-batch';
import { projectManager } from '@main/core/projects/project-manager';
import { viewStateService } from '@main/core/view-state/view-state-service';
import { db } from '@main/db/client';
import { projects, taskProjects, tasks } from '@main/db/schema';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { capture } from '@main/lib/telemetry';
import { moveToTrash } from './deferred-cleanup';

/**
 * Remove a path with retries to tolerate transient Windows file locks
 * (open PTY sessions / file watchers holding handles). Treats a missing path
 * as success. Returns true if the path is gone afterwards.
 */
async function rmWithRetries(
  target: string,
  { label, maxAttempts = 3 }: { label: string; maxAttempts?: number }
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (!fs.existsSync(target)) return true;
      await fs.promises.rm(target, { recursive: true, force: true });
      return true;
    } catch (e) {
      log.warn('deleteTask: removal attempt failed', {
        label,
        target,
        attempt,
        error: String(e),
      });
      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
  }
  return false;
}

/**
 * Remove a worktree directory directly using filesystem operations.
 * Used when the project is not available in projectManager.
 */
async function removeWorktreeDirectly(worktreePath: string): Promise<boolean> {
  // See removeWorktree(): our git helpers pin the directory as their CWD.
  // This path skips the provider, so dispose here as well.
  disposeCatFileBatchesUnder(worktreePath);
  const ok = await rmWithRetries(worktreePath, { label: 'worktree' });
  if (ok) {
    log.info('deleteTask: removed worktree directly via filesystem', { worktreePath });
  } else {
    log.warn('deleteTask: direct worktree removal failed after retries', { worktreePath });
  }
  return ok;
}

export async function deleteTask(taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;

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
    const taskWorkDir = task.workDir;

    // Kill our persistent git helpers (cat-file --batch) spawned with their
    // CWD inside this task's worktrees: on Windows a process CWD blocks both
    // rmdir and rename-to-trash of the directory, so without this the app
    // deadlocks its own deletion and leaves an orphan dir behind.
    const disposedHelpers = disposeCatFileBatchesUnder(taskWorkDir);
    if (disposedHelpers.length > 0) {
      log.info('deleteTask: disposed git helpers pinning task workdir', {
        taskWorkDir,
        helpers: disposedHelpers,
      });
    }

    // Batch fetch all project names in a single query
    const projectIds = taskProjectRows.map((r) => r.projectId);
    const projectRows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(inArray(projects.id, projectIds));
    const nameById = new Map(projectRows.map((r) => [r.id, r.name]));
    const worktreePaths = taskProjectRows.map((row) => ({
      projectId: row.projectId,
      worktreePath: path.join(taskWorkDir, nameById.get(row.projectId) ?? row.projectId),
    }));

    // Remove worktrees under task.workDir/{project.name} for each associated project
    for (const { projectId, worktreePath } of worktreePaths) {
      const rowProject = projectManager.getProject(projectId);
      if (rowProject) {
        try {
          await rowProject.removeWorktreeAtPath(worktreePath);
          log.info('deleteTask: removed worktree', {
            taskId,
            projectId,
            worktreePath,
          });
        } catch (e) {
          log.warn('deleteTask: worktree removal failed, trying direct removal', {
            taskId,
            projectId,
            worktreePath,
            error: String(e),
          });
          await removeWorktreeDirectly(worktreePath);
        }
      } else {
        log.info('deleteTask: project not in projectManager, using direct removal', {
          taskId,
          projectId,
          worktreePath,
        });
        await removeWorktreeDirectly(worktreePath);
      }
    }

    // Remove the parent task directory itself. Retries tolerate transient
    // Windows file locks; if a file is still busy (typically a process that
    // survived teardown — e.g. an electron dev server started in the task
    // terminal holds node_modules/electron/.../default_app.asar open), defer via
    // moveToTrash so the task path clears now and the next app launch sweeps it.
    let rootRemoved = await rmWithRetries(taskWorkDir, {
      label: 'task root directory',
      maxAttempts: 5,
    });
    if (!rootRemoved) {
      const trashed = await moveToTrash(taskWorkDir);
      if (trashed) {
        rootRemoved = true;
        log.info('deleteTask: deferred task root deletion (busy file), moved to trash', {
          taskWorkDir,
          trashPath: trashed,
        });
        // A failed per-project removal above may have skipped its internal
        // `git worktree prune` (the rm threw first), leaving a registration
        // that points at the now-trashed path and would block branch deletion
        // below. Retrying on the moved path is cheap: the rm is a no-op on a
        // missing directory and the prune clears the stale reference.
        for (const { projectId, worktreePath } of worktreePaths) {
          const project = projectManager.getProject(projectId);
          if (!project) continue;
          await project.removeWorktreeAtPath(worktreePath).catch(() => {});
        }
      }
    }
    if (rootRemoved) {
      log.info('deleteTask: removed task root directory', { taskWorkDir });
    } else {
      log.warn('deleteTask: failed to remove task root directory after retries', {
        taskWorkDir,
      });
    }

    // Delete branches for each associated project (only if taskBranch != sourceBranch)
    if (task.taskBranch) {
      for (const row of taskProjectRows) {
        const rowProject = projectManager.getProject(row.projectId);
        // Don't delete branch if it's the same as the source branch for this project
        if (rowProject && row.sourceBranch && task.taskBranch !== row.sourceBranch) {
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
}
