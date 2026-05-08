import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { terminals } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';

export async function deleteTerminal(taskId: string, terminalId: string): Promise<void> {
  await db.delete(terminals).where(eq(terminals.id, terminalId));

  const task = resolveTaskByTaskId(taskId);
  await task?.terminals.killTerminal(terminalId);

  capture('terminal_deleted', {
    task_id: taskId,
    terminal_id: terminalId,
  });
}
