/**
 * Structured chat rendering for agent conversations.
 *
 * Messages are parsed from each CLI's own transcript files (see
 * src/main/core/transcripts/) — they are never written by this app, so the
 * transcript files remain the single source of truth.
 */

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system';

export type ChatBlock =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'tool_use'; name: string; input?: unknown; toolUseId: string }
  | { kind: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  /** Provider system event (e.g. context compaction) rendered as a divider. */
  | { kind: 'system'; text: string };

/** A slash command offered by the chat input autocomplete. */
export interface ChatCommandInfo {
  /** Without the leading slash. */
  name: string;
  description?: string;
  source: 'builtin' | 'custom' | 'app';
}

/** Approximate context fill of a session, read from its transcript tail. */
export interface ChatContextUsage {
  tokens: number;
  contextWindow?: number;
}

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

/**
 * One entry in the chat center's session list, discovered by scanning the
 * providers' own transcript files (no app-side session registry).
 */
export interface ChatSessionSummary {
  /** The provider's own session id (claude session uuid / codex rollout uuid). */
  sessionId: string;
  providerId: string;
  /** Working directory the session ran in — headless resume must spawn here. */
  cwd: string;
  /** First user message (truncated) — the de-facto session title. */
  title: string;
  /** Last file modification time (epoch ms). */
  updatedAt: number;
  /** Absolute transcript path (provider-root validated before use). */
  file: string;
}

/**
 * A session created in the chat UI that has no transcript yet. Persisted
 * app-side so it survives restarts; dropped once its first run materializes
 * the transcript (or the user deletes it).
 */
export interface ChatPendingSession {
  sessionId: string;
  providerId: string;
  cwd: string;
  title: string;
  /** Creation time (epoch ms). */
  createdAt: number;
}
