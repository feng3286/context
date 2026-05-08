import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { Conversation, CreateConversationParams } from '@shared/conversations';
import { db } from '@main/db/client';
import { conversations, projects, taskProjects, tasks } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { projectManager } from '../projects/project-manager';
import { resolveTask } from '../projects/utils';
import { mapConversationRowToConversation } from './utils';

export async function createConversation(params: CreateConversationParams): Promise<Conversation> {
  const id = params.id ?? randomUUID();
  const [existingConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.taskId, params.taskId))
    .limit(1);

  const config =
    params.autoApprove === undefined
      ? undefined
      : JSON.stringify({ autoApprove: params.autoApprove });

  // Determine projectId for the conversation
  let projectId = params.projectId;
  if (!projectId) {
    // For multi-project tasks, get the first project from task_projects table
    const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, params.taskId)).limit(1);

    if (taskRow?.workspaceId) {
      // This is a workspace task - get the first associated project
      const [firstProject] = await db
        .select({ projectId: taskProjects.projectId })
        .from(taskProjects)
        .where(eq(taskProjects.taskId, params.taskId))
        .limit(1);
      projectId = firstProject?.projectId ?? taskRow.projectId;
    } else {
      // Legacy single-project task
      projectId = taskRow?.projectId;
    }
  }

  const [row] = await db
    .insert(conversations)
    .values({
      id,
      projectId: projectId ?? null,
      taskId: params.taskId,
      title: params.title,
      provider: params.provider,
      config,
      createdAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .returning();

  // Resolve task - for multi-project tasks, use the first project
  const task = projectId ? resolveTask(projectId, params.taskId) : null;
  if (!task && projectId) {
    throw new Error('Task not found');
  }

  const conversation = mapConversationRowToConversation(row);

  if (task) {
    await task.conversations.startSession(
      conversation,
      params.initialSize,
      false,
      params.initialPrompt
    );
  }

  capture('conversation_created', {
    provider: params.provider,
    is_first_in_task: existingConversation === undefined,
    project_id: projectId,
    task_id: params.taskId,
    conversation_id: id,
  });

  return mapConversationRowToConversation(row);
}
