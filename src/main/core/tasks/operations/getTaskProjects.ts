import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects, projects } from '@main/db/schema';
import type { LocalProject, SshProject } from '@shared/projects';
import type { Project } from '@shared/projects';

export async function getTaskProjects(taskId: string): Promise<Project[]> {
  const rows = await db
    .select({ project: projects })
    .from(taskProjects)
    .innerJoin(projects, eq(taskProjects.projectId, projects.id))
    .where(eq(taskProjects.taskId, taskId));

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