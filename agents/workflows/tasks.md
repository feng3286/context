# Task Orchestration

## Main Files

- `src/main/core/tasks/createMultiProjectTask.ts` — Three-phase task creation
- `src/main/core/tasks/addProjectToTask.ts` — Add project to existing task
- `src/main/core/tasks/provisionTask.ts` — Worktree provisioning for a single project
- `src/main/core/tasks/generateAgentsMd.ts` — AGENTS.md generation for multi-project tasks
- `src/main/core/tasks/resolveTaskBranchName.ts` — Branch name resolution
- `src/main/core/tasks/operations/getTaskProjects.ts` — Query task-project bindings
- `src/main/core/tasks/operations/setTaskProjects.ts` — Set task-project bindings
- `src/main/core/tasks/controller.ts` — RPC handlers
- `src/main/db/schema.ts` — `tasks`, `task_projects` tables

## Three-Phase Task Creation (`createMultiProjectTask`)

When `createBranch=true` and `projectCount > 1`:

**Phase 1 — Git Branch Creation** (parallel per project)
- Check repository is not unborn (must have at least one commit)
- Create task branch from source branch in each project
- If any project fails, roll back all previously created branches

**Phase 2 — Worktree Provisioning** (parallel per project)
- Call `projectManager.getProject(id).provisionTask()` for each project
- Provision is atomic per project — creates worktree, checks out branch
- If any project fails, roll back all worktrees and branches

**Phase 3 — Database Insert** (sequential)
- Insert task row into `tasks` table
- Insert all project bindings into `task_projects` table
- Generate `AGENTS.md` in the task worktree (only when `projectCount > 1`)
- If DB fails, roll back all worktrees and branches

### taskBranch Empty vs Non-Empty

| Scenario | `taskBranch` value | Branch creation | Provision uses |
|----------|-------------------|-----------------|----------------|
| Non-empty | `"feature-xyz"` | Creates branch `task/feature-xyz-abcde` | taskBranch |
| Empty/null | `""` or `null` | Skipped | sourceBranch directly |

## Adding Projects to Existing Tasks (`addProjectToTask`)

- Validates task exists, project exists, project is in the same workspace, and not already bound
- When task has a `taskBranch`: creates a new branch for the project, provisions on taskBranch
- When task has no `taskBranch`: skips branch creation, provisions on sourceBranch
- Inserts the binding into `task_projects`, regenerates `AGENTS.md` if project count > 1
- Rolls back branch/worktree on provisioning or DB failure

## AGENTS.md Generation

- Generated at `<task-worktree>/AGENTS.md`
- Contains context from all bound projects (project ID, source branch)
- Only generated when a task has more than one project
- Regenerated when projects are added or removed

## Rules

- Never skip Phase 1 error checking — if any project fails branch creation, all must be rolled back
- `taskBranch` must never be `null` in the DB — use empty string `""` for branchless tasks
- When changing task creation logic, update `createMultiProjectTask.test.ts`
- When changing add-project logic, update `addProjectToTask.test.ts`
