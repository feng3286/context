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
  /** Stable event topic. Pending sessions adopt the CLI's own session id when
   * the first run lands, but subscriptions must keep receiving events. */
  private readonly topic: string;

  constructor(session: ChatSessionSummary) {
    this.session = session;
    this.topic = session.sessionId;
    makeAutoObservable(this, { session: false });
  }

  async init(): Promise<void> {
    this.deltasOff = events.on(
      chatDeltaChannel,
      (payload) => {
        if (payload.sessionId !== this.topic) return;
        runInAction(() => {
          if (payload.kind === 'text') this.streamText += payload.text;
          else this.streamThinking += payload.text;
        });
      },
      this.topic
    );
    this.runsOff = events.on(
      chatRunChannel,
      async (payload) => {
        if (payload.sessionId !== this.topic) return;
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
        // A pending (new) session now has a transcript: adopt the CLI's own
        // session id (codex picks its rollout uuid at run time), retire the
        // pending stub, and resolve the transcript path so later messages
        // resume instead of starting yet another fresh session.
        if (!this.session.file) {
          void rpc.chats.removePendingSessions({ ids: [this.topic] });
          if (payload.actualSessionId) {
            runInAction(() => {
              (this.session as { sessionId: string }).sessionId = payload.actualSessionId as string;
            });
          }
          const resolved = await rpc.chats.resolveSessionFile({
            providerId: this.session.providerId,
            sessionId: this.session.sessionId,
            cwd: this.session.cwd,
          });
          if (resolved.success && resolved.data) {
            runInAction(() => {
              (this.session as { file: string }).file = resolved.data as string;
            });
          }
        }
        if (this.session.file) void this.reload();
      },
      this.topic
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
        topic: this.topic,
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
  /** Last session-deletion failure, shown in the rail until dismissed. */
  deleteError: string | null = null;

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
    // Persist the stub so the session survives restarts before its first run.
    void rpc.chats.addPendingSession({
      sessionId: session.sessionId,
      providerId,
      cwd,
      title: session.title,
      createdAt: session.updatedAt,
    });
    this.selectExternal(session);
    return session;
  }

  async load(workDir: string): Promise<void> {
    this.workDir = workDir;
    this.loading = true;
    try {
      const [result, pending] = await Promise.all([
        rpc.chats.listSessions({ cwdPrefix: workDir }),
        rpc.chats.listPendingSessions({ cwdPrefix: workDir }),
      ]);
      if (result.success) {
        const stubs: ChatSessionSummary[] = (pending.success ? pending.data : []).map((stub) => ({
          sessionId: stub.sessionId,
          providerId: stub.providerId,
          cwd: stub.cwd,
          title: stub.title || 'New session',
          updatedAt: stub.createdAt,
          file: '',
        }));
        // Stubs whose transcript materialized are retired — the discovered
        // entry replaces them.
        const materialized = stubs
          .filter((stub) => result.data.some((d) => d.sessionId === stub.sessionId))
          .map((stub) => stub.sessionId);
        if (materialized.length > 0) {
          void rpc.chats.removePendingSessions({ ids: materialized });
        }
        runInAction(() => {
          this.sessions = result.data;
          this.loaded = true;
          this.localSessions = stubs.filter((stub) => !materialized.includes(stub.sessionId));
          // Drop the selection if the session disappeared from the index.
          const stillThere =
            !this.selectedExternal ||
            this.railSessions.some((s) => s.sessionId === this.selectedExternal?.sessionId);
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
    if (this.selectedExternal?.sessionId === session?.sessionId) return;
    this.externalChat?.dispose();
    this.selectedExternal = session;
    if (session) {
      this.externalChat = new SessionChatStore(session);
      void this.externalChat.init();
    } else {
      this.externalChat = null;
    }
  }

  /** Delete a session: remove its transcript (if any) and drop it from the rail. */
  async removeExternal(session: ChatSessionSummary): Promise<void> {
    if (session.file) {
      const result = await rpc.chats.deleteSession({
        providerId: session.providerId,
        file: session.file,
      });
      if (!result.success) {
        runInAction(() => {
          this.deleteError = describeDeleteError(result.error);
        });
        return;
      }
    } else {
      // No transcript yet — retire the persisted stub instead.
      await rpc.chats.removePendingSessions({ ids: [session.sessionId] });
    }
    runInAction(() => {
      this.deleteError = null;
      this.localSessions = this.localSessions.filter((s) => s !== session);
      this.sessions = this.sessions.filter((s) => s !== session);
    });
    if (this.selectedExternal === session) this.selectExternal(null);
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

function describeDeleteError(error: { type: string; message?: string }): string {
  switch (error.type) {
    case 'busy':
      return 'Session is still running — stop it before deleting.';
    case 'forbidden':
      return 'That transcript path is outside the session directories.';
    default:
      return error.message ?? 'Failed to delete the session.';
  }
}
