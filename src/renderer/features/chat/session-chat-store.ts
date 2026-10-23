import { makeAutoObservable, runInAction } from 'mobx';
import type { ChatContextUsage, ChatMessage, ChatSessionSummary } from '@shared/chat';
import { chatDeltaChannel, chatMessageChannel, chatRunChannel } from '@shared/events/chatEvents';
import { i18n } from '@renderer/i18n/config';
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
  contextUsage: ChatContextUsage | null = null;

  private deltasOff: (() => void) | null = null;
  private runsOff: (() => void) | null = null;
  private messagesOff: (() => void) | null = null;
  /** Optimistic user bubble of the in-flight run, so a failed run can keep it
   * on screen (marked undelivered) instead of silently flushing it. */
  private pendingUser: ChatMessage | null = null;
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
    // Final messages (assistant replies, compaction notices) land live instead
    // of waiting for the end-of-run transcript reload.
    this.messagesOff = events.on(
      chatMessageChannel,
      (payload) => {
        if (payload.sessionId !== this.topic) return;
        runInAction(() => {
          for (const message of payload.messages) {
            if (this.messages.some((m) => m.id === message.id)) continue;
            this.messages.push(message);
          }
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
        const failed = payload.status === 'error';
        runInAction(() => {
          this.running = false;
          this.runError = failed ? (payload.error ?? i18n.t('chat:runFailed')) : null;
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
        if (this.session.file) await this.reload();
        // A failed run never landed in the transcript, so the reload above (or
        // an early return for a still-pending session) would drop the user's
        // optimistic bubble. Keep it, marked undelivered.
        const optimistic = this.pendingUser;
        this.pendingUser = null;
        if (failed && optimistic) {
          const text = optimistic.blocks.find((b) => b.kind === 'text');
          const landed =
            !!text &&
            this.messages.some((m) =>
              m.blocks.some((b) => b.kind === 'text' && b.text === text.text)
            );
          runInAction(() => {
            if (landed) return;
            if (this.session.file) {
              this.messages.push({ ...optimistic, failed: true });
            } else {
              optimistic.failed = true;
            }
          });
        }
      },
      this.topic
    );
    await this.reload();
  }

  dispose(): void {
    this.deltasOff?.();
    this.runsOff?.();
    this.messagesOff?.();
    this.deltasOff = null;
    this.runsOff = null;
    this.messagesOff = null;
  }

  async reload(): Promise<void> {
    // Pending local sessions have no transcript until the first run lands.
    if (!this.session.file) return;
    this.loading = this.messages.length === 0;
    try {
      const [result, usage] = await Promise.all([
        rpc.chats.getHistory({
          providerId: this.session.providerId,
          file: this.session.file,
        }),
        rpc.chats.getContextUsage({
          providerId: this.session.providerId,
          file: this.session.file,
        }),
      ]);
      runInAction(() => {
        if (result.success) {
          this.messages = result.data.messages.slice(-HISTORY_PAGE);
          this.historyError = false;
        } else {
          this.historyError = true;
        }
        if (usage.success) {
          this.contextUsage = usage.data;
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
      const optimistic: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        blocks: [{ kind: 'text', text: value }],
        timestamp: new Date().toISOString(),
      };
      runInAction(() => {
        this.pendingUser = optimistic;
        this.messages.push(optimistic);
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
  railError: string | null = null;

  private workDir: string | null = null;
  /** Extra scan roots: sessions created under a context project's worktree
   * live outside the task worktree and would vanish from the rail on restart
   * if only workDir were scanned. Mirrors the TUI conversation cwd options. */
  private extraScanDirs: string[] = [];

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
      title: i18n.t('chat:newSessionTitle'),
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

  async load(workDir: string, extraDirs: string[] = []): Promise<void> {
    this.workDir = workDir;
    this.extraScanDirs = extraDirs;
    this.loading = true;
    try {
      const prefixes = [...new Set([workDir, ...extraDirs])];
      const [sessionLists, pendingLists] = await Promise.all([
        Promise.all(prefixes.map((prefix) => rpc.chats.listSessions({ cwdPrefix: prefix }))),
        Promise.all(prefixes.map((prefix) => rpc.chats.listPendingSessions({ cwdPrefix: prefix }))),
      ]);
      if (sessionLists.every((r) => r.success)) {
        // Merge across scan roots; one session has exactly one cwd, so the
        // dedupe only guards nested-prefix overlap.
        const discovered = new Map<string, ChatSessionSummary>();
        for (const r of sessionLists) {
          for (const s of r.success ? r.data : []) {
            if (!discovered.has(s.sessionId)) discovered.set(s.sessionId, s);
          }
        }
        const discoveredList = [...discovered.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        const stubs: ChatSessionSummary[] = [];
        for (const r of pendingLists) {
          for (const stub of r.success ? r.data : []) {
            if (stubs.some((s) => s.sessionId === stub.sessionId)) continue;
            stubs.push({
              sessionId: stub.sessionId,
              providerId: stub.providerId,
              cwd: stub.cwd,
              title: stub.title || i18n.t('chat:newSessionTitle'),
              updatedAt: stub.createdAt,
              file: '',
            });
          }
        }
        // Stubs whose transcript materialized are retired — the discovered
        // entry replaces them.
        const materialized = stubs
          .filter((stub) => discovered.has(stub.sessionId))
          .map((stub) => stub.sessionId);
        if (materialized.length > 0) {
          void rpc.chats.removePendingSessions({ ids: materialized });
        }
        runInAction(() => {
          this.sessions = discoveredList;
          this.loaded = true;
          // Merge, don't rebuild: sessions created this lifetime survive even
          // when their addPendingSession RPC has not landed in the KV yet —
          // a plain rebuild dropped them and cleared the selection mid-flight.
          const known = new Map(
            stubs
              .filter((stub) => !materialized.includes(stub.sessionId))
              .map((stub) => [stub.sessionId, stub])
          );
          const merged = this.localSessions.map((local) => known.get(local.sessionId) ?? local);
          const fresh = [...known.values()].filter(
            (stub) => !this.localSessions.some((local) => local.sessionId === stub.sessionId)
          );
          this.localSessions = [...merged, ...fresh];
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
    if (this.workDir) await this.load(this.workDir, this.extraScanDirs);
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

  /** Branch a session at an earlier message: fork its transcript (original
   * untouched), open the branch, and send `text` there — the branch point's
   * text, editable by the caller before passing it in. */
  async branchFrom(source: ChatSessionSummary, messageId: string, text: string): Promise<boolean> {
    if (!source.file || !text.trim()) return false;
    const result = await rpc.chats.forkSession({
      providerId: source.providerId,
      file: source.file,
      messageId,
      sourceTitle: source.title,
    });
    if (!result.success) {
      runInAction(() => {
        this.railError = describeForkError(result.error);
      });
      return false;
    }
    const branch: ChatSessionSummary = {
      sessionId: result.data.sessionId,
      providerId: source.providerId,
      cwd: source.cwd,
      title: source.title,
      updatedAt: Date.now(),
      file: result.data.file,
    };
    runInAction(() => {
      this.sessions = [branch, ...this.sessions];
    });
    this.selectExternal(branch);
    await this.externalChat?.send(text);
    return true;
  }

  /** App-owned display title (override); empty string falls back to derived. */
  async renameSession(session: ChatSessionSummary, title: string): Promise<void> {
    const trimmed = title.trim();
    const result = await rpc.chats.renameSession({ sessionId: session.sessionId, title: trimmed });
    if (!result.success) {
      runInAction(() => {
        this.railError = result.error.message ?? i18n.t('chat:railErrors.default');
      });
      return;
    }
    runInAction(() => {
      session.title = trimmed;
    });
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
          this.railError = describeDeleteError(result.error);
        });
        return;
      }
    } else {
      // No transcript yet — retire the persisted stub instead.
      await rpc.chats.removePendingSessions({ ids: [session.sessionId] });
    }
    runInAction(() => {
      this.railError = null;
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
      return i18n.t('chat:sendErrors.busy');
    case 'live_in_terminal':
      return i18n.t('chat:sendErrors.live_in_terminal');
    case 'unsupported':
      return i18n.t('chat:sendErrors.unsupported');
    case 'spawn_failed':
      return i18n.t('chat:sendErrors.spawn_failed', {
        detail: error.message ? `: ${error.message}` : '',
      });
    default:
      return error.message ?? i18n.t('chat:sendErrors.default');
  }
}

function describeDeleteError(error: { type: string; message?: string }): string {
  switch (error.type) {
    case 'busy':
      return i18n.t('chat:railErrors.busy');
    case 'forbidden':
      return i18n.t('chat:railErrors.forbidden');
    default:
      return error.message ?? i18n.t('chat:railErrors.default');
  }
}

function describeForkError(error: { type: string; message?: string }): string {
  switch (error.type) {
    case 'not_found':
      return i18n.t('chat:forkErrors.notFound');
    case 'forbidden':
      return i18n.t('chat:forkErrors.forbidden');
    case 'empty':
      return i18n.t('chat:forkErrors.empty');
    default:
      return error.message ?? i18n.t('chat:forkErrors.default');
  }
}
