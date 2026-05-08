import { createHash } from './utils';

export type Terminal = {
  id: string;
  taskId: string; // Only taskId binding - terminal belongs to task, not specific project
  ssh?: boolean;
  name: string;
};

export type CreateTerminalParams = {
  id: string;
  taskId: string; // Only taskId - terminal binds to task, not project
  name: string;
  initialSize?: { cols: number; rows: number };
};

export async function createScriptTerminalId({
  taskId,
  type,
  script,
}: {
  taskId: string;
  type: 'setup' | 'run' | 'teardown';
  script: string;
}) {
  const key = `${taskId}::${type}::${script}`;
  const hash = await createHash(key);
  return hash.slice(0, 32);
}
