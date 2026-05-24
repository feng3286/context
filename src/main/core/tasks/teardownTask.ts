import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects, tasks } from '@main/db/schema';
import { projectManager } from '../projects/project-manager';

export async function teardownTask(taskId: string) {
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) throw new Error(`Task not found: ${taskId}`);

  // Get primary project from task_projects
  const [tpRow] = await db
    .select({ projectId: taskProjects.projectId })
    .from(taskProjects)
    .where(eq(taskProjects.taskId, taskId))
    .limit(1);

  if (!tpRow) throw new Error(`Task has no associated projects: ${taskId}`);

  const project = projectManager.getProject(tpRow.projectId);
  if (!project) throw new Error(`Project not found: ${tpRow.projectId}`);
  return await project.teardownTask(taskId);
}
