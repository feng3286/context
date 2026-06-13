export interface AgentSessionConfig {
  taskId: string;
  conversationId: string;
  providerId: string;
  command: string;
  args: string[];
  cwd: string;
  sessionId?: string;
  shellSetup?: string;
  tmuxSessionName?: string;
  autoApprove: boolean;
  resume: boolean;
}
