import type { Branch, Remote } from './git';

export const DEFAULT_REMOTE_NAME = 'origin';

export function selectPreferredRemote(
  configuredRemote: string | undefined,
  remotes: ReadonlyArray<Remote>
): Remote {
  const preferred = configuredRemote?.trim();
  const found = preferred ? remotes.find((r) => r.name === preferred) : undefined;
  return (
    found ??
    remotes.find((r) => r.name === DEFAULT_REMOTE_NAME) ??
    remotes[0] ?? { name: DEFAULT_REMOTE_NAME, url: '' }
  );
}

/**
 * Strips the remote prefix from a fully-qualified remote tracking ref.
 * e.g. "origin/main" → "main", "main" → "main"
 */
export function bareRefName(ref: string): string {
  const slash = ref.indexOf('/');
  return slash !== -1 ? ref.slice(slash + 1) : ref;
}

/**
 * Normalize a local branch ref returned by `git rev-parse --symbolic-full-name`
 * (or the `%(refname)` format) down to its bare branch name. Handles every
 * form git may emit for HEAD:
 *   - "refs/heads/v2.2.7"  — full ref (the canonical --symbolic-full-name output)
 *   - "heads/v2.2.7"       — disambiguated short name emitted by --abbrev-ref /
 *                           %(refname:short) when a branch shares its name with
 *                           a tag (e.g. refs/heads/v2.2.7 + refs/tags/v2.2.7)
 *   - "v2.2.7"             — already a short name
 *
 * Does NOT decide detached HEAD: callers must treat the literal "HEAD" or an
 * empty string as null themselves.
 *
 * Always parse the FULL ref (--symbolic-full-name / %(refname)) when possible.
 * The `heads/` fallback exists for the --abbrev-ref short form only; with the
 * full ref a real branch literally named "heads/weird" round-trips correctly
 * (refs/heads/heads/weird → "heads/weird"), whereas the bare short form would
 * be indistinguishable from a disambiguation prefix.
 */
export function normalizeLocalBranchRef(ref: string): string {
  if (ref.startsWith('refs/heads/')) return ref.slice('refs/heads/'.length);
  if (ref.startsWith('heads/')) return ref.slice('heads/'.length);
  return ref;
}

/**
 * Resolves the canonical default branch name from user settings, the branch
 * list, and the git-heuristic fallback. Shared between main and renderer.
 *
 * @param configured - Already-resolved user preference (settings.defaultBranch ?? bareRefName(baseRef))
 * @param branches   - Full branch list (local + remote)
 * @param remote     - The configured remote name
 * @param gitDefaultBranch - Git-heuristic default (symbolic-ref / remote show / well-known names)
 */
export function computeDefaultBranch(
  configured: string,
  branches: Branch[],
  remote: string,
  gitDefaultBranch: string
): string {
  const existsLocally = branches.some((b) => b.type === 'local' && b.branch === configured);
  const isOnRemote = branches.some(
    (b) => b.type === 'remote' && b.branch === configured && b.remote.name === remote
  );
  if (existsLocally || isOnRemote) return configured;
  return gitDefaultBranch;
}
