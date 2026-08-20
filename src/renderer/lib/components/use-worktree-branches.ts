import { useEffect, useState } from 'react';
import { rpc } from '@renderer/lib/ipc';

/**
 * Branch names that currently have a linked worktree for the given project
 * (excluding the main checkout). Fetched once per mount; refreshed together
 * with the branch selector's refresh button. Falls back to an empty set on
 * error so the UI degrades to "no markers" rather than blocking.
 */
export function useWorktreeBranches(projectId: string | undefined) {
  const [worktreeBranches, setWorktreeBranches] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    rpc.repository
      .getWorktreeBranches(projectId)
      .then((branches) => {
        if (!cancelled) setWorktreeBranches(new Set(branches));
      })
      .catch(() => {
        if (!cancelled) setWorktreeBranches(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return worktreeBranches;
}
