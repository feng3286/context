import { eq } from 'drizzle-orm';
import type { LocalProject, Project, SshProject } from '@shared/projects';
import type { TaskProjectContext } from '@shared/task-projects';
import { db } from '@main/db/client';
import { projects, taskProjects } from '@main/db/schema';

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

export async function getTaskProjectContexts(taskId: string): Promise<TaskProjectContext[]> {
  const rows = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      sourceBranch: taskProjects.sourceBranch,
    })
    .from(taskProjects)
    .innerJoin(projects, eq(taskProjects.projectId, projects.id))
    .where(eq(taskProjects.taskId, taskId));

  return rows.map((row) => ({
    projectId: row.projectId,
    projectName: row.projectName,
    worktreePath: null,
    sourceBranch: row.sourceBranch,
  }));
}
