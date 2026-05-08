import { AgentProviderId } from '@shared/agent-provider-registry';

export type Conversation = {
  id: string;
  taskId: string; // Only taskId binding - conversation context spans all projects in a multi-project task
  providerId: AgentProviderId;
  title: string;
  resume?: boolean;
  autoApprove?: boolean;
};

export type RenameConversationParams = {
  conversationId: string;
  newTitle: string;
};

export type CreateConversationParams = {
  id: string;
  taskId: string; // Only taskId - conversation binds to task, not project
  provider: AgentProviderId;
  title: string;
  autoApprove?: boolean;
  initialSize?: { cols: number; rows: number };
  initialPrompt?: string;
};
