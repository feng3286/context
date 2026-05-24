import { eq, sql } from 'drizzle-orm';
import { TaskLifecycleStatus } from '@shared/tasks';
import { db } from '@main/db/client';
import { taskProjects, tasks } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';

export async function updateTaskStatus(taskId: string, status: TaskLifecycleStatus): Promise<void> {
  const [row] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!row) throw new Error(`Task not found: ${taskId}`);
  if (row.status === status) return;

  await db
    .update(tasks)
    .set({
      status,
      updatedAt: sql`CURRENT_TIMESTAMP`,
      statusChangedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(tasks.id, taskId));

  // Get primary project for telemetry
  const [tpRow] = await db
    .select({ projectId: taskProjects.projectId })
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId))
    .limit(1);

  capture('task_status_changed', {
    from_status: row.status as TaskLifecycleStatus,
    to_status: status,
    project_id: tpRow?.projectId ?? '',
    task_id: row.id,
  });
}
