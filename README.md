# Context

> [English](README_en.md) | 中文

---

> **本项目是 [Emdash](https://github.com/generalaction/emdash) 的衍生作品** — Emdash 是由 [General Action, Inc.](https://github.com/generalaction) 开发的智能开发环境，支持并行运行多个编码助手，每个助手隔离在独立的 git worktree 中，可在本地或远程 SSH 上运行。
>
> Context 基于上游 Emdash 项目（Apache License 2.0）构建，在此基础上增加了工作空间编排、多项目任务管理、UI 优化以及 Windows 兼容性修复等功能。

## 上游项目声明

本项目起源于 [Emdash](https://github.com/generalaction/emdash)，由 General Action, Inc. 根据 [Apache License 2.0](https://github.com/generalaction/emdash/blob/main/LICENSE) 开源。

本仓库是从上游 Emdash 仓库独立克隆而来，后续所有开发均跟踪本地分支（`v1.2`、`v2.0`、`v2.1`）。

所有上游版权和许可条款均保留在 [LICENSE.md](LICENSE.md) 中。

## 功能特性

### 灵活的上下文管理

Context 的核心创新是将 git worktree 作为桥梁 — **将不同的 git 项目从物理边界中解放出来，自由组合到编码助手的统一上下文中**。

**通过 Worktree 实现统一代理上下文** — 任意选择多个 git 项目，将它们注入到同一个编码助手会话中（Claude Code、Codex、Qwen Code 等）。代理将工作空间中的所有项目视为一个统一的工作上下文：它可以跨仓库读取文件、协调前端和后端的修改，并在一个 PTY 会话中管理所有项目。每个项目检出到独立的 worktree 子目录，保持各自的 git 历史和分支状态，而代理将它们作为一个逻辑工作区来操作。

**工作空间隔离** — 每个工作空间是一个完全隔离的上下文，拥有独立的文件系统提供者、git 操作、项目设置和生命周期脚本。工作空间采用引用计数管理，独立释放，同时运行多个工作空间不会泄漏状态或资源。基于分支的工作空间 key 机制确保不同任务分支在完全隔离的环境中运行。

**Task 与 Project 自由绑定** — Task 不再绑定到单一项目。一个 Task 可以跨越多个项目，每个项目有独立的源分支和 worktree。反过来，一个项目也可以参与多个不同工作空间中的 Task。这种多对多的关系意味着你可以：
- 创建一个同时涉及 `web-app` 和 `api-server` 的 Task，在一个视图中跟踪两个项目的变更
- 为同一个项目分别创建不同任务 — 一个做功能分支，一个做热修复 — 互不冲突
- 随着工作范围的演变，动态向工作空间添加或移除项目

### 并行代理执行

并行运行多个编码助手（Claude Code、Codex、Qwen Code 等），每个代理隔离在独立的 git worktree 中。代理在工作空间的上下文中运行，每个项目有独立的 PTY 会话和文件监视。

### 远程开发

通过 SSH 连接到远程机器，在远程代码库上工作。支持 SSH Agent 和密钥认证，凭据安全存储在系统密钥链中。

### 工单集成

将 Linear、GitHub 或 Jira 工单直接传递给编码助手。在同一个界面中审查差异、测试变更、创建 PR 和合并。

## 安装

可从 [GitHub Releases](https://github.com/feng3286/context/releases) 页面下载。

### Windows

- 安装程序 (x64): https://github.com/feng3286/context/releases/latest/download/context-x64.msi
- 便携版 (x64): https://github.com/feng3286/context/releases/latest/download/context-x64.exe

### macOS (arm64)

- DMG: https://github.com/feng3286/context/releases/latest/download/context-arm64.dmg
- ZIP: https://github.com/feng3286/context/releases/latest/download/context-arm64.zip

### Linux (x64)

- AppImage: https://github.com/feng3286/context/releases/latest/download/context-x64.AppImage
- deb: https://github.com/feng3286/context/releases/latest/download/context-x64.deb
- RPM: https://github.com/feng3286/context/releases/latest/download/context-x64.rpm

### 从源码构建

```bash
pnpm install
pnpm run dev
```

## 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm run dev

# 构建生产版本
pnpm run build

# 打包
pnpm run package:win   # Windows
```

## 贡献

欢迎提交贡献！请先阅读 `AGENTS.md` 中的代码规范，然后提交 PR。

## 许可证

本项目采用 [Apache License 2.0](LICENSE.md) 许可。

Context 是 [Emdash](https://github.com/generalaction/emdash) 的衍生作品，原始项目由 General Action, Inc. 开发并根据 Apache License 2.0 许可。本仓库中的修改和补充版权归 maofeng 和贡献者所有，Copyright 2026。

详见 [LICENSE.md](LICENSE.md) 中的完整条款。

## 常见问题

<details>
<summary><b>你们收集什么遥测数据？可以禁用吗？</b></summary>

> 匿名、白名单事件（应用启动/关闭、功能使用名称、应用/平台版本）会发送到 PostHog。
> 我们不会发送代码、文件路径、仓库名、提示词或个人信息。
>
> **禁用遥测：**
>
> - 在应用内：**Settings → General → Privacy & Telemetry**（关闭开关）
> - 或在启动前设置环境变量：`TELEMETRY_ENABLED=false`

</details>

<details>
<summary><b>我的数据存储在哪里？</b></summary>

> **应用数据本地优先**。我们将应用状态存储在本地 SQLite 数据库中：
>
> ```
> macOS:   ~/Library/Application Support/emdash/emdash.db
> Windows: %APPDATA%\emdash\emdash.db
> Linux:   ~/.config/emdash/emdash.db
> ```
>
> 隐私说明：使用任何编码助手（Claude Code、Codex、Qwen 等）时，你的代码和提示词会发送到该提供商的云端 API 服务器进行处理。每个提供商都有自己的数据处理和保留政策。
>
> 你可以通过删除本地数据库来重置（请先退出应用）。文件会在下次启动时重新创建。

</details>

<details>
<summary><b>可以通过 SSH 处理远程项目吗？</b></summary>

> 可以！前往 **Settings → SSH Connections** 添加你的服务器详情。
> 选择认证方式：SSH Agent（推荐）、私钥或密码。
> 添加远程项目并指定服务器上的路径。
>
> 要求：能够 SSH 访问远程服务器，远程服务器上已安装 Git。

</details>
