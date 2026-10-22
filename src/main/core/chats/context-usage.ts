import fs from 'node:fs/promises';
import type { ChatContextUsage } from '@shared/chat';

/**
 * Approximate context fill of a session, read from the tail of its transcript:
 * - claude: the last assistant message's token usage (input + cache fields)
 * - codex:  the last `token_count` event (total_tokens + model_context_window)
 *
 * Reading the head would find stale numbers after compaction, so we read the
 * last chunk instead. Best-effort — a missing window simply hides the meter.
 */

const TAIL_BYTES = 96 * 1024;

export async function readContextUsage(
  providerId: string,
  file: string
): Promise<ChatContextUsage | null> {
  try {
    const tail = await readTail(file);
    if (providerId === 'codex') return codexUsage(tail);
    return claudeUsage(tail);
  } catch {
    return null;
  }
}

async function readTail(file: string): Promise<string> {
  const fh = await fs.open(file, 'r');
  try {
    const size = (await fh.stat()).size;
    const start = Math.max(0, size - TAIL_BYTES);
    const buf = Buffer.alloc(size - start);
    await fh.read(buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally {
    await fh.close();
  }
}

interface ClaudeUsageRow {
  type?: string;
  message?: {
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

function claudeUsage(tail: string): ChatContextUsage | null {
  let tokens: number | null = null;
  for (const line of tail.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('"usage"')) continue;
    try {
      const row = JSON.parse(trimmed) as ClaudeUsageRow;
      const usage = row.message?.usage;
      if (!usage || usage.input_tokens == null) continue;
      tokens =
        (usage.input_tokens ?? 0) +
        (usage.cache_read_input_tokens ?? 0) +
        (usage.cache_creation_input_tokens ?? 0);
    } catch {
      // Truncated tail line — skip.
    }
  }
  return tokens == null ? null : { tokens, contextWindow: 200_000 };
}

interface CodexTokenRow {
  type?: string;
  payload?: {
    type?: string;
    info?: {
      total_token_usage?: { total_tokens?: number };
      model_context_window?: number;
    };
  };
}

function codexUsage(tail: string): ChatContextUsage | null {
  let tokens: number | null = null;
  let window: number | undefined;
  for (const line of tail.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.includes('token_count')) continue;
    try {
      const row = JSON.parse(trimmed) as CodexTokenRow;
      const usage = row.payload?.info?.total_token_usage?.total_tokens;
      if (usage == null) continue;
      tokens = usage;
      window = row.payload?.info?.model_context_window;
    } catch {
      // Truncated tail line — skip.
    }
  }
  return tokens == null ? null : { tokens, contextWindow: window };
}
