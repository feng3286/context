import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { log } from '@main/lib/logger';

/**
 * Name of the directory used to stash paths that could not be removed
 * synchronously (typically because a process surviving teardown holds a file
 * open — e.g. an electron dev server started inside a task terminal).
 */
export const TRASH_DIR_NAME = '.context-trash';

/**
 * Best-effort removal used by the startup sweep. Unlike the in-flight deletion
 * path, this is non-fatal: anything still locked is simply left for the next
 * launch rather than aborting app init.
 */
async function rmBestEffort(target: string): Promise<void> {
  try {
    await fs.promises.rm(target, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  } catch (e) {
    log.debug('deferred-cleanup: trash entry still locked, will retry next launch', {
      target,
      error: String(e),
    });
  }
}

/**
 * Move a path that could not be deleted into a sibling `.context-trash`
 * directory. Renaming a directory is a metadata operation on its parent and
 * generally succeeds on Windows even when a file inside it is held open (the
 * lock is on the file, not the parent dir entry). This clears the task path
 * immediately so the user does not see an orphan directory; the trashed entry
 * is swept on the next app launch once the locking process has exited.
 *
 * @returns the trash destination path on success, or null if the move failed.
 */
export async function moveToTrash(target: string): Promise<string | null> {
  const parent = path.dirname(target);
  const base = path.basename(target);
  const trashDir = path.join(parent, TRASH_DIR_NAME);
  const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const dest = path.join(trashDir, `${base}-${stamp}`);

  try {
    await fs.promises.mkdir(trashDir, { recursive: true });
    // Try a plain rename first (fast path, works when target & trash share a
    // volume, which they do by construction — trash is a sibling).
    await fs.promises.rename(target, dest);
    return dest;
  } catch (e) {
    log.warn('deferred-cleanup: failed to move path to trash', {
      target,
      dest,
      error: String(e),
    });
    return null;
  }
}

/**
 * Sweep deferred-deletion trash directories left over from previous sessions.
 *
 * Trash dirs live at `<worktreeRoot>/<workspace>/.context-trash/`. We scan one
 * level deep under the worktree root (each entry is a workspace dir) and clear
 * any `.context-trash` found. Best-effort and non-blocking — locked entries
 * survive to the next launch.
 */
export async function sweepDeferredTrash(worktreeRoot: string): Promise<void> {
  if (!worktreeRoot) return;

  let workspaces: string[] = [];
  try {
    workspaces = await fs.promises.readdir(worktreeRoot);
  } catch (e) {
    // Root may not exist yet (fresh install) — nothing to sweep.
    log.debug('deferred-cleanup: worktree root not readable, skipping sweep', {
      worktreeRoot,
      error: String(e),
    });
    return;
  }

  await Promise.all(
    workspaces.map(async (ws) => {
      const trashDir = path.join(worktreeRoot, ws, TRASH_DIR_NAME);
      let entries: string[] = [];
      try {
        entries = await fs.promises.readdir(trashDir);
      } catch {
        return; // no trash for this workspace
      }
      if (entries.length === 0) {
        // Empty trash dir — remove it too so the workspace dir stays clean.
        await rmBestEffort(trashDir);
        return;
      }
      log.info('deferred-cleanup: sweeping deferred trash', {
        trashDir,
        count: entries.length,
      });
      await Promise.all(entries.map((entry) => rmBestEffort(path.join(trashDir, entry))));
      // Best-effort: remove the now-empty trash dir. If entries remain (still
      // locked), leave it for the next launch.
      await rmBestEffort(trashDir);
    })
  );
}
