# Workspace Orchestration

## Main Files

- `src/main/core/workspaces/operations/` — CRUD operations (create, update, delete, list, getWorkspace, getProjectWorkspaces, etc.)
- `src/main/core/workspaces/controller.ts` — RPC handlers
- `src/main/db/schema.ts` — `workspaces`, `workspace_projects` tables

## Data Model

**Many-to-many relationships:**
- A workspace can contain multiple projects (`workspace_projects`)
- A task can span multiple projects (`task_projects`)
- A project can participate in multiple workspaces and multiple tasks

**Tables:**
- `workspaces` — workspace metadata (id, name, workspace key based on task branch)
- `workspace_projects` — workspace-to-project bindings
- `task_projects` — task-to-project bindings with source branch per project

## Workspace Lifecycle

- Workspaces are reference-counted instances managed by `workspaceManagerStore`
- Each workspace has its own filesystem provider, git operations, settings, and lifecycle scripts
- Workspace key is branch-based — different task branches get isolated workspace environments
- Disposal is independent — releasing one workspace does not affect others

## Renderer Store

- `workspaceManagerStore` — singleton managing all workspace instances
- `getWorkspaceStore(workspaceId)` → `WorkspaceStore | undefined`
- `asMounted(getProjectStore(id))` → `MountedProject | undefined`
- Workspace load triggers project discovery and store initialization

## Rules

- Access workspace via `getWorkspaceStore(workspaceId)`, not through project store
- Workspace key collisions are resolved by branch name — same branch = same workspace
- When adding/removing projects from a workspace, ensure both DB and in-memory state are updated
- Do not bypass workspace isolation — each workspace must have its own providers
