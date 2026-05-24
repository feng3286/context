import { eq, sql } from 'drizzle-orm';
import { projectManager } from '@main/core/projects/project-manager';
import { db } from '@main/db/client';
import { taskProjects, tasks } from '@main/db/schema';
import { log } from '@main/lib/logger';
import { capture } from '@main/lib/telemetry';

export async function archiveTask(taskId: string): Promise<void> {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;

  // Get primary project from task_projects
  const [tpRow] = await db
    .select({ projectId: taskProjects.projectId })
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId))
    .limit(1);

  if (!tpRow) return;

  const project = projectManager.getProject(tpRow.projectId);

  await db
    .update(tasks)
    .set({
      status: 'archived',
      archivedAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      statusChangedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(tasks.id, taskId));
  capture('task_archived', { project_id: tpRow.projectId, task_id: taskId });

  if (!project) return;

  void project
    .teardownTask(taskId)
    .then((teardownResult) => {
      if (!teardownResult.success) {
        log.warn('archiveTask: teardown failed', { taskId, error: teardownResult.error.message });
      }
    })
    .catch((e) => {
      log.warn('archiveTask: teardown failed', { taskId, error: String(e) });
    });
}
