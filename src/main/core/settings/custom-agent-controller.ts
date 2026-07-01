import { spawn } from 'node:child_process';
import { createRPCController } from '@shared/ipc/rpc';

export const customAgentController = createRPCController({
  checkCli: async (cli: string): Promise<boolean> => {
    return new Promise((resolve) => {
      // On Windows, many CLI binaries are .cmd/.bat wrappers that require shell
      // execution. Using shell: true ensures these can be found and executed.
      const proc = spawn(cli, ['--version'], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 5000,
        shell: process.platform === 'win32',
      });
      let stdout = '';
      let stderr = '';
      proc.stdout?.on('data', (d: Buffer) => {
        stdout += d.toString();
      });
      proc.stderr?.on('data', (d: Buffer) => {
        stderr += d.toString();
      });
      proc.on('close', (code) => {
        const hasOutput = stdout.trim() || stderr.trim();
        resolve(code === 0 && !!hasOutput);
      });
      proc.on('error', () => resolve(false));
    });
  },
});
