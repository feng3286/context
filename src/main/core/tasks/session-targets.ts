import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { conversations, tasks, terminals } from '@main/db/schema';

export type TaskSessionLeafIds = {
  conversationIds: string[];
  terminalIds: string[];
};

export async function getTaskSessionLeafIds(taskId: string): Promise<TaskSessionLeafIds> {
  const [conversationRows, terminalRows] = await Promise.all([
    db.select({ id: conversations.id }).from(conversations).where(eq(conversations.taskId, taskId)),
    db.select({ id: terminals.id }).from(terminals).where(eq(terminals.taskId, taskId)),
  ]);

  return {
    conversationIds: conversationRows.map((row) => row.id),
    terminalIds: terminalRows.map((row) => row.id),
  };
}
