# Main Process

## Structure

The main process is organized into domain modules under `src/main/core/`. Each domain typically has a `controller.ts` (RPC handlers) and service/implementation files.

## Domain Modules (`src/main/core/`)

- **account** — Account service, credential store, provider token registry
- **agent-hooks** — HTTP hook server for agent callbacks, event enrichment, OS notifications, hook config writer (Claude/Codex)
- **app** — App lifecycle service and controller
- **conversations** — Conversation CRUD, session start, agent event classifiers (per-provider terminal output parsers)
- **dependencies** — CLI agent detection, probing, dependency management
- **editor** — Editor buffer service for Monaco integration
- **forgejo** — Forgejo integration (self-hosted Git)
- **fs** — Filesystem operations with provider pattern (`local-fs.ts`, `ssh-fs.ts`)
- **git** — Git operations (`git-service.ts`, `git-repo-utils.ts`, `detectGitInfo.ts`)
- **github** — GitHub auth, PRs, issues, repos (via `gh` CLI)
- **gitlab** — GitLab integration
- **issues** — Generic issue tracking abstraction
- **jira** — Jira integration
- **linear** — Linear integration
- **marketplace** — Configurable marketplace system for MCP servers and Skills
- **mcp** — MCP service, adapters, config IO, catalog
- **plain** — Plain.com integration
- **projects** — Project management with provider pattern (`local-project-provider.ts`), worktree service, project settings, CRUD operations
- **pty** — PTY lifecycle (`local-pty.ts`, `ssh2-pty.ts`), session registry, env setup, spawn utilities
- **pull-requests** — PR query engine, sync scheduler, project remotes service
- **repository** — Repository controller
- **secrets** — Encrypted app secrets store
- **settings** — App settings service and schema, override settings
- **shared** — Shared utilities (OAuth flow)
- **skills** — Skills service and controller
- **ssh** — SSH connection management, credentials, config parsing, client proxy
- **tasks** — Task CRUD and orchestration: create multi-project tasks, add/remove projects, provision, archive, restore, delete, rename, update status, set pinned, linked issues, AGENTS.md generation
- **telemetry** — PostHog telemetry collection and consent management
- **terminals** — Terminal lifecycle with provider pattern (`local-terminal-provider.ts`, `ssh-terminal-provider.ts`), lifecycle scripts
- **updates** — Auto-update service (electron-updater integration, GitHub provider)
- **utils** — Shell environment, shell escaping, child process env, external links
- **view-state** — UI view state persistence
- **workspaces** — Workspace CRUD, add/remove projects, workspace-centric data model

## Other Main Process Areas

- `src/main/app/` — Menu, protocol handler, window creation
- `src/main/lib/` — Logger, telemetry, events, Result type, updater error
- `src/main/db/` — Database schema (Drizzle ORM, SQLite), initialization, migrations
- `src/main/utils/` — Shell environment, shell escaping, child process env, external links

## IPC / RPC Structure

- All domain controllers are assembled into a typed RPC router in `src/main/rpc.ts`.
- RPC primitives live in `src/shared/ipc/rpc.ts` (`createRPCRouter`, `createRPCController`, `createRPCClient`).
- Event primitives live in `src/shared/ipc/events.ts`.
- A small number of manual IPC handlers remain in `electron-api.d.ts` for methods requiring `event.sender` (PTY start/input/resize/kill, fsList, openIn).

## When Editing Here

- Check `agents/conventions/main-patterns.md` for controller, service, Result type, and event patterns.
- Check `agents/conventions/ipc.md` for the RPC controller pattern and typing rules.
- Check `agents/risky-areas/pty.md` before touching PTY or provider spawn behavior.
- Check `agents/risky-areas/database.md` before changing persistence or migrations.
- Check `agents/workflows/tasks.md` before modifying task creation or provisioning logic.
- Check `agents/workflows/workspaces.md` before modifying workspace orchestration.
