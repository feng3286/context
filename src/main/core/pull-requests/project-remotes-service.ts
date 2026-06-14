import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { Remote } from '@shared/git';
import { isGitHubUrl, normalizeGitHubUrl } from '@main/core/github/services/utils';
import { db } from '@main/db/client';
import { projectRemotes } from '@main/db/schema';

/**
 * Upsert all git remotes for a project into the `project_remotes` table and
 * delete any rows that are no longer present in the live remote list.
 *
 * Called on every task provision and whenever `.git/config` changes.
 */
export async function syncProjectRemotes(projectId: string, remotes: Remote[]): Promise<void> {
  if (remotes.length === 0) {
    await db.delete(projectRemotes).where(eq(projectRemotes.projectId, projectId));
    return;
  }

  const values = remotes.map((r) => ({
    projectId,
    remoteName: r.name,
    remoteUrl: isGitHubUrl(r.url) ? normalizeGitHubUrl(r.url) : r.url,
  }));

  await db
    .insert(projectRemotes)
    .values(values)
    .onConflictDoUpdate({
      target: [projectRemotes.projectId, projectRemotes.remoteName],
      set: { remoteUrl: sql`excluded.remote_url` },
    });

  await db.delete(projectRemotes).where(
    and(
      eq(projectRemotes.projectId, projectId),
      notInArray(
        projectRemotes.remoteName,
        remotes.map((r) => r.name)
      )
    )
  );
}

/** Return all remote URLs currently stored for a project. */
export async function getProjectRemoteUrls(projectId: string): Promise<string[]> {
  const rows = await db
    .select({ remoteUrl: projectRemotes.remoteUrl })
    .from(projectRemotes)
    .where(eq(projectRemotes.projectId, projectId));
  return rows.map((r) => r.remoteUrl);
}
