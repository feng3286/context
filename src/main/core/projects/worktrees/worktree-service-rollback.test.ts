import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '@shared/result';
import { LocalFileSystem } from '@main/core/fs/impl/local-fs';
import type { ProjectSettingsProvider } from '@main/core/projects/settings/schema';
import { WorktreeService } from '@main/core/projects/worktrees/worktree-service';
import { getLocalExec, type ExecFn } from '@main/core/utils/exec';

// ─── Real worktree service tests with actual git ─────────────────────────────

async function initRepo(dir: string, exec: ExecFn): Promise<void> {
  await exec('git', ['init'], { cwd: dir });
  await exec('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: dir });
  await exec('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  await exec('git', ['config', 'user.name', 'Test'], { cwd: dir });
  await exec('git', ['commit', '--allow-empty', '-m', 'init'], { cwd: dir });
}

function makeSettings(preservePatterns: string[] = []): ProjectSettingsProvider {
  return {
    get: async () => ({ preservePatterns }),
    update: async () => ok(),
    ensure: async () => {},
    getWorktreeDirectory: async () => '',
    getDefaultBranch: async () => 'main',
    getRemote: async () => 'origin',
  } as unknown as ProjectSettingsProvider;
}

describe('WorktreeService rollback behavior', () => {
  let repoDir: string;
  let poolDir: string;
  let exec: ExecFn;

  beforeEach(async () => {
    repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-repo-'));
    poolDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-pool-'));
    exec = getLocalExec();
    await initRepo(repoDir, exec);
  });

  afterEach(() => {
    fs.rmSync(repoDir, { recursive: true, force: true });
    fs.rmSync(poolDir, { recursive: true, force: true });
  });

  function makeService(
    overrides: Partial<{
      worktreePoolPath: string;
      repoPath: string;
      exec: ExecFn;
      projectSettings: ProjectSettingsProvider;
    }> = {}
  ): WorktreeService {
    return new WorktreeService({
      worktreePoolPath: poolDir,
      repoPath: repoDir,
      exec,
      rootFs: new LocalFileSystem('/'),
      projectSettings: makeSettings(),
      ...overrides,
    });
  }

  it('removeWorktree actually removes the directory', async () => {
    await exec('git', ['branch', 'feature/test-remove'], { cwd: repoDir });
    const svc = makeService();

    const result = await svc.checkoutBranchWorktree(
      { type: 'local', branch: 'main' },
      'feature/test-remove'
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    const worktreePath = result.data;
    expect(fs.existsSync(worktreePath)).toBe(true);

    await svc.removeWorktree(worktreePath);
    expect(fs.existsSync(worktreePath)).toBe(false);
  });

  it('create two worktrees for same branch fails with worktree-already-exists', async () => {
    await exec('git', ['branch', 'feature/shared-branch'], { cwd: repoDir });
    const svc = makeService();

    const result1 = await svc.checkoutBranchWorktree(
      { type: 'local', branch: 'main' },
      'feature/shared-branch'
    );
    expect(result1.success).toBe(true);

    const subDir = path.join(poolDir, 'sub');
    const result2 = await svc.checkoutBranchWorktree(
      { type: 'local', branch: 'main' },
      'feature/shared-branch',
      subDir
    );
    expect(result2.success).toBe(false);
    if (!result2.success) {
      expect(result2.error.type).toBe('worktree-already-exists');
    }
  });

  it('removeWorktree cleans up git worktree reference', async () => {
    await exec('git', ['branch', 'feature/test-cleanup'], { cwd: repoDir });
    const svc = makeService();

    const result = await svc.checkoutBranchWorktree(
      { type: 'local', branch: 'main' },
      'feature/test-cleanup'
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    const worktreePath = result.data;

    const { stdout: before } = await exec('git', ['worktree', 'list'], { cwd: repoDir });
    expect(before).toContain('feature/test-cleanup');

    await svc.removeWorktree(worktreePath);

    const { stdout: after } = await exec('git', ['worktree', 'list'], { cwd: repoDir });
    expect(after).not.toContain('feature/test-cleanup');
  });
});
