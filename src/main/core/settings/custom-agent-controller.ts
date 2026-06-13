import { spawn } from 'node:child_process';
import { createRPCController } from '@shared/ipc/rpc';

export const customAgentController = createRPCController({
  checkCli: async (cli: string): Promise<boolean> => {
    return new Promise((resolve) => {
      const proc = spawn(cli, ['--version'], {
        stdio: ['ignore', 'ignore', 'ignore'],
        timeout: 5000,
      });
      proc.on('close', (code) => resolve(code === 0));
      proc.on('error', () => resolve(false));
    });
  },
});
