import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getLocalExec } from '@main/core/utils/exec';
import { sweepOrphanTaskDirs } from './orphan-cleanup';

function git(cwd: string, cmd: string): void {
  execSync(`git ${cmd}`, { cwd, stdio: 'pipe' });
}

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'emdash-orphan-repo-'));
  git(dir, 'init');
  git(dir, 'config user.email "t@test.local"');
  git(dir, 'config user.name "test"');
  writeFileSync(join(dir, 'a.txt'), 'hello\n');
  git(dir, 'add a.txt');
  git(dir, 'commit -m init');
  return dir;
}

function worktreeList(repo: string): string {
  return execSync('git worktree list --porcelain', { cwd: repo, encoding: 'utf8' });
}

function branchList(repo: string): string {
  return execSync('git branch --list', { cwd: repo, encoding: 'utf8' });
}

describe('sweepOrphanTaskDirs', () => {
  it('removes orphan task dirs, prunes registrations, deletes task branches; spares live tasks, source branches and plain dirs', async () => {
    const root = mkdtempSync(join(tmpdir(), 'emdash-orphan-root-'));
    const repo = makeRepo();

    // Live task: referenced by a task work_dir — must be untouched.
    const liveDir = join(root, 'ws', 'live-task', 'proj');
    git(repo, `worktree add -b task/live-branch "${liveDir}"`);

    // Orphan with a task-style branch — dir removed, branch deleted.
    const orphanDir = join(root, 'ws', 'orphan-task', 'proj');
    git(repo, `worktree add -b context/orphan-task-abc123 "${orphanDir}"`);

    // Orphan checked out on the project's source branch — dir removed, branch kept.
    const srcDir = join(root, 'ws', 'orphan-src', 'proj');
    git(repo, `worktree add -b dev_main "${srcDir}"`);

    // Plain directory without worktree children — spared.
    const plainDir = join(root, 'ws', 'plain');
    mkdirSync(plainDir, { recursive: true });
    writeFileSync(join(plainDir, 'keep.txt'), 'x');

    await sweepOrphanTaskDirs(root, {
      knownWorkDirs: [join(root, 'ws', 'live-task')],
      repos: [{ path: repo, baseRef: 'origin/dev_main' }],
      exec: getLocalExec(),
    });

    expect(existsSync(liveDir)).toBe(true);
    expect(existsSync(join(root, 'ws', 'orphan-task'))).toBe(false);
    expect(existsSync(join(root, 'ws', 'orphan-src'))).toBe(false);
    expect(existsSync(plainDir)).toBe(true);

    const list = worktreeList(repo);
    expect(list).toContain('live-task');
    expect(list).not.toContain('orphan-task');
    expect(list).not.toContain('orphan-src');

    const branches = branchList(repo);
    expect(branches).toContain('task/live-branch');
    expect(branches).not.toContain('context/orphan-task-abc123');
    expect(branches).toContain('dev_main');
  });

  it('spares the .context-trash directory', async () => {
    const root = mkdtempSync(join(tmpdir(), 'emdash-orphan-root-'));
    const repo = makeRepo();
    const trashDir = join(root, 'ws', '.context-trash');
    const inner = join(trashDir, 'old-task-123');
    const orphanDir = join(inner, 'proj');
    git(repo, `worktree add "${orphanDir}"`);

    await sweepOrphanTaskDirs(root, {
      knownWorkDirs: [],
      repos: [{ path: repo, baseRef: 'origin/main' }],
      exec: getLocalExec(),
    });

    // The trash dir is the sweeper's own storage — never treated as an orphan.
    expect(existsSync(orphanDir)).toBe(true);
  });
});
