import { makeAutoObservable, runInAction } from 'mobx';
import { rpc } from '@renderer/lib/ipc';

/**
 * Agent chat tabs of one task — a sibling of conversation (TUI) tabs, fully
 * decoupled from them: a chat tab is just an agent + the task's working
 * directory context. One tab per agent; the open set persists per task.
 */
export class ChatTab {
  readonly id: string;
  readonly providerId: string;

  constructor(id: string, providerId: string) {
    this.id = id;
    this.providerId = providerId;
  }
}

export class ChatTabsStore {
  tabs: ChatTab[] = [];
  /** Null = a conversation (TUI) tab is active. */
  activeId: string | null = null;
  private taskId: string | null = null;

  constructor() {
    makeAutoObservable(this);
  }

  get activeTab(): ChatTab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null;
  }

  async load(taskId: string): Promise<void> {
    this.taskId = taskId;
    const result = await rpc.chats.getChatTabs();
    if (!result.success) return;
    const providerIds = result.data[taskId] ?? [];
    runInAction(() => {
      this.tabs = providerIds.map((p) => new ChatTab(crypto.randomUUID(), p));
      this.activeId = null;
    });
  }

  async create(providerId: string): Promise<ChatTab> {
    const tab = new ChatTab(crypto.randomUUID(), providerId);
    runInAction(() => {
      this.tabs.push(tab);
      this.activeId = tab.id;
    });
    await this.persist();
    return tab;
  }

  async remove(id: string): Promise<void> {
    const index = this.tabs.findIndex((t) => t.id === id);
    if (index === -1) return;
    runInAction(() => {
      this.tabs.splice(index, 1);
      this.activeId =
        this.activeId === id
          ? (this.tabs[Math.min(index, this.tabs.length - 1)]?.id ?? null)
          : this.activeId;
    });
    await this.persist();
  }

  setActive(id: string | null): void {
    this.activeId = id;
  }

  private async persist(): Promise<void> {
    if (!this.taskId) return;
    await rpc.chats.setChatTabs({
      taskId: this.taskId,
      providerIds: this.tabs.map((t) => t.providerId),
    });
  }
}
