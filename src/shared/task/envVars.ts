export interface TaskEnvContext {
  taskId: string;
  taskName: string;
  taskPath: string;
  projectPath: string;
  defaultBranch?: string;
  portSeed?: string;
}

export function getTaskEnvVars(ctx: TaskEnvContext): Record<string, string> {
  const taskName = slugify(ctx.taskName) || 'task';
  const portSeed = ctx.portSeed || ctx.taskPath || ctx.taskId;
  return {
    CONTEXT_TASK_ID: ctx.taskId,
    CONTEXT_TASK_NAME: taskName,
    CONTEXT_TASK_PATH: ctx.taskPath,
    CONTEXT_ROOT_PATH: ctx.projectPath,
    CONTEXT_DEFAULT_BRANCH: ctx.defaultBranch || 'main',
    CONTEXT_PORT: String(getBasePort(portSeed)),
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function getBasePort(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return 50000 + (Math.abs(hash) % 1000) * 10;
}
