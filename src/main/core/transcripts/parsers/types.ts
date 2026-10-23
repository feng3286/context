import type { ChatMessage } from '@shared/chat';

export interface TranscriptContext {
  sessionId: string;
  taskId: string;
  conversationId: string;
  providerId: string;
  /** Working directory the agent CLI was spawned in (transcript layout depends on it). */
  workDir: string;
  /**
   * Epoch ms the conversation was created (DB) or spawned (live). Parsers with
   * ambiguous file layout (codex rollout files carry their own session UUID)
   * use it to bound which files can belong to this conversation.
   */
  sinceEpochMs?: number;
}

export interface TranscriptParser {
  readonly provider: string;
  readonly version: number;
  /**
   * Candidate transcript files for this conversation, best match first.
   * Must never throw — return [] when nothing can be located.
   */
  resolve(ctx: TranscriptContext): Promise<string[]>;
  /**
   * Optional check that a candidate file actually belongs to this conversation
   * (e.g. codex stores the session cwd in its first line). Receives the first
   * line of the file.
   */
  validateFile?(firstLine: string, ctx: TranscriptContext): boolean;
  /**
   * Parse one JSONL line into zero or more chat messages. Unknown/uninteresting
   * lines return null — parsers must never throw on unexpected shapes.
   * `ordinal` is the line's index among non-blank lines, for providers whose
   * message ids need a stable position (codex rollout rows stopped carrying
   * their own ordinal field).
   */
  parseLine(line: string, ordinal?: number): ChatMessage[] | null;
}
