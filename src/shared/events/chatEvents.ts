import type { ChatMessage } from '@shared/chat';
import { defineEvent } from '@shared/ipc/events';

/** New chat messages parsed from a transcript. Topic = PTY session ID. */
export const chatMessageChannel = defineEvent<{
  sessionId: string;
  messages: ChatMessage[];
}>('chat:message');

/**
 * Streaming text/thinking deltas from a headless agent run. Topic = provider
 * session id. These are transient — final messages arrive via
 * chatMessageChannel or a history reload when the run finishes.
 */
export const chatDeltaChannel = defineEvent<{
  sessionId: string;
  kind: 'text' | 'thinking';
  text: string;
}>('chat:delta');

/** Headless run lifecycle. Topic = provider session id. */
export const chatRunChannel = defineEvent<{
  sessionId: string;
  status: 'running' | 'done' | 'error';
  error?: string;
  /** Session id the CLI itself reported (differs from our placeholder for
   * codex new sessions, which pick their rollout uuid at run time). */
  actualSessionId?: string;
}>('chat:run');
