import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { disposeCatFileBatchesUnder } from '@main/core/git/impl/cat-file-batch';
import { getLocalExec, type ExecFn } from '@main/core/utils/exec';
import { isPathUnder, isWorktreeCheckout, normalizeFsPath } from '@main/core/utils/paths';
import { log } from '@main/lib/logger';
import { TRASH_DIR_NAME } from './deferred-cleanup';

interface RegisteredWorktree {
  repoPath: string;
  /** Absolute path of the linked worktree checkout. */
  worktreePath: string;
  /** Short branch name checked out in this worktree; null when detached. */
  branch: string | null;
}

export interface LocalRepoRef {
  path: string;
  /** Project source branch (e.g. `origin/dev_x`); branches equal to it are never deleted. */
  baseRef?: string | null;
}

export interface SweepOrphanTaskDirsOptions {
  /** Task work_dirs still considered live. Defaults to the tasks table. */
  knownWorkDirs?: string[];
  /** Local repositories to inspect for worktree registrations. Defaults to local projects. */
  repos?: LocalRepoRef[];
  exec?: ExecFn;
}

async function isDirectory(p: string): Promise<boolean> {
  try {
    return (await fs.promises.stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** `origin/dev_x` → `dev_x`; other refs pass through unchanged. */
function shortBranchName(ref: string | null | undefined): string {
  if (!ref) return '';
  return ref.replace(/^refs\/heads\//, '').replace(/^origin\//, '');
}

async function loadTaskWorkDirs(): Promise<string[]> {
  const { db } = await import('@main/db/client');
  const { tasks } = await import('@main/db/schema');
  const rows = await db.select({ workDir: tasks.workDir }).from(tasks);
  return rows.map((r) => r.workDir).filter((d): d is string => !!d);
}

async function loadLocalRepos(): Promise<LocalRepoRef[]> {
  const { db } = await import('@main/db/client');
  const { projects } = await import('@main/db/schema');
  const rows = await db
    .select({ path: projects.path, baseRef: projects.baseRef })
    .from(projects)
    .where(eq(projects.workspaceProvider, 'local'));
  return rows;
}

async function listRegisteredWorktrees(
  repoPath: string,
  exec: ExecFn
): Promise<RegisteredWorktree[]> {
  try {
    const { stdout } = await exec('git', ['worktree', 'list', '--porcelain'], {
      cwd: repoPath,
      timeout: 10_000,
    });
    const out: RegisteredWorktree[] = [];
    let current: { worktreePath?: string; branch?: string | null } = {};
    const flush = () => {
      if (current.worktreePath) {
        out.push({
          repoPath,
          worktreePath: current.worktreePath,
          branch: current.branch ?? null,
        });
      }
      current = {};
    };
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        flush();
        current.worktreePath = line.slice('worktree '.length).trim();
      } else if (line.startsWith('branch ')) {
        current.branch = shortBranchName(line.slice('branch '.length).trim());
      } else if (line.startsWith('detached')) {
        current.branch = null;
      }
    }
    flush();
    return out;
  } catch {
    return [];
  }
}

/**
 * Best-effort removal of a path; returns true when the path is gone afterwards.
 */
async function rmBestEffort(target: string): Promise<boolean> {
  try {
    await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  } catch (e) {
    log.debug('orphan-cleanup: removal failed, will retry next launch', {
      target,
      error: String(e),
    });
  }
  return !fs.existsSync(target);
}

/**
 * Sweep task directories left under the worktree root by failed deletions
 * (e.g. a process pinned the directory as its CWD on Windows before the
 * dispose-before-removal fix existed).
 *
 * A directory is treated as an orphaned task dir when it is not referenced by
 * any task's `work_dir` and at least one of its children is a linked worktree
 * checkout (`.git` *file*) — plain clones and unrelated folders are spared.
 * After removing an orphan, the repos that had worktrees registered under it
 * are pruned, and the branches those worktrees had checked out are deleted
 * (mirroring deleteTask's branch semantics: the project's source branch and
 * the repo's main checkout are never touched).
 *
 * Non-blocking and best-effort: anything still locked survives to the next
 * launch.
 */
export async function sweepOrphanTaskDirs(
  worktreeRoot: string,
  options: SweepOrphanTaskDirsOptions = {}
): Promise<void> {
  if (!worktreeRoot) return;
  const exec = options.exec ?? getLocalExec();
  const knownWorkDirs = options.knownWorkDirs ?? (await loadTaskWorkDirs());
  const repos = options.repos ?? (await loadLocalRepos());
  const baseRefByRepo = new Map(
    repos.map((r) => [normalizeFsPath(r.path), shortBranchName(r.baseRef)])
  );

  // Worktree registrations across all local repos, keyed by normalized path.
  const registrations = new Map<string, RegisteredWorktree>();
  for (const repo of repos) {
    for (const wt of await listRegisteredWorktrees(repo.path, exec)) {
      registrations.set(normalizeFsPath(wt.worktreePath), wt);
    }
  }

  let workspaces: string[] = [];
  try {
    workspaces = await fs.promises.readdir(worktreeRoot);
  } catch (e) {
    log.debug('orphan-cleanup: worktree root not readable, skipping', {
      worktreeRoot,
      error: String(e),
    });
    return;
  }

  const affectedRepos = new Map<string, { repoPath: string; branches: string[] }>();

  for (const ws of workspaces) {
    const wsDir = path.join(worktreeRoot, ws);
    if (!(await isDirectory(wsDir))) continue;

    let entries: string[] = [];
    try {
      entries = await fs.promises.readdir(wsDir);
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (entry === TRASH_DIR_NAME) continue;
      const candidate = path.join(wsDir, entry);
      if (!(await isDirectory(candidate))) continue;

      // Spared when any live task's work_dir covers it (or lives inside it).
      if (knownWorkDirs.some((d) => isPathUnder(candidate, d) || isPathUnder(d, candidate))) {
        continue;
      }

      // Task-shaped? At least one child must be a linked worktree checkout —
      // plain clones keep `.git` as a directory and are left alone.
      let children: string[] = [];
      try {
        children = await fs.promises.readdir(candidate);
      } catch {
        continue;
      }
      const worktreeChildren = children.filter((c) => isWorktreeCheckout(path.join(candidate, c)));
      if (worktreeChildren.length === 0) continue;

      // Kill our own stale helpers that may still pin the directory.
      disposeCatFileBatchesUnder(candidate);
      const removed = await rmBestEffort(candidate);
      if (!removed) continue;

      log.info('orphan-cleanup: removed orphan task dir', { dir: candidate });
      for (const child of worktreeChildren) {
        const reg = registrations.get(normalizeFsPath(path.join(candidate, child)));
        if (!reg) continue;
        // Never touch the repo's main checkout, detached worktrees, or the
        // project's source branch — same guarantees deleteTask gives.
        if (normalizeFsPath(reg.worktreePath) === normalizeFsPath(reg.repoPath)) continue;
        const sourceBranch = baseRefByRepo.get(normalizeFsPath(reg.repoPath)) ?? '';
        if (!reg.branch || reg.branch === sourceBranch) continue;
        const record = affectedRepos.get(reg.repoPath) ?? { repoPath: reg.repoPath, branches: [] };
        if (!record.branches.includes(reg.branch)) record.branches.push(reg.branch);
        affectedRepos.set(reg.repoPath, record);
      }
    }
  }

  for (const { repoPath, branches } of affectedRepos.values()) {
    await exec('git', ['worktree', 'prune'], { cwd: repoPath, timeout: 10_000 }).catch(() => {});
    for (const branch of branches) {
      await exec('git', ['branch', '-D', branch], { cwd: repoPath, timeout: 10_000 }).catch((e) => {
        log.warn('orphan-cleanup: branch deletion failed', { repoPath, branch, error: String(e) });
      });
      log.info('orphan-cleanup: deleted orphan task branch', { repoPath, branch });
    }
  }
}
