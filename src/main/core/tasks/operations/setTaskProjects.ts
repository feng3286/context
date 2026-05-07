import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects } from '@main/db/schema';

export async function setTaskProjects(taskId: string, projectIds: string[]): Promise<void> {
  // Delete existing associations
  await db.delete(taskProjects).where(eq(taskProjects.taskId, taskId));

  // Insert new associations
  if (projectIds.length > 0) {
    await db.insert(taskProjects).values(
      projectIds.map((projectId) => ({ taskId, projectId }))
    );
  }
}