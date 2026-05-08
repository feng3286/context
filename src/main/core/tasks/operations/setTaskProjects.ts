import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects } from '@main/db/schema';

export type TaskProjectEntry = {
  projectId: string;
  worktreePath?: string;
};

export async function setTaskProjects(
  taskId: string,
  projects: string[] | TaskProjectEntry[]
): Promise<void> {
  // Delete existing associations
  await db.delete(taskProjects).where(eq(taskProjects.taskId, taskId));

  // Insert new associations
  if (projects.length > 0) {
    const values =
      typeof projects[0] === 'string'
        ? (projects as string[]).map((projectId) => ({ taskId, projectId }))
        : (projects as TaskProjectEntry[]).map((entry) => ({
            taskId,
            projectId: entry.projectId,
            worktreePath: entry.worktreePath ?? null,
          }));
    await db.insert(taskProjects).values(values);
  }
}
