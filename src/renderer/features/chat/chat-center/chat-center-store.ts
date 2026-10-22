import { makeAutoObservable, runInAction } from 'mobx';
import type { ChatMessage, ChatSessionSummary } from '@shared/chat';
import { chatDeltaChannel, chatRunChannel } from '@shared/events/chatEvents';
import { events, rpc } from '@renderer/lib/ipc';

const HISTORY_PAGE = 400;

/**
 * Chat center state: the discovered session list (provider transcripts), the
 * selected session's history, and the live streaming buffer for a headless
 * run in progress.
 */
export class ChatCenterStore {
  sessions: ChatSessionSummary[] = [];
  loadingSessions = false;
  providerFilter: string = 'all';
  query = '';

  selected: ChatSessionSummary | null = null;
  messages: ChatMessage[] = [];
  loadingHistory = false;
  historyError: string | null = null;

  /** Live headless run for the selected session. */
  running = false;
  streamText = '';
  streamThinking = '';
  runError: string | null = null;
  sendPending = false;

  private deltasOff: (() => void) | null = null;
  private runsOff: (() => void) | null = null;
  private inited = false;

  constructor() {
    makeAutoObservable(this);
  }

  async init(): Promise<void> {
    if (this.inited) return;
    this.inited = true;
    // Global listeners route by payload.sessionId; per-selection filtering
    // happens in the handlers.
    this.deltasOff = events.on(chatDeltaChannel, (payload) => {
      runInAction(() => {
        if (!this.selected || payload.sessionId !== this.selected.sessionId) return;
        if (payload.kind === 'text') this.streamText += payload.text;
        else this.streamThinking += payload.text;
      });
    });
    this.runsOff = events.on(chatRunChannel, (payload) => {
      void this.handleRun(payload);
    });
    await this.loadSessions();
  }

  private async handleRun(payload: {
    sessionId: string;
    status: 'running' | 'done' | 'error';
    error?: string;
  }): Promise<void> {
    if (!this.selected || payload.sessionId !== this.selected.sessionId) return;
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
    // Reload history: the transcript file is authoritative and now
    // contains the user message + final assistant message(s).
    await this.reloadHistory();
  }

  dispose(): void {
    this.deltasOff?.();
    this.runsOff?.();
    this.deltasOff = null;
    this.runsOff = null;
    this.inited = false;
  }

  async loadSessions(): Promise<void> {
    this.loadingSessions = true;
    try {
      const result = await rpc.chats.listSessions();
      if (result.success) {
        runInAction(() => {
          this.sessions = result.data;
          // Drop the selection if its session vanished from the index.
          if (this.selected && !result.data.some((s) => s.file === this.selected?.file)) {
            this.select(null);
          }
        });
      }
    } finally {
      runInAction(() => {
        this.loadingSessions = false;
      });
    }
  }

  setProviderFilter(value: string): void {
    this.providerFilter = value;
  }

  setQuery(value: string): void {
    this.query = value;
  }

  get filteredSessions(): ChatSessionSummary[] {
    const query = this.query.trim().toLowerCase();
    return this.sessions.filter((session) => {
      if (this.providerFilter !== 'all' && session.providerId !== this.providerFilter) {
        return false;
      }
      if (query && !session.title.toLowerCase().includes(query)) return false;
      return true;
    });
  }

  select(session: ChatSessionSummary | null): void {
    if (this.selected?.file === session?.file) return;
    this.selected = session;
    this.messages = [];
    this.streamText = '';
    this.streamThinking = '';
    this.runError = null;
    this.historyError = null;
    this.running = false;
    if (session) void this.reloadHistory();
  }

  async reloadHistory(): Promise<void> {
    const session = this.selected;
    if (!session) return;
    this.loadingHistory = this.messages.length === 0;
    try {
      const result = await rpc.chats.getHistory({
        providerId: session.providerId,
        file: session.file,
      });
      if (!result.success) {
        runInAction(() => {
          if (this.selected === session) {
            this.historyError = 'history_unavailable';
          }
        });
        return;
      }
      runInAction(() => {
        if (this.selected !== session) return;
        this.messages = result.data.messages.slice(-HISTORY_PAGE);
        this.historyError = null;
      });
    } finally {
      runInAction(() => {
        if (this.selected === session) this.loadingHistory = false;
      });
    }
  }

  async send(text: string): Promise<boolean> {
    const session = this.selected;
    const value = text.trim();
    if (!session || !value || this.running || this.sendPending) return false;
    this.sendPending = true;
    this.runError = null;
    try {
      const result = await rpc.chats.send({
        providerId: session.providerId,
        sessionId: session.sessionId,
        cwd: session.cwd,
        text: value,
      });
      if (!result.success) {
        runInAction(() => {
          this.runError = describeSendError(result.error);
        });
        return false;
      }
      // Optimistic user bubble — replaced by the transcript after the run.
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
    const session = this.selected;
    if (session) void rpc.chats.abort({ sessionId: session.sessionId });
  }
}

function describeSendError(error: { type: string; message?: string }): string {
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
