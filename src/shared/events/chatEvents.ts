import type { ChatMessage } from '@shared/chat';
import { defineEvent } from '@shared/ipc/events';

/** New chat messages parsed from a transcript. Topic = PTY session ID. */
export const chatMessageChannel = defineEvent<{
  sessionId: string;
  messages: ChatMessage[];
}>('chat:message');
