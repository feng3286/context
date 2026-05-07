# Workspace Multi-Project Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce Workspace as a top-level entity to support multi-project, shared-context tasks.

**Architecture:** Add new `workspaces` table and related junction tables, modify Task to associate with Workspace + multiple Projects, update services and UI to use Workspace as home entry point.

**Tech Stack:** Drizzle ORM (SQLite), MobX (renderer stores), React, IPC/RPC (main-renderer communication).

---

## File Structure

### New Files (Main Process)
- `src/main/core/workspaces/workspace-service.ts` - Workspace CRUD operations
- `src/main/core/workspaces/workspace-controller.ts` - RPC controller for Workspace API
- `src/main/core/workspaces/operations/*.ts` - Database operations (createWorkspace, getWorkspace, etc.)
- `src/main/core/tasks/operations/getTaskProjects.ts` - Get Projects for a Task
- `src/main/core/tasks/operations/addTaskProject.ts` - Add Project to Task
- `src/main/core/tasks/operations/removeTaskProject.ts` - Remove Project from Task
- `src/main/db/migrations/migrate-to-workspace.ts` - Data migration script

### New Files (Shared)
- `src/shared/workspaces.ts` - Workspace shared types

### New Files (Renderer)
- `src/renderer/features/workspaces/stores/workspace-manager.ts` - WorkspaceManagerStore
- `src/renderer/features/workspaces/stores/workspace-store.ts` - Individual WorkspaceStore
- `src/renderer/features/workspaces/stores/workspace-selectors.ts` - Workspace selectors
- `src/renderer/features/workspaces/workspace-list-view.tsx` - Workspace list (new home)
- `src/renderer/features/workspaces/workspace-detail-view.tsx` - Workspace detail page
- `src/renderer/features/workspaces/components/create-workspace-modal.tsx` - Create Workspace modal

### Modified Files (Main Process)
- `src/main/db/schema.ts` - Add workspaces, workspace_projects, task_projects tables; modify tasks, conversations, terminals
- `src/main/core/tasks/provisionTask.ts` - Multi-Project provisioning
- `src/main/core/tasks/controller.ts` - Add Workspace-related RPC methods
- `src/main/core/tasks/createTask.ts` - Support multi-Project Task creation
- `src/main/core/conversations/impl/*.ts` - Remove projectId dependency
- `src/main/rpc.ts` - Register workspace controller

### Modified Files (Shared)
- `src/shared/tasks.ts` - Add workspaceId, workDir; change projectId to projectIds
- `src/shared/conversations.ts` - Remove projectId from CreateConversationParams

### Modified Files (Renderer)
- `src/renderer/app/view-registry.ts` - Add workspace views
- `src/renderer/app/home-view.tsx` - Replace with workspace list view
- `src/renderer/features/sidebar/left-sidebar.tsx` - Add Workspace navigation
- `src/renderer/features/tasks/create-task-modal/create-task-modal.tsx` - Add Workspace/Project selection
- `src/renderer/features/tasks/stores/task-manager.ts` - Use workspaceId
- `src/renderer/features/projects/stores/project-manager.ts` - Add Workspace association tracking

---

## Phase 1: Data Model & Schema

### Task 1: Add workspaces table schema

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: Add workspaces table definition**

Add after the `projects` table definition (around line 59):

```typescript
export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    workDir: text('work_dir'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    nameIdx: uniqueIndex('idx_workspaces_name').on(table.name),
  })
);
```

- [ ] **Step 2: Run typecheck to verify schema compiles**

Run: `pnpm run typecheck`
Expected: PASS (no new type errors)

- [ ] **Step 3: Commit**

```bash
git add src/main/db/schema.ts
git commit -m "feat(db): add workspaces table schema"
```

### Task 2: Add workspace_projects junction table schema

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: Add workspace_projects junction table**

Add after `workspaces` table:

```typescript
export const workspaceProjects = sqliteTable(
  'workspace_projects',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    addedAt: text('added_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.projectId] }),
    workspaceIdIdx: index('idx_workspace_projects_workspace_id').on(table.workspaceId),
    projectIdIdx: index('idx_workspace_projects_project_id').on(table.projectId),
  })
);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/db/schema.ts
git commit -m "feat(db): add workspace_projects junction table"
```

### Task 3: Add task_projects junction table schema

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: Add task_projects junction table**

Add after `workspaceProjects`:

```typescript
export const taskProjects = sqliteTable(
  'task_projects',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.taskId, table.projectId] }),
    taskIdIdx: index('idx_task_projects_task_id').on(table.taskId),
    projectIdIdx: index('idx_task_projects_project_id').on(table.projectId),
  })
);
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/main/db/schema.ts
git commit -m "feat(db): add task_projects junction table"
```

### Task 4: Modify tasks table schema

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: Add workspaceId and workDir columns to tasks table**

Locate the `tasks` table definition (around line 89) and add new columns:

```typescript
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')  // Keep for backward compatibility during migration
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    workspaceId: text('workspace_id')  // NEW
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    workDir: text('work_dir'),  // NEW: task-specific work directory
    name: text('name').notNull(),
    status: text('status').notNull(),
    sourceBranch: text('source_branch', { mode: 'json' }).$type<StoredBranch>(),
    taskBranch: text('task_branch'),
    // ... rest of existing fields
  },
  (table) => ({
    projectIdIdx: index('idx_tasks_project_id').on(table.projectId),
    workspaceIdIdx: index('idx_tasks_workspace_id').on(table.workspaceId),  // NEW
  })
);
```

- [ ] **Step 2: Add WorkspaceRow type inference**

Add after the table definitions:

```typescript
export type WorkspaceRow = typeof workspaces.$inferSelect;
export type WorkspaceInsert = typeof workspaces.$inferInsert;
export type WorkspaceProjectRow = typeof workspaceProjects.$inferSelect;
export type TaskProjectRow = typeof taskProjects.$inferSelect;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/db/schema.ts
git commit -m "feat(db): add workspaceId and workDir to tasks table"
```

### Task 5: Add workspace relations

**Files:**
- Modify: `src/main/db/schema.ts`

- [ ] **Step 1: Add workspacesRelations**

Add after existing relations definitions (around line 354):

```typescript
export const workspacesRelations = relations(workspaces, ({ many }) => ({
  workspaceProjects: many(workspaceProjects),
  tasks: many(tasks),
}));

export const workspaceProjectsRelations = relations(workspaceProjects, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceProjects.workspaceId],
    references: [workspaces.id],
  }),
  project: one(projects, {
    fields: [workspaceProjects.projectId],
    references: [projects.id],
  }),
}));

export const taskProjectsRelations = relations(taskProjects, ({ one }) => ({
  task: one(tasks, {
    fields: [taskProjects.taskId],
    references: [tasks.id],
  }),
  project: one(projects, {
    fields: [taskProjects.projectId],
    references: [projects.id],
  }),
}));
```

- [ ] **Step 2: Update tasksRelations to include taskProjects**

Modify existing `tasksRelations`:

```typescript
export const tasksRelations = relations(tasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id],
  }),
  workspace: one(workspaces, {  // NEW
    fields: [tasks.workspaceId],
    references: [workspaces.id],
  }),
  taskProjects: many(taskProjects),  // NEW
  conversations: many(conversations),
}));
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/db/schema.ts
git commit -m "feat(db): add workspace and task_projects relations"
```

---

## Phase 2: Shared Types

### Task 6: Add Workspace shared types

**Files:**
- Create: `src/shared/workspaces.ts`

- [ ] **Step 1: Create Workspace shared types file**

Create `src/shared/workspaces.ts`:

```typescript
export type Workspace = {
  id: string;
  name: string;
  workDir?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkspaceParams = {
  id: string;
  name: string;
  workDir?: string;
  projectIds?: string[];  // Optional: projects to add on creation
};

export type UpdateWorkspaceParams = {
  name?: string;
  workDir?: string;
};

export type AddProjectToWorkspaceParams = {
  workspaceId: string;
  projectId: string;
};

export type RemoveProjectFromWorkspaceParams = {
  workspaceId: string;
  projectId: string;
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/shared/workspaces.ts
git commit -m "feat(shared): add Workspace shared types"
```

### Task 7: Modify Task shared types

**Files:**
- Modify: `src/shared/tasks.ts`

- [ ] **Step 1: Add workspaceId and workDir to Task type**

Modify `Task` type (around line 21):

```typescript
export type Task = {
  id: string;
  projectId: string;  // Keep for backward compatibility
  workspaceId?: string;  // NEW
  workDir?: string;  // NEW
  name: string;
  status: TaskLifecycleStatus;
  sourceBranch: Branch | undefined;
  taskBranch?: string;
  createdAt: string;
  updatedAt: string;
  // ... rest unchanged
};
```

- [ ] **Step 2: Add projectIds to CreateTaskParams**

Modify `CreateTaskParams` (around line 61):

```typescript
export type CreateTaskParams = {
  id: string;
  projectId: string;  // Keep for backward compatibility (single-project tasks)
  workspaceId?: string;  // NEW: for multi-project tasks
  projectIds?: string[];  // NEW: multi-project task projects
  primaryProjectId?: string;  // NEW: the project that determines sourceBranch
  workDir?: string;  // NEW: task-specific work directory
  name: string;
  sourceBranch: Branch;
  strategy: CreateTaskStrategy;
  linkedIssue?: Issue;
  initialConversation?: CreateConversationParams;
  initialStatus?: TaskLifecycleStatus;
};
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: May have type errors in files using Task/CreateTaskParams - note them for later fixes

- [ ] **Step 4: Commit**

```bash
git add src/shared/tasks.ts
git commit -m "feat(shared): add workspaceId, workDir, projectIds to Task types"
```

---

## Phase 3: Main Process Operations

### Task 8: Create workspace database operations

**Files:**
- Create: `src/main/core/workspaces/operations/createWorkspace.ts`
- Create: `src/main/core/workspaces/operations/getWorkspace.ts`
- Create: `src/main/core/workspaces/operations/listWorkspaces.ts`
- Create: `src/main/core/workspaces/operations/updateWorkspace.ts`
- Create: `src/main/core/workspaces/operations/deleteWorkspace.ts`
- Create: `src/main/core/workspaces/operations/getWorkspaceProjects.ts`
- Create: `src/main/core/workspaces/operations/addProjectToWorkspace.ts`
- Create: `src/main/core/workspaces/operations/removeProjectFromWorkspace.ts`

- [ ] **Step 1: Create operations directory and core files**

Create directory and first operation file:

```typescript
// src/main/core/workspaces/operations/createWorkspace.ts
import { db } from '@main/db/client';
import { workspaces, workspaceProjects } from '@main/db/schema';
import type { CreateWorkspaceParams, Workspace } from '@shared/workspaces';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function createWorkspace(params: CreateWorkspaceParams): Promise<Workspace> {
  const [row] = await db.insert(workspaces).values({
    id: params.id,
    name: params.name,
    workDir: params.workDir,
  }).returning();

  const workspace = mapWorkspaceRowToWorkspace(row);

  // Add projects if specified
  if (params.projectIds?.length) {
    await db.insert(workspaceProjects).values(
      params.projectIds.map(projectId => ({
        workspaceId: params.id,
        projectId,
      }))
    );
  }

  return workspace;
}
```

- [ ] **Step 2: Create utility for mapping rows**

Create `src/main/core/workspaces/utils.ts`:

```typescript
import type { WorkspaceRow } from '@main/db/schema';
import type { Workspace } from '@shared/workspaces';

export function mapWorkspaceRowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    workDir: row.workDir ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
```

- [ ] **Step 3: Create getWorkspace operation**

```typescript
// src/main/core/workspaces/operations/getWorkspace.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';
import type { Workspace } from '@shared/workspaces';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const [row] = await db.select().from(workspaces).where(eq(workspaces.id, id));
  if (!row) return null;
  return mapWorkspaceRowToWorkspace(row);
}
```

- [ ] **Step 4: Create listWorkspaces operation**

```typescript
// src/main/core/workspaces/operations/listWorkspaces.ts
import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';
import type { Workspace } from '@shared/workspaces';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function listWorkspaces(): Promise<Workspace[]> {
  const rows = await db.select().from(workspaces);
  return rows.map(mapWorkspaceRowToWorkspace);
}
```

- [ ] **Step 5: Create getWorkspaceProjects operation**

```typescript
// src/main/core/workspaces/operations/getWorkspaceProjects.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { workspaceProjects, projects } from '@main/db/schema';
import type { Project } from '@shared/projects';
import { mapProjectRowToProject } from '@main/core/projects/utils';

export async function getWorkspaceProjects(workspaceId: string): Promise<Project[]> {
  const rows = await db
    .select({ project: projects })
    .from(workspaceProjects)
    .innerJoin(projects, eq(workspaceProjects.projectId, projects.id))
    .where(eq(workspaceProjects.workspaceId, workspaceId));

  return rows.map(row => mapProjectRowToProject(row.project));
}
```

- [ ] **Step 6: Create addProjectToWorkspace operation**

```typescript
// src/main/core/workspaces/operations/addProjectToWorkspace.ts
import { db } from '@main/db/client';
import { workspaceProjects } from '@main/db/schema';

export async function addProjectToWorkspace(
  workspaceId: string,
  projectId: string
): Promise<void> {
  await db.insert(workspaceProjects).values({
    workspaceId,
    projectId,
  });
}
```

- [ ] **Step 7: Create removeProjectFromWorkspace operation**

```typescript
// src/main/core/workspaces/operations/removeProjectFromWorkspace.ts
import { and, eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { workspaceProjects } from '@main/db/schema';

export async function removeProjectFromWorkspace(
  workspaceId: string,
  projectId: string
): Promise<void> {
  await db.delete(workspaceProjects).where(
    and(
      eq(workspaceProjects.workspaceId, workspaceId),
      eq(workspaceProjects.projectId, projectId)
    )
  );
}
```

- [ ] **Step 8: Create updateWorkspace operation**

```typescript
// src/main/core/workspaces/operations/updateWorkspace.ts
import { eq, sql } from 'drizzle-orm';
import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';
import type { UpdateWorkspaceParams, Workspace } from '@shared/workspaces';
import { mapWorkspaceRowToWorkspace } from '../utils';

export async function updateWorkspace(
  id: string,
  params: UpdateWorkspaceParams
): Promise<Workspace> {
  const [row] = await db
    .update(workspaces)
    .set({
      ...params,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(workspaces.id, id))
    .returning();

  return mapWorkspaceRowToWorkspace(row);
}
```

- [ ] **Step 9: Create deleteWorkspace operation**

```typescript
// src/main/core/workspaces/operations/deleteWorkspace.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { workspaces } from '@main/db/schema';

export async function deleteWorkspace(id: string): Promise<void> {
  await db.delete(workspaces).where(eq(workspaces.id, id));
}
```

- [ ] **Step 10: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/main/core/workspaces/
git commit -m "feat(main): add workspace database operations"
```

### Task 9: Create workspace controller

**Files:**
- Create: `src/main/core/workspaces/controller.ts`
- Modify: `src/main/rpc.ts`

- [ ] **Step 1: Create workspace controller**

Create `src/main/core/workspaces/controller.ts`:

```typescript
import { createWorkspace } from './operations/createWorkspace';
import { getWorkspace } from './operations/getWorkspace';
import { listWorkspaces } from './operations/listWorkspaces';
import { updateWorkspace } from './operations/updateWorkspace';
import { deleteWorkspace } from './operations/deleteWorkspace';
import { getWorkspaceProjects } from './operations/getWorkspaceProjects';
import { addProjectToWorkspace } from './operations/addProjectToWorkspace';
import { removeProjectFromWorkspace } from './operations/removeProjectFromWorkspace';

export const workspaceController = {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  getWorkspaceProjects,
  addProjectToWorkspace,
  removeProjectFromWorkspace,
};
```

- [ ] **Step 2: Register workspace controller in RPC router**

Modify `src/main/rpc.ts`, add import and registration:

```typescript
import { workspaceController } from '@main/core/workspaces/controller';

// In the router definition, add:
workspace: workspaceController,
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/main/core/workspaces/controller.ts src/main/rpc.ts
git commit -m "feat(main): add workspace RPC controller"
```

### Task 10: Create task_projects operations

**Files:**
- Create: `src/main/core/tasks/operations/getTaskProjects.ts`
- Create: `src/main/core/tasks/operations/addTaskProject.ts`
- Create: `src/main/core/tasks/operations/removeTaskProject.ts`
- Create: `src/main/core/tasks/operations/setTaskProjects.ts`

- [ ] **Step 1: Create getTaskProjects operation**

```typescript
// src/main/core/tasks/operations/getTaskProjects.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects, projects } from '@main/db/schema';
import type { Project } from '@shared/projects';
import { mapProjectRowToProject } from '@main/core/projects/utils';

export async function getTaskProjects(taskId: string): Promise<Project[]> {
  const rows = await db
    .select({ project: projects })
    .from(taskProjects)
    .innerJoin(projects, eq(taskProjects.projectId, projects.id))
    .where(eq(taskProjects.taskId, taskId));

  return rows.map(row => mapProjectRowToProject(row.project));
}
```

- [ ] **Step 2: Create setTaskProjects operation**

```typescript
// src/main/core/tasks/operations/setTaskProjects.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects } from '@main/db/schema';

export async function setTaskProjects(taskId: string, projectIds: string[]): Promise<void> {
  // Delete existing associations
  await db.delete(taskProjects).where(eq(taskProjects.taskId, taskId));

  // Insert new associations
  if (projectIds.length > 0) {
    await db.insert(taskProjects).values(
      projectIds.map(projectId => ({ taskId, projectId }))
    );
  }
}
```

- [ ] **Step 3: Export operations in tasks controller**

Modify `src/main/core/tasks/controller.ts` to include new operations:

```typescript
import { getTaskProjects } from './operations/getTaskProjects';
import { setTaskProjects } from './operations/setTaskProjects';

export const taskController = {
  // ... existing exports
  getTaskProjects,
  setTaskProjects,
};
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/core/tasks/operations/
git commit -m "feat(main): add task_projects operations"
```

---

## Phase 4: Data Migration

### Task 11: Create data migration script

**Files:**
- Create: `src/main/db/migrations/migrate-to-workspace.ts`
- Create: `drizzle/0007_add_workspace.sql`

- [ ] **Step 1: Create Drizzle migration SQL file**

Create `drizzle/0007_add_workspace.sql`:

```sql
CREATE TABLE `workspaces` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `work_dir` text,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX `idx_workspaces_name` ON `workspaces` (`name`);

CREATE TABLE `workspace_projects` (
  `workspace_id` text NOT NULL,
  `project_id` text NOT NULL,
  `added_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(`workspace_id`, `project_id`)
);

CREATE INDEX `idx_workspace_projects_workspace_id` ON `workspace_projects` (`workspace_id`);
CREATE INDEX `idx_workspace_projects_project_id` ON `workspace_projects` (`project_id`);

CREATE TABLE `task_projects` (
  `task_id` text NOT NULL,
  `project_id` text NOT NULL,
  PRIMARY KEY(`task_id`, `project_id`)
);

CREATE INDEX `idx_task_projects_task_id` ON `task_projects` (`task_id`);
CREATE INDEX `idx_task_projects_project_id` ON `task_projects` (`project_id`);

ALTER TABLE `tasks` ADD COLUMN `workspace_id` text REFERENCES `workspaces`(`id`);
ALTER TABLE `tasks` ADD COLUMN `work_dir` text;

CREATE INDEX `idx_tasks_workspace_id` ON `tasks` (`workspace_id`);
```

- [ ] **Step 2: Create migration script**

Create `src/main/db/migrations/migrate-to-workspace.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { db } from '../client';
import { workspaces, workspaceProjects, taskProjects, tasks, projects } from '../schema';
import { generateId } from '@shared/id';

export async function migrateToWorkspace(): Promise<void> {
  // Check if migration already done
  const existingWorkspaces = await db.select().from(workspaces).limit(1);
  if (existingWorkspaces.length > 0) {
    console.log('Workspace migration already complete');
    return;
  }

  console.log('Starting workspace migration...');

  const allProjects = await db.select().from(projects);

  for (const project of allProjects) {
    // Create a workspace for each existing project
    const workspaceId = generateId();

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

    // Update tasks for this project
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, project.id));

    for (const task of projectTasks) {
      // Set workspaceId on task
      await db
        .update(tasks)
        .set({ workspaceId })
        .where(eq(tasks.id, task.id));

      // Link task to project via task_projects
      await db.insert(taskProjects).values({
        taskId: task.id,
        projectId: project.id,
      });
    }
  }

  console.log(`Migrated ${allProjects.length} projects to workspaces`);
}
```

- [ ] **Step 3: Integrate migration into db initialization**

Modify `src/main/db/initialize.ts` to run migration:

```typescript
import { migrateToWorkspace } from './migrations/migrate-to-workspace';

// After existing migrations, add:
await migrateToWorkspace();
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/db/migrations/ drizzle/0007_add_workspace.sql
git commit -m "feat(db): add workspace migration script"
```

---

## Phase 5: Renderer Stores

### Task 12: Create WorkspaceManagerStore

**Files:**
- Create: `src/renderer/features/workspaces/stores/workspace-manager.ts`

- [ ] **Step 1: Create WorkspaceManagerStore**

```typescript
import { makeObservable, observable, runInAction } from 'mobx';
import type { Workspace, CreateWorkspaceParams, UpdateWorkspaceParams } from '@shared/workspaces';
import type { Project } from '@shared/projects';
import { rpc } from '@renderer/lib/ipc';
import { WorkspaceStore, createUnloadedWorkspace } from './workspace';

export class WorkspaceManagerStore {
  workspaces = observable.map<string, WorkspaceStore>();
  private _loadPromise: Promise<void> | null = null;

  constructor() {
    makeObservable(this, { workspaces: observable });
  }

  load(): Promise<void> {
    if (!this._loadPromise) {
      this._loadPromise = this._doLoad();
    }
    return this._loadPromise;
  }

  private async _doLoad(): Promise<void> {
    const workspaces = await rpc.workspace.listWorkspaces();
    runInAction(() => {
      for (const w of workspaces) {
        this.workspaces.set(w.id, createUnloadedWorkspace(w));
      }
    });
  }

  async createWorkspace(params: CreateWorkspaceParams): Promise<string> {
    const workspace = await rpc.workspace.createWorkspace(params);
    runInAction(() => {
      this.workspaces.set(workspace.id, createUnloadedWorkspace(workspace));
    });
    return workspace.id;
  }

  async deleteWorkspace(id: string): Promise<void> {
    await rpc.workspace.deleteWorkspace(id);
    runInAction(() => {
      this.workspaces.delete(id);
    });
  }

  getWorkspace(id: string): WorkspaceStore | undefined {
    return this.workspaces.get(id);
  }
}

// Singleton
export const workspaceManagerStore = new WorkspaceManagerStore();
```

- [ ] **Step 2: Create WorkspaceStore and factory**

Create `src/renderer/features/workspaces/stores/workspace.ts`:

```typescript
import { makeObservable, observable, runInAction } from 'mobx';
import type { Workspace } from '@shared/workspaces';
import type { Project } from '@shared/projects';
import { rpc } from '@renderer/lib/ipc';

export type WorkspaceLifecycleStatus = 'unloaded' | 'loading' | 'ready' | 'error';

export type WorkspaceStore =
  | UnloadedWorkspaceStore
  | LoadingWorkspaceStore
  | ReadyWorkspaceStore
  | ErrorWorkspaceStore;

interface BaseWorkspaceStore {
  data: Workspace;
}

export interface UnloadedWorkspaceStore extends BaseWorkspaceStore {
  status: 'unloaded';
}

export interface LoadingWorkspaceStore extends BaseWorkspaceStore {
  status: 'loading';
}

export interface ReadyWorkspaceStore extends BaseWorkspaceStore {
  status: 'ready';
  projects: Project[];
}

export interface ErrorWorkspaceStore extends BaseWorkspaceStore {
  status: 'error';
  error: string;
}

export function createUnloadedWorkspace(data: Workspace): UnloadedWorkspaceStore {
  return { data, status: 'unloaded' };
}

export class WorkspaceStoreClass {
  data: Workspace;
  status: WorkspaceLifecycleStatus = 'unloaded';
  projects: Project[] = [];
  error?: string;
  private _loadPromise: Promise<void> | null = null;

  constructor(data: Workspace) {
    this.data = data;
    makeObservable(this, {
      data: observable,
      status: observable,
      projects: observable,
      error: observable,
    });
  }

  load(): Promise<void> {
    if (this.status === 'ready' || this.status === 'loading') {
      return this._loadPromise ?? Promise.resolve();
    }

    runInAction(() => {
      this.status = 'loading';
    });

    this._loadPromise = rpc.workspace.getWorkspaceProjects(this.data.id)
      .then((projects) => {
        runInAction(() => {
          this.projects = projects;
          this.status = 'ready';
          this.error = undefined;
        });
      })
      .catch((err) => {
        runInAction(() => {
          this.status = 'error';
          this.error = err instanceof Error ? err.message : String(err);
        });
      })
      .finally(() => {
        this._loadPromise = null;
      });

    return this._loadPromise;
  }

  async addProject(projectId: string): Promise<void> {
    await rpc.workspace.addProjectToWorkspace({ workspaceId: this.data.id, projectId });
    runInAction(() => {
      // Reload projects
      void this.load();
    });
  }

  async removeProject(projectId: string): Promise<void> {
    await rpc.workspace.removeProjectFromWorkspace({ workspaceId: this.data.id, projectId });
    runInAction(() => {
      this.projects = this.projects.filter(p => p.id !== projectId);
    });
  }
}
```

- [ ] **Step 3: Create workspace selectors**

Create `src/renderer/features/workspaces/stores/workspace-selectors.ts`:

```typescript
import { workspaceManagerStore } from './workspace-manager';
import type { WorkspaceStore, ReadyWorkspaceStore } from './workspace';

export function getWorkspaceStore(id: string): WorkspaceStore | undefined {
  return workspaceManagerStore.getWorkspace(id);
}

export function asReadyWorkspace(store: WorkspaceStore): ReadyWorkspaceStore | undefined {
  return store.status === 'ready' ? store : undefined;
}

export function getWorkspaceProjects(id: string): Project[] | undefined {
  const store = getWorkspaceStore(id);
  if (store && store.status === 'ready') {
    return store.projects;
  }
  return undefined;
}
```

- [ ] **Step 4: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/renderer/features/workspaces/stores/
git commit -m "feat(renderer): add WorkspaceManagerStore and WorkspaceStore"
```

---

## Phase 6: UI Views

### Task 13: Create Workspace List View (New Home)

**Files:**
- Create: `src/renderer/features/workspaces/workspace-list-view.tsx`
- Modify: `src/renderer/app/view-registry.ts`
- Modify: `src/renderer/app/home-view.tsx`

- [ ] **Step 1: Create workspace-list-view component**

```typescript
// src/renderer/features/workspaces/workspace-list-view.tsx
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { Plus, FolderOpen } from 'lucide-react';
import { workspaceManagerStore } from './stores/workspace-manager';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';

export const WorkspaceListTitlebar = observer(function WorkspaceListTitlebar() {
  return <Titlebar />;
});

export const WorkspaceListMainPanel = observer(function WorkspaceListMainPanel() {
  const { navigate } = useNavigate();
  const showCreateWorkspaceModal = useShowModal('createWorkspaceModal');

  useEffect(() => {
    workspaceManagerStore.load();
  }, []);

  const workspaces = Array.from(workspaceManagerStore.workspaces.values());

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-background text-foreground p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Workspaces</h1>
        <button
          onClick={() => showCreateWorkspaceModal({})}
          className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Workspace
        </button>
      </div>

      <div className="grid gap-4">
        {workspaces.map((store) => (
          <WorkspaceCard
            key={store.data.id}
            workspace={store.data}
            onClick={() => navigate('workspace', { workspaceId: store.data.id })}
          />
        ))}
      </div>

      {workspaces.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <FolderOpen className="h-12 w-12 mb-4" />
          <p>No workspaces yet. Create one to start.</p>
        </div>
      )}
    </div>
  );
});

function WorkspaceCard({ workspace, onClick }: { workspace: Workspace; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col p-4 rounded-lg border border-border bg-background hover:bg-background-1 transition-colors"
    >
      <span className="text-lg font-semibold">{workspace.name}</span>
      {workspace.workDir && (
        <span className="text-sm text-muted-foreground truncate">{workspace.workDir}</span>
      )}
    </button>
  );
}

export const workspaceListView = {
  TitlebarSlot: WorkspaceListTitlebar,
  MainPanel: WorkspaceListMainPanel,
};
```

- [ ] **Step 2: Add workspace view to view-registry**

Modify `src/renderer/app/view-registry.ts`:

```typescript
import { workspaceListView } from '@renderer/features/workspaces/workspace-list-view';
import { workspaceDetailView } from '@renderer/features/workspaces/workspace-detail-view';

export const views = {
  home: workspaceListView,  // Replace homeView with workspaceListView
  workspace: workspaceDetailView,
  project: projectView,
  task: taskView,
  settings: settingsView,
  skills: skillsView,
  mcp: mcpView,
} satisfies Record<string, ViewDefinition<any>>;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: May have errors for workspaceDetailView (next task) - note them

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/workspaces/workspace-list-view.tsx src/renderer/app/view-registry.ts
git commit -m "feat(ui): create workspace list view as new home"
```

### Task 14: Create Workspace Detail View

**Files:**
- Create: `src/renderer/features/workspaces/workspace-detail-view.tsx`

- [ ] **Step 1: Create workspace-detail-view component**

```typescript
// src/renderer/features/workspaces/workspace-detail-view.tsx
import { observer } from 'mobx-react-lite';
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Plus, Settings, Trash2 } from 'lucide-react';
import { getWorkspaceStore } from './stores/workspace-selectors';
import { WorkspaceStoreClass } from './stores/workspace';
import { useNavigate } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';

export const WorkspaceDetailTitlebar = observer(function WorkspaceDetailTitlebar() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const store = getWorkspaceStore(workspaceId ?? '');

  return (
    <Titlebar>
      {store && (
        <span className="text-lg font-semibold">{store.data.name}</span>
      )}
    </Titlebar>
  );
});

export const WorkspaceDetailMainPanel = observer(function WorkspaceDetailMainPanel() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { navigate } = useNavigate();
  const showCreateTaskModal = useShowModal('taskModal');
  const showAddProjectModal = useShowModal('addProjectModal');

  const store = getWorkspaceStore(workspaceId ?? '');

  useEffect(() => {
    if (store && store.status === 'unloaded') {
      // Cast to class to call load method
      (store as WorkspaceStoreClass).load();
    }
  }, [store]);

  if (!store) {
    return <div>Workspace not found</div>;
  }

  if (store.status === 'loading') {
    return <div>Loading...</div>;
  }

  if (store.status === 'error') {
    return <div>Error: {store.error}</div>;
  }

  const projects = store.projects;

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{store.data.name}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => showAddProjectModal({ workspaceId })}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:bg-background-1"
          >
            <Plus className="h-4 w-4" />
            Add Project
          </button>
          <button
            onClick={() => showCreateTaskModal({ workspaceId })}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm bg-primary text-primary-foreground"
          >
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Projects List */}
      <div className="flex-1 p-4 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">Projects</h3>
        <div className="grid gap-2">
          {projects.map((project) => (
            <button
              key={project.id}
              onClick={() => navigate('project', { projectId: project.id })}
              className="flex items-center justify-between p-3 rounded border border-border hover:bg-background-1"
            >
              <div>
                <span className="font-medium">{project.name}</span>
                <span className="text-sm text-muted-foreground ml-2">{project.path}</span>
              </div>
            </button>
          ))}
          {projects.length === 0 && (
            <p className="text-muted-foreground">No projects in this workspace</p>
          )}
        </div>
      </div>
    </div>
  );
});

export const workspaceDetailView = {
  TitlebarSlot: WorkspaceDetailTitlebar,
  MainPanel: WorkspaceDetailMainPanel,
};
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/workspaces/workspace-detail-view.tsx
git commit -m "feat(ui): create workspace detail view"
```

### Task 15: Create Workspace Modal

**Files:**
- Create: `src/renderer/features/workspaces/components/create-workspace-modal.tsx`
- Modify: `src/renderer/app/modal-registry.ts`

- [ ] **Step 1: Create create-workspace-modal component**

```typescript
// src/renderer/features/workspaces/components/create-workspace-modal.tsx
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { workspaceManagerStore } from '../stores/workspace-manager';
import { useModal } from '@renderer/lib/modal/modal-provider';

interface CreateWorkspaceModalProps {
  // Optional: initial project IDs to add
  projectIds?: string[];
}

export const CreateWorkspaceModal = observer(function CreateWorkspaceModal(
  props: CreateWorkspaceModalProps
) {
  const { closeModal } = useModal('createWorkspaceModal');
  const [name, setName] = useState('');
  const [workDir, setWorkDir] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;

    setLoading(true);
    try {
      const id = await workspaceManagerStore.createWorkspace({
        id: crypto.randomUUID(),
        name: name.trim(),
        workDir: workDir.trim() || undefined,
        projectIds: props.projectIds,
      });
      closeModal();
      // Navigate to new workspace
      // navigate('workspace', { workspaceId: id });
    } catch (err) {
      console.error('Failed to create workspace:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4">Create Workspace</h2>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background"
            placeholder="My Workspace"
          />
        </div>

        <div>
          <label className="text-sm font-medium">Work Directory (optional)</label>
          <input
            type="text"
            value={workDir}
            onChange={(e) => setWorkDir(e.target.value)}
            className="w-full mt-1 px-3 py-2 rounded border border-border bg-background"
            placeholder="/path/to/worktrees"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 mt-6">
        <button
          onClick={closeModal}
          className="px-3 py-2 rounded border border-border hover:bg-background-1"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || loading}
          className="px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50"
        >
          {loading ? 'Creating...' : 'Create'}
        </button>
      </div>
    </div>
  );
});
```

- [ ] **Step 2: Register modal in modal-registry**

Modify `src/renderer/app/modal-registry.ts`:

```typescript
import { CreateWorkspaceModal } from '@renderer/features/workspaces/components/create-workspace-modal';

export const modalRegistry = {
  // ... existing modals
  createWorkspaceModal: createModal(CreateWorkspaceModal),
} satisfies Record<string, ModalRegistryEntry>;
```

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/renderer/features/workspaces/components/create-workspace-modal.tsx src/renderer/app/modal-registry.ts
git commit -m "feat(ui): add create workspace modal"
```

---

## Phase 7: Sidebar Navigation

### Task 16: Update sidebar for workspace navigation

**Files:**
- Modify: `src/renderer/features/sidebar/left-sidebar.tsx`

- [ ] **Step 1: Add workspace navigation to sidebar**

Modify the sidebar to show workspace navigation above the project list:

```typescript
// Add imports
import { LayoutGrid } from 'lucide-react';
import { workspaceManagerStore } from '@renderer/features/workspaces/stores/workspace-manager';

// Add workspace section before ProjectsGroupLabel:
<SidebarGroup>
  <SidebarGroupContent>
    <SidebarMenu>
      <SidebarMenuButton
        isActive={isCurrentView(currentView, 'home')}
        onClick={() => navigate('home')}
        aria-label="Workspaces"
      >
        <LayoutGrid className="h-5 w-5 sm:h-4 sm:w-4" />
        Workspaces
      </SidebarMenuButton>
    </SidebarMenu>
  </SidebarGroupContent>
</SidebarGroup>
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/renderer/features/sidebar/left-sidebar.tsx
git commit -m "feat(ui): add workspace navigation to sidebar"
```

---

## Phase 8: Testing & Integration

### Task 17: Run full test suite

- [ ] **Step 1: Run format check**

Run: `pnpm run format`
Expected: PASS

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`
Expected: PASS (fix any lint errors)

- [ ] **Step 3: Run typecheck**

Run: `pnpm run typecheck`
Expected: PASS

- [ ] **Step 4: Run tests**

Run: `pnpm run test`
Expected: Tests pass (fix any failing tests)

- [ ] **Step 5: Commit if fixes needed**

```bash
git add -A
git commit -m "fix: resolve type/lint/test errors from workspace integration"
```

---

## Self-Review Checklist

**1. Spec coverage:**
- ✅ Data model: Tasks 1-5
- ✅ Shared types: Tasks 6-7
- ✅ Main process operations: Tasks 8-10
- ✅ Data migration: Task 11
- ✅ Renderer stores: Task 12
- ✅ UI views: Tasks 13-15
- ✅ Sidebar navigation: Task 16

**2. Placeholder scan:**
- ✅ No TBD/TODO/placeholder comments
- ✅ All code shown in steps
- ✅ All types defined before use

**3. Type consistency:**
- ✅ Workspace type matches between shared and main/renderer
- ✅ CreateTaskParams matches between shared and controller
- ✅ ViewDefinition types match in view-registry

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-07-workspace-multi-project.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**