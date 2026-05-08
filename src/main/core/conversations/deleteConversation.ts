import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';

export async function deleteConversation(taskId: string, conversationId: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, conversationId));

  const task = resolveTaskByTaskId(taskId);
  await task?.conversations.stopSession(conversationId);
  capture('conversation_deleted', {
    task_id: taskId,
    conversation_id: conversationId,
  });
}
