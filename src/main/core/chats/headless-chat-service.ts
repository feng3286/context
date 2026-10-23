import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ChatBlock, ChatMessage } from '@shared/chat';
import { chatDeltaChannel, chatMessageChannel, chatRunChannel } from '@shared/events/chatEvents';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { isWindowsCmd, resolveShell } from '@main/core/pty/spawn-utils';
import { providerOverrideSettings } from '@main/core/settings/provider-settings-service';
import { compactNoticeBlock } from '@main/core/transcripts/parsers/claude';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { quoteShellArg } from '@main/utils/shellEscape';
import { adoptPendingSession } from './pending-sessions';

/**
 * Drives agent CLIs headlessly (`claude -p`, `codex exec`) so the chat center
 * is a real chat — messages are sent from the chat UI itself and replies
 * stream back as they are generated. No PTY, no TUI. The CLI still writes its
 * own transcript, which stays the single source of truth.
 *
 * Permissions: runs at maximum — print/exec mode has no one to answer approval
 * prompts, so without bypass every file/bash tool call is simply denied. The
 * chat UI's Stop button is the interruption path, not a permission dialog.
 *
 * Safety: a session whose interactive TUI is currently running is refused —
 * two writers to one transcript would corrupt the session.
 */

interface HeadlessRun {
  sessionId: string;
  providerId: string;
  child: ChildProcess;
  /** Set by abortHeadless so the resulting non-zero close is not an error. */
  aborted?: boolean;
}

const runs = new Map<string, HeadlessRun>();

const LINE_FLUSH_INTERVAL_MS = 33; // batch deltas ~30fps

export type HeadlessSendError =
  | { type: 'unsupported' }
  | { type: 'busy' }
  | { type: 'live_in_terminal' }
  | { type: 'spawn_failed'; message: string };

export async function sendHeadless(args: {
  providerId: string;
  sessionId: string;
  cwd: string;
  text: string;
  /** Event topic; defaults to the provider session id. App-owned conversations
   * pass their synthetic `conversation:<task>:<id>` id so existing chat
   * subscriptions receive the deltas. */
  topic?: string;
  /** Start a fresh session (claude --session-id / codex exec) instead of
   * resuming an existing one. */
  newSession?: boolean;
}): Promise<
  { ok: true; actualSessionId: string | null } | { ok: false; error: HeadlessSendError }
> {
  const { providerId, sessionId, cwd, text, topic = sessionId, newSession } = args;
  if (providerId !== 'claude' && providerId !== 'codex') {
    return { ok: false, error: { type: 'unsupported' } };
  }
  if (!sessionId && !newSession) {
    return { ok: false, error: { type: 'unsupported' } };
  }
  if (!newSession && runs.has(sessionId)) {
    return { ok: false, error: { type: 'busy' } };
  }
  if (ptySessionRegistry.hasConversationSession(sessionId)) {
    return { ok: false, error: { type: 'live_in_terminal' } };
  }
  // The session id is spliced into the command line — restrict it to the
  // charset the providers actually use (uuids) so no shell metacharacters
  // can slip through whichever quoting the current shell needs.
  if (sessionId && !/^[a-zA-Z0-9:_-]+$/.test(sessionId)) {
    return { ok: false, error: { type: 'unsupported' } };
  }

  const override = await providerOverrideSettings.getItem(providerId);
  const cli = override?.cli ?? providerId;
  // Optional model override — empty/whitespace means the CLI's default.
  const model = override?.model?.trim();
  const shell = resolveShell();
  const useCmd = isWindowsCmd(shell);
  // cmd.exe does not understand POSIX single-quote escaping. Only the cli
  // path and the (validated) session id reach the line — the prompt itself
  // goes over stdin — so double-quoting the path is sufficient there.
  const quote = useCmd ? quoteWinArg : quoteShellArg;

  let commandLine: string;
  if (providerId === 'claude') {
    // stream-json in print mode requires --verbose; partial messages give us
    // real token-level streaming deltas.
    const resumeOrSession = newSession
      ? `--session-id ${quote(sessionId)}`
      : `--resume ${quote(sessionId)}`;
    commandLine = [
      quote(cli),
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      // Max permissions — otherwise print mode denies every Bash/Edit/Write.
      '--dangerously-skip-permissions',
      ...(model ? ['--model', quote(model)] : []),
      resumeOrSession,
    ].join(' ');
  } else {
    commandLine = [
      quote(cli),
      'exec',
      '--json',
      '--skip-git-repo-check',
      // Max permissions — otherwise exec mode stays in its read-only sandbox.
      '--dangerously-bypass-approvals-and-sandbox',
      ...(model ? ['-m', quote(model)] : []),
      ...(newSession ? [] : ['resume', quote(sessionId)]),
      '-',
    ].join(' ');
  }

  let child: ChildProcess;
  try {
    child = spawn(
      shell,
      // cmd.exe: wrap the whole command in an extra quote pair — cmd's /c
      // stripping then leaves the double-quoted executable + args intact.
      // Node's own arg quoting would turn embedded quotes into \" which cmd
      // does not understand, so the line is passed verbatim instead. Safe:
      // every variable part is either a validated id or a quoted path.
      useCmd ? ['/d', '/c', `"${commandLine}"`] : ['-c', commandLine],
      {
        cwd,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        windowsVerbatimArguments: useCmd,
        // POSIX: own process group so Stop can signal the whole tree; Windows
        // has no group semantics and uses `taskkill /T` instead.
        detached: process.platform !== 'win32',
      }
    );
  } catch (e) {
    return { ok: false, error: { type: 'spawn_failed', message: String(e) } };
  }

  const run: HeadlessRun = { sessionId, providerId, child };
  runs.set(sessionId, run);
  // The command line carries flags that silently change behavior (model,
  // permissions) — log it so stale-build "why is it denied" mysteries take
  // one look instead of a spike session. The prompt never appears here.
  log.info('chats: headless spawn', { providerId, sessionId, pid: child.pid, commandLine });

  events.emit(chatRunChannel, { sessionId: topic, status: 'running' }, topic);

  const stdoutBuffer: string[] = [];
  let stdoutText = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  // The session id the CLI itself reports — codex picks its rollout uuid at
  // run time, so a "new session" placeholder id must be corrected afterwards.
  let actualSessionId: string | null = null;
  const captureSessionId = (id: string) => {
    actualSessionId = id;
  };

  const emitDelta = (kind: 'text' | 'thinking', deltaText: string) => {
    if (!deltaText) return;
    events.emit(chatDeltaChannel, { sessionId: topic, kind, text: deltaText }, topic);
  };

  const flushStdout = () => {
    flushTimer = null;
    const combined = stdoutText + stdoutBuffer.join('');
    stdoutBuffer.length = 0;
    const lines = combined.split('\n');
    const pending = lines.pop() ?? '';
    stdoutText = pending;
    for (const line of lines) {
      handleStreamLine(providerId, topic, line, emitDelta, captureSessionId);
    }
  };

  child.stdout?.setEncoding('utf8');
  child.stdout?.on('data', (chunk: string) => {
    stdoutBuffer.push(chunk);
    if (!flushTimer) flushTimer = setTimeout(flushStdout, LINE_FLUSH_INTERVAL_MS);
  });

  let stderrTail = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) => {
    stderrTail = (stderrTail + chunk).slice(-2000);
  });

  const finish = (status: 'done' | 'error' | 'aborted', error?: string) => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (flushStdout && runs.get(sessionId) === run) {
      // Drain whatever complete lines remain.
      stdoutBuffer.push('\n');
      flushStdout();
    }
    runs.delete(sessionId);
    events.emit(
      chatRunChannel,
      { sessionId: topic, status, error, actualSessionId: actualSessionId ?? undefined },
      topic
    );
    // A "new session" placeholder id (codex picks its rollout uuid at run time)
    // must not linger as a pending stub: rename it to the id the CLI actually
    // used so the next index scan retires the stub instead of ghosting it.
    if (actualSessionId && actualSessionId !== sessionId) {
      void adoptPendingSession(sessionId, actualSessionId).catch((e) => {
        log.warn('chats: pending session adoption failed', {
          sessionId,
          actualSessionId,
          error: String(e),
        });
      });
    }
  };

  child.on('error', (e) => {
    log.warn('chats: headless spawn error', { providerId, sessionId, error: String(e) });
    finish(run.aborted ? 'aborted' : 'error', String(e));
  });
  child.on('close', (code) => {
    if (run.aborted) {
      // User-initiated Stop — a non-zero/signal close is expected, not an error.
      finish('aborted');
    } else if (code === 0) {
      finish('done');
    } else {
      log.warn('chats: headless run failed', { providerId, sessionId, code, stderrTail });
      finish('error', stderrTail.trim() || `exited with code ${code}`);
    }
  });

  // A spawn that failed asynchronously (ENOENT, …) leaves a dead pipe; writing
  // to it would raise an unhandled 'error' on stdin and crash the main process.
  let childBroken = false;
  child.on('error', () => {
    childBroken = true;
  });
  child.stdin?.on('error', (e) => {
    log.warn('chats: stdin write failed', { sessionId, error: String(e) });
  });

  // The prompt goes over stdin — it never touches the command line.
  if (!childBroken) {
    child.stdin?.write(text);
    child.stdin?.end();
  }

  return { ok: true, actualSessionId: null };
}

/** Windows double-quote quoting for the cmd.exe branch (args are validated ids/literals). */
function quoteWinArg(value: string): string {
  return `"${value.replace(/"/g, '')}"`;
}

export function abortHeadless(sessionId: string): boolean {
  const run = runs.get(sessionId);
  if (!run) return false;
  run.aborted = true;
  killProcessTree(run.child, sessionId);
  return true;
}

/** Kill the whole CLI process tree. `child.kill()` alone only reaches the
 * shell wrapper — the CLI itself would survive as an orphan and keep writing
 * the transcript after the UI already shows the run as stopped. */
function killProcessTree(child: ChildProcess, sessionId: string): void {
  const pid = child.pid;
  if (pid != null && process.platform === 'win32') {
    try {
      // /T = tree (shell wrapper + the CLI under it), /F = force.
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } catch (e) {
      log.warn('chats: taskkill failed', { sessionId, error: String(e) });
    }
  }
  if (pid != null && process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGTERM'); // detached spawn → negative pid = group
    } catch {
      // group already gone — the direct kill below is enough
    }
  }
  try {
    child.kill();
  } catch (e) {
    log.warn('chats: abort failed', { sessionId, error: String(e) });
  }
}

export function isHeadlessRunning(sessionId: string): boolean {
  return runs.has(sessionId);
}

// ---------------------------------------------------------------------------
// Stream parsing (defensive — CLI event shapes are not a stable contract)
// ---------------------------------------------------------------------------

interface ClaudeStreamLine {
  type?: string;
  subtype?: string;
  session_id?: string;
  compactMetadata?: { trigger?: string; preTokens?: number; postTokens?: number };
  event?: {
    type?: string;
    delta?: { type?: string; text?: string; thinking?: string };
  };
  message?: {
    id?: string;
    content?: Array<{
      type?: string;
      text?: string;
      thinking?: string;
      name?: string;
      id?: string;
      input?: unknown;
    }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}

interface CodexExecLine {
  type?: string;
  thread_id?: string;
  item?: {
    type?: string;
    text?: string;
    summary?: Array<{ text?: string }>;
  };
  msg?: { type?: string; session_id?: string };
  message?: string;
}

type DeltaEmit = (kind: 'text' | 'thinking', text: string) => void;

function handleStreamLine(
  providerId: string,
  topic: string,
  line: string,
  emitDelta: DeltaEmit,
  onSessionId: (id: string) => void
): void {
  const trimmed = line.trim();
  if (!trimmed) return;
  let row: unknown;
  try {
    row = JSON.parse(trimmed);
  } catch {
    return;
  }

  if (providerId === 'claude') {
    handleClaudeLine(row as ClaudeStreamLine, topic, emitDelta, onSessionId);
  } else {
    handleCodexLine(row as CodexExecLine, topic, onSessionId);
  }
}

function handleClaudeLine(
  row: ClaudeStreamLine,
  topic: string,
  emitDelta: DeltaEmit,
  onSessionId: (id: string) => void
): void {
  if (row.type === 'system' && row.session_id) onSessionId(row.session_id);
  if (row.type === 'system' && row.subtype === 'compact_boundary') {
    // Surface compaction live — the transcript reload at run end replays it too.
    const message: ChatMessage = {
      id: `hl-compact-${randomUUID()}`,
      role: 'system',
      blocks: [compactNoticeBlock(row.compactMetadata)],
      timestamp: new Date().toISOString(),
    };
    events.emit(chatMessageChannel, { sessionId: topic, messages: [message] }, topic);
    return;
  }
  if (row.type === 'stream_event' && row.event?.type === 'content_block_delta') {
    const delta = row.event.delta;
    if (delta?.type === 'text_delta' && delta.text) emitDelta('text', delta.text);
    if (delta?.type === 'thinking_delta' && delta.thinking) emitDelta('thinking', delta.thinking);
    return;
  }
  if (row.type === 'assistant' && row.message) {
    const blocks: ChatBlock[] = [];
    for (const block of row.message.content ?? []) {
      if (block.type === 'text' && block.text?.trim()) {
        blocks.push({ kind: 'text', text: block.text.trim() });
      } else if (block.type === 'thinking' && block.thinking?.trim()) {
        blocks.push({ kind: 'thinking', text: block.thinking.trim() });
      } else if (block.type === 'tool_use') {
        blocks.push({
          kind: 'tool_use',
          name: block.name ?? 'tool',
          input: block.input,
          toolUseId: block.id ?? '',
        });
      }
    }
    if (blocks.length === 0) return;
    const usage = row.message.usage;
    const message: ChatMessage = {
      id: `hl-${row.message.id ?? randomUUID()}`,
      role: 'assistant',
      blocks,
      timestamp: new Date().toISOString(),
      tokens:
        usage && (usage.input_tokens != null || usage.output_tokens != null)
          ? { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 }
          : undefined,
    };
    events.emit(chatMessageChannel, { sessionId: topic, messages: [message] }, topic);
  }
}

function handleCodexLine(
  row: CodexExecLine,
  topic: string,
  onSessionId: (id: string) => void
): void {
  // The rollout uuid only becomes known when codex announces it.
  if (row.type === 'thread.started' && row.thread_id) onSessionId(row.thread_id);
  else if (row.msg?.type === 'session_created' && row.msg.session_id) {
    onSessionId(row.msg.session_id);
  }
  if (row.type === 'item.completed' && row.item) {
    const item = row.item;
    if (item.type === 'agent_message' && item.text?.trim()) {
      const message: ChatMessage = {
        id: `hl-cx-${randomUUID()}`,
        role: 'assistant',
        blocks: [{ kind: 'text', text: item.text.trim() }],
        timestamp: new Date().toISOString(),
      };
      events.emit(chatMessageChannel, { sessionId: topic, messages: [message] }, topic);
    } else if (item.type === 'reasoning') {
      const text = (item.summary ?? [])
        .map((part) => part.text ?? '')
        .join('\n')
        .trim();
      if (text) {
        const message: ChatMessage = {
          id: `hl-cx-r-${randomUUID()}`,
          role: 'assistant',
          blocks: [{ kind: 'thinking', text }],
          timestamp: new Date().toISOString(),
        };
        events.emit(chatMessageChannel, { sessionId: topic, messages: [message] }, topic);
      }
    }
  }
}
