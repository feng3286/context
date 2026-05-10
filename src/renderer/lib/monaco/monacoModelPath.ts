/**
 * Build a stable Monaco model URI for a file within a project/worktree context.
 * Monaco uses this identity to keep model-local undo/redo history.
 *
 * For multi-project tasks, projectId should be provided to ensure unique URIs
 * for files from different projects that may have the same relative path.
 */
export function buildMonacoModelPath(
  rootPath: string,
  filePath: string,
  projectId?: string
): string {
  // For multi-project tasks, include projectId in the path to ensure uniqueness
  const effectiveRoot = projectId ? `project:${projectId}` : rootPath;
  const normalizedRoot = effectiveRoot.replace(/\\/g, '/').replace(/\/+$/g, '');
  const normalizedFile = filePath.replace(/\\/g, '/').replace(/^\/+/g, '');
  const joined = `${normalizedRoot}/${normalizedFile}`.replace(/\/{2,}/g, '/');
  const absolute = joined.startsWith('/') ? joined : `/${joined}`;
  const encodedPath = absolute
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `file://${encodedPath}`;
}
