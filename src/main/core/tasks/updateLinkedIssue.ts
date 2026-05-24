import { eq } from 'drizzle-orm';
import { Issue } from '@shared/tasks';
import { db } from '@main/db/client';
import { taskProjects, tasks } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';

export async function updateLinkedIssue(taskId: string, issue?: Issue) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) return;

  await db
    .update(tasks)
    .set({
      linkedIssue: issue ? JSON.stringify(issue) : null,
    })
    .where(eq(tasks.id, taskId));

  if (issue) {
    // Get primary project for telemetry
    const [tpRow] = await db
      .select({ projectId: taskProjects.projectId })
      .from(taskProjects)
      .where(eq(taskProjects.taskId, taskId))
      .limit(1);

    capture('issue_linked_to_task', {
      provider: issue.provider,
      project_id: tpRow?.projectId ?? '',
      task_id: task.id,
    });
  }
}
