export type Conversation = {
  id: string;
  taskId: string;
  providerId: string;
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
  taskId: string;
  provider: string;
  title: string;
  autoApprove?: boolean;
  initialSize?: { cols: number; rows: number };
  initialPrompt?: string;
};
