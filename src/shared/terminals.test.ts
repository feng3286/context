import { describe, expect, it } from 'vitest';
import { createScriptTerminalId } from './terminals';

describe('createScriptTerminalId', () => {
  it('is deterministic for the same task/type/script tuple', async () => {
    const first = await createScriptTerminalId({
      taskId: 'task-1',
      type: 'setup',
      script: 'pnpm install',
    });
    const second = await createScriptTerminalId({
      taskId: 'task-1',
      type: 'setup',
      script: 'pnpm install',
    });

    expect(first).toBe(second);
  });

  it('changes when task changes', async () => {
    const task1 = await createScriptTerminalId({
      taskId: 'task-1',
      type: 'run',
      script: 'pnpm dev',
    });
    const task2 = await createScriptTerminalId({
      taskId: 'task-2',
      type: 'run',
      script: 'pnpm dev',
    });

    expect(task1).not.toBe(task2);
  });

  it('changes when type changes', async () => {
    const setup = await createScriptTerminalId({
      taskId: 'task-1',
      type: 'setup',
      script: 'pnpm install',
    });
    const run = await createScriptTerminalId({
      taskId: 'task-1',
      type: 'run',
      script: 'pnpm install',
    });

    expect(setup).not.toBe(run);
  });

  it('changes when script changes', async () => {
    const install = await createScriptTerminalId({
      taskId: 'task-1',
      type: 'setup',
      script: 'pnpm install',
    });
    const build = await createScriptTerminalId({
      taskId: 'task-1',
      type: 'setup',
      script: 'pnpm build',
    });

    expect(install).not.toBe(build);
  });
});