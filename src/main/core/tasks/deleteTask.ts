import { and, eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { projectManager } from '@main/core/projects/project-manager';
import { viewStateService } from '@main/core/view-state/view-state-service';
import { db } from '@main/db/client';
import { projects, taskProjects, tasks } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { capture } from '@main/lib/telemetry';

/**
 * Remove a worktree directory directly using filesystem operations.
 * Used when the project is not available in projectManager.
 */
async function removeWorktreeDirectly(worktreePath: string): Promise<boolean> {
  try {
    // Check if path exists
    if (!fs.existsSync(worktreePath)) {
      log.info('deleteTask: worktree path does not exist', { worktreePath });
      return true;
    }

    // Remove the directory
    await fs.promises.rm(worktreePath, { recursive: true, force: true });
    log.info('deleteTask: removed worktree directly via filesystem', { worktreePath });
    return true;
  } catch (e) {
    log.warn('deleteTask: direct worktree removal failed', { worktreePath, error: String(e) });
    return false;
  }
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;
  const sourceBranch = task.sourceBranch ?? undefined;
  const workDir = task.workDir ?? undefined;

  // Get all task-project associations (for multi-project tasks)
  const taskProjectRows = await db
    .select()
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId));

  const project = projectManager.getProject(projectId);

  if (project) {
    const teardownResult = await project.teardownTask(taskId).catch((e) => {
      log.warn('deleteTask: teardown failed', { taskId, error: String(e) });
      return null;
    });

    if (teardownResult && !teardownResult.success) {
      log.warn('deleteTask: teardown failed', { taskId, error: teardownResult.error.message });
    }
  }

  await db.delete(tasks).where(eq(tasks.id, taskId));
  void viewStateService.del(`task:${taskId}`);
  capture('task_deleted', { project_id: projectId, task_id: taskId });

  // Remove worktrees using saved paths from database
  // This ensures we delete the correct worktree even if the user changed
  // the defaultWorktreeDirectory setting after the task was created

  // For multi-project tasks: use the task's workDir for worktree cleanup
  if (taskProjectRows.length > 0 && workDir) {
    // Use the task's workDir for worktree cleanup
    for (const row of taskProjectRows) {
      const rowProject = projectManager.getProject(row.projectId);
      if (rowProject) {
        try {
          await rowProject.removeWorktreeAtPath(workDir);
          log.info('deleteTask: removed worktree', {
            taskId,
            projectId: row.projectId,
            workDir,
          });
        } catch (e) {
          log.warn('deleteTask: worktree removal failed, trying direct removal', {
            taskId,
            projectId: row.projectId,
            workDir,
            error: String(e),
          });
          // Fallback: try direct filesystem removal
          await removeWorktreeDirectly(workDir);
        }
        // Only need to remove the worktree once
        break;
      }
    }

    // If no project found in projectManager, try direct removal
    const hasProjectManager = taskProjectRows.some(
      (row) => projectManager.getProject(row.projectId) !== null
    );
    if (!hasProjectManager) {
      log.info('deleteTask: no project in projectManager, using direct removal', {
        taskId,
        workDir,
      });
      await removeWorktreeDirectly(workDir);
    }

    // Delete branches for multi-project tasks
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
  // For single-project tasks: use workDir from tasks table or fallback to branch-based lookup
  else if (task.taskBranch && project) {
    // Prefer saved workDir if available
    if (workDir) {
      try {
        await project.removeWorktreeAtPath(workDir);
        log.info('deleteTask: removed worktree using saved path', {
          taskId,
          workDir,
        });
      } catch (e) {
        log.warn('deleteTask: worktree removal failed, trying direct removal', { taskId, workDir, error: String(e) });
        await removeWorktreeDirectly(workDir);
      }
    } else {
      // Fallback: check if other tasks share the same branch before removing
      const siblings = await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.projectId, task.projectId), eq(tasks.taskBranch, task.taskBranch)))
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
        .where(and(eq(tasks.projectId, task.projectId), eq(tasks.taskBranch, task.taskBranch)))
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
  } else if (workDir && !project) {
    // Single-project task but project not available - try direct removal
    await removeWorktreeDirectly(workDir);
  }
}
