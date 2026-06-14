import { execSync, type ExecSyncOptions } from 'node:child_process';

export interface ExecOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Print the command before running it */
  echo?: boolean;
}

export function exec(cmd: string, opts?: ExecOptions): string {
  if (opts?.echo) {
    console.log(`$ ${cmd}`);
  }
  const execOpts: ExecSyncOptions = {
    encoding: 'utf-8',
    // Use pipe for all streams so we capture stdout and stderr together
    stdio: ['pipe', 'pipe', 'pipe'],
    ...(opts?.cwd && { cwd: opts.cwd }),
    ...(opts?.env && { env: { ...process.env, ...opts.env } }),
  };
  try {
    return (execSync(cmd, execOpts) as string).trim();
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    const stdout = typeof e.stdout === 'string' ? e.stdout.trim() : '';
    const stderr = typeof e.stderr === 'string' ? e.stderr.trim() : '';
    const output = [stdout, stderr].filter(Boolean).join('\n');
    throw new Error(`Command failed (exit ${e.status ?? '?'}): ${cmd}\n${output}`);
  }
}

export function execOrNull(cmd: string, opts?: ExecOptions): string | null {
  try {
    return exec(cmd, opts);
  } catch {
    return null;
  }
}
