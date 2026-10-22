import { makeAutoObservable, runInAction } from 'mobx';
import type { ChatMessage, ChatSessionSummary } from '@shared/chat';
import { chatDeltaChannel, chatRunChannel } from '@shared/events/chatEvents';
import { events, rpc } from '@renderer/lib/ipc';

const HISTORY_PAGE = 400;

/** Providers that support headless send + file-based history. */
export function supportsHeadlessChat(providerId: string): boolean {
  return providerId === 'claude' || providerId === 'codex';
}

/**
 * Chat with one discovered (non-conversation) session: history comes from its
 * transcript file, messages are sent headlessly, and replies stream in via
 * the chat:delta events the main process emits during the run.
 */
export class SessionChatStore {
  readonly session: ChatSessionSummary;
  messages: ChatMessage[] = [];
  loading = false;
  historyError = false;
  running = false;
  streamText = '';
  streamThinking = '';
  runError: string | null = null;
  sendPending = false;

  private deltasOff: (() => void) | null = null;
  private runsOff: (() => void) | null = null;

  constructor(session: ChatSessionSummary) {
    this.session = session;
    makeAutoObservable(this, { session: false });
  }

  async init(): Promise<void> {
    this.deltasOff = events.on(
      chatDeltaChannel,
      (payload) => {
        if (payload.sessionId !== this.session.sessionId) return;
        runInAction(() => {
          if (payload.kind === 'text') this.streamText += payload.text;
          else this.streamThinking += payload.text;
        });
      },
      this.session.sessionId
    );
    this.runsOff = events.on(
      chatRunChannel,
      (payload) => {
        if (payload.sessionId !== this.session.sessionId) return;
        if (payload.status === 'running') {
          runInAction(() => {
            this.running = true;
          });
          return;
        }
        runInAction(() => {
          this.running = false;
          this.runError = payload.status === 'error' ? (payload.error ?? 'Run failed') : null;
          this.streamText = '';
          this.streamThinking = '';
        });
        if (this.session.file) void this.reload();
      },
      this.session.sessionId
    );
    await this.reload();
  }

  dispose(): void {
    this.deltasOff?.();
    this.runsOff?.();
    this.deltasOff = null;
    this.runsOff = null;
  }

  async reload(): Promise<void> {
    // Pending local sessions have no transcript until the first run lands.
    if (!this.session.file) return;
    this.loading = this.messages.length === 0;
    try {
      const result = await rpc.chats.getHistory({
        providerId: this.session.providerId,
        file: this.session.file,
      });
      runInAction(() => {
        if (result.success) {
          this.messages = result.data.messages.slice(-HISTORY_PAGE);
          this.historyError = false;
        } else {
          this.historyError = true;
        }
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async send(text: string): Promise<boolean> {
    const value = text.trim();
    if (!value || this.running || this.sendPending) return false;
    this.sendPending = true;
    this.runError = null;
    try {
      const result = await rpc.chats.send({
        providerId: this.session.providerId,
        sessionId: this.session.sessionId,
        cwd: this.session.cwd,
        text: value,
        // Pending local sessions have no transcript yet — start a fresh one.
        newSession: !this.session.file,
      });
      if (!result.success) {
        runInAction(() => {
          this.runError = describeSendError(result.error);
        });
        return false;
      }
      // Optimistic user bubble — the transcript reload after the run replaces it.
      runInAction(() => {
        this.messages.push({
          id: `local-${Date.now()}`,
          role: 'user',
          blocks: [{ kind: 'text', text: value }],
          timestamp: new Date().toISOString(),
        });
        this.running = true;
        this.streamText = '';
        this.streamThinking = '';
      });
      return true;
    } finally {
      runInAction(() => {
        this.sendPending = false;
      });
    }
  }

  abort(): void {
    void rpc.chats.abort({ sessionId: this.session.sessionId });
  }
}

/** Sessions under one task's working directory + which one is open. */
export class TaskSessionsStore {
  /** Sessions discovered from provider transcript dirs (cwd-filtered). */
  sessions: ChatSessionSummary[] = [];
  /** Sessions created in this view that have no transcript yet. */
  localSessions: ChatSessionSummary[] = [];
  loading = false;
  loaded = false;
  /** Null = the conversation's own session (default selection). */
  selectedExternal: ChatSessionSummary | null = null;
  externalChat: SessionChatStore | null = null;

  private workDir: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  /** Everything the rail should render, local pending items first. */
  get railSessions(): ChatSessionSummary[] {
    return [...this.localSessions, ...this.sessions];
  }

  /** A brand-new chat session for the tab's agent, bound to a context dir. */
  createLocalSession(providerId: string, cwd: string): ChatSessionSummary {
    const session: ChatSessionSummary = {
      sessionId: crypto.randomUUID(),
      providerId,
      cwd,
      title: 'New session',
      updatedAt: Date.now(),
      file: '',
    };
    runInAction(() => {
      this.localSessions.push(session);
    });
    this.selectExternal(session);
    return session;
  }

  async load(workDir: string): Promise<void> {
    this.workDir = workDir;
    this.loading = true;
    try {
      const result = await rpc.chats.listSessions({ cwdPrefix: workDir });
      if (result.success) {
        runInAction(() => {
          this.sessions = result.data;
          this.loaded = true;
          // Local pending items that materialized in the index are dropped —
          // the discovered entry replaces them.
          this.localSessions = this.localSessions.filter(
            (local) => !result.data.some((discovered) => discovered.sessionId === local.sessionId)
          );
          // Drop the selection if the session disappeared from the index.
          const stillThere =
            !this.selectedExternal ||
            this.railSessions.some((s) => s.file === this.selectedExternal?.file);
          if (!stillThere) {
            this.selectExternal(null);
          }
        });
      }
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async refresh(): Promise<void> {
    if (this.workDir) await this.load(this.workDir);
  }

  selectExternal(session: ChatSessionSummary | null): void {
    if (this.selectedExternal?.file === session?.file) return;
    this.externalChat?.dispose();
    this.selectedExternal = session;
    if (session) {
      this.externalChat = new SessionChatStore(session);
      void this.externalChat.init();
    } else {
      this.externalChat = null;
    }
  }

  dispose(): void {
    this.externalChat?.dispose();
    this.externalChat = null;
  }
}

export function describeSendError(error: { type: string; message?: string }): string {
  switch (error.type) {
    case 'busy':
      return 'The agent is still responding — wait for it to finish or press Stop.';
    case 'live_in_terminal':
      return 'This session is running in a task terminal — reply there to keep one writer.';
    case 'unsupported':
      return 'Headless chat is not available for this provider.';
    case 'spawn_failed':
      return `Failed to start the agent CLI${error.message ? `: ${error.message}` : ''}`;
    default:
      return error.message ?? 'Failed to send the message.';
  }
}
