import { eq, sql } from 'drizzle-orm';
import type { CreateTerminalParams, Terminal } from '@shared/terminals';
import { db } from '@main/db/client';
import { terminals, tasks } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';
import { mapTerminalRowToTerminal } from './core';

export async function createTerminal(params: CreateTerminalParams): Promise<Terminal> {
  const { id: terminalId, initialSize = { cols: 80, rows: 24 } } = params;

  // Get projectId from the task record for database insert
  const taskRow = await db
    .select({ projectId: tasks.projectId })
    .from(tasks)
    .where(eq(tasks.id, params.taskId))
    .limit(1);

  if (taskRow.length === 0) {
    throw new Error('Task not found');
  }

  const projectId = taskRow[0].projectId;

  const [row] = await db
    .insert(terminals)
    .values({
      id: terminalId,
      projectId: projectId,
      taskId: params.taskId,
      name: params.name,
      ssh: 0,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .returning();

  const task = resolveTaskByTaskId(params.taskId);
  if (!task) {
    throw new Error('Task not found');
  }

  await task.terminals.spawnTerminal(mapTerminalRowToTerminal(row), initialSize);
  capture('terminal_created', {
    terminal_id: terminalId,
    task_id: params.taskId,
  });

  return mapTerminalRowToTerminal(row);
}
