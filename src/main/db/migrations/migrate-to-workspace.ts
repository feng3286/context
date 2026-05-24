import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../client';
import { projects, taskProjects, tasks, workspaceProjects, workspaces } from '../schema';

/**
 * Data migration to convert existing Projects into Workspaces.
 * This runs after the schema migration (0007_add_workspace.sql) completes.
 *
 * Migration strategy:
 * - Create a Workspace for each existing Project (1:1 mapping)
 * - Link each Project to its corresponding Workspace via workspace_projects
 * - Set workspaceId on existing Tasks (based on their project-task_projects relationship)
 * - Create task_projects entries linking Tasks to Projects
 *
 * NOTE: This migration is a no-op if projectId column has been removed (post-0014).
 */
export async function migrateToWorkspace(): Promise<void> {
  // Check if migration already done by checking for existing workspaces
  const existingWorkspaces = await db.select().from(workspaces).limit(1);
  if (existingWorkspaces.length > 0) {
    console.log('Workspace migration already complete');
    return;
  }

  console.log('Starting workspace migration...');

  // Get all existing projects
  const allProjects = await db.select().from(projects);

  if (allProjects.length === 0) {
    console.log('No projects to migrate');
    return;
  }

  // Get all existing tasks with their project associations via task_projects
  const allTasks = await db.select().from(tasks);
  const taskProjectRows = await db.select().from(taskProjects).execute();
  const taskToProjects = new Map<string, string[]>();
  for (const tp of taskProjectRows) {
    const projects = taskToProjects.get(tp.taskId) ?? [];
    projects.push(tp.projectId);
    taskToProjects.set(tp.taskId, projects);
  }

  for (const project of allProjects) {
    // Create a workspace for each existing project
    const workspaceId = randomUUID();

    await db.insert(workspaces).values({
      id: workspaceId,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });

    // Link project to workspace
    await db.insert(workspaceProjects).values({
      workspaceId,
      projectId: project.id,
      addedAt: project.createdAt,
    });

    // Find tasks associated with this project via task_projects
    const projectTaskIds = allTasks
      .filter((task) => taskToProjects.get(task.id)?.includes(project.id))
      .map((t) => t.id);

    for (const taskId of projectTaskIds) {
      // Set workspaceId on task
      await db.update(tasks).set({ workspaceId }).where(eq(tasks.id, taskId));
    }
  }

  console.log(`Migrated ${allProjects.length} projects to workspaces`);
  console.log(`Updated tasks with workspace associations`);
}
