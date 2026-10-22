import { Loader2, MessagesSquare, RefreshCw, SendHorizontal, Square } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatSessionSummary } from '@shared/chat';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { Button } from '@renderer/lib/ui/button';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import { AutoResizingTextarea } from '../components/chat-view';
import { MessageBubble } from '../components/message-bubble';
import { ChatCenterStore } from './chat-center-store';

export function ChatCenterTitlebar() {
  return <Titlebar />;
}

export function ChatCenterMainPanel() {
  return <ChatCenter />;
}

export const chatCenterView = {
  TitlebarSlot: ChatCenterTitlebar,
  MainPanel: ChatCenterMainPanel,
};

function formatRelative(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(ms).toLocaleDateString();
}

const ChatCenter = observer(function ChatCenter() {
  const store = useMemo(() => new ChatCenterStore(), []);
  useEffect(() => {
    void store.init();
    return () => store.dispose();
  }, [store]);

  return (
    <div className="flex h-full min-h-0">
      <SessionList store={store} />
      <ChatPane store={store} />
    </div>
  );
});

const SessionList = observer(function SessionList({ store }: { store: ChatCenterStore }) {
  const providers = Array.from(new Set(store.sessions.map((s) => s.providerId)));

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-background-secondary-1">
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <MessagesSquare className="size-4" />
          Chats
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={store.loadingSessions}
          onClick={() => void store.loadSessions()}
          aria-label="Refresh sessions"
        >
          {store.loadingSessions ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
        </Button>
      </div>
      <div className="flex items-center gap-1 px-3 pb-2">
        {['all', ...providers].map((provider) => (
          <button
            key={provider}
            type="button"
            onClick={() => store.setProviderFilter(provider)}
            className={cn(
              'rounded-md px-2 py-0.5 text-[11px] capitalize transition-colors',
              store.providerFilter === provider
                ? 'bg-background-1 text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {provider}
          </button>
        ))}
      </div>
      <div className="px-3 pb-2">
        <input
          value={store.query}
          onChange={(e) => store.setQuery(e.target.value)}
          placeholder="Search sessions…"
          className="w-full rounded-md border border-border bg-background-1 px-2 py-1 text-xs outline-none placeholder:text-muted-foreground focus:border-ring"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {store.filteredSessions.length === 0 && !store.loadingSessions ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No sessions found. Sessions appear here once an agent CLI (claude, codex…) has saved a
            conversation.
          </div>
        ) : null}
        {store.filteredSessions.map((session) => (
          <SessionItem
            key={session.file}
            session={session}
            active={store.selected?.file === session.file}
            onSelect={() => store.select(session)}
          />
        ))}
      </div>
    </aside>
  );
});

function SessionItem({
  session,
  active,
  onSelect,
}: {
  session: ChatSessionSummary;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'mb-0.5 flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-background-1 shadow-sm' : 'hover:bg-background-1/60'
      )}
    >
      <span className="line-clamp-2 text-xs leading-snug">{session.title}</span>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-background-1 px-1 py-px font-medium">{session.providerId}</span>
        {session.cwd ? <span className="truncate">{session.cwd.split(/[\\/]/).pop()}</span> : null}
        <span className="ml-auto shrink-0">{formatRelative(session.updatedAt)}</span>
      </span>
    </button>
  );
}

const ChatPane = observer(function ChatPane({ store }: { store: ChatCenterStore }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [text, setText] = useState('');
  const session = store.selected;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [store.messages.length, store.streamText, store.streamThinking, store]);

  if (!session) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-muted-foreground">
        Select a session to start chatting
      </div>
    );
  }

  const send = async () => {
    const value = text.trim();
    if (!value || store.running || store.sendPending) return;
    if (await store.send(value)) setText('');
  };

  const showStream =
    store.running || store.streamText.length > 0 || store.streamThinking.length > 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {session.cwd || 'unknown directory'}
        </span>
        {store.running ? <Spinner className="size-3.5" /> : null}
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto py-3"
      >
        {store.loadingHistory ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Spinner className="size-4" />
            Loading conversation…
          </div>
        ) : null}
        {store.historyError ? (
          <div className="py-6 text-center text-xs text-red-500">
            Could not load this conversation's history.
          </div>
        ) : null}
        {!store.loadingHistory && store.messages.length === 0 && !showStream ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No messages in this session yet — send the first one below.
          </div>
        ) : null}
        {store.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {showStream ? (
          <div className="px-4 py-1.5">
            {store.streamThinking ? (
              <div className="mb-1 border-l-2 border-border pl-2 text-xs whitespace-pre-wrap text-muted-foreground italic">
                {store.streamThinking}
              </div>
            ) : null}
            {store.streamText ? (
              <div className="text-sm whitespace-pre-wrap">
                {store.streamText}
                <span className="animate-pulse">▍</span>
              </div>
            ) : (
              <span className="animate-pulse text-xs text-muted-foreground">thinking…</span>
            )}
          </div>
        ) : null}
      </div>
      {store.runError ? (
        <div className="mx-4 mb-1 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-500">
          {store.runError}
        </div>
      ) : null}
      <div className="shrink-0 border-t border-border p-2">
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background-1 px-2 py-1.5">
          <AutoResizingTextarea
            rows={1}
            value={text}
            placeholder={
              session.cwd ? 'Send a message…' : 'Cannot send — the session directory is unknown'
            }
            disabled={!session.cwd}
            className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
          />
          {store.running ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              onClick={() => store.abort()}
              aria-label="Stop"
            >
              <Square className="size-3.5" />
            </Button>
          ) : (
            <Button
              size="icon"
              variant="ghost"
              className="size-7 shrink-0"
              disabled={!text.trim() || store.sendPending || !session.cwd}
              onClick={() => void send()}
              aria-label="Send"
            >
              {store.sendPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <SendHorizontal className="size-3.5" />
              )}
            </Button>
          )}
        </div>
        <div className="pt-1 text-[10px] text-muted-foreground">
          Enter to send · Shift+Enter for a new line · replies stream in as they are generated
        </div>
      </div>
    </div>
  );
});
