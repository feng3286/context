# Task Conversation Multi-Project Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor task detail page to support multi-project tasks - conversations and terminals bind to taskId only, remove primary project concept, git changes grouped by project.

**Architecture:** 
- Remove `projectId` from Conversation and Terminal types, bind to taskId only
- Remove `worktreePath` from task_projects table, compute dynamically
- ConversationProvider and TerminalProvider constructors simplified to take (taskId, taskWorkDir)
- UI: git changes grouped by project, terminals shared across task

**Tech Stack:** TypeScript, React, MobX, Drizzle ORM, Electron IPC

---

## Files Overview

### Shared Types
- `src/shared/conversations.ts` - Remove `projectId` from Conversation type
- `src/shared/terminals.ts` - Remove `projectId` from Terminal type (if exists)
- `src/shared/ptySessionId.ts` - Add task-only session ID functions

### Database
- `src/main/db/schema.ts` - Remove columns from schema
- `drizzle/0011_remove_task_projects_worktree_path.sql` - Migration
- `drizzle/0012_remove_conversation_project_id.sql` - Migration
- `drizzle/meta/_journal.json` - Update journal

### Main Process - Conversations
- `src/main/core/conversations/createConversation.ts` - Remove projectId logic
- `src/main/core/conversations/getConversationsForTask.ts` - Remove projectId param
- `src/main/core/conversations/deleteConversation.ts` - Remove projectId param
- `src/main/core/conversations/utils.ts` - Remove projectId mapping
- `src/main/core/conversations/impl/local-conversation.ts` - Simplify constructor
- `src/main/core/conversations/impl/ssh-conversation.ts` - Simplify constructor

### Main Process - Terminals
- `src/main/core/terminals/getTerminalsForTask.ts` - Remove projectId param
- `src/main/core/terminals/createTerminal.ts` - Remove projectId logic
- `src/main/core/terminals/deleteTerminal.ts` - Remove projectId param
- `src/main/core/terminals/impl/local-terminal-provider.ts` - Simplify constructor
- `src/main/core/terminals/impl/ssh-terminal-provider.ts` - Simplify constructor

### Main Process - Projects
- `src/main/core/projects/project-provider.ts` - Update TaskProvider interface
- `src/main/core/projects/impl/local-project-provider.ts` - Update provisionTask
- `src/main/core/projects/impl/ssh-project-provider.ts` - Update provisionTask
- `src/main/core/projects/worktrees/worktree-service.ts` - Auto-compute paths
- `src/main/core/tasks/provisionTask.ts` - Remove worktreePath storage
- `src/main/core/tasks/controller.ts` - Update RPC methods
- `src/main/core/tasks/operations/setTaskProjects.ts` - Remove worktreePath

### Renderer - Stores
- `src/renderer/features/tasks/conversations/conversation-manager.ts` - Remove projectId
- `src/renderer/features/tasks/terminals/terminal-manager.ts` - Remove projectId
- `src/renderer/features/tasks/stores/task.ts` - Update ProvisionedTask
- `src/renderer/features/tasks/task-view-context.tsx` - Update context

### Renderer - UI
- `src/renderer/features/tasks/conversations/create-conversation-modal.tsx` - Remove projectId prop
- `src/renderer/features/tasks/diff-view/changes-panel/changes-panel.tsx` - Group by project
- `src/renderer/features/tasks/stores/project-context-store.ts` - May need updates

---

### Task 1: Update Shared Types

**Files:**
- Modify: `src/shared/conversations.ts`
- Modify: `src/shared/ptySessionId.ts`
- Test: Verify type imports work

- [ ] **Step 1: Update Conversation type**

Remove `projectId` from Conversation and CreateConversationParams:

```typescript
// src/shared/conversations.ts
import { AgentProviderId } from '@shared/agent-provider-registry';

export type Conversation = {
  id: string;
  taskId: string;  // Only taskId binding
  providerId: AgentProviderId;
  title: string;
  resume?: boolean;
  autoApprove?: boolean;
};

export type RenameConversationParams = {
  conversationId: string;
  newTitle: string;
};

export type CreateConversationParams = {
  id: string;
  taskId: string;  // Only taskId
  provider: AgentProviderId;
  title: string;
  autoApprove?: boolean;
  initialSize?: { cols: number; rows: number };
  initialPrompt?: string;
};
```

- [ ] **Step 2: Add task-only session ID functions**

Add new functions for task-only session IDs:

```typescript
// src/shared/ptySessionId.ts

// Keep existing function for backward compatibility during migration
export function makePtySessionId(projectId: string, taskId: string, conversationId: string): string {
  return `${projectId}:${taskId}:${conversationId}`;
}

// New functions for task-only binding
export function makeConversationSessionId(taskId: string, conversationId: string): string {
  return `conversation:${taskId}:${conversationId}`;
}

export function makeTerminalSessionId(taskId: string, terminalId: string): string {
  return `terminal:${taskId}:${terminalId}`;
}
```

- [ ] **Step 3: Verify Terminal type**

Check if Terminal type has projectId and update if needed. Read the file first.

---

### Task 2: Update Database Schema

**Files:**
- Modify: `src/main/db/schema.ts`
- Create: `drizzle/0011_remove_task_projects_worktree_path.sql`
- Create: `drizzle/0012_remove_conversation_project_id.sql`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Update schema.ts**

Remove `worktreePath` from task_projects and `projectId` from conversations:

```typescript
// In src/main/db/schema.ts

// task_projects - remove worktreePath
export const taskProjects = sqliteTable('task_projects', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  // worktreePath removed - now computed dynamically
});

// conversations - remove projectId
export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  // projectId removed - conversation binds to task only
  title: text('title').notNull(),
  provider: text('provider').notNull(),
  config: text('config'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Also update ConversationRow type if it's defined in schema.ts
export type ConversationRow = {
  id: string;
  taskId: string;
  // projectId removed
  title: string;
  provider: string;
  config: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

- [ ] **Step 2: Create migration for task_projects**

```sql
-- drizzle/0011_remove_task_projects_worktree_path.sql
ALTER TABLE task_projects DROP COLUMN worktree_path;
```

- [ ] **Step 3: Create migration for conversations**

```sql
-- drizzle/0012_remove_conversation_project_id.sql
ALTER TABLE conversations DROP COLUMN project_id;
```

- [ ] **Step 4: Update migration journal**

Update `drizzle/meta/_journal.json` to register new migrations:

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    // ... existing entries ...
    {
      "idx": 11,
      "version": "0011_remove_task_projects_worktree_path",
      "when": 1715000000000,
      "tag": "0011_remove_task_projects_worktree_path",
      "breakpoints": true
    },
    {
      "idx": 12,
      "version": "0012_remove_conversation_project_id",
      "when": 1715001000000,
      "tag": "0012_remove_conversation_project_id",
      "breakpoints": true
    }
  ]
}
```

---

### Task 3: Update Conversation Utils

**Files:**
- Modify: `src/main/core/conversations/utils.ts`

- [ ] **Step 1: Update mapConversationRowToConversation**

Remove projectId parameter:

```typescript
// src/main/core/conversations/utils.ts
import { AgentProviderId } from '@shared/agent-provider-registry';
import { Conversation } from '@shared/conversations';
import { ConversationRow } from '@main/db/schema';

export function mapConversationRowToConversation(
  row: ConversationRow,
  resume: boolean = false
): Conversation {
  return {
    id: row.id,
    title: row.title,
    taskId: row.taskId,
    providerId: row.provider as AgentProviderId,
    autoApprove: row.config ? JSON.parse(row.config).autoApprove : undefined,
    resume: resume,
  };
}
```

---

### Task 4: Update Conversation Main Process Functions

**Files:**
- Modify: `src/main/core/conversations/getConversationsForTask.ts`
- Modify: `src/main/core/conversations/deleteConversation.ts`
- Modify: `src/main/core/conversations/createConversation.ts`
- Modify: `src/main/core/conversations/controller.ts`

- [ ] **Step 1: Update getConversationsForTask**

Remove projectId parameter and query:

```typescript
// src/main/core/conversations/getConversationsForTask.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';
import { mapConversationRowToConversation } from './utils';

export async function getConversationsForTask(taskId: string) {
  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.taskId, taskId));
  return rows.map((r) => mapConversationRowToConversation(r, false));
}
```

- [ ] **Step 2: Update deleteConversation**

Remove projectId parameter:

```typescript
// src/main/core/conversations/deleteConversation.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { conversations } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';

export async function deleteConversation(
  taskId: string,
  conversationId: string
): Promise<void> {
  await db
    .delete(conversations)
    .where(
      eq(conversations.id, conversationId)
    );

  const task = resolveTaskByTaskId(taskId);
  await task?.conversations.stopSession(conversationId);
  capture('conversation_deleted', {
    task_id: taskId,
    conversation_id: conversationId,
  });
}
```

Note: This requires a new `resolveTaskByTaskId` helper (see Task 6).

- [ ] **Step 3: Update createConversation**

Remove projectId logic, use task.workDir:

```typescript
// src/main/core/conversations/createConversation.ts
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { Conversation, CreateConversationParams } from '@shared/conversations';
import { db } from '@main/db/client';
import { conversations, tasks } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';
import { mapConversationRowToConversation } from './utils';

export async function createConversation(params: CreateConversationParams): Promise<Conversation> {
  const id = params.id ?? randomUUID();
  
  // Check for existing conversation in task
  const [existingConversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.taskId, params.taskId))
    .limit(1);

  const config =
    params.autoApprove === undefined
      ? undefined
      : JSON.stringify({ autoApprove: params.autoApprove });

  // Insert conversation without projectId
  const [row] = await db
    .insert(conversations)
    .values({
      id,
      taskId: params.taskId,
      title: params.title,
      provider: params.provider,
      config,
      createdAt: sql`CURRENT_TIMESTAMP`,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .returning();

  // Get task and start session
  const task = resolveTaskByTaskId(params.taskId);
  if (!task) {
    throw new Error('Task not found');
  }

  const conversation = mapConversationRowToConversation(row);
  await task.conversations.startSession(
    conversation,
    params.initialSize,
    false,
    params.initialPrompt
  );

  capture('conversation_created', {
    provider: params.provider,
    is_first_in_task: existingConversation === undefined,
    task_id: params.taskId,
    conversation_id: id,
  });

  return mapConversationRowToConversation(row);
}
```

- [ ] **Step 4: Update controller exports**

The controller auto-registers exported functions, ensure signatures match:

```typescript
// src/main/core/conversations/controller.ts
// No changes needed - functions are auto-registered by name
// Just ensure the exported functions have correct signatures
```

---

### Task 5: Update ConversationProvider Implementations

**Files:**
- Modify: `src/main/core/conversations/impl/local-conversation.ts`
- Modify: `src/main/core/conversations/impl/ssh-conversation.ts`

- [ ] **Step 1: Update LocalConversationProvider**

Remove projectId, use taskId-based session ID:

```typescript
// src/main/core/conversations/impl/local-conversation.ts
import { homedir } from 'node:os';
import { getProvider } from '@shared/agent-provider-registry';
import type { AgentSessionConfig } from '@shared/agent-session';
import { Conversation } from '@shared/conversations';
import { agentSessionExitedChannel } from '@shared/events/agentEvents';
import { makeConversationSessionId } from '@shared/ptySessionId';
import { agentHookService } from '@main/core/agent-hooks/agent-hook-service';
import { wireAgentClassifier } from '@main/core/agent-hooks/classifier-wiring';
import { claudeTrustService } from '@main/core/agent-hooks/claude-trust-service';
import { HookConfigWriter } from '@main/core/agent-hooks/hook-config';
import type { ConversationProvider } from '@main/core/conversations/types';
import { LocalFileSystem } from '@main/core/fs/impl/local-fs';
import { spawnLocalPty } from '@main/core/pty/local-pty';
import { Pty } from '@main/core/pty/pty';
import { buildAgentEnv } from '@main/core/pty/pty-env';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { resolveSpawnParams } from '@main/core/pty/spawn-utils';
import { killTmuxSession, makeTmuxSessionName } from '@main/core/pty/tmux-session-name';
import { appSettingsService } from '@main/core/settings/settings-service';
import type { ExecFn } from '@main/core/utils/exec';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { capture } from '@main/lib/telemetry';
import { buildAgentCommand } from './agent-command';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_RESPAWNS = 2;

export class LocalConversationProvider implements ConversationProvider {
  private sessions = new Map<string, Pty>();
  private knownSessionIds = new Set<string>();
  private respawnCounts = new Map<string, number>();
  private readonly taskId: string;
  private readonly taskWorkDir: string;
  private readonly tmux: boolean;
  private readonly shellSetup?: string;
  private readonly exec: ExecFn;
  private readonly taskEnvVars: Record<string, string>;
  private readonly hookConfigWriter: HookConfigWriter;
  private readonly preparedHookProviders = new Map<string, boolean>();

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
  }) {
    this.taskId = taskId;
    this.taskWorkDir = taskWorkDir;
    this.tmux = tmux;
    this.shellSetup = shellSetup;
    this.exec = exec;
    this.taskEnvVars = taskEnvVars;
    this.hookConfigWriter = new HookConfigWriter(new LocalFileSystem(taskWorkDir), exec);
  }

  async startSession(
    conversation: Conversation,
    initialSize: { cols: number; rows: number } = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
    isResuming: boolean = false,
    initialPrompt?: string
  ): Promise<void> {
    const sessionId = makeConversationSessionId(this.taskId, conversation.id);
    this.knownSessionIds.add(sessionId);
    if (this.sessions.has(sessionId)) return;

    await claudeTrustService.maybeAutoTrustLocal({
      providerId: conversation.providerId,
      cwd: this.taskWorkDir,
      homedir: homedir(),
    });
    await this.prepareHookConfig(conversation.providerId);

    const { command, args } = await buildAgentCommand({
      providerId: conversation.providerId,
      autoApprove: conversation.autoApprove,
      sessionId: conversation.id,
      isResuming,
      initialPrompt,
    });

    const tmuxSessionName = this.tmux ? makeTmuxSessionName(sessionId) : undefined;

    const cfg: AgentSessionConfig = {
      taskId: this.taskId,
      conversationId: conversation.id,
      providerId: conversation.providerId,
      command,
      args,
      cwd: this.taskWorkDir,
      shellSetup: this.shellSetup,
      tmuxSessionName,
      autoApprove: conversation.autoApprove ?? false,
      resume: isResuming,
    };

    const spawnParams = resolveSpawnParams('agent', cfg);
    const ptyId = `${conversation.providerId}:${conversation.id}`;
    const port = agentHookService.getPort();
    const token = agentHookService.getToken();
    const pty = spawnLocalPty({
      id: sessionId,
      command: spawnParams.command,
      args: spawnParams.args,
      cwd: this.taskWorkDir,
      env: {
        ...buildAgentEnv({
          hook: port > 0 ? { port, ptyId, token } : undefined,
        }),
        ...this.taskEnvVars,
      },
      cols: initialSize.cols,
      rows: initialSize.rows,
    });

    const hookActive = port > 0;
    const provider = getProvider(conversation.providerId);
    const useHooksOnly = hookActive && provider?.supportsHooks;

    if (!useHooksOnly) {
      wireAgentClassifier({
        pty,
        providerId: conversation.providerId,
        projectId: '', // Not needed for multi-project
        taskId: this.taskId,
        conversationId: conversation.id,
      });
    }

    pty.onExit(({ exitCode }) => {
      ptySessionRegistry.unregister(sessionId);
      const shouldRespawn = this.sessions.has(sessionId);
      this.sessions.delete(sessionId);
      capture('agent_run_finished', {
        provider: conversation.providerId,
        exit_code: typeof exitCode === 'number' ? exitCode : -1,
        task_id: this.taskId,
        conversation_id: conversation.id,
      });
      events.emit(agentSessionExitedChannel, {
        sessionId,
        conversationId: conversation.id,
        taskId: this.taskId,
        exitCode,
      });
      if (shouldRespawn && !this.tmux) {
        const count = (this.respawnCounts.get(sessionId) ?? 0) + 1;
        this.respawnCounts.set(sessionId, count);

        if (count > MAX_RESPAWNS && !isResuming) {
          log.error('LocalConversationProvider: respawn limit reached, giving up', {
            conversationId: conversation.id,
          });
          this.respawnCounts.delete(sessionId);
          return;
        }

        const resumeNext = isResuming && count <= MAX_RESPAWNS;
        if (count > MAX_RESPAWNS) this.respawnCounts.set(sessionId, 0);

        setTimeout(() => {
          this.startSession(conversation, initialSize, resumeNext, initialPrompt).catch((e) => {
            log.error('LocalConversationProvider: respawn failed', {
              conversationId: conversation.id,
              error: String(e),
            });
          });
        }, 500);
      }
    });

    ptySessionRegistry.register(sessionId, pty);
    this.sessions.set(sessionId, pty);
    capture('agent_run_started', {
      provider: conversation.providerId,
      task_id: this.taskId,
      conversation_id: conversation.id,
    });
  }

  private async prepareHookConfig(providerId: Conversation['providerId']): Promise<void> {
    try {
      const localProjectSettings = await appSettingsService.get('localProject');
      const writeGitIgnoreEntries = localProjectSettings.writeAgentConfigToGitIgnore ?? true;
      const previousWriteGitIgnoreEntries = this.preparedHookProviders.get(providerId);
      const shouldPrepareHookConfig =
        previousWriteGitIgnoreEntries === undefined ||
        (!previousWriteGitIgnoreEntries && writeGitIgnoreEntries);
      if (!shouldPrepareHookConfig) return;

      await this.hookConfigWriter.writeForProvider(providerId, {
        writeGitIgnoreEntries,
      });
      this.preparedHookProviders.set(providerId, writeGitIgnoreEntries);
    } catch (error) {
      log.warn('LocalConversationProvider: failed to prepare hook config', {
        providerId,
        taskPath: this.taskWorkDir,
        error: String(error),
      });
    }
  }

  async stopSession(conversationId: string): Promise<void> {
    const sessionId = makeConversationSessionId(this.taskId, conversationId);
    this.knownSessionIds.delete(sessionId);
    const pty = this.sessions.get(sessionId);
    if (pty) {
      try {
        pty.kill();
      } catch (e) {
        log.warn('LocalConversationProvider: error killing PTY', { sessionId, error: String(e) });
      }
      this.sessions.delete(sessionId);
      ptySessionRegistry.unregister(sessionId);
    }
    if (this.tmux) {
      await killTmuxSession(this.exec, makeTmuxSessionName(sessionId));
    }
  }

  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.knownSessionIds);
    await this.detachAll();
    if (this.tmux) {
      await Promise.all(
        sessionIds.map((id) => killTmuxSession(this.exec, makeTmuxSessionName(id)))
      );
    }
    this.knownSessionIds.clear();
  }

  async detachAll(): Promise<void> {
    for (const [sessionId, pty] of this.sessions) {
      try {
        pty.kill();
      } catch {}
      ptySessionRegistry.unregister(sessionId);
    }
    this.sessions.clear();
  }
}
```

- [ ] **Step 2: Update SshConversationProvider**

Similar changes for SSH:

```typescript
// src/main/core/conversations/impl/ssh-conversation.ts
import type { AgentSessionConfig } from '@shared/agent-session';
import { Conversation } from '@shared/conversations';
import { agentSessionExitedChannel } from '@shared/events/agentEvents';
import { makeConversationSessionId } from '@shared/ptySessionId';
import { wireAgentClassifier } from '@main/core/agent-hooks/classifier-wiring';
import { claudeTrustService } from '@main/core/agent-hooks/claude-trust-service';
import type { ConversationProvider } from '@main/core/conversations/types';
import { SshFileSystem } from '@main/core/fs/impl/ssh-fs';
import { Pty } from '@main/core/pty/pty';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { resolveSshCommand } from '@main/core/pty/spawn-utils';
import { openSsh2Pty } from '@main/core/pty/ssh2-pty';
import { killTmuxSession, makeTmuxSessionName } from '@main/core/pty/tmux-session-name';
import type { SshClientProxy } from '@main/core/ssh/ssh-client-proxy';
import type { ExecFn } from '@main/core/utils/exec';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { capture } from '@main/lib/telemetry';
import { buildAgentCommand } from './agent-command';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_RESPAWNS = 2;

export class SshConversationProvider implements ConversationProvider {
  private sessions = new Map<string, Pty>();
  private knownSessionIds = new Set<string>();
  private respawnCounts = new Map<string, number>();
  private readonly taskId: string;
  private readonly taskWorkDir: string;
  private readonly taskEnvVars: Record<string, string>;
  private readonly tmux: boolean = false;
  private readonly shellSetup?: string;
  private readonly exec: ExecFn;
  private readonly proxy: SshClientProxy;

  constructor({
    taskId,
    taskWorkDir,
    taskEnvVars = {},
    tmux = false,
    shellSetup,
    exec,
    proxy,
  }: {
    taskId: string;
    taskWorkDir: string;
    taskEnvVars?: Record<string, string>;
    tmux?: boolean;
    shellSetup?: string;
    exec: ExecFn;
    proxy: SshClientProxy;
  }) {
    this.taskId = taskId;
    this.taskWorkDir = taskWorkDir;
    this.taskEnvVars = taskEnvVars;
    this.tmux = tmux;
    this.shellSetup = shellSetup;
    this.exec = exec;
    this.proxy = proxy;
  }

  async startSession(
    conversation: Conversation,
    initialSize: { cols: number; rows: number } = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
    isResuming: boolean = false,
    initialPrompt?: string
  ): Promise<void> {
    const sessionId = makeConversationSessionId(this.taskId, conversation.id);
    this.knownSessionIds.add(sessionId);

    if (this.sessions.has(sessionId)) return;

    await claudeTrustService.maybeAutoTrustSsh({
      providerId: conversation.providerId,
      cwd: this.taskWorkDir,
      exec: this.exec,
      remoteFs: new SshFileSystem(this.proxy, '/'),
    });

    const { command, args } = await buildAgentCommand({
      providerId: conversation.providerId,
      autoApprove: conversation.autoApprove,
      sessionId: conversation.id,
      isResuming,
      initialPrompt,
    });

    const tmuxSessionName = this.tmux ? makeTmuxSessionName(sessionId) : undefined;

    const cfg: AgentSessionConfig = {
      taskId: this.taskId,
      conversationId: conversation.id,
      providerId: conversation.providerId,
      command,
      args,
      cwd: this.taskWorkDir,
      shellSetup: this.shellSetup,
      tmuxSessionName,
      autoApprove: conversation.autoApprove ?? false,
      resume: isResuming,
    };

    const sshCommand = resolveSshCommand('agent', cfg, this.taskEnvVars);
    const result = await openSsh2Pty(this.proxy.client, {
      id: sessionId,
      command: sshCommand,
      cols: initialSize.cols,
      rows: initialSize.rows,
    });

    if (!result.success) {
      log.error('SshConversationProvider: failed to open SSH channel', {
        sessionId,
        error: result.error.message,
      });
      return;
    }

    const pty = result.data;

    wireAgentClassifier({
      pty,
      providerId: conversation.providerId,
      projectId: '', // Not needed for multi-project
      taskId: this.taskId,
      conversationId: conversation.id,
    });

    pty.onExit(({ exitCode }) => {
      ptySessionRegistry.unregister(sessionId);
      const shouldRespawn = this.sessions.has(sessionId);
      this.sessions.delete(sessionId);
      capture('agent_run_finished', {
        provider: conversation.providerId,
        exit_code: typeof exitCode === 'number' ? exitCode : -1,
        task_id: this.taskId,
        conversation_id: conversation.id,
      });
      events.emit(agentSessionExitedChannel, {
        sessionId,
        conversationId: conversation.id,
        taskId: this.taskId,
        exitCode,
      });
      if (shouldRespawn && !this.tmux) {
        const count = (this.respawnCounts.get(sessionId) ?? 0) + 1;
        this.respawnCounts.set(sessionId, count);

        if (count > MAX_RESPAWNS && !isResuming) {
          log.error('SshConversationProvider: respawn limit reached, giving up', {
            conversationId: conversation.id,
          });
          this.respawnCounts.delete(sessionId);
          return;
        }

        const resumeNext = isResuming && count <= MAX_RESPAWNS;
        if (count > MAX_RESPAWNS) this.respawnCounts.set(sessionId, 0);

        setTimeout(() => {
          this.startSession(conversation, initialSize, resumeNext, initialPrompt).catch((e) => {
            log.error('SshConversationProvider: respawn failed', {
              conversationId: conversation.id,
              error: String(e),
            });
          });
        }, 500);
      }
    });

    ptySessionRegistry.register(sessionId, pty);
    this.sessions.set(sessionId, pty);
    capture('agent_run_started', {
      provider: conversation.providerId,
      task_id: this.taskId,
      conversation_id: conversation.id,
    });
  }

  async stopSession(conversationId: string): Promise<void> {
    const sessionId = makeConversationSessionId(this.taskId, conversationId);
    this.knownSessionIds.delete(sessionId);
    const pty = this.sessions.get(sessionId);
    if (pty) {
      try {
        pty.kill();
      } catch (e) {
        log.warn('SshConversationProvider: error killing PTY', { sessionId, error: String(e) });
      }
      this.sessions.delete(sessionId);
      ptySessionRegistry.unregister(sessionId);
    }
    if (this.tmux) {
      await killTmuxSession(this.exec, makeTmuxSessionName(sessionId));
    }
  }

  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.knownSessionIds);
    await this.detachAll();
    if (this.tmux) {
      await Promise.all(
        sessionIds.map((id) => killTmuxSession(this.exec, makeTmuxSessionName(id)))
      );
    }
    this.knownSessionIds.clear();
  }

  async detachAll(): Promise<void> {
    for (const [sessionId, pty] of this.sessions) {
      try {
        pty.kill();
      } catch {}
      ptySessionRegistry.unregister(sessionId);
    }
    this.sessions.clear();
  }
}
```

---

### Task 6: Add resolveTaskByTaskId Helper

**Files:**
- Modify: `src/main/core/projects/utils.ts`

- [ ] **Step 1: Add resolveTaskByTaskId function**

This helper finds a task across all projects:

```typescript
// src/main/core/projects/utils.ts
// Add this new function

import { projectManager } from './project-manager';

/**
 * Resolve a task by taskId across all projects.
 * Used for multi-project tasks where task is not bound to a specific projectId.
 */
export function resolveTaskByTaskId(taskId: string): TaskProvider | undefined {
  // Iterate all projects to find the task
  for (const project of projectManager.getAllProjects()) {
    const task = project.getTask(taskId);
    if (task) return task;
  }
  return undefined;
}
```

Note: This requires checking if `projectManager.getAllProjects()` exists or needs to be added.

---

### Task 7: Update Terminal Main Process Functions

**Files:**
- Modify: `src/main/core/terminals/getTerminalsForTask.ts`
- Modify: `src/main/core/terminals/createTerminal.ts`
- Modify: `src/main/core/terminals/deleteTerminal.ts`
- Modify: `src/main/core/terminals/controller.ts`

- [ ] **Step 1: Update getTerminalsForTask**

Remove projectId parameter:

```typescript
// src/main/core/terminals/getTerminalsForTask.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { terminals } from '@main/db/schema';
import { mapTerminalRowToTerminal } from './core';

export async function getTerminalsForTask(taskId: string) {
  const rows = await db
    .select()
    .from(terminals)
    .where(eq(terminals.taskId, taskId));
  return rows.map(mapTerminalRowToTerminal);
}
```

- [ ] **Step 2: Update createTerminal**

Remove projectId, use task.workDir:

```typescript
// src/main/core/terminals/createTerminal.ts
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { CreateTerminalParams } from '@shared/terminals';
import { db } from '@main/db/client';
import { tasks, terminals } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';
import { mapTerminalRowToTerminal } from './core';

export async function createTerminal(params: CreateTerminalParams) {
  const id = params.id ?? randomUUID();

  // Get task to find workDir
  const [taskRow] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, params.taskId))
    .limit(1);

  if (!taskRow) {
    throw new Error('Task not found');
  }

  const taskWorkDir = taskRow.workDir;
  if (!taskWorkDir) {
    throw new Error('Task workDir not found');
  }

  const [row] = await db
    .insert(terminals)
    .values({
      id,
      taskId: params.taskId,
      name: params.name,
      command: params.command,
      createdAt: sql`CURRENT_TIMESTAMP`,
    })
    .returning();

  const terminal = mapTerminalRowToTerminal(row);

  const task = resolveTaskByTaskId(params.taskId);
  if (task) {
    await task.terminals.spawnTerminal(terminal, params.initialSize ?? { cols: 80, rows: 24 });
  }

  capture('terminal_created', {
    task_id: params.taskId,
    terminal_id: id,
  });

  return terminal;
}
```

- [ ] **Step 3: Update deleteTerminal**

Remove projectId parameter:

```typescript
// src/main/core/terminals/deleteTerminal.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { terminals } from '@main/db/schema';
import { capture } from '@main/lib/telemetry';
import { resolveTaskByTaskId } from '../projects/utils';

export async function deleteTerminal(taskId: string, terminalId: string): Promise<void> {
  await db.delete(terminals).where(eq(terminals.id, terminalId));

  const task = resolveTaskByTaskId(taskId);
  await task?.terminals.killTerminal(terminalId);

  capture('terminal_deleted', {
    task_id: taskId,
    terminal_id: terminalId,
  });
}
```

---

### Task 8: Update TerminalProvider Implementations

**Files:**
- Modify: `src/main/core/terminals/impl/local-terminal-provider.ts`
- Modify: `src/main/core/terminals/impl/ssh-terminal-provider.ts`

- [ ] **Step 1: Update LocalTerminalProvider**

Remove projectId, use taskId-based session ID:

```typescript
// src/main/core/terminals/impl/local-terminal-provider.ts
import type { GeneralSessionConfig } from '@shared/general-session';
import { makeTerminalSessionId } from '@shared/ptySessionId';
import { Terminal } from '@shared/terminals';
import { spawnLocalPty } from '@main/core/pty/local-pty';
import { Pty } from '@main/core/pty/pty';
import { buildTerminalEnv } from '@main/core/pty/pty-env';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { resolveSpawnParams } from '@main/core/pty/spawn-utils';
import { killTmuxSession, makeTmuxSessionName } from '@main/core/pty/tmux-session-name';
import type { ExecFn } from '@main/core/utils/exec';
import { log } from '@main/lib/logger';
import { wireTerminalDevServerWatcher } from '../dev-server-watcher';
import { type LifecycleScriptSpawnRequest, type TerminalProvider } from '../terminal-provider';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_RESPAWNS = 2;

type SpawnPolicy = {
  respawnOnExit: boolean;
  preserveBufferOnExit: boolean;
  watchDevServer: boolean;
};

export class LocalTerminalProvider implements TerminalProvider {
  private sessions = new Map<string, Pty>();
  private knownSessionIds = new Set<string>();
  private respawnCounts = new Map<string, number>();
  private readonly taskId: string;
  private readonly taskWorkDir: string;
  private readonly tmux: boolean;
  private readonly shellSetup?: string;
  private readonly exec: ExecFn;
  private readonly taskEnvVars: Record<string, string>;

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
  }) {
    this.taskId = taskId;
    this.taskWorkDir = taskWorkDir;
    this.tmux = tmux;
    this.shellSetup = shellSetup;
    this.exec = exec;
    this.taskEnvVars = taskEnvVars;
  }

  async spawnTerminal(
    terminal: Terminal,
    initialSize: { cols: number; rows: number } = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
    command?: { command: string; args: string[] }
  ): Promise<void> {
    return this.spawnWithPolicy(terminal, initialSize, command, {
      respawnOnExit: true,
      preserveBufferOnExit: false,
      watchDevServer: true,
    });
  }

  async spawnLifecycleScript({
    terminal,
    command,
    initialSize = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
    respawnOnExit = false,
    preserveBufferOnExit = true,
    watchDevServer = false,
  }: LifecycleScriptSpawnRequest): Promise<void> {
    return this.spawnWithPolicy(
      terminal,
      initialSize,
      { command, args: [] },
      {
        respawnOnExit,
        preserveBufferOnExit,
        watchDevServer,
      }
    );
  }

  private async spawnWithPolicy(
    terminal: Terminal,
    initialSize: { cols: number; rows: number },
    command: { command: string; args: string[] } | undefined,
    policy: SpawnPolicy
  ): Promise<void> {
    const sessionId = makeTerminalSessionId(this.taskId, terminal.id);
    this.knownSessionIds.add(sessionId);
    if (this.sessions.has(sessionId)) return;

    const cfg: GeneralSessionConfig = {
      taskId: this.taskId,
      cwd: this.taskWorkDir,
      shellSetup: this.shellSetup,
      tmuxSessionName: this.tmux ? makeTmuxSessionName(sessionId) : undefined,
      command: command?.command,
      args: command?.args,
    };
    const params = resolveSpawnParams('general', cfg);

    const pty = spawnLocalPty({
      id: sessionId,
      command: params.command,
      args: params.args,
      cwd: this.taskWorkDir,
      env: { ...buildTerminalEnv(), ...this.taskEnvVars },
      cols: initialSize.cols,
      rows: initialSize.rows,
    });

    if (policy.watchDevServer) {
      wireTerminalDevServerWatcher({ pty, scopeId: this.taskId, terminalId: terminal.id });
    }

    pty.onExit(() => {
      const shouldRespawn = policy.respawnOnExit && this.sessions.has(sessionId);
      this.sessions.delete(sessionId);
      if (!policy.preserveBufferOnExit) {
        ptySessionRegistry.unregister(sessionId);
      }
      if (shouldRespawn && !this.tmux) {
        const count = (this.respawnCounts.get(sessionId) ?? 0) + 1;
        this.respawnCounts.set(sessionId, count);

        if (count > MAX_RESPAWNS) {
          log.error('LocalTerminalProvider: respawn limit reached, giving up', {
            terminalId: terminal.id,
            respawnCount: count,
          });
          this.respawnCounts.delete(sessionId);
          return;
        }

        setTimeout(() => {
          this.spawnWithPolicy(terminal, initialSize, command, policy).catch((e) => {
            log.error('LocalTerminalProvider: respawn failed', {
              terminalId: terminal.id,
              error: String(e),
            });
          });
        }, 500);
      }
    });

    ptySessionRegistry.register(sessionId, pty, {
      preserveBufferOnExit: policy.preserveBufferOnExit,
    });
    this.sessions.set(sessionId, pty);
  }

  async killTerminal(terminalId: string): Promise<void> {
    const sessionId = makeTerminalSessionId(this.taskId, terminalId);
    this.knownSessionIds.delete(sessionId);
    const pty = this.sessions.get(sessionId);
    if (pty) {
      try {
        pty.kill();
      } catch {}
      this.sessions.delete(sessionId);
      ptySessionRegistry.unregister(sessionId);
    }
    if (this.tmux) {
      await killTmuxSession(this.exec, makeTmuxSessionName(sessionId));
    }
  }

  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.knownSessionIds);
    await this.detachAll();
    if (this.tmux) {
      await Promise.all(
        sessionIds.map((id) => killTmuxSession(this.exec, makeTmuxSessionName(id)))
      );
    }
    this.knownSessionIds.clear();
  }

  async detachAll(): Promise<void> {
    for (const [sessionId, pty] of this.sessions) {
      try {
        pty.kill();
      } catch {}
      ptySessionRegistry.unregister(sessionId);
    }
    this.sessions.clear();
  }
}
```

- [ ] **Step 2: Update SshTerminalProvider**

Similar changes for SSH provider.

---

### Task 9: Update Project Provider and provisionTask

**Files:**
- Modify: `src/main/core/projects/project-provider.ts`
- Modify: `src/main/core/projects/impl/local-project-provider.ts`
- Modify: `src/main/core/projects/impl/ssh-project-provider.ts`
- Modify: `src/main/core/tasks/provisionTask.ts`

- [ ] **Step 1: Update TaskProvider interface**

Update the interface to reflect new provider signatures:

```typescript
// src/main/core/projects/project-provider.ts
// TaskProvider interface remains the same, but the underlying providers change
// conversations and terminals now use taskId instead of projectId
```

- [ ] **Step 2: Update LocalProjectProvider.provisionTask**

Remove projectId from provider creation:

```typescript
// src/main/core/projects/impl/local-project-provider.ts
// In provisionTask method, update provider creation:

// Before:
const conversationProvider = new LocalConversationProvider({
  projectId: task.projectId,
  taskPath: workspace.path,
  taskId: task.id,
  ...
});

// After:
const conversationProvider = new LocalConversationProvider({
  taskId: task.id,
  taskWorkDir: task.workDir ?? workspace.path,
  ...
});

// Same for terminal provider
const terminalProvider = new LocalTerminalProvider({
  taskId: task.id,
  taskWorkDir: task.workDir ?? workspace.path,
  ...
});
```

- [ ] **Step 3: Update provisionTask.ts**

Remove worktreePath storage logic:

```typescript
// src/main/core/tasks/provisionTask.ts
// Simplify: remove worktreePath storage, use task.workDir directly
```

---

### Task 10: Update setTaskProjects Operation

**Files:**
- Modify: `src/main/core/tasks/operations/setTaskProjects.ts`

- [ ] **Step 1: Remove worktreePath handling**

```typescript
// src/main/core/tasks/operations/setTaskProjects.ts
import { eq } from 'drizzle-orm';
import { db } from '@main/db/client';
import { taskProjects } from '@main/db/schema';

export async function setTaskProjects(
  taskId: string,
  projectIds: string[]
): Promise<void> {
  // Delete existing associations
  await db.delete(taskProjects).where(eq(taskProjects.taskId, taskId));

  // Insert new associations (no worktreePath)
  if (projectIds.length > 0) {
    const values = projectIds.map((projectId) => ({ taskId: projectId, projectId }));
    await db.insert(taskProjects).values(values);
  }
}
```

---

### Task 11: Update Renderer ConversationManagerStore

**Files:**
- Modify: `src/renderer/features/tasks/conversations/conversation-manager.ts`

- [ ] **Step 1: Remove projectId from ConversationManagerStore**

```typescript
// src/renderer/features/tasks/conversations/conversation-manager.ts
import { action, computed, makeObservable, observable, onBecomeObserved, runInAction } from 'mobx';
import { Conversation, CreateConversationParams } from '@shared/conversations';
import {
  agentEventChannel,
  agentSessionExitedChannel,
  isAttentionNotification,
  type NotificationType,
} from '@shared/events/agentEvents';
import { makeConversationSessionId } from '@shared/ptySessionId';
import { events, rpc } from '@renderer/lib/ipc';
import { PtySession } from '@renderer/lib/pty/pty-session';
import { soundPlayer } from '@renderer/utils/soundPlayer';

export type AgentStatus = 'idle' | 'working' | 'awaiting-input' | 'error' | 'completed';

export class ConversationManagerStore {
  private _loaded = false;
  private offAgentEvents: (() => void) | null = null;
  private offSessionExited: (() => void) | null = null;
  conversations = observable.map<string, ConversationStore>();

  constructor(
    private readonly taskId: string
  ) {
    makeObservable(this, {
      conversations: observable,
      taskStatus: computed,
    });
    onBecomeObserved(this, 'conversations', () => {
      if (this._loaded) return;
      this.load();
    });
    this.offAgentEvents = this.listenToAgentEvents();
    this.offSessionExited = this.listenToSessionExited();
  }

  // ... rest of the class methods stay similar
  // Update session ID creation in ConversationStore

  async load() {
    this._loaded = true;
    const conversations = await rpc.conversations.getConversationsForTask(this.taskId);
    runInAction(() => {
      for (const conversation of conversations) {
        const store = new ConversationStore(conversation, this.taskId);
        this.conversations.set(conversation.id, store);
        void store.session.connect();
      }
    });
  }

  // ... other methods
}

export class ConversationStore {
  data: Conversation;
  session: PtySession;
  status: AgentStatus = 'idle';
  seen = true;
  lastNotificationType: NotificationType | null = null;

  constructor(conversation: Conversation, taskId: string) {
    this.data = conversation;
    this.session = new PtySession(
      makeConversationSessionId(taskId, conversation.id)
    );
    makeObservable(this, {
      data: observable,
      session: observable,
      status: observable,
      seen: observable,
      lastNotificationType: observable,
      setStatus: action,
      setAwaitingInput: action,
      setWorking: action,
      clearWorking: action,
      markSeen: action,
      indicatorStatus: computed,
    });
  }

  // ... rest of the class
}
```

---

### Task 12: Update Renderer TerminalManagerStore

**Files:**
- Modify: `src/renderer/features/tasks/terminals/terminal-manager.ts`

- [ ] **Step 1: Remove projectId from TerminalManagerStore**

Similar to ConversationManagerStore, remove projectId and use taskId-based session ID.

---

### Task 13: Update ProvisionedTask and Task View Context

**Files:**
- Modify: `src/renderer/features/tasks/stores/task.ts`
- Modify: `src/renderer/features/tasks/task-view-context.tsx`

- [ ] **Step 1: Update ProvisionedTask**

Remove projectId from ConversationManagerStore and TerminalManagerStore creation:

```typescript
// src/renderer/features/tasks/stores/task.ts
// In ProvisionedTask constructor:

this.conversations = new ConversationManagerStore(taskData.id); // taskId only
this.terminals = new TerminalManagerStore(taskData.id); // taskId only
```

- [ ] **Step 2: Update TaskViewContext**

Ensure context doesn't require projectId for conversation/terminal operations.

---

### Task 14: Update Create Conversation Modal

**Files:**
- Modify: `src/renderer/features/tasks/conversations/create-conversation-modal.tsx`

- [ ] **Step 1: Remove projectId prop**

```typescript
// src/renderer/features/tasks/conversations/create-conversation-modal.tsx
// Remove projectId from modal props
// Use taskId only to get ConversationManagerStore
```

---

### Task 15: Update Git Changes Panel - Group by Project

**Files:**
- Modify: `src/renderer/features/tasks/diff-view/changes-panel/changes-panel.tsx`
- Modify: `src/renderer/features/tasks/diff-view/changes-panel/staged-section.tsx`
- Modify: `src/renderer/features/tasks/diff-view/changes-panel/unstaged-section.tsx`
- Modify: `src/renderer/features/tasks/diff-view/changes-panel/pr-section.tsx`

- [ ] **Step 1: Create ProjectChangesSection component**

Wrap each project's git changes in a collapsible section.

- [ ] **Step 2: Update ChangesPanel to iterate over projects**

```tsx
// src/renderer/features/tasks/diff-view/changes-panel/changes-panel.tsx
// Iterate over projectContexts.projects and render each project's changes
```

---

### Task 16: Update Worktree Service

**Files:**
- Modify: `src/main/core/projects/worktrees/worktree-service.ts`

- [ ] **Step 1: Auto-compute worktree path**

Update createWorktree to compute path automatically: `{task.workDir}/{project.name}/`

---

### Task 17: Final Integration and Testing

- [ ] **Step 1: Run typecheck**

Run: `pnpm run typecheck`
Fix any type errors.

- [ ] **Step 2: Run tests**

Run: `pnpm run test`
Fix any failing tests.

- [ ] **Step 3: Manual testing**

- Create a multi-project task
- Start a conversation, verify cwd is task.workDir
- Start a terminal, verify cwd is task.workDir
- Verify git changes are grouped by project
- Verify file tree is grouped by project

---

## Summary of Changes

| Component | Before | After |
|-----------|--------|-------|
| Conversation binding | projectId + taskId | taskId only |
| Terminal binding | projectId + taskId | taskId only |
| Session ID format | `projectId:taskId:id` | `taskId:id` |
| task_projects.worktreePath | Stored in DB | Computed dynamically |
| Conversation cwd | Project workspace | task.workDir |
| Terminal cwd | Project workspace | task.workDir |
| Git Changes UI | Single list | Grouped by project |
| Terminals UI | Per-project list | Shared list |