import { Conversation } from '@shared/conversations';

export interface ConversationProvider {
  startSession(
    conversation: Conversation,
    initialSize?: { cols: number; rows: number },
    isResuming?: boolean,
    initialPrompt?: string
  ): Promise<void>;
  stopSession(conversationId: string): Promise<void>;
  destroyAll(): Promise<void>;
  detachAll(): Promise<void>;
  /**
   * The working directory the conversation's CLI was last spawned in. Used by
   * consumers that must locate per-conversation artifacts (e.g. transcript
   * files), where the task workDir is not precise enough for multi-project
   * tasks. Optional — SSH providers may not track it.
   */
  getSpawnCwd?(conversationId: string): string | undefined;
}

export type ConversationConfig = {
  autoApprove?: boolean;
};
