import { makeAutoObservable, runInAction } from 'mobx';
import type { ChatCapability, ChatMessage } from '@shared/chat';
import { chatDeltaChannel, chatMessageChannel, chatRunChannel } from '@shared/events/chatEvents';
import { events, rpc } from '@renderer/lib/ipc';

const PAGE_SIZE = 200;
const PENDING_RETRY_MS = 3000;
const PENDING_MAX_RETRIES = 60; // ~3 minutes of waiting for the first transcript write

/**
 * Chat timeline for one conversation. Backed by the main process transcript
 * service (which follows the CLI's own transcript file) — this store only
 * caches what it received and never renders local-only messages, so the
 * terminal and chat can never disagree about what happened.
 */
export class ChatStore {
  messages: ChatMessage[] = [];
  capability: ChatCapability = 'pending';
  hasOlder = false;
  loading = true;
  /** Live headless run for this conversation (no-TUI fallback path). */
  running = false;
  streamText = '';
  streamThinking = '';
  runError: string | null = null;

  private inited = false;
  private retryCount = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private disposers: (() => void)[] = [];

  constructor(readonly sessionId: string) {
    makeAutoObservable(this, { sessionId: false });
  }

  async init(): Promise<void> {
    if (this.inited) return;
    this.inited = true;
    // Subscribe before fetching: live messages emitted during the fetch are
    // deduped by id instead of lost.
    this.disposers.push(
      events.on(
        chatMessageChannel,
        (payload) => {
          runInAction(() => this.append(payload.messages));
        },
        this.sessionId
      )
    );
    this.disposers.push(
      events.on(
        chatDeltaChannel,
        (payload) => {
          if (payload.sessionId !== this.sessionId) return;
          runInAction(() => {
            if (payload.kind === 'text') this.streamText += payload.text;
            else this.streamThinking += payload.text;
          });
        },
        this.sessionId
      )
    );
    this.disposers.push(
      events.on(
        chatRunChannel,
        (payload) => {
          void this.handleRun(payload);
        },
        this.sessionId
      )
    );
    await this.fetch();
  }

  private async handleRun(payload: {
    sessionId: string;
    status: 'running' | 'done' | 'error';
    error?: string;
  }): Promise<void> {
    if (payload.sessionId !== this.sessionId) return;
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
    // The transcript is authoritative once the run's writes land.
    await this.fetch();
  }

  async loadOlder(): Promise<void> {
    const oldest = this.messages[0];
    if (!oldest || this.loading) return;
    await this.fetch(oldest.id);
  }

  dispose(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    for (const off of this.disposers) off();
    this.disposers = [];
  }

  private append(incoming: ChatMessage[]): void {
    const known = new Set(this.messages.map((m) => m.id));
    for (const message of incoming) {
      if (!known.has(message.id)) {
        this.messages.push(message);
        known.add(message.id);
      }
    }
  }

  private async fetch(before?: string): Promise<void> {
    this.loading = true;
    try {
      const result = await rpc.transcripts.getMessages({
        sessionId: this.sessionId,
        before,
        limit: PAGE_SIZE,
      });
      if (!result.success) {
        this.schedulePendingRetry();
        return;
      }
      runInAction(() => {
        this.capability = result.data.capability;
        this.hasOlder = result.data.hasMore;
        if (before) {
          const known = new Set(this.messages.map((m) => m.id));
          this.messages = [
            ...result.data.messages.filter((m) => !known.has(m.id)),
            ...this.messages,
          ];
        } else {
          // The fetched window is authoritative; keep locally received messages
          // that are newer than it.
          const fetchedIds = new Set(result.data.messages.map((m) => m.id));
          const newer = this.messages.filter((m) => !fetchedIds.has(m.id));
          this.messages = [...result.data.messages, ...newer];
        }
      });
      if (result.data.capability === 'pending') this.schedulePendingRetry();
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  /**
   * The transcript file only appears once the agent processes its first
   * message — until then keep polling at a low rate instead of showing a
   * dead "waiting" state forever.
   */
  private schedulePendingRetry(): void {
    if (this.retryTimer || this.retryCount >= PENDING_MAX_RETRIES) return;
    this.retryCount += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.capability === 'pending' && this.messages.length === 0) {
        void this.fetch();
      }
    }, PENDING_RETRY_MS);
  }
}
