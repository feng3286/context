import fs from 'node:fs/promises';
import type { ChatMessage } from '@shared/chat';
import { log } from '@main/lib/logger';
import { getParser } from './parsers';

const MAX_CACHED_MESSAGES = 2000;

/**
 * Read-only transcript access for the chat center. The CLI keeps owning the
 * conversation — the transcript file is the single source of truth, and this
 * service only projects it into structured chat messages.
 *
 * (A live file-watching variant of this service once existed for streaming
 * transcript updates; it was removed when chat moved to headless runs, which
 * stream deltas directly from the CLI. If transcript-tail following is ever
 * needed again, see git history before this comment was written.)
 */
class TranscriptService {
  /**
   * Parse one transcript file directly (chat center history). The file path
   * comes from the session index, which discovered it under the provider's own
   * config directory.
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
}

function parseLines(parser: ReturnType<typeof getParser>, text: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = parser?.parseLine(line);
      if (parsed) messages.push(...parsed);
    } catch {
      // A single malformed line must never take down the reader.
    }
  }
  return messages;
}

function capMessages(messages: ChatMessage[]): {
  messages: ChatMessage[];
  truncated: boolean;
} {
  if (messages.length <= MAX_CACHED_MESSAGES) return { messages, truncated: false };
  return { messages: messages.slice(-MAX_CACHED_MESSAGES), truncated: true };
}

export const transcriptService = new TranscriptService();
