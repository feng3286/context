import { makeAutoObservable, runInAction } from 'mobx';
import type { ChatCapability, ChatMessage } from '@shared/chat';
import { chatMessageChannel } from '@shared/events/chatEvents';
import { events, rpc } from '@renderer/lib/ipc';

const PAGE_SIZE = 200;

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

  private inited = false;
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
    await this.fetch();
  }

  async loadOlder(): Promise<void> {
    const oldest = this.messages[0];
    if (!oldest || this.loading) return;
    await this.fetch(oldest.id);
  }

  dispose(): void {
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
      if (!result.success) return;
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
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
