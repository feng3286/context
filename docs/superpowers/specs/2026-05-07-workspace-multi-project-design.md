---
name: Workspace Multi-Project Architecture
description: Introduces Workspace as a top-level entity to support multi-project, shared-context tasks
type: project
---

# Workspace Multi-Project Architecture Design

## Problem Statement

The current architecture follows a strict hierarchy: Project -> Task -> Conversation. Each Task belongs to a single Project, and each Conversation is scoped to that Task's Project. This limits scenarios where multiple Projects (potentially from different directories or git repositories) need to collaborate in a shared context.

## Proposed Solution

Introduce a new top-level entity: **Workspace**. The new hierarchy becomes:

```
Workspace -> Projects (many-to-many) -> Tasks -> Conversations
```

Key characteristics:
- Workspace is manually created and managed
- Projects can belong to multiple Workspaces (many-to-many)
- Tasks are created within a Workspace and can select multiple Projects
- Conversations span all Projects associated with the Task
- Different Projects' worktrees are placed in a unified working directory

## Data Model

### New Tables

#### `workspaces`
```typescript
workspaces: {
  id: string (PK)
  name: string
  workDir: string?  // Optional default work directory template
  createdAt: timestamp
  updatedAt: timestamp
}
```

#### `workspace_projects` (many-to-many junction table)
```typescript
workspace_projects: {
  workspaceId: string (FK -> workspaces.id)
  projectId: string (FK -> projects.id)
  addedAt: timestamp
  // PK: (workspaceId, projectId)
}
```

#### `task_projects` (many-to-many junction table)
```typescript
task_projects: {
  taskId: string (FK -> tasks.id)
  projectId: string (FK -> projects.id)
  // PK: (taskId, projectId)
}
```

### Modified Tables

#### `tasks`
```typescript
tasks: {
  ... // existing fields retained
  workspaceId: string (FK -> workspaces.id)  // NEW: replaces projectId
  workDir: string?  // NEW: task-specific work directory
  // projectId removed (use task_projects junction table instead)
}
```

#### `conversations`
```typescript
conversations: {
  ... // existing fields retained
  taskId: string (FK -> tasks.id)
  // projectId removed (access via task -> task_projects)
}
```

#### `terminals`
```typescript
terminals: {
  ... // existing fields retained
  taskId: string (FK -> tasks.id)
  // projectId removed (access via task -> task_projects)
}
```

#### `editor_buffers` (unchanged semantics)
```typescript
editor_buffers: {
  ... // existing fields retained
  workspaceId: string  // Kept: now represents task work directory identifier
  projectId: string (FK)  // Kept
}
```

## Core Services

### Workspace Service (`src/main/core/workspaces/`)

```typescript
class WorkspaceService {
  // CRUD
  createWorkspace(params: CreateWorkspaceParams): Promise<Workspace>
  getWorkspace(id: string): Promise<Workspace | null>
  listWorkspaces(): Promise<Workspace[]>
  updateWorkspace(id: string, params: UpdateWorkspaceParams): Promise<Workspace>
  deleteWorkspace(id: string): Promise<void>

  // Project association management
  addProject(workspaceId: string, projectId: string): Promise<void>
  removeProject(workspaceId: string, projectId: string): Promise<void>
  getWorkspaceProjects(workspaceId: string): Promise<Project[]>
}
```

### Task Provision Flow (`src/main/core/tasks/provisionTask.ts`)

```typescript
async function provisionTask(taskId: string) {
  const task = await getTask(taskId);
  const workspace = await getWorkspace(task.workspaceId);
  const projects = await getTaskProjects(taskId);

  const localProjects = projects.filter(p => p.type === 'local');
  const sshProjects = projects.filter(p => p.type === 'ssh');

  // Create task work directory
  const taskWorkDir = task.workDir || generateDefaultWorkDir(task);

  // Create worktrees for local projects
  for (const project of localProjects) {
    await createLocalWorktree(project, taskWorkDir, task.taskBranch);
  }

  // Provision SSH projects remotely (keep existing behavior)
  for (const project of sshProjects) {
    await provisionSshTaskRemotely(project, task);
  }

  return { path: taskWorkDir, workspaceId: task.workspaceId };
}
```

### Multi-Project Task Branch Strategy

**Branch naming**: All Projects in a Task share the same `taskBranch` name. Each Project creates its own worktree under this branch name, creating independent git branches in each repository.

**Source branch selection**: When creating a multi-Project Task, the user selects one primary Project as the "branch source". This Project's `sourceBranch` determines the base branch for the `taskBranch`. Other Projects use their respective default branches as the source for their worktrees.

```typescript
interface CreateTaskParams {
  // ... existing fields
  workspaceId: string;
  projectIds: string[];
  primaryProjectId: string;  // The Project that determines sourceBranch
  sourceBranch: Branch;      // From primaryProject
  taskBranch: string;        // Shared branch name for all Projects
}
```

**Why this approach**:
- Single `taskBranch` simplifies Task identification and worktree management
- Primary Project concept provides clear branch source semantics
- Each Project's worktree is independent (same branch name, different repository)
- Supports cross-repository development (e.g., frontend + backend changes under same Task)
```

### Conversation API (`src/main/core/conversations/`)

```typescript
async function createConversation(params: CreateConversationParams) {
  const task = await getTask(params.taskId);
  const projects = await getTaskProjects(params.taskId);

  return createPtyConversation({
    ...params,
    workDir: task.workDir,
    accessibleProjects: projects,
  });
}
```

## SSH Project Handling

**Principle**: SSH Projects maintain their existing remote execution mode. No local worktree is created.

- **Local Projects**: Worktrees created in the task's local work directory
- **SSH Projects**: Worktrees created on remote servers (existing behavior), accessed via SSH/SFTP

### Hybrid File Access

```typescript
interface FileAccessProvider {
  readFile(projectId: string, filePath: string): Promise<string>;
  writeFile(projectId: string, filePath: string, content: string): Promise<void>;
  listFiles(projectId: string, dirPath: string): Promise<string[]>;
}

class HybridFileAccessProvider implements FileAccessProvider {
  async readFile(projectId: string, filePath: string): Promise<string> {
    const project = await getProject(projectId);
    if (project.type === 'local') {
      return fs.readFile(filePath, 'utf-8');
    } else {
      const sftp = await getSftp(project.connectionId);
      return sftp.readFile(filePath);
    }
  }
}
```

## UI Structure

### New Pages

**Workspace List Page** (`src/renderer/features/workspaces/workspace-list-view.tsx`):
- Home entry point
- Display all Workspace cards (name, project count, task count)
- Support creating new Workspace

**Workspace Detail Page** (`src/renderer/features/workspaces/workspace-detail-view.tsx`):
- Left panel: Project list (expandable for individual Project details)
- Right panel: Task list
- Toolbar: Add Project, Create Task, Settings

### Modified Views

**Task Creation Modal**:
- Workspace selector (default to current if from Workspace detail)
- Project multi-select (from Workspace's Projects)
- Work directory field

**Task Detail Page**:
- Display associated Projects list
- Conversation unchanged (single Conversation spans multiple Projects)

**Project Detail Page**:
- Display associated Workspaces list (many-to-many)

### Routing

```
/workspace/:workspaceId -> Workspace detail
/workspace/:workspaceId/task/:taskId -> Task detail
/project/:projectId -> Project detail (existing)
```

## Data Migration Strategy

### Migration Steps

1. **Create new tables** (workspaces, workspace_projects, task_projects)
2. **Add workspaceId column to tasks table**
3. **Run migration script**:

```typescript
async function migrateToWorkspace() {
  const existingProjects = await db.select().from(projects);

  for (const project of existingProjects) {
    // Create Workspace for each Project
    const workspaceId = generateId();
    await db.insert(workspaces).values({
      id: workspaceId,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    });

    // Associate Project to Workspace
    await db.insert(workspaceProjects).values({
      workspaceId,
      projectId: project.id,
      addedAt: project.createdAt,
    });

    // Update Tasks' workspaceId
    const projectTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.projectId, project.id));

    for (const task of projectTasks) {
      await db.update(tasks).set({ workspaceId }).where(eq(tasks.id, task.id));

      // Link Task to original Project via task_projects
      await db.insert(taskProjects).values({
        taskId: task.id,
        projectId: project.id,
      });
    }
  }
}
```

4. **Optional cleanup** (future migration): Remove `tasks.projectId` column after all code is updated.

### Backward Compatibility

During migration, code supports both old and new structures:

```typescript
async function getTasks(workspaceId?: string, projectId?: string) {
  if (workspaceId) {
    return db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId));
  }
  // Backward compatibility during migration period
  if (projectId) {
    return db.select().from(tasks).where(eq(tasks.projectId, projectId));
  }
}
```

## Why This Approach

**Why introduce Workspace entity**:
- Users need to group related Projects (e.g., frontend + backend + shared library)
- Enables cross-project Tasks with shared context
- Provides a logical container for multi-project collaboration

**Why many-to-many Project-Workspace relationship**:
- Same Project may participate in different collaboration contexts
- Allows flexible grouping without duplicating Project definitions
- User can merge Workspaces later if desired

**Why Task links to Workspace + multiple Projects**:
- Task needs a parent Workspace context
- Explicit Project selection gives user control over which Projects participate
- Conversation context covers only selected Projects (not all Workspace Projects)

**Why SSH keeps remote mode**:
- Avoids complex rsync synchronization
- Maintains existing SSH architecture stability
- Remote access through SSH/SFTP is already well-supported