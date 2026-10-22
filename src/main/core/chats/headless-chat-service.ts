import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { ChatBlock, ChatMessage } from '@shared/chat';
import { chatDeltaChannel, chatMessageChannel, chatRunChannel } from '@shared/events/chatEvents';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { resolveShell } from '@main/core/pty/spawn-utils';
import { providerOverrideSettings } from '@main/core/settings/provider-settings-service';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { quoteShellArg } from '@main/utils/shellEscape';

/**
 * Drives agent CLIs headlessly (`claude -p`, `codex exec`) so the chat center
 * is a real chat — messages are sent from the chat UI itself and replies
 * stream back as they are generated. No PTY, no TUI. The CLI still writes its
 * own transcript, which stays the single source of truth.
 *
 * Safety: a session whose interactive TUI is currently running is refused —
 * two writers to one transcript would corrupt the session.
 */

interface HeadlessRun {
  sessionId: string;
  providerId: string;
  child: ChildProcess;
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
}): Promise<{ ok: true } | { ok: false; error: HeadlessSendError }> {
  const { providerId, sessionId, cwd, text } = args;
  if (providerId !== 'claude' && providerId !== 'codex') {
    return { ok: false, error: { type: 'unsupported' } };
  }
  if (!sessionId) {
    return { ok: false, error: { type: 'unsupported' } };
  }
  if (runs.has(sessionId)) {
    return { ok: false, error: { type: 'busy' } };
  }
  if (ptySessionRegistry.hasConversationSession(sessionId)) {
    return { ok: false, error: { type: 'live_in_terminal' } };
  }

  const cli = (await providerOverrideSettings.getItem(providerId))?.cli ?? providerId;

  let commandLine: string;
  if (providerId === 'claude') {
    // stream-json in print mode requires --verbose; partial messages give us
    // real token-level streaming deltas.
    const resumeOrSession = `--resume ${quoteShellArg(sessionId)}`;
    commandLine = [
      quoteShellArg(cli),
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      resumeOrSession,
    ].join(' ');
  } else {
    commandLine = [
      quoteShellArg(cli),
      'exec',
      '--json',
      '--skip-git-repo-check',
      'resume',
      quoteShellArg(sessionId),
      '-',
    ].join(' ');
  }

  const shell = resolveShell();
  const useCmd = shell.toLowerCase().endsWith('cmd.exe');
  let child: ChildProcess;
  try {
    child = spawn(shell, [useCmd ? '/c' : '-c', commandLine], {
      cwd,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } catch (e) {
    return { ok: false, error: { type: 'spawn_failed', message: String(e) } };
  }

  const run: HeadlessRun = { sessionId, providerId, child };
  runs.set(sessionId, run);

  events.emit(chatRunChannel, { sessionId, status: 'running' }, sessionId);

  const stdoutBuffer: string[] = [];
  let stdoutText = '';
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const emitDelta = (kind: 'text' | 'thinking', deltaText: string) => {
    if (!deltaText) return;
    events.emit(chatDeltaChannel, { sessionId, kind, text: deltaText }, sessionId);
  };

  const flushStdout = () => {
    flushTimer = null;
    const combined = stdoutText + stdoutBuffer.join('');
    stdoutBuffer.length = 0;
    const lines = combined.split('\n');
    const pending = lines.pop() ?? '';
    stdoutText = pending;
    for (const line of lines) handleStreamLine(providerId, sessionId, line, emitDelta);
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

  const finish = (status: 'done' | 'error', error?: string) => {
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
    events.emit(chatRunChannel, { sessionId, status, error }, sessionId);
  };

  child.on('error', (e) => {
    log.warn('chats: headless spawn error', { providerId, sessionId, error: String(e) });
    finish('error', String(e));
  });
  child.on('close', (code) => {
    if (code === 0) {
      finish('done');
    } else {
      log.warn('chats: headless run failed', { providerId, sessionId, code, stderrTail });
      finish('error', stderrTail.trim() || `exited with code ${code}`);
    }
  });

  // The prompt goes over stdin — it never touches the command line.
  child.stdin?.write(text);
  child.stdin?.end();

  return { ok: true };
}

export function abortHeadless(sessionId: string): boolean {
  const run = runs.get(sessionId);
  if (!run) return false;
  try {
    run.child.kill();
  } catch (e) {
    log.warn('chats: abort failed', { sessionId, error: String(e) });
  }
  return true;
}

export function isHeadlessRunning(sessionId: string): boolean {
  return runs.has(sessionId);
}

// ---------------------------------------------------------------------------
// Stream parsing (defensive — CLI event shapes are not a stable contract)
// ---------------------------------------------------------------------------

interface ClaudeStreamLine {
  type?: string;
  session_id?: string;
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
  message?: string;
}

type DeltaEmit = (kind: 'text' | 'thinking', text: string) => void;

function handleStreamLine(
  providerId: string,
  sessionId: string,
  line: string,
  emitDelta: DeltaEmit
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
    handleClaudeLine(row as ClaudeStreamLine, sessionId, emitDelta);
  } else {
    handleCodexLine(row as CodexExecLine, sessionId);
  }
}

function handleClaudeLine(row: ClaudeStreamLine, sessionId: string, emitDelta: DeltaEmit): void {
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
    events.emit(
      chatMessageChannel,
      { sessionId: row.session_id ?? sessionId, messages: [message] },
      sessionId
    );
  }
}

function handleCodexLine(row: CodexExecLine, sessionId: string): void {
  if (row.type === 'item.completed' && row.item) {
    const item = row.item;
    if (item.type === 'agent_message' && item.text?.trim()) {
      const message: ChatMessage = {
        id: `hl-cx-${randomUUID()}`,
        role: 'assistant',
        blocks: [{ kind: 'text', text: item.text.trim() }],
        timestamp: new Date().toISOString(),
      };
      events.emit(chatMessageChannel, { sessionId, messages: [message] }, sessionId);
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
        events.emit(chatMessageChannel, { sessionId, messages: [message] }, sessionId);
      }
    }
  }
}
