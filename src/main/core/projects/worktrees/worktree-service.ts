import path from 'node:path';
import type { Branch } from '@shared/git';
import { DEFAULT_REMOTE_NAME, normalizeLocalBranchRef } from '@shared/git-utils';
import { err, ok, Result } from '@shared/result';
import { FileSystemProvider } from '@main/core/fs/types';
import { disposeCatFileBatchesUnder } from '@main/core/git/impl/cat-file-batch';
import { ExecFn } from '@main/core/utils/exec';
import { log } from '@main/lib/logger';
import { ProjectSettingsProvider } from '../settings/schema';

export type ServeWorktreeError =
  | { type: 'worktree-setup-failed'; cause: unknown }
  | { type: 'branch-not-found'; branch: string }
  | { type: 'worktree-already-exists'; path: string };

export class WorktreeService {
  private gitOpQueue: Promise<unknown> = Promise.resolve();
  private worktreePoolPath: string;
  private readonly repoPath: string;
  private readonly projectName: string;
  private readonly exec: ExecFn;
  private readonly rootFs: FileSystemProvider;
  private readonly projectSettings: ProjectSettingsProvider;

  constructor(args: {
    worktreePoolPath: string;
    repoPath: string;
    projectName?: string;
    exec: ExecFn;
    rootFs: FileSystemProvider;
    projectSettings: ProjectSettingsProvider;
  }) {
    this.worktreePoolPath = args.worktreePoolPath;
    this.repoPath = args.repoPath;
    this.projectName = args.projectName ?? path.basename(this.repoPath);
    this.projectSettings = args.projectSettings;
    this.exec = args.exec;
    this.rootFs = args.rootFs;

    this.exec('git', ['worktree', 'prune'], { cwd: this.repoPath }).catch(() => {});
    // Enable long paths on Windows to avoid MAX_PATH (260 char) limit
    if (process.platform === 'win32') {
      this.exec('git', ['config', 'core.longpaths', 'true'], { cwd: this.repoPath }).catch(
        () => {}
      );
    }
  }

  private enqueueGitOp<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.gitOpQueue.then(fn, fn);
    this.gitOpQueue = result.catch(() => {});
    return result as Promise<T>;
  }

  private async isValidWorktree(worktreePath: string): Promise<boolean> {
    try {
      await this.exec('git', ['rev-parse', '--git-dir'], { cwd: worktreePath });
      return true;
    } catch {
      return false;
    }
  }

  async getCurrentBranch(worktreePath: string): Promise<string | null> {
    try {
      const { stdout } = await this.exec('git', ['rev-parse', '--symbolic-full-name', 'HEAD'], {
        cwd: worktreePath,
      });
      const ref = stdout.trim();
      if (ref === 'HEAD' || !ref) return null;
      return normalizeLocalBranchRef(ref);
    } catch {
      return null;
    }
  }

  async syncWorktreePoolPath(): Promise<void> {
    const dir = await this.projectSettings.getWorktreeDirectory();
    this.worktreePoolPath = path.join(dir, this.projectName);
  }

  private async ensureWorktreePoolDirExists(): Promise<void> {
    await this.rootFs.mkdir(this.worktreePoolPath, { recursive: true });
  }

  private async getRemoteCandidates(): Promise<string[]> {
    const configuredRemote = (await this.projectSettings.getRemote().catch(() => '')).trim();
    if (!configuredRemote || configuredRemote === DEFAULT_REMOTE_NAME) {
      return [DEFAULT_REMOTE_NAME];
    }
    return [configuredRemote, DEFAULT_REMOTE_NAME];
  }

  private async findCheckedOutPathForBranch(branchName: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.exec('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.repoPath,
      });
      const branchLine = `branch refs/heads/${branchName}`;
      for (const block of stdout.split('\n\n')) {
        if (!block.split('\n').some((line) => line === branchLine)) {
          continue;
        }
        const match = /^worktree (.+)$/m.exec(block);
        const candidatePath = match?.[1];
        if (!candidatePath) continue;
        if (await this.isValidWorktree(candidatePath)) {
          return candidatePath;
        }
        await this.exec('git', ['worktree', 'prune'], { cwd: this.repoPath }).catch(() => {});
      }
    } catch {}
    return undefined;
  }

  private async resolveSourceBaseRef(
    sourceBranch: Branch | undefined
  ): Promise<string | undefined> {
    if (!sourceBranch) return undefined;

    if (sourceBranch.type === 'local') {
      const localRef = `refs/heads/${sourceBranch.branch}`;
      try {
        await this.exec('git', ['rev-parse', '--verify', localRef], { cwd: this.repoPath });
        return localRef;
      } catch {
        return undefined;
      }
    }

    const remoteName = sourceBranch.remote.name;
    await this.exec('git', ['fetch', remoteName], { cwd: this.repoPath }).catch(() => {});
    const remoteRef = `refs/remotes/${remoteName}/${sourceBranch.branch}`;
    try {
      await this.exec('git', ['rev-parse', '--verify', remoteRef], { cwd: this.repoPath });
      return remoteRef;
    } catch {
      return undefined;
    }
  }

  async getWorktree(branchName: string): Promise<string | undefined> {
    const worktreePath = path.join(this.worktreePoolPath, branchName);
    if (await this.rootFs.exists(worktreePath)) {
      if (await this.isValidWorktree(worktreePath)) return worktreePath;
      await this.rootFs.remove(worktreePath, { recursive: true }).catch(() => {});
    }

    try {
      const realPoolPath = await this.rootFs.realPath(this.worktreePoolPath);
      const { stdout } = await this.exec('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.repoPath,
      });
      const branchLine = `branch refs/heads/${branchName}`;
      for (const block of stdout.split('\n\n')) {
        if (block.split('\n').some((line) => line === branchLine)) {
          const match = /^worktree (.+)$/m.exec(block);
          if (match?.[1] && match[1] !== this.repoPath) return match[1];
        }
      }
    } catch {}
    return undefined;
  }

  /**
   * Branch names that currently have a linked worktree (excluding the main
   * repo checkout). Used by the UI to flag branches already checked out in a
   * worktree when picking a task source branch.
   *
   * Path comparison is normalised to forward slashes + lowercase: porcelain
   * output uses forward slashes while repoPath usually has backslashes on
   * Windows, and drive-letter case varies.
   */
  async listWorktreeBranches(): Promise<string[]> {
    try {
      const { stdout } = await this.exec('git', ['worktree', 'list', '--porcelain'], {
        cwd: this.repoPath,
      });
      const mainPath = this.repoPath.replace(/\\/g, '/').toLowerCase();
      const branches: string[] = [];
      for (const block of stdout.split('\n\n')) {
        const wtMatch = /^worktree (.+)$/m.exec(block);
        const wtPath = wtMatch?.[1];
        if (!wtPath) continue;
        if (wtPath.replace(/\\/g, '/').toLowerCase() === mainPath) continue;
        const branchMatch = /^branch refs\/heads\/(.+)$/m.exec(block);
        if (branchMatch?.[1]) branches.push(branchMatch[1]);
      }
      return branches;
    } catch {
      return [];
    }
  }

  async checkoutBranchWorktree(
    sourceBranch: Branch | undefined,
    branchName: string,
    customWorkDir?: string
  ): Promise<Result<string, ServeWorktreeError>> {
    if (!customWorkDir) await this.ensureWorktreePoolDirExists();
    return this.enqueueGitOp(() =>
      this.doCheckoutBranchWorktree(sourceBranch, branchName, customWorkDir)
    );
  }

  private async doCheckoutBranchWorktree(
    sourceBranch: Branch | undefined,
    branchName: string,
    customWorkDir?: string
  ): Promise<Result<string, ServeWorktreeError>> {
    const checkedOutPath = await this.findCheckedOutPathForBranch(branchName);
    if (checkedOutPath) {
      return err({ type: 'worktree-already-exists', path: checkedOutPath });
    }

    // If customWorkDir is provided, use it directly as the target path
    // Otherwise, use default pool path + branchName
    const targetPath = customWorkDir ?? path.join(this.worktreePoolPath, branchName);
    if (await this.rootFs.exists(targetPath)) {
      if (await this.isValidWorktree(targetPath)) {
        return err({ type: 'worktree-already-exists', path: targetPath });
      }
      await this.rootFs.remove(targetPath, { recursive: true }).catch(() => {});
      await this.exec('git', ['worktree', 'prune'], { cwd: this.repoPath }).catch(() => {});
    }

    try {
      // Fetch remote tracking refs in parallel before creating or looking up branches,
      // so that refs/remotes/<remote>/<branch> are up to date.
      // Only fetch the specific branch, not the entire remote.
      const remoteCandidates = await this.getRemoteCandidates();
      await Promise.all(
        remoteCandidates.map((remoteName) => {
          const branchRef = sourceBranch?.type === 'local' ? sourceBranch.branch : branchName;
          // Fetch only the specific branch ref (not the entire remote)
          return this.exec('git', ['fetch', remoteName, branchRef], {
            cwd: this.repoPath,
          }).catch(() => {});
        })
      );

      let localExists = false;
      try {
        await this.exec('git', ['rev-parse', '--verify', `refs/heads/${branchName}`], {
          cwd: this.repoPath,
        });
        localExists = true;
      } catch {}

      if (!localExists) {
        const sourceRef = await this.resolveSourceBaseRef(sourceBranch);
        if (!sourceRef) {
          return err({ type: 'branch-not-found', branch: sourceBranch?.branch ?? branchName });
        }
        await this.exec('git', ['branch', '--no-track', branchName, sourceRef], {
          cwd: this.repoPath,
        });
      }

      await this.rootFs.mkdir(path.dirname(targetPath), { recursive: true });
      await this.exec('git', ['worktree', 'prune'], { cwd: this.repoPath }).catch(() => {});
      // Enable long paths on Windows before worktree add
      if (process.platform === 'win32') {
        await this.exec('git', ['config', 'core.longpaths', 'true'], { cwd: this.repoPath });
      }
      await this.exec('git', ['worktree', 'add', targetPath, branchName], {
        cwd: this.repoPath,
        timeout: 300_000,
      });
    } catch (cause) {
      // Clean up orphan directory created by mkdir above
      await this.rootFs.remove(targetPath, { recursive: true }).catch(() => {});
      return err({ type: 'worktree-setup-failed', cause });
    }

    await this.copyPreservedFiles(targetPath).catch((e) => {
      log.warn('WorktreeService: failed to copy preserved files', {
        targetPath,
        error: String(e),
      });
    });

    return ok(targetPath);
  }

  async checkoutExistingBranch(
    branchName: string,
    customWorkDir?: string
  ): Promise<Result<string, ServeWorktreeError>> {
    if (!customWorkDir) await this.ensureWorktreePoolDirExists();
    return this.enqueueGitOp(() => this.doCheckoutExistingBranch(branchName, customWorkDir));
  }

  private async doCheckoutExistingBranch(
    branchName: string,
    customWorkDir?: string
  ): Promise<Result<string, ServeWorktreeError>> {
    const checkedOutPath = await this.findCheckedOutPathForBranch(branchName);
    if (checkedOutPath) {
      return err({ type: 'worktree-already-exists', path: checkedOutPath });
    }

    // If customWorkDir is provided, use it directly as the target path
    // Otherwise, use default pool path + branchName
    const targetPath = customWorkDir ?? path.join(this.worktreePoolPath, branchName);
    const remoteCandidates = await this.getRemoteCandidates();

    if (await this.rootFs.exists(targetPath)) {
      if (await this.isValidWorktree(targetPath)) {
        return err({ type: 'worktree-already-exists', path: targetPath });
      }
      await this.rootFs.remove(targetPath, { recursive: true });
      await this.exec('git', ['worktree', 'prune'], { cwd: this.repoPath }).catch(() => {});
    }

    try {
      // Fetch the specific branch from remotes in parallel (not the entire remote)
      const remoteCandidates = await this.getRemoteCandidates();
      await Promise.all(
        remoteCandidates.map((remoteName) =>
          this.exec('git', ['fetch', remoteName, branchName], {
            cwd: this.repoPath,
          }).catch(() => {})
        )
      );
      let localExists = false;
      try {
        await this.exec('git', ['rev-parse', '--verify', `refs/heads/${branchName}`], {
          cwd: this.repoPath,
        });
        localExists = true;
      } catch {}

      if (!localExists) {
        let trackingRemote: string | undefined;
        for (const remoteName of remoteCandidates) {
          try {
            await this.exec(
              'git',
              ['rev-parse', '--verify', `refs/remotes/${remoteName}/${branchName}`],
              {
                cwd: this.repoPath,
              }
            );
            trackingRemote = remoteName;
            break;
          } catch {}
        }
        if (!trackingRemote) {
          return err({ type: 'branch-not-found', branch: branchName });
        }
        await this.exec(
          'git',
          ['branch', '--track', branchName, `${trackingRemote}/${branchName}`],
          {
            cwd: this.repoPath,
          }
        );
      }

      // Only create directory after all git checks pass
      await this.rootFs.mkdir(path.dirname(targetPath), { recursive: true });
      await this.exec('git', ['worktree', 'prune'], { cwd: this.repoPath }).catch(() => {});
      // Enable long paths on Windows before worktree add
      if (process.platform === 'win32') {
        await this.exec('git', ['config', 'core.longpaths', 'true'], { cwd: this.repoPath });
      }
      await this.exec('git', ['worktree', 'add', targetPath, branchName], {
        cwd: this.repoPath,
        timeout: 300_000,
      });
    } catch (cause) {
      // Clean up orphan directory created by mkdir above
      await this.rootFs.remove(targetPath, { recursive: true }).catch(() => {});
      return err({ type: 'worktree-setup-failed', cause });
    }

    await this.copyPreservedFiles(targetPath).catch((e) => {
      log.warn('WorktreeService: failed to copy preserved files', {
        targetPath,
        error: String(e),
      });
    });

    return ok(targetPath);
  }

  async moveWorktree(oldPath: string, newPath: string): Promise<void> {
    await this.exec('git', ['worktree', 'move', oldPath, newPath], { cwd: this.repoPath });
  }

  async removeWorktree(worktreePath: string): Promise<void> {
    // Kill our own persistent git helpers first: a `git cat-file --batch`
    // spawned with cwd inside this worktree pins the directory (Windows blocks
    // rmdir/rename of any process's CWD), which would make the app deadlock
    // its own worktree removal.
    const disposedHelpers = disposeCatFileBatchesUnder(worktreePath);
    if (disposedHelpers.length > 0) {
      log.info('worktree-service: disposed git helpers pinning worktree', {
        worktreePath,
        helpers: disposedHelpers,
      });
    }
    // Force remove the directory first with retries (handles Windows file locks).
    // rootFs.remove() resolves { success, error } and never throws, so we must
    // check the return value ourselves — otherwise the retry loop is a no-op.
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await this.rootFs.remove(worktreePath, { recursive: true });
      if (result.success) {
        lastError = undefined;
        break; // Success
      }
      lastError = new Error(result.error ?? `Failed to remove worktree: ${worktreePath}`);
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    if (lastError) throw lastError;
    // Then prune stale worktree references
    await this.exec('git', ['worktree', 'prune'], { cwd: this.repoPath }).catch(() => {});
  }

  private async copyPreservedFiles(targetPath: string): Promise<void> {
    const settings = await this.projectSettings.get();
    const patterns = settings.preservePatterns ?? [];
    for (const pattern of patterns) {
      const matches = await this.rootFs.glob(pattern, {
        cwd: this.repoPath,
        dot: true,
      });
      for (const relPath of matches) {
        const src = path.join(this.repoPath, relPath);
        const stat = await this.rootFs.stat(src).catch(() => null);
        if (!stat || stat.type !== 'file') continue;
        const dest = path.join(targetPath, relPath);
        await this.rootFs.mkdir(path.dirname(dest), { recursive: true });
        await this.rootFs.copyFile(src, dest);
      }
    }
  }
}
