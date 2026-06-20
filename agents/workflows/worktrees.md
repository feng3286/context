# Worktrees

## Main Files

- `src/main/core/projects/worktrees/worktree-service.ts`
- `src/main/core/projects/project-manager.ts`
- `src/main/core/terminals/runLifecycleScript.ts`
- `.emdash.json`

## Current Behavior

- Task worktrees are created under the project's `.emdash/worktrees/` directory
- Branch prefix defaults to `task` and is configurable in app settings
- Selected gitignored files are preserved into worktrees
- Worktree creation is managed by the project provider pattern
- Multi-project tasks create worktrees for each project, each with its own branch

## `.emdash.json`

Current supported keys:

- `preservePatterns`
- `scripts.setup`
- `scripts.run`
- `scripts.teardown`
- `shellSetup`
- `tmux`

## Rules

- Do not hardcode worktree paths; use service helpers
- Use lifecycle config for repo-specific bootstrap and teardown behavior
- `shellSetup` runs inside each PTY before the interactive shell starts
- tmux wrapping is project-configurable and affects PTY lifecycle behavior
- Multi-project task worktrees must be provisioned atomically — failure in any project triggers rollback of all created worktrees and branches
