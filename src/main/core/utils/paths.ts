import fs from 'node:fs';
import path from 'node:path';

/**
 * Normalize a filesystem path for comparison: forward slashes, no trailing
 * separator, lowercased (Windows paths are case-insensitive; on case-sensitive
 * platforms lowercasing can only over-match, never under-match, and callers
 * compare paths that originate from the same app).
 */
export function normalizeFsPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * True when `child` is equal to or located under `ancestor`.
 * Both paths are normalized (case-insensitive, forward slashes) first.
 */
export function isPathUnder(child: string, ancestor: string): boolean {
  const c = normalizeFsPath(child);
  const a = normalizeFsPath(ancestor);
  if (!a) return false;
  return c === a || c.startsWith(a + '/');
}

/**
 * True when the path is a git worktree checkout (as opposed to a plain clone):
 * linked worktrees carry a `.git` *file* pointing at the main repo's admin dir,
 * while a normal repository has a `.git` *directory*.
 */
export function isWorktreeCheckout(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, '.git')).isFile();
  } catch {
    return false;
  }
}
