import { eq } from 'drizzle-orm';
import type { LocalProject, Project, SshProject } from '@shared/projects';
import { db } from '@main/db/client';
import { projects, workspaceProjects } from '@main/db/schema';

export async function getWorkspaceProjects(workspaceId: string): Promise<Project[]> {
  const rows = await db
    .select({ project: projects })
    .from(workspaceProjects)
    .innerJoin(projects, eq(workspaceProjects.projectId, projects.id))
    .where(eq(workspaceProjects.workspaceId, workspaceId));

  return rows.map((row) =>
    row.project.workspaceProvider === 'local'
      ? ({
          type: 'local' as const,
          id: row.project.id,
          name: row.project.name,
          path: row.project.path,
          baseRef: row.project.baseRef ?? 'main',
          createdAt: row.project.createdAt,
          updatedAt: row.project.updatedAt,
        } satisfies LocalProject)
      : ({
          type: 'ssh' as const,
          id: row.project.id,
          name: row.project.name,
          path: row.project.path,
          baseRef: row.project.baseRef ?? 'main',
          connectionId: row.project.sshConnectionId!,
          createdAt: row.project.createdAt,
          updatedAt: row.project.updatedAt,
        } satisfies SshProject)
  );
}
