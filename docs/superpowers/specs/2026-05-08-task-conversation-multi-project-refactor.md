---
name: Task Conversation Multi-Project Refactor
description: Refactor task detail page to properly support multi-project tasks - conversations bind to taskId only, remove primary project concept, UI components grouped by project except shared terminals
type: project
---

# Task Conversation Multi-Project Refactor Design

## Problem Statement

Current implementation has several issues with multi-project task support:

1. **Conversation binds to projectId**: `ConversationManagerStore` requires a `projectId`, forcing selection of a "primary project" even when the task spans multiple projects
2. **task_projects stores worktreePath redundantly**: Worktree paths are stored in the junction table, but should be computed dynamically
3. **Primary project concept exists**: Code has fallback logic to select "first project" as primary, which contradicts the multi-project design intent
4. **UI not properly grouped**: Only file tree groups by project; terminals and git changes are not grouped

## Goals

1. **Conversation binds to taskId only**: Conversation context covers all projects in the task, starts in task's `workDir`
2. **Remove worktreePath from task_projects**: Worktree paths computed by WorktreeService, stored implicitly in task.workDir structure
3. **Remove primary project concept**: All projects in a task are equal, no fallback selection
4. **UI grouping**:
   - File tree: Already grouped by project (keep existing)
   - Terminals: Shared across task, starts in task.workDir (no grouping)
   - Git changes: Grouped by project in Changes panel

## Data Model Changes

### 1. Simplify task_projects table

**Before**:
```typescript
task_projects: {
  taskId: string (FK -> tasks.id)
  projectId: string (FK -> projects.id)
  worktreePath: string?  // REMOVE THIS
}
```

**After**:
```typescript
task_projects: {
  taskId: string (FK -> tasks.id)
  projectId: string (FK -> projects.id)
  // worktreePath removed
}
```

**Migration**:
- Create new migration `0011_remove_task_projects_worktree_path.sql`
- Drop `worktreePath` column from `task_projects` table

### 2. Remove projectId from Conversation type

**Before** (`src/shared/conversations.ts`):
```typescript
export type Conversation = {
  id: string;
  projectId?: string;  // REMOVE THIS
  taskId: string;
  providerId: AgentProviderId;
  title: string;
  resume?: boolean;
  autoApprove?: boolean;
};
```

**After**:
```typescript
export type Conversation = {
  id: string;
  taskId: string;  // Only taskId binding
  providerId: AgentProviderId;
  title: string;
  resume?: boolean;
  autoApprove?: boolean;
};
```

**Migration**:
- Create new migration `0012_remove_conversation_project_id.sql`
- Drop `projectId` column from `conversations` table

### 3. PTY Session ID format

**Before** (`src/shared/ptySessionId.ts`):
```typescript
export function makePtySessionId(projectId: string, taskId: string, conversationId: string): string
```

**After**:
```typescript
// For conversations
export function makeConversationSessionId(taskId: string, conversationId: string): string

// For terminals (also shared across task, no projectId needed)
export function makeTerminalSessionId(taskId: string, terminalId: string): string
```

Both conversations and terminals use taskId-based session IDs since they're both shared across the task.

## Core Service Changes

### 1. ConversationManagerStore

**File**: `src/renderer/features/tasks/conversations/conversation-manager.ts`

**Before**:
```typescript
constructor(
  private readonly projectId: string,
  private readonly taskId: string
)
```

**After**:
```typescript
constructor(
  private readonly taskId: string
)
```

Changes:
- Remove `projectId` parameter
- Update `load()` to not pass `projectId` to RPC calls
- Update `createConversation()` params to not include `projectId`
- Update `ConversationStore` to use taskId-based session ID

### 2. createConversation (Main Process)

**File**: `src/main/core/conversations/createConversation.ts`

**Before**: Complex logic to determine projectId (fallback to first project, legacy handling)

**After**:
```typescript
export async function createConversation(params: CreateConversationParams): Promise<Conversation> {
  const id = params.id ?? randomUUID();
  
  // Get task and its workDir
  const [taskRow] = await db.select().from(tasks).where(eq(tasks.id, params.taskId)).limit(1);
  if (!taskRow) throw new Error('Task not found');
  
  const taskWorkDir = taskRow.workDir;
  if (!taskWorkDir) throw new Error('Task workDir not found');
  
  // Insert conversation without projectId
  const [row] = await db
    .insert(conversations)
    .values({
      id,
      taskId: params.taskId,
      title: params.title,
      provider: params.provider,
      config: params.autoApprove ? JSON.stringify({ autoApprove: params.autoApprove }) : undefined,
      createdAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .returning();
  
  // Start session in task workDir
  await startConversationSession(params.taskId, taskWorkDir, conversation, params);
  
  return mapConversationRowToConversation(row);
}
```

Key changes:
- Remove all projectId determination logic
- Use task.workDir as session cwd
- Create simplified ConversationProvider that binds to (taskId, workDir)

### 3. ConversationProvider Refactor

**Files**:
- `src/main/core/conversations/impl/local-conversation.ts`
- `src/main/core/conversations/impl/ssh-conversation.ts`

**Before**: Constructor takes `projectId`, `taskPath`, `taskId`

**After**: Constructor takes `taskId`, `taskWorkDir` only

```typescript
constructor({
  taskId,
  taskWorkDir,
  tmux = false,
  shellSetup,
  exec,
  taskEnvVars = {},
}: {
  taskId: string;
  taskWorkDir: string;
  tmux?: boolean;
  shellSetup?: string;
  exec: ExecFn;
  taskEnvVars?: Record<string, string>;
})
```

Session ID generation uses taskId only:
```typescript
const sessionId = makePtySessionId(this.taskId, conversation.id);
```

### 4. WorktreeService Auto-Path Computation

**File**: `src/main/core/projects/worktrees/worktree-service.ts`

**Strategy**: Worktree path = `{task.workDir}/{project.name}/`

**Changes**:
- Remove worktreePath parameter from `createWorktree()`
- Compute path automatically: `path.join(task.workDir, project.name)`
- Update `provisionTask.ts` to not pass worktreePath

### 5. provisionTask Refactor

**File**: `src/main/core/tasks/provisionTask.ts`

**Changes**:
- Remove worktreePath storage logic
- WorktreeService computes paths on-the-fly
- Simplify workspace creation logic (no per-project worktreePath storage)

### 6. TerminalManagerStore

**File**: `src/renderer/features/tasks/terminals/terminal-manager.ts`

**Before**: Binds to `(projectId, taskId)`

**After**: Binds to `(taskId)` only, completely shared across all projects

Changes:
- Remove `projectId` parameter from constructor
- Terminal creation RPC uses `taskId` only
- Terminal cwd is `task.workDir` (shared workspace)
- Terminal list shows all terminals for the task, no project grouping

## UI Changes

### 1. Git Changes Panel - Project Grouped

**File**: `src/renderer/features/tasks/diff-view/changes-panel/changes-panel.tsx`

**Design**:
```tsx
<ChangesPanel>
  {projectContexts.projects.map(project => (
    <ProjectChangesSection key={project.id}>
      <ProjectHeader name={project.name} />
      <StagedSection project={project} />
      <UnstagedSection project={project} />
      <PrSection project={project} />
    </ProjectChangesSection>
  ))}
</ChangesPanel>
```

Each project shows:
- Staged files for that project
- Unstaged files for that project  
- PR for that project (if exists)

**Why**: Git operations are per-project, grouping by project provides clear separation.

### 2. Terminals - Shared, No Grouping

**File**: `src/renderer/features/tasks/terminals/terminal-panel.tsx`

**No changes needed for grouping** - terminals remain as a shared list.

**Change needed**: Terminal cwd should be `task.workDir` instead of project workspace path.

### 3. File Tree - Keep Existing

**File**: `src/renderer/features/tasks/editor/multi-project-file-tree.tsx`

Already groups by project, no changes needed.

### 4. Create Conversation Modal

**File**: `src/renderer/features/tasks/conversations/create-conversation-modal.tsx`

**Changes**:
- Remove `projectId` prop requirement
- Use `taskId` only to get ConversationManagerStore

## Migration Strategy

### 1. Database Migrations

Create two migrations:

**0011_remove_task_projects_worktree_path.sql**:
```sql
ALTER TABLE task_projects DROP COLUMN worktree_path;
```

**0012_remove_conversation_project_id.sql**:
```sql
ALTER TABLE conversations DROP COLUMN project_id;
```

### 2. Code Migration Order

1. Update shared types (`Conversation`, `CreateConversationParams`)
2. Update PTY session ID functions
3. Update ConversationManagerStore (renderer)
4. Update ConversationProvider classes (main)
5. Update createConversation (main)
6. Update provisionTask and WorktreeService
7. Update UI components
8. Run database migrations

### 3. Backward Compatibility

During migration:
- Existing conversations with projectId will work (projectId column nullable)
- After migration, projectId column dropped
- Old PTY sessions will use old session ID format; new sessions use new format

## Testing Strategy

1. **Unit tests**: Update conversation-related tests to remove projectId
2. **Integration tests**: Test multi-project task provisioning
3. **Manual testing**:
   - Create multi-project task
   - Start conversation, verify cwd is task.workDir
   - Verify terminals start in task.workDir
   - Verify git changes grouped by project
   - Verify file tree grouped by project

## Why This Design

**Why remove projectId from Conversation**:
- Conversation context should span all projects in the task
- Agent needs visibility into all project files
- No "primary project" concept - all projects are peers

**Why remove worktreePath from task_projects**:
- Path can be computed: `{task.workDir}/{project.name}/`
- Reduces data duplication
- Simplifies provisioning logic

**Why terminals shared, git grouped**:
- Terminals: User may need to run commands that span projects (e.g., build scripts)
- Git changes: Git operations are per-project, grouping provides clear separation

**Why task.workDir for conversation cwd**:
- Agent can navigate to any project's subdirectory
- Provides unified view of all project worktrees
- Matches user's mental model of "task workspace"