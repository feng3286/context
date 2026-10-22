/**
 * Structured chat rendering for agent conversations.
 *
 * Messages are parsed from each CLI's own transcript files (see
 * src/main/core/transcripts/) — they are never written by this app, so the
 * transcript files remain the single source of truth.
 */

export type ChatRole = 'user' | 'assistant' | 'tool';

export type ChatBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; name: string; input?: unknown; toolUseId: string }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError?: boolean };

export interface ChatMessage {
  /** Stable within one transcript file (provider-native id, call id or line ordinal). */
  id: string;
  role: ChatRole;
  blocks: ChatBlock[];
  timestamp: string;
  tokens?: { input: number; output: number };
}

/**
 * - transcript: a parser resolved and is reading the provider's transcript
 * - pending:    provider supported but no transcript file found yet (or unknown session)
 * - unsupported: no parser for this provider — chat view falls back to a hint
 */
export type ChatCapability = 'transcript' | 'pending' | 'unsupported' | 'unknown';

export interface ChatMessagesResult {
  messages: ChatMessage[];
  capability: ChatCapability;
  /** True when older messages exist beyond the returned window. */
  hasMore: boolean;
}
