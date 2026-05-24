# Context

Context is a fork of [Emdash](https://github.com/generalaction/emdash) by [General Action, Inc.](https://github.com/generalaction), an agentic development environment (ADE) that lets you run multiple coding agents in parallel, each isolated in its own git worktree, either locally or over SSH.

This project builds on Emdash with additional features, bug fixes, and infrastructure improvements.

## Origin & License

Context is derived from [Emdash](https://github.com/generalaction/emdash), originally developed by General Action, Inc. and licensed under the Apache License 2.0. This project remains under the same license. See [LICENSE.md](LICENSE.md) for full terms.

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

## Features

### Parallel Agent Execution

Run multiple coding agents (Claude Code, Codex, Qwen Code, etc.) in parallel, each in an isolated git worktree.

### Workspace Management

Organize projects into workspaces for structured multi-repo development.

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
