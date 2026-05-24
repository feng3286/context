import { eq, sql } from 'drizzle-orm';
import type { CreateTerminalParams, Terminal } from '@shared/terminals';
import { db } from '@main/db/client';
import { taskProjects, terminals } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';
import { mapTerminalRowToTerminal } from './core';

export async function createTerminal(params: CreateTerminalParams): Promise<Terminal> {
  const { id: terminalId, initialSize = { cols: 80, rows: 24 } } = params;

  // Get projectId from task_projects for database insert
  const tpRow = await db
    .select({ projectId: taskProjects.projectId })
    .from(taskProjects)
    .where(eq(taskProjects.taskId, params.taskId))
    .limit(1);

  if (!tpRow || tpRow.length === 0) {
    throw new Error('Task has no associated projects');
  }

  const projectId = tpRow[0].projectId;

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
