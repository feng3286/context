# Context

> **This project is a derivative work of [Emdash](https://github.com/generalaction/emdash)** — an agentic development environment developed by [General Action, Inc.](https://github.com/generalaction) that lets you run multiple coding agents in parallel, each isolated in its own git worktree, either locally or over SSH.
>
> Context is derived from the upstream Emdash project under the Apache License 2.0. The vast majority of the upstream codebase remains intact; this project adds workspace orchestration, multi-project task management, UI refinements, and Windows compatibility fixes on top of the Emdash foundation.

## Upstream Attribution

The origin and core of this project is [Emdash](https://github.com/generalaction/emdash), originally developed and open-sourced by General Action, Inc. under the [Apache License 2.0](https://github.com/generalaction/emdash/blob/main/LICENSE).

This repository is **not a fork on GitHub** — it was created as an independent clone from the upstream Emdash repository, with all subsequent development tracked on local branches (`v1`, `v1.1`, `v1.2`, `v2.0`, `v2.1`). Over the course of development, **484+ merge commits** were pulled in from upstream `generalaction/emdash/*` branches to stay synchronized with the latest Emdash features and fixes, while **900+ unique commits** were authored in this repository for custom features, bug fixes, and UI improvements.

All upstream copyright and license terms are preserved in [LICENSE.md](LICENSE.md).

## Development History

This section documents the custom development performed in this repository beyond the upstream Emdash project. The git history spans from the initial commit `779fa400` (September 2025) through the current `v2.1` branch head `d467348f` (May 2026), encompassing approximately **1,446 total commits** on the `v2.1` branch alone.

### Branch Lineage

```
v2.1 (current default branch)
  └─ v2.0
       └─ v1.2
            └─ v1.1
                 └─ v1
                      └─ initial clone from upstream Emdash
```

Each branch represents a development epoch. Upstream changes were regularly merged from `generalaction/emdash/*` branches (484+ upstream merges) to incorporate the latest Emdash improvements, while custom development proceeded on parallel tracks.

### v1 — Initial Release Line (Sep – Oct 2025)

**Scope:** ~150 commits from the initial Emdash clone through release 1.0.x.

The v1 branch established the foundation of this project as a derivative of Emdash. Key developments:

- Initial Electron app setup with TypeScript and Tailwind CSS (`629e991e`)
- Repository manager integration (`b2a19fc2`)
- Onboarding flow implementation and fixes
- Linear, GitHub, and Jira ticket integration
- Provider CLI orchestration (Claude Code, Codex, Qwen Code, etc.)
- PTY terminal session management
- Git worktree isolation for parallel agent execution
- Multiple patch releases (1.0.9 through 1.0.15)

Notable commits: `0f1a4743` (release 1.0.9), `be71cf56` (release 1.0.10), `a5d583e8` (release 1.0.11), `2ce0bab4` (release 1.0.12), `f5056885` (release 1.0.13), `c223ee1b` (release 1.0.14), `ac144391` (release 1.0.15).

### v1.1 — Stability & Remote Development (Nov 2025 – Jan 2026)

**Scope:** Releases 1.1.0 through 1.1.3.

- **Remote development**: SSH/SFTP support for remote codebases with secure credential storage in OS keychain
- SSH connection management UI (Settings → SSH Connections)
- Project error handling improvements (`caa210d5`)
- Onboarding flow refinments and bug fixes (`88663200`, `45d92545`)
- App identity promotion from v1-beta to v1-stable channel (`f26c854c`, `78ab5037`)
- PR-to-task association fixes (`c1d015c8`)
- Telemetry privacy controls (opt-in PostHog, disableable via env var or in-app settings)

Release commits: `6edbd421` (1.1.1), `dcd69102` (1.1.2), `6bf740e4` (1.1.3).

### v1.2 — Windows Compatibility & IDE Integration (Feb – Mar 2026)

- **Windows compatibility**: Desktop compatibility fixes for worktree checkout and PTY session spawn (`a97fc3fc`)
- Bash detection improvements to prevent cmd.exe window flashing on Windows (`696335b5`)
- **Open in IDE**: Pass active file path from editor/diff view to VS Code, Cursor, Windsurf (`a442b157`, `c97955ce`, `f24cad54`, `0a33a0b9`)
- Customizable branch names, skip-new-branch option, and worktree directory configuration (`0e025d63`)
- Azure code signing configuration for CI builds (`4d449413`)

### v2.0 — Workspace Foundation (Mar – Apr 2026)

**Scope:** Major architectural shift from single-project to multi-project workspace model.

- **Workspace support**: Full workspace management UI — create, list, detail views (`ceb54cb1`, `ac087828`, `55c81256`, `abd2f605`)
- Database schema: `workspaces` table, `workspace_projects` junction table, `task_projects` junction table, `workspaceId` and `workDir` columns on tasks (`6e6908d1`, `2f1c82aa`, `f8837a06`, `23051de6`, `9368caa7`)
- Workspace RPC controller and operations (`bcc084f1`, `fcccb4d3`)
- Shared types for `Workspace` and workspace-aware `Task` types (`3ae1139e`, `3498b4fe`)
- `WorkspaceManagerStore` and `WorkspaceStore` (MobX state management) (`343e1b4a`)
- UI reorganization: workspace list moved to sidebar with create button (`359d6a84`)
- Separate dev database configuration via `cross-env` (`86fc77d7`, `b720e17c`)

### v2.1 — Multi-Project Tasks & Polish (Apr – May 2026)

**Scope:** Task model refactor to use `workspace_id` as primary foreign key, removing `tasks.project_id`.

- **Task model refactor**: Removed `tasks.project_id` column; `workspace_id` is now the sole task-to-workspace linkage (`aaf52874`)
- Multi-project task diff view fix (`9bf7cc4c`)
- Task conversation refactor for multi-project support (`929378a5`)
- Project detail page with beautified UI (`718fbb1d`, `a0691f69`)
- Single-project task creation paths removed; task deletion crash fixed (`41e43eee`)
- Use project subdirectory as cwd for single-project task sessions (`d467348f`)
- Windows signing restored for CI builds (`4d449413`)
- UI improvements: Monaco editor theming (`3826002c`), drag fixes in onboarding (`d76b23c1`)

## Changes from Upstream

### v2.1

- **Workspace support**: Multi-project workspace orchestration with add/remove project operations.
- **Task model refactor**: Removed `tasks.project_id` column in favor of `workspace_id` as the primary foreign key.
- **Single-project task cleanup**: Removed legacy single-project task creation paths and fixed task deletion crash.
- **Task session improvements**: Use project subdirectory as cwd for single-project task sessions.
- **Windows signing**: Restored Azure code signing configuration for CI builds.

### v1.x

- **Remote development**: SSH/SFTP support for remote codebases with secure credential storage.
- **Telemetry**: Opt-in anonymous telemetry via PostHog, fully disableable in-app or via environment variable.
- **Windows compatibility**: PTY session spawn, worktree checkout, and IDE integration fixes for Windows.
- **UI refinements**: Workspace sidebar navigation, project detail pages, Monaco editor theming.

## Features

### Parallel Agent Execution

Run multiple coding agents (Claude Code, Codex, Qwen Code, etc.) in parallel, each in an isolated git worktree.

### Workspace Management

Organize projects into workspaces for structured multi-repo development. Add and remove projects from workspaces, view project details, and track tasks across all projects in a workspace.

### Remote Development

Connect to remote machines via SSH to work with remote codebases. Supports SSH agent and key authentication, with secure credential storage in your OS keychain.

### Ticket Integration

Pass tickets directly from Linear, GitHub, or Jira to your coding agent. Review diffs, test changes, create PRs, and merge — all from one place.

## Installation

### macOS

- Apple Silicon: https://github.com/feng3286/context/releases/latest/download/emdash-arm64.dmg
- Intel x64: https://github.com/feng3286/context/releases/latest/download/emdash-x64.dmg

### Windows

- Installer (x64): https://github.com/feng3286/context/releases/latest/download/emdash-x64.msi
- Portable (x64): https://github.com/feng3286/context/releases/latest/download/emdash-x64.exe

### Linux

- AppImage (x64): https://github.com/feng3286/context/releases/latest/download/emdash-x86_64.AppImage
- Debian package (x64): https://github.com/feng3286/context/releases/latest/download/emdash-amd64.deb

### Build from Source

```bash
pnpm install
pnpm run dev
```

## Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Package for your platform
pnpm run package:win   # Windows
pnpm run package:mac   # macOS
pnpm run package:linux # Linux
```

## Contributing

Contributions are welcome! Please read the codebase conventions in `AGENTS.md` and open a PR.

## License

This project is licensed under the [Apache License 2.0](LICENSE.md).

Context is a derivative work of [Emdash](https://github.com/generalaction/emdash), originally developed by General Action, Inc. and licensed under the Apache License 2.0. Modifications and additions in this repository are Copyright 2026 maofeng and contributors.

See [LICENSE.md](LICENSE.md) for full terms.

## FAQ

<details>
<summary><b>What telemetry do you collect and can I disable it?</b></summary>

> Anonymous, allow-listed events (app start/close, feature usage names, app/platform versions) are sent to PostHog.
> We do not send code, file paths, repo names, prompts, or PII.
>
> **Disable telemetry:**
>
> - In the app: **Settings → General → Privacy & Telemetry** (toggle off)
> - Or via env var before launch: `TELEMETRY_ENABLED=false`

</details>

<details>
<summary><b>Where is my data stored?</b></summary>

> **App data is local-first**. We store app state in a local SQLite database:
>
> ```
> macOS:   ~/Library/Application Support/emdash/emdash.db
> Windows: %APPDATA%\emdash\emdash.db
> Linux:   ~/.config/emdash/emdash.db
> ```
>
> Privacy Note: When you use any coding agent (Claude Code, Codex, Qwen, etc.), your code and prompts are sent to that provider's cloud API servers for processing. Each provider has their own data handling and retention policies.
>
> You can reset the local DB by deleting it (quit the app first). The file is recreated on next launch.

</details>

<details>
<summary><b>Can I work with remote projects over SSH?</b></summary>

> Yes! Go to **Settings → SSH Connections** and add your server details.
> Choose authentication: SSH agent (recommended), private key, or password.
> Add a remote project and specify the path on the server.
>
> Requirements: SSH access to the remote server, Git installed on the remote server.

</details>
