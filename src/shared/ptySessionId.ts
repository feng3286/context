/**
 * Deterministic PTY session ID.
 *
 * Legacy format: `<projectId>:<scopeId>:<leafId>` where leafId is either a
 * conversationId (agent sessions) or a terminalId (shell sessions).
 *
 * New format: `<prefix>:<taskId>:<leafId>` where prefix is 'conversation' or 'terminal'.
 *
 * There is at most one active PTY per leaf entity.  Using a deterministic ID
 * means the renderer can subscribe to ptyDataChannel BEFORE calling
 * rpc.conversations.startSession / rpc.terminals.createTerminal — no extra
 * round-trip is needed to learn the session ID.
 */

/**
 * Legacy function for backward compatibility during migration.
 * @deprecated Use makeConversationSessionId or makeTerminalSessionId instead.
 */
export function makePtySessionId(projectId: string, scopeId: string, leafId: string): string {
  return `${projectId}:${scopeId}:${leafId}`;
}

/**
 * Create a session ID for a conversation PTY.
 * Conversation sessions are bound to taskId only (not projectId) to support
 * multi-project tasks where conversation context spans all projects.
 */
export function makeConversationSessionId(taskId: string, conversationId: string): string {
  return `conversation:${taskId}:${conversationId}`;
}

/**
 * Create a session ID for a terminal PTY.
 * Terminal sessions are bound to taskId only (not projectId) to support
 * multi-project tasks.
 */
export function makeTerminalSessionId(taskId: string, terminalId: string): string {
  return `terminal:${taskId}:${terminalId}`;
}
