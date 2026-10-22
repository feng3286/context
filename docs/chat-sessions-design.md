# 图形化会话管理设计（会话列表 + 对话视图）

> 状态：设计提案 v1 · 2026-10-21 · 分支 v2.3.1
> 参考：Claude Code 官方 GUI 生态（opcode/claudia 的 transcript 渲染路线）、TypingMind/ChatGPT 式会话列表交互、本仓库 `docs/agent-team-design.md`（共享消息渲染基座）

## 0. TL;DR

当前每个 agent 会话 = 一个交互式 TUI 跑在 xterm 终端里。本提案新增**图形化会话层**：

1. **会话列表（Session Center）**：跨项目聚合所有 conversation，显示 provider、运行状态、最后消息摘要、未读数，一键跳转 —— 像 IM 的会话列表。
2. **对话视图（Chat View）**：把 agent 会话渲染成结构化消息流（markdown + 工具调用折叠块 + 输入框），作为终端的**并列模式**（一键切换，终端保留）。

核心技术决策：

| 决策 | 选择 | 理由 |
|---|---|---|
| 结构化消息来源 | **A. Transcript 文件监听**（主线） | 不改 CLI 运行方式；TUI 的权限确认/plan mode/slash 全保留；终端与 Chat 天然不脱节（同一真相源的两个投影） |
| 兜底 | **C. 原始输出卡片** | 无 transcript 格式的 provider 降级为「最近终端输出」块，UI 不缺席 |
| 远期增强 | **B. Headless JSON 流** | 仅对支持的 provider 逐步切换，解锁内联权限按钮；v1 不做 |
| 消息落库 | **不落库** | transcript 文件是真相源，避免双写不一致；重放 = 按需解析文件 |
| 输入通道 | **复用 PTY 注入** | Chat 输入框 → bracketed-paste → `pty.sendInput`，与终端打字完全同路 |

现状基础（探索证实）：

| 需求 | 现有设施 | 缺口 |
|---|---|---|
| 会话与状态 | `ConversationManagerStore`（working/awaiting-input/completed/error）、`agentEventChannel` | 无消息级数据 |
| 确定性会话 ID | `conversation:<taskId>:<conversationId>`（`src/shared/ptySessionId.ts:28-39`） | — |
| Claude transcript 探测 | `hasResumableSession` 已解析 `~/.claude/projects/<cwdHash>/<id>.jsonl`（`local-conversation.ts:222-233`） | 只判存在，不解析内容 |
| 输出事件通道 | `ptyDataChannel`（16ms 批量）、hook-server `lastAssistantMessage`（`agentEvents.ts:21-55`）、21 个 provider 状态 classifier | 无消息结构化 |
| 输入注入 | `pastePromptInjection`（bracketed-paste，除 Claude 外）+ Claude 直写 | — |
| 多会话 UI | `TabbedPtyPanel` + 离屏 xterm host（tab 切换终端实例存活） | 无列表视图、无消息渲染 |
| 消息持久化 | `messages` 表为遗留空表；CLI transcript 各自落盘（jsonl） | 无统一解析层 |

---

## 1. 三条路线的取舍（为什么是 Transcript 监听）

```
A. Transcript 文件监听          B. Headless JSON 流            C. TUI 输出解析
────────────────────           ─────────────────────          ─────────────────────
PTY 跑 TUI（不变）              改用 -p --output-format 跑      PTY 输出 ANSI 剥离+正则
  └─ CLI 自己写 jsonl             └─ 失去 TUI 交互能力             └─ 与 TUI 版本强耦合
     └─ watcher tail + 解析          （权限/plan/命令自实现）        极脆弱
        → 结构化消息                  → 结构化消息
```

| | A | B | C |
|---|---|---|---|
| 消息质量 | 高（role/tool/usage 全结构化） | 最高（官方流） | 低（猜文本块） |
| 交互能力 | **完整保留**（TUI 还在终端跑） | 需逐一自实现 | 完整保留 |
| per-provider 成本 | parser（格式可能变，需容错） | 输入循环+权限代理，最大 | 正则维护地狱 |
| 终端与 Chat 一致性 | 天然一致 | 两套运行时 | 天然一致 |
| 失败模式 | parser 降级到 C | 会话直接坏 | 静默错乱 |

**A 是唯一同时满足「不破坏 CLI 复用」与「消息结构化」的路线**；B 是 A 之上的远期增强（同一 `ChatMessage` 模型，来源可切换）；C 仅作 A 失效时的显示兜底。

各 provider transcript 现状（P1 需逐一实测确认格式）：

| Provider | Transcript 位置 | 覆盖策略 |
|---|---|---|
| claude | `~/.claude/projects/<cwdHash>/<sessionId>.jsonl`（路径算法已实现） | P1 parser |
| codex | `~/.codex/sessions/<Y>/<M>/<D>/rollout-*.jsonl`（按时间目录，需索引 sessionId→文件） | P1 parser |
| gemini / qwen | `~/.gemini/tmp/<hash>/`（fork 同源） | P2 parser |
| 其余 20 个 | 格式各异或无本地落盘 | C 兜底，逐个适配 |

---

## 2. 概念模型

### 2.1 统一消息模型（`src/shared/chat.ts`，新）

```ts
export type ChatRole = 'user' | 'assistant' | 'system' | 'tool';

export type ChatBlock =
  | { kind: 'text'; text: string }                 // markdown
  | { kind: 'thinking'; text: string }             // collapsed by default
  | { kind: 'tool_use'; name: string; input: unknown; toolUseId: string }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { kind: 'raw'; text: string };                 // 路线 C 兜底：原始终端输出片段

export interface ChatMessage {
  id: string;                    // provider 原生 id 或 `${sessionId}:${offset}`
  sessionId: string;             // conversation:<taskId>:<conversationId>
  role: ChatRole;
  blocks: ChatBlock[];
  timestamp: string;
  tokens?: { input: number; output: number; cachedRead?: number };
}

export interface ChatSourceInfo {
  capability: 'transcript' | 'raw';   // 决定 Chat 视图是否可用/降级
  parserVersion: string;
}
```

### 2.2 会话列表条目

```ts
export interface SessionSummary {
  sessionId: string;
  conversationId: string;
  taskId: string;
  projectId: string;
  projectName: string;
  provider: AgentProviderId;
  title: string;               // conversation.title（现有列）
  status: 'working' | 'awaiting-input' | 'completed' | 'error' | 'exited';  // 复用现有状态机
  lastMessagePreview: string;  // watcher 记录的最后一条 assistant/user 文本（≤120 字）
  lastMessageAt?: string;
  unread: number;              // 渲染层内存计数（见 §5.3）
  chatCapable: boolean;        // transcript parser 可用
}
```

---

## 3. 主进程架构：`src/main/core/transcripts/`

```
src/main/core/transcripts/
├── controller.ts            # RPC: getMessages, getSessionSummaries, markReadSource
├── transcript-watcher.ts    # 每活动会话一个 watcher：增量读 + 残行缓存 + 事件发射
├── parsers/
│   ├── types.ts             # TranscriptParser 接口
│   ├── claude.ts            # jsonl → ChatMessage（含 tool_use/tool_result/usage）
│   ├── codex.ts             # rollout jsonl → ChatMessage
│   ├── gemini.ts            # P2
│   └── index.ts             # registry：provider → parser | undefined（未注册 = 降级 raw）
└── session-index.ts         # sessionId → { file, offset, capability } 内存索引
```

### 3.1 Parser 接口

```ts
export interface TranscriptParser {
  provider: AgentProviderId;
  version: string;
  // 由 workDir + sessionId 定位 transcript 文件（claude 可直接算；codex 需扫描 sessions 目录）
  resolve(ctx: { workDir: string; sessionId: string; createdAt: string }): string[];
  parseLine(line: string): ChatMessage | ChatMessage[] | null;  // 未知行返回 null（容错核心）
}
```

关键容错规则：**parser 永不抛错**。未知行类型 / 字段缺失 → 返回 null 跳过；连续 N 行解析失败 → 该会话 capability 降级为 `raw` 并 emit `chatSourceDegradedChannel`（UI 顶部黄条「消息解析降级，可切换终端查看」）。

### 3.2 Watcher 语义

- **生命周期跟随 PTY**：`LocalConversationProvider.startSession` 成功后启动 watcher，`agentSessionExitedChannel` 后停止（不删索引，文件仍在）。resume 重启 → watcher 重新解析已有文件尾部（天然恢复历史）。
- **读取策略**：不依赖 `fs.watch`（Windows append 事件抖动），用 **500ms 轮询 mtime+size**，size 变化 → 从上次 offset 增量读 → 按 `\n` 切分（残行留在缓冲）→ 逐行 parse → 批量 emit。
- **重放**：`getMessages(sessionId, { before?: string, limit: 200 })` —— 默认取尾部 200 条，`before` 游标向上翻页（按文件 offset 前移读块）。大文件（长会话可达数 MB）永不全量进内存。
- **offset 持久化在内存**：重启应用后从文件尾部重新对齐（重放由渲染层按需拉取，不丢数据）。

### 3.3 事件与 RPC

新通道（`src/shared/events/chatEvents.ts`）：

```ts
export const chatMessageChannel = defineEvent<{ sessionId: string; messages: ChatMessage[] }>('chat:message');
export const chatSourceDegradedChannel = defineEvent<{ sessionId: string }>('chat:source-degraded');
```

新 RPC（`transcripts/controller.ts`，`src/main/rpc.ts` 自动注册）：

```
transcripts.getMessages(sessionId, { before?, limit? }) → { messages, hasMore, capability }
transcripts.getSessionSummaries(projectIds?) → SessionSummary[]
```

### 3.4 与现有事件的配合（不重复造）

- **会话状态**（working/awaiting-input/...）：继续由 `agentEventChannel` / `ConversationManagerStore` 驱动，Chat 视图只消费不生产。hook-server 的 `lastAssistantMessage`（claude/codex）作为 transcript 的交叉校验源：若 hook 报了新 assistant 消息而 1s 内 watcher 没跟上，以 UI 状态条提示而不阻塞。
- **用户输入**：Chat 输入框 → `rpc.pty.sendInput(bracketedPaste(text))`（Claude 走直写），与 `prompt-injection.ts` / `context-bar.tsx` 同路。**不在 chat 流本地回显用户消息** —— transcript 里的 user 行到达后自然出现（含 initialPrompt、终端里手打的输入、ContextBar 注入的 issue 上下文，全部一视同仁）。

---

## 4. 渲染层设计

### 4.1 Store 结构

```
src/renderer/features/chat/
├── stores/
│   ├── chat-store.ts            # per conversation：messages[]、hasMore、capability、degraded
│   └── session-center-store.ts  # 全局：SessionSummary[]（聚合所有已打开项目）
├── components/
│   ├── chat-view.tsx            # 消息流 + 输入框（tab 内视图模式之一）
│   ├── message-bubble.tsx       # role 气泡 + blocks 渲染（markdown / 折叠工具块）
│   ├── chat-input-bar.tsx       # 多行输入 + ContextBar 复用
│   ├── session-list-item.tsx
│   └── session-center-view.tsx  # P2：全局会话中心
└── hooks/use-chat.ts            # subscribe chatMessageChannel + 初始 getMessages + 翻页
```

- `ChatStore` 挂在 `ConversationStore` 旁（`conversation-manager.ts` 内聚合），遵守 state guard 惯例（`asProvisioned` 显式判空，不 `!`）。
- **未读计数**：渲染层内存状态 —— 非当前可见 tab 收到 `chatMessageChannel` 且 role=assistant 时 +1，tab 激活清零。不落库（单窗口语义足够；P3 多窗口再议 KV）。

### 4.2 Task 内：Chat / 终端双模式

不新建独立 view，在现有 conversation tab 内加模式切换（`TabbedPtyPanel` 扩展）：

```
┌─ Task view ────────────────────────────────────────────────┐
│ ┌─ Tab bar ─────────────────────────────────────────────┐  │
│ │ [claude ●working] [codex ○idle 3] [terminal]           │  │
│ └────────────────────────────────────────────────────────┘  │
│ ┌─ [💬 Chat | ⌨ Terminal] toggle ──── ✦ 12.4k tok ───────┐  │
│ │                                                          │  │
│ │  ▸ user 09:41                                            │  │
│ │    修复 login 页 500 错误                                  │  │
│ │  ▸ assistant 09:41  ✻ 12.4k tok                          │  │
│ │    看了路由和日志，问题在 session 中间件…                    │  │
│ │    ▸ ▸ Bash: npm test (✓ 34 passed)          [collapsed] │  │
│ │    ▸ ▸ Read: src/middleware/session.ts       [collapsed] │  │
│ │  ▸ awaiting input ── ⚠ 等待权限确认（在终端中处理）[切换]    │  │
│ │ ┌──────────────────────────────────────────────────────┐ │  │
│ │ │ 输入消息… (Shift+Enter 换行)                   [发送] │ │  │
│ │ └──────────────────────────────────────────────────────┘ │  │
│ └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

交互规则：

- **终端实例不销毁**：Chat 模式下 xterm 搬到离屏 host 继续收数据（现有 `xterm-host.ts` 机制），保证 TUI 内的权限菜单/确认不被错过状态，切回终端零成本。
- `chatCapable: false`（无 parser 的 provider）→ toggle 显示但 Chat 面板渲染 `raw` 模式：最近输出的 ANSI-clean 文本块 + 「完整交互请切终端」。
- 权限等待（hook `permission_prompt`）→ Chat 流内插系统条，按钮 = 切到终端。v1 不做内联代答（那是路线 B 的事）。
- 默认模式记忆在 conversation 级（KV，namespace `chat`）。

### 4.3 P2：全局会话中心

新 view 注册进 `src/renderer/core/view/registry.ts`：

```
┌─ Sessions ───────────────────────────────────────┐
│ [搜索…]  [全部|working|awaiting]                  │
│ ───────────────────────────────────────────────  │
│ ● web-app / login-500    claude   working  09:41 │
│   「问题在 session 中间件，正在改…」         ●2    │
│ ○ api-refactor / main    codex    idle     09:12 │
│   「测试全部通过，等待 review」                    │
│ ○ docs / api-docs        gemini   error    08:55 │
│   「进程退出（code 1）」                  [retry] │
└──────────────────────────────────────────────────┘
```

- 数据源 `getSessionSummaries`：主进程聚合 `ProjectProvider` 内存中的活动会话 + DB conversations（`getConversationsForTask`），watcher 的 lastMessage 缓存在 `session-index.ts` 内存里。
- 点击条目 → 导航到对应 project/task 并激活该 conversation tab（复用现有导航）。
- `[retry]` 复用 `startSession(isResuming=true)`。

### 4.4 Markdown 渲染

代码块高亮 + 折叠长代码（>30 行默认折叠）；`tool_use`/`thinking` 默认折叠，`tool_result` 显示首行摘要 + 展开全文。若渲染层尚无 markdown 依赖，引入 `react-markdown` + `remark-gfm` + `shiki`（或现有依赖，P1 盘点）。

---

## 5. DB 变更

**无迁移**。conversations 表已有全部所需元信息；messages 遗留表继续闲置（不启用、不删除，避免与 legacy-port 纠缠）；消息不落库（§0 决策）。唯一持久化新增是 KV namespace `chat`（每 conversation 的默认视图模式），走现有 `src/main/db/kv.ts`。

---

## 6. 分阶段实施

| 阶段 | 内容 | 交付物 | 验证 |
|---|---|---|---|
| **P1 Chat 视图（claude+codex）**（~1.5周） | `transcripts/` 模块、claude/codex parser、watcher、`ChatStore`+`ChatView`、tab 内双模式 toggle、输入注入 | claude/codex 会话可切 Chat 模式收发消息 | 手动：终端发消息 → Chat 流出现；Chat 发消息 → TUI 收到并回复；resume 后历史完整 |
| **P2 会话中心 + 扩 provider**（~1周） | `session-center-view`、`getSessionSummaries`、未读徽标、gemini/qwen parser、raw 兜底模式 | 全局会话列表可用 | 切项目/切 tab 未读正确；无 transcript provider 显示 raw 卡片 |
| **P3 打磨**（~1周） | token 统计头、消息搜索（会话内 + 跨会话走 getMessages 过滤）、向上翻页、降级黄条、默认模式记忆、telemetry（`chat_view_used`） | 日常可把 Chat 当主视图 | 长会话（>5MB transcript）翻页流畅 |
| **P4 远期：Headless 增强** | 对 claude/codex 增加 headless 运行档位，解锁 Chat 内联权限按钮/内联 plan 确认 | 摆脱终端依赖的完整 Chat | 不依赖 TUI 完成一轮含权限确认的会话 |

每阶段跑 `pnpm run format && pnpm run typecheck && pnpm test`（memory：v2.2.7 基线已有失败，先 `git stash -u` 对照基线再判断）。

---

## 7. 与 Agent Team 提案的关系

- **共享基座**：team 提案的消息时间线（`team_messages`）与本提案的 `MessageBubble`/时间线渲染复用同一组件族；`ChatMessage` 模型是 team `TeamMessage` 展示层的子集。
- **顺序建议**：先 Chat（P1-P3）再 Team——Team 的 teammate 面板直接内嵌 Chat 视图，编排消息与 agent 回复在同一渲染层，避免做两遍。
- **互不依赖**：Chat 不需要 team 的 DB 迁移与 orchestrator；反过来 team 落地时 watcher 已是现成的「读 agent 输出」通道。

## 风险与开放问题

0. **transcript 格式是非官方契约**：CLI 升级可能改 jsonl 结构。缓解：parser 容错（未知行跳过）+ `parserVersion` + 降级黄条；P1 起给每个 parser 建真实样本 fixture 测试（跑一轮真会话存样本进 `__fixtures__/`）。
1. **codex 会话文件定位**：rollout 文件按日期目录命名，sessionId 不在文件名里的版本需要扫目录 grep 首行 —— `resolve()` 允许返回多个候选路径，watcher 逐个试探。P1 实测确认 Windows 路径表现。
2. **重复渲染源**：TUI 会在终端里回显用户输入，但 Chat 模式下终端不可见，以 transcript user 行为唯一展示源 —— 无重复；但 initialPrompt 若 CLI 不写进 transcript（部分 provider），Chat 流会缺第一条用户消息，需在 spawn 时由渲染层乐观补一条（标记 `local`，transcript 到达后去重）。
3. **Windows 轮询成本**：N 个活动会话 = N 个 500ms 轮询。会话数可控（<20），size stat 调用廉价；若不够，P3 升级为 mtime 变化才读。
4. **大 tool_result**：读文件/测试输出可能单条几十 KB —— 渲染层折叠 + 虚拟列表（消息流用 `react-window` 类方案，P1 就上，别后补）。
5. **焦点管理**：Chat 输入框与（离屏）xterm 的键盘路由 —— xterm 离屏时必须 detach DOM 焦点，避免按键被终端吞掉（`use-pty.ts` 的 `onData` 只在挂载时接线，需验证离屏行为）。
6. **SSH 项目**：agent 跑在远端，transcript 在远端文件系统。P1 不支持（SSH 会话 Chat toggle 置灰，只留终端）；P3 评估经 `ssh2` sftp tail 的成本。
7. **与 agent-team 提案的合并顺序**：若 Team 先行，本提案 §4.1 组件直接被 teammate 面板复用，P2 会话中心纳入 teammates —— 两个提案共享一次组件设计，不会返工。
