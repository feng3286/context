import path from 'node:path';

/**
 * Directory-prefix matching shared by the transcript index and the pending
 * session registry: the session's own directory or any subdirectory of the
 * prefix (multi-project tasks live in per-task subdirectories).
 *
 * Paths are compared after normalizing separators (transcripts recorded under
 * Git Bash / POSIX-style tools may use forward slashes on Windows) and
 * lowercased (Windows path casing varies between writers).
 */

export function cwdMatches(cwd: string, prefix: string): boolean {
  if (!cwd || !prefix) return false;
  const norm = normalizeDir(cwd);
  const prefixNorm = normalizeDir(prefix);
  return norm === prefixNorm || norm.startsWith(prefixNorm + path.sep);
}

function normalizeDir(p: string): string {
  let out = p;
  if (path.sep === '\\') out = out.split('/').join('\\');
  while (out.length > 1 && out.endsWith(path.sep)) {
    out = out.slice(0, -1);
  }
  return out.toLowerCase();
}
