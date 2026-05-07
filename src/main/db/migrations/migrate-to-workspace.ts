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
 * - Set workspaceId on existing Tasks (based on their projectId)
 * - Create task_projects entries linking Tasks to Projects
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

  // Get all existing tasks
  const allTasks = await db.select().from(tasks);

  for (const project of allProjects) {
    // Create a workspace for each existing project
    const workspaceId = randomUUID();

    await db.insert(workspaces).values({
      id: workspaceId,
      name: project.name,
      workDir: null,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });

    // Link project to workspace
    await db.insert(workspaceProjects).values({
      workspaceId,
      projectId: project.id,
      addedAt: project.createdAt,
    });

    // Update tasks for this project - set workspaceId and create task_projects entries
    const projectTasks = allTasks.filter((task) => task.projectId === project.id);

    for (const task of projectTasks) {
      // Set workspaceId on task
      await db.update(tasks).set({ workspaceId }).where(eq(tasks.id, task.id));

      // Link task to project via task_projects
      await db.insert(taskProjects).values({
        taskId: task.id,
        projectId: project.id,
      });
    }
  }

  console.log(`Migrated ${allProjects.length} projects to workspaces`);
  console.log(`Updated ${allTasks.length} tasks with workspace associations`);
}
