# Context

> [中文](README.md) | English

---

> **This project is a derivative work of [Emdash](https://github.com/generalaction/emdash)** — an agentic development environment developed by [General Action, Inc.](https://github.com/generalaction) that lets you run multiple coding agents in parallel, each isolated in its own git worktree, either locally or over SSH.
>
> Context is derived from the upstream Emdash project under the Apache License 2.0. The vast majority of the upstream codebase remains intact; this project adds workspace orchestration, multi-project task management, UI refinements, and Windows compatibility fixes on top of the Emdash foundation.

## Upstream Attribution

The origin and core of this project is [Emdash](https://github.com/generalaction/emdash), originally developed and open-sourced by General Action, Inc. under the [Apache License 2.0](https://github.com/generalaction/emdash/blob/main/LICENSE).

This repository was created as an independent clone from the upstream Emdash repository, with all subsequent development tracked on local branches (`v1.2`, `v2.0`, `v2.1`).

All upstream copyright and license terms are preserved in [LICENSE.md](LICENSE.md).

## Features

### Flexible Context Management

Context's core innovation is using git worktree as a bridge — **freeing different git repositories from their physical boundaries and composing them into a single, unified coding agent context**.

**Unified Agent Context via Worktree** — Pick any combination of git repositories and inject them into one coding agent session (Claude Code, Codex, Qwen Code, etc.). The agent sees all projects in its workspace as a single working context: it can read files across repos, make coordinated changes spanning a frontend and its backend, and manage them under one PTY session. Each project is checked out into its own worktree subdirectory, maintaining independent git history and branch state, while the agent operates on them as one logical workspace.

**Workspace Isolation** — Each workspace is a fully isolated context with its own filesystem provider, git operations, project settings, and lifecycle scripts. Workspaces are reference-counted and disposed independently, so running multiple workspaces simultaneously never leaks state or resources. Branch-based workspace keying ensures that different task branches operate in completely separate environments.

**Free Task-Project Binding** — Tasks are no longer locked to a single project. A task can span multiple projects, each with its own source branch and worktree. Conversely, a single project can participate in multiple tasks across different workspaces. This many-to-many relationship means you can:
- Create one task that touches both `web-app` and `api-server`, tracking changes across both in a single view
- Spin up separate tasks for the same project — one for a feature branch, another for a hotfix — without conflict
- Add or remove projects from a workspace dynamically as the scope of work evolves

### Parallel Agent Execution

Run multiple coding agents (Claude Code, Codex, Qwen Code, etc.) in parallel, each in an isolated git worktree. Agents operate within the context of their workspace, with per-project PTY sessions and file watching.

### Remote Development

Connect to remote machines via SSH to work with remote codebases. Supports SSH agent and key authentication, with secure credential storage in your OS keychain.

### Ticket Integration

Pass tickets directly from Linear, GitHub, or Jira to your coding agent. Review diffs, test changes, create PRs, and merge — all from one place.

## Installation

Downloads are available from the [GitHub Releases](https://github.com/feng3286/context/releases) page.

### Windows

- Installer (x64): https://github.com/feng3286/context/releases/latest/download/context-x64.msi
- Portable (x64): https://github.com/feng3286/context/releases/latest/download/context-x64.exe

### macOS (arm64)

- DMG: https://github.com/feng3286/context/releases/latest/download/context-arm64.dmg
- ZIP: https://github.com/feng3286/context/releases/latest/download/context-arm64.zip

### Linux (x64)

- AppImage: https://github.com/feng3286/context/releases/latest/download/context-x64.AppImage
- deb: https://github.com/feng3286/context/releases/latest/download/context-x64.deb
- RPM: https://github.com/feng3286/context/releases/latest/download/context-x64.rpm

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

# Package
pnpm run package:win   # Windows
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
