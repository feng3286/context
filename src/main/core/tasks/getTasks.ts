import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { Task } from '@shared/tasks';
import { db } from '@main/db/client';
import { conversations, taskProjects, tasks } from '@main/db/schema';
import { mapTaskRowToTask } from './core';

export async function getTasks(projectId?: string): Promise<Task[]> {
  // Query tasks associated with the project via task_projects junction table
  const rows = projectId
    ? await db
        .select({
          id: tasks.id,
          workspaceId: tasks.workspaceId,
          workDir: tasks.workDir,
          name: tasks.name,
          status: tasks.status,
          sourceBranch: tasks.sourceBranch,
          taskBranch: tasks.taskBranch,
          linkedIssue: tasks.linkedIssue,
          archivedAt: tasks.archivedAt,
          createdAt: tasks.createdAt,
          updatedAt: tasks.updatedAt,
          lastInteractedAt: tasks.lastInteractedAt,
          statusChangedAt: tasks.statusChangedAt,
          isPinned: tasks.isPinned,
        })
        .from(tasks)
        .innerJoin(taskProjects, eq(taskProjects.taskId, tasks.id))
        .where(eq(taskProjects.projectId, projectId))
        .orderBy(desc(tasks.updatedAt))
    : await db.select().from(tasks).orderBy(desc(tasks.updatedAt));

  if (rows.length === 0) return [];

  const taskIds = rows.map((r) => r.id);

  const convRows = await db
    .select({
      taskId: conversations.taskId,
      provider: conversations.provider,
      count: count(),
    })
    .from(conversations)
    .where(inArray(conversations.taskId, taskIds))
    .groupBy(conversations.taskId, conversations.provider);

  const convByTask = new Map<string, Record<string, number>>();
  for (const { taskId, provider, count: c } of convRows) {
    const rec = convByTask.get(taskId) ?? {};
    rec[provider ?? 'unknown'] = c;
    convByTask.set(taskId, rec);
  }

  return rows.map((row) => ({
    ...mapTaskRowToTask(row),
    prs: [],
    conversations: convByTask.get(row.id) ?? {},
  }));
}

export async function getTasksByWorkspace(workspaceId: string): Promise<Task[]> {
  const rows = await db
    .select()
    .from(tasks)
    .where(eq(tasks.workspaceId, workspaceId))
    .orderBy(desc(tasks.updatedAt));

  if (rows.length === 0) return [];

  const taskIds = rows.map((r) => r.id);

  const convRows = await db
    .select({
      taskId: conversations.taskId,
      provider: conversations.provider,
      count: count(),
    })
    .from(conversations)
    .where(inArray(conversations.taskId, taskIds))
    .groupBy(conversations.taskId, conversations.provider);

  const convByTask = new Map<string, Record<string, number>>();
  for (const { taskId, provider, count: c } of convRows) {
    const rec = convByTask.get(taskId) ?? {};
    rec[provider ?? 'unknown'] = c;
    convByTask.set(taskId, rec);
  }

  return rows.map((row) => ({
    ...mapTaskRowToTask(row),
    prs: [],
    conversations: convByTask.get(row.id) ?? {},
  }));
}
