import fs from 'node:fs/promises';
import type { ChatMessage } from '@shared/chat';
import { chatMessageChannel } from '@shared/events/chatEvents';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { getParser } from './parsers';
import type { TranscriptContext, TranscriptParser } from './parsers/types';

const POLL_INTERVAL_MS = 500;
const MAX_CACHED_MESSAGES = 2000;
/**
 * How often (in poll ticks) to retry transcript resolution while no file has
 * appeared. The transcript is only created when the agent processes its first
 * message, which can take arbitrarily long — retry forever, just slower.
 */
const RESOLVE_RETRY_EVERY = 20; // 20 ticks × 500ms = every 10s

interface WatchState {
  ctx: TranscriptContext;
  parser: TranscriptParser;
  /** Resolved transcript file; null while it has not appeared yet. */
  file: string | null;
  byteOffset: number;
  /** Trailing partial line (a JSONL line split across reads). */
  pendingText: string;
  messages: ChatMessage[];
  /** True once the head of the file was dropped from the cache (cap). */
  hasOlderHistory: boolean;
  resolveAttempts: number;
  timer: ReturnType<typeof setInterval> | null;
}

export interface TranscriptReplayResult {
  messages: ChatMessage[];
  capability: 'transcript' | 'pending' | 'unsupported';
  hasMore: boolean;
}

export interface ReplayOptions {
  before?: string;
  limit?: number;
}

/**
 * Follows agent CLI transcript files (claude/codex JSONL) and converts them
 * into structured chat messages. The CLI keeps owning the conversation — this
 * is a read-only projection, so the terminal and the chat view can never
 * disagree about what happened.
 */
class TranscriptService {
  private states = new Map<string, WatchState>();

  async start(ctx: TranscriptContext): Promise<void> {
    const parser = getParser(ctx.providerId);
    if (!parser) return; // unsupported provider — chat view shows a hint instead

    const previous = this.states.get(ctx.sessionId);
    if (previous?.timer) clearInterval(previous.timer);

    const state: WatchState = {
      ctx,
      parser,
      file: null,
      byteOffset: 0,
      pendingText: '',
      messages: [],
      hasOlderHistory: false,
      resolveAttempts: 0,
      timer: null,
    };
    this.states.set(ctx.sessionId, state);

    await this.locateAndLoad(state);
    state.timer = setInterval(() => {
      void this.poll(state);
    }, POLL_INTERVAL_MS);
  }

  /**
   * Stop polling for a session. The parsed cache is kept so the chat view can
   * still replay history after the PTY exits.
   */
  stop(sessionId: string): void {
    const state = this.states.get(sessionId);
    if (state?.timer) {
      clearInterval(state.timer);
      state.timer = null;
    }
  }

  async getMessages(ctx: TranscriptContext, opts: ReplayOptions): Promise<TranscriptReplayResult> {
    const parser = getParser(ctx.providerId);
    if (!parser) return { messages: [], capability: 'unsupported', hasMore: false };

    const state = this.states.get(ctx.sessionId);
    if (!state) {
      // No live watcher (e.g. renderer reloaded before startSession ran).
      // Parse the file once without starting a poller.
      const oneShot = await this.readOnce(ctx, parser);
      if (!oneShot) return { messages: [], capability: 'pending', hasMore: false };
      return { ...tailSlice(oneShot.messages, opts), capability: 'transcript' };
    }
    if (!state.file) return { messages: [], capability: 'pending', hasMore: false };
    return { ...tailSlice(state.messages, opts), capability: 'transcript' };
  }

  /**
   * Parse one transcript file directly (chat center history for sessions that
   * are not app-owned conversations). The file path comes from the session
   * index, which discovered it under the provider's own config directory.
   */
  async readSessionFile(providerId: string, file: string): Promise<ChatMessage[]> {
    const parser = getParser(providerId);
    if (!parser) return [];
    try {
      const stat = await fs.stat(file);
      if (!stat.isFile()) return [];
      const buf = Buffer.alloc(stat.size);
      const fh = await fs.open(file, 'r');
      let text: string;
      try {
        await fh.read(buf, 0, buf.length, 0);
        text = buf.toString('utf8');
      } finally {
        await fh.close();
      }
      return capMessages(parseLines(parser, text)).messages;
    } catch (e) {
      log.warn('transcripts: readSessionFile failed', { file, error: String(e) });
      return [];
    }
  }

  /** Resolve + fully parse a transcript without registering a watcher. */
  private async readOnce(
    ctx: TranscriptContext,
    parser: TranscriptParser
  ): Promise<{ messages: ChatMessage[] } | null> {
    let candidates: string[] = [];
    try {
      candidates = await parser.resolve(ctx);
    } catch (e) {
      log.warn('transcripts: resolve failed', { sessionId: ctx.sessionId, error: String(e) });
      return null;
    }
    for (const file of candidates) {
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile()) continue;
        const buf = Buffer.alloc(stat.size);
        const fh = await fs.open(file, 'r');
        let text: string;
        try {
          await fh.read(buf, 0, buf.length, 0);
          text = buf.toString('utf8');
        } finally {
          await fh.close();
        }
        if (!ownedBy(ctx, parser, text)) continue;
        const messages = parseLines(parser, text);
        return { messages: capMessages(messages).messages };
      } catch {
        continue;
      }
    }
    return null;
  }

  private async locateAndLoad(state: WatchState): Promise<void> {
    state.resolveAttempts += 1;
    // Retry resolution at a lower frequency while waiting for the first write,
    // but never give up — the session stays replayable whenever the file shows up.
    if (state.resolveAttempts > 10 && state.resolveAttempts % RESOLVE_RETRY_EVERY !== 0) {
      return;
    }

    let candidates: string[] = [];
    try {
      candidates = await state.parser.resolve(state.ctx);
    } catch (e) {
      log.warn('transcripts: resolve failed', {
        sessionId: state.ctx.sessionId,
        error: String(e),
      });
    }

    for (const file of candidates) {
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile()) continue;
        const buf = Buffer.alloc(stat.size);
        const fh = await fs.open(file, 'r');
        let text: string;
        try {
          await fh.read(buf, 0, buf.length, 0);
          text = buf.toString('utf8');
        } finally {
          await fh.close();
        }
        if (!ownedBy(state.ctx, state.parser, text)) continue;

        const pendingText = state.pendingText;
        state.file = file;
        state.messages = [];
        state.hasOlderHistory = false;
        const { messages, consumedBytes, pending } = consumeText(state.parser, text, pendingText);
        state.pendingText = pending;
        state.messages = capMessages(messages).messages;
        state.byteOffset = consumedBytes;
        return;
      } catch {
        continue;
      }
    }
    state.file = null;
  }

  private async poll(state: WatchState): Promise<void> {
    try {
      if (!state.file) {
        await this.locateAndLoad(state);
        return;
      }
      const stat = await fs.stat(state.file).catch(() => null);
      if (!stat || stat.size < state.byteOffset) {
        // File replaced/rotated (resume forks a new rollout) — re-resolve.
        state.file = null;
        state.pendingText = '';
        await this.locateAndLoad(state);
        return;
      }
      if (stat.size === state.byteOffset) return;

      const length = stat.size - state.byteOffset;
      const startOffset = state.byteOffset;
      const buf = Buffer.alloc(length);
      const fh = await fs.open(state.file, 'r');
      let text: string;
      try {
        await fh.read(buf, 0, length, startOffset);
        text = buf.toString('utf8');
      } finally {
        await fh.close();
      }

      const { messages, consumedBytes, pending } = consumeText(
        state.parser,
        text,
        state.pendingText
      );
      state.pendingText = pending;
      state.byteOffset = startOffset + consumedBytes;
      const fresh = pushMessages(state, messages);
      if (fresh.length > 0) {
        events.emit(
          chatMessageChannel,
          { sessionId: state.ctx.sessionId, messages: fresh },
          state.ctx.sessionId
        );
      }
    } catch (e) {
      log.warn('transcripts: poll failed', {
        sessionId: state.ctx.sessionId,
        error: String(e),
      });
    }
  }
}

/** First-line ownership check (parser-specific, e.g. codex session cwd). */
function ownedBy(ctx: TranscriptContext, parser: TranscriptParser, text: string): boolean {
  if (!parser.validateFile) return true;
  const nl = text.indexOf('\n');
  const firstLine = nl === -1 ? text : text.slice(0, nl);
  try {
    return parser.validateFile(firstLine, ctx);
  } catch {
    return false;
  }
}

function parseLines(parser: TranscriptParser, text: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = parser.parseLine(line);
      if (parsed) messages.push(...parsed);
    } catch {
      // A single malformed line must never take down the watcher.
    }
  }
  return messages;
}

/**
 * Parse `text` (which continues `pendingText` from a previous read) into
 * complete-line messages. Returns the byte length of the consumed portion
 * (complete lines only — the trailing partial line stays pending) and that
 * trailing text so the caller can store it.
 */
function consumeText(
  parser: TranscriptParser,
  text: string,
  pendingText: string
): { messages: ChatMessage[]; consumedBytes: number; pending: string } {
  const combined = pendingText + text;
  const parts = combined.split('\n');
  const pending = parts.pop() ?? '';
  let consumedBytes = Buffer.byteLength(combined, 'utf8') - Buffer.byteLength(pending, 'utf8');
  const messages: ChatMessage[] = [];
  for (const line of parts) {
    if (!line.trim()) continue;
    try {
      const parsed = parser.parseLine(line);
      if (parsed) messages.push(...parsed);
    } catch {
      // Skip malformed lines; the JSONL writer may also have been interrupted.
    }
  }
  // When nothing has been consumed yet (whole input is one partial line) keep 0.
  if (parts.length === 0) consumedBytes = 0;
  return { messages, consumedBytes, pending };
}

function capMessages(messages: ChatMessage[]): {
  messages: ChatMessage[];
  truncated: boolean;
} {
  if (messages.length <= MAX_CACHED_MESSAGES) return { messages, truncated: false };
  return { messages: messages.slice(-MAX_CACHED_MESSAGES), truncated: true };
}

function pushMessages(state: WatchState, msgs: ChatMessage[]): ChatMessage[] {
  if (msgs.length === 0) return [];
  state.messages.push(...msgs);
  if (state.messages.length > MAX_CACHED_MESSAGES) {
    const drop = state.messages.length - MAX_CACHED_MESSAGES;
    state.messages.splice(0, drop);
    state.hasOlderHistory = true;
  }
  return msgs;
}

function tailSlice(
  messages: ChatMessage[],
  opts: ReplayOptions
): {
  messages: ChatMessage[];
  hasMore: boolean;
} {
  const limit = Math.max(1, Math.min(opts.limit ?? 200, MAX_CACHED_MESSAGES));
  let end = messages.length;
  if (opts.before) {
    const idx = messages.findIndex((m) => m.id === opts.before);
    if (idx >= 0) end = idx;
  }
  const start = Math.max(0, end - limit);
  return { messages: messages.slice(start, end), hasMore: start > 0 };
}

export const transcriptService = new TranscriptService();
