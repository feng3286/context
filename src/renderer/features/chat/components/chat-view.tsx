import {
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  SendHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatCommandInfo, ChatMessage, ChatSessionSummary } from '@shared/chat';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import type { ChatTab } from '../chat-tabs-store';
import { SessionChatStore, TaskSessionsStore } from '../session-chat-store';
import { MessageBubble } from './message-bubble';

export const AutoResizingTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AutoResizingTextarea(props, ref) {
  return (
    <textarea
      {...props}
      ref={ref}
      onChange={(e) => {
        props.onChange?.(e);
        const el = e.currentTarget;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
      }}
    />
  );
});

function StreamingBubble({ text, thinking }: { text: string; thinking: string }) {
  return (
    <div className="px-4 py-1.5">
      {thinking ? (
        <div className="mb-1 border-l-2 border-border pl-2 text-xs whitespace-pre-wrap text-muted-foreground italic">
          {thinking}
        </div>
      ) : null}
      {text ? (
        <div className="text-sm whitespace-pre-wrap">
          {text}
          <span className="animate-pulse">▍</span>
        </div>
      ) : (
        <span className="animate-pulse text-xs text-muted-foreground">thinking…</span>
      )}
    </div>
  );
}

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

/**
 * One agent chat tab: left rail lists the agent's sessions recorded under the
 * task's working directory, right pane chats with the selected session
 * headlessly. Fully decoupled from conversation (TUI) tabs — nothing here
 * touches a terminal PTY.
 */
export const ChatTabView = observer(function ChatTabView({
  chatTab,
  workDir,
  projectDir,
}: {
  chatTab: ChatTab;
  workDir: string;
  projectDir?: string;
}) {
  const sessionsStore = useMemo(() => new TaskSessionsStore(), []);
  const externalChat = sessionsStore.externalChat;

  useEffect(() => {
    if (workDir) void sessionsStore.load(workDir);
    return () => sessionsStore.dispose();
  }, [sessionsStore, workDir]);

  return (
    <div className="flex h-full min-h-0 flex-1 bg-background-secondary-1">
      <SessionsRail
        store={sessionsStore}
        chatTab={chatTab}
        workDir={workDir}
        projectDir={projectDir}
      />
      {sessionsStore.selectedExternal && externalChat ? (
        <ExternalSessionPane
          key={externalChat.session.file}
          store={externalChat}
          onNewSession={() => {
            sessionsStore.createLocalSession(
              chatTab.providerId,
              sessionsStore.selectedExternal?.cwd ?? workDir
            );
          }}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <MessageSquare className="size-6 text-muted-foreground" />
          <div className="text-sm font-medium">No session selected</div>
          <div className="max-w-xs text-xs text-muted-foreground">
            Create a new session with the + button in the sidebar, or pick one from the list.
          </div>
        </div>
      )}
    </div>
  );
});

const SessionsRail = observer(function SessionsRail({
  store,
  chatTab,
  workDir,
  projectDir,
}: {
  store: TaskSessionsStore;
  chatTab: ChatTab;
  workDir: string;
  projectDir?: string;
}) {
  // Only this tab's agent sessions — one tab per agent.
  const external = store.railSessions.filter((s) => s.providerId === chatTab.providerId);
  const [choosingContext, setChoosingContext] = useState(false);
  const contextOptions = [
    ...(projectDir && projectDir.toLowerCase() !== workDir.toLowerCase()
      ? [{ label: `Project · ${projectDir.split(/[\/]/).pop()}`, path: projectDir }]
      : []),
    { label: 'Task directory', path: workDir },
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border">
      <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Sessions
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={() => setChoosingContext((v) => !v)}
            aria-label="New session"
          >
            <Plus className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            disabled={store.loading}
            onClick={() => void store.refresh()}
            aria-label="Refresh sessions"
          >
            {store.loading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
          </Button>
        </div>
      </div>
      {choosingContext ? (
        <div className="mx-1.5 mb-1 rounded-md border border-border bg-background-1 p-1">
          <div className="px-1.5 pb-1 text-[10px] text-muted-foreground">Context directory</div>
          {contextOptions.map((option) => (
            <button
              key={option.path}
              type="button"
              className="block w-full truncate rounded px-1.5 py-1 text-left text-xs hover:bg-background-1/80"
              onClick={() => {
                setChoosingContext(false);
                store.createLocalSession(chatTab.providerId, option.path);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {store.deleteError ? (
        <button
          type="button"
          className="mx-1.5 mb-1 rounded-md bg-red-500/10 px-2 py-1 text-left text-[10px] leading-relaxed text-red-500"
          onClick={() => (store.deleteError = null)}
          title="Click to dismiss"
        >
          {store.deleteError}
        </button>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {external.map((session) => (
          <RailSessionItem
            key={session.sessionId}
            session={session}
            active={store.selectedExternal?.sessionId === session.sessionId}
            onSelect={() => store.selectExternal(session)}
            onDelete={() => void store.removeExternal(session)}
          />
        ))}
        {store.loaded && external.length === 0 ? (
          <div className="px-2 py-3 text-[10px] leading-relaxed text-muted-foreground/70">
            No sessions found under this working directory yet.
          </div>
        ) : null}
      </div>
    </aside>
  );
});

function RailSessionItem({
  session,
  active,
  onSelect,
  onDelete,
}: {
  session: ChatSessionSummary;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  // Two-step delete: arm on first click, confirm on the second.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 2500);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        setArmed(false);
        onSelect();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setArmed(false);
          onSelect();
        }
      }}
      className={cn(
        'group relative mb-0.5 flex w-full cursor-pointer flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
        active ? 'bg-background-1 shadow-sm' : 'hover:bg-background-1/60'
      )}
    >
      <span className="line-clamp-2 pr-5 text-xs leading-snug">{session.title}</span>
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-background-1 px-1 py-px font-medium">{session.providerId}</span>
        {session.cwd ? <span className="truncate">{session.cwd.split(/[\\/]/).pop()}</span> : null}
        <span className="ml-auto shrink-0">{formatRelative(session.updatedAt)}</span>
      </span>
      {onDelete ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute right-1 top-1 size-5',
            armed ? 'text-red-500 opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          aria-label={armed ? 'Confirm delete' : 'Delete session'}
          onClick={(e) => {
            e.stopPropagation();
            if (armed) onDelete();
            else setArmed(true);
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}

/** A session from the rail — headless send with streaming replies. */
const ExternalSessionPane = observer(function ExternalSessionPane({
  store,
  onNewSession,
}: {
  store: SessionChatStore;
  onNewSession?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [text, setText] = useState('');
  const [commands, setCommands] = useState<ChatCommandInfo[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [slashHidden, setSlashHidden] = useState(false);
  const session = store.session;
  const canSend = supportsHeadless(session.providerId) && !!session.cwd;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [store.messages.length, store.streamText, store.streamThinking, store]);

  // Agent slash commands (built-ins + custom files) for the autocomplete menu.
  useEffect(() => {
    let cancelled = false;
    void rpc.chats
      .listCommands({ providerId: session.providerId, cwd: session.cwd || undefined })
      .then((result) => {
        if (cancelled || !result.success) return;
        const list = [...result.data];
        if (onNewSession) {
          list.unshift({
            name: 'new',
            description: 'Start a fresh session in this tab',
            source: 'app',
          });
        }
        setCommands(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session.providerId, session.cwd, onNewSession]);

  // Slash autocomplete while the whole input is a `/query` fragment; a trailing
  // space (after completing) no longer matches, so Enter then sends.
  const slashQuery = text.match(/^\/([a-zA-Z0-9:_-]*)$/)?.[1] ?? null;
  const slashMatches = useMemo(() => {
    if (slashQuery == null) return [];
    const query = slashQuery.toLowerCase();
    return commands.filter((c) => c.name.toLowerCase().startsWith(query)).slice(0, 8);
  }, [commands, slashQuery]);
  const slashOpen = slashMatches.length > 0 && !slashHidden;

  useEffect(() => {
    setHighlight(0);
  }, [slashQuery]);

  const completeSlash = (cmd: ChatCommandInfo) => {
    setText(`/${cmd.name} `);
  };

  const send = async () => {
    const value = text.trim();
    if (!value || store.running || store.sendPending) return;
    if (value === '/new' && onNewSession) {
      setText('');
      onNewSession();
      return;
    }
    if (await store.send(value)) setText('');
  };

  const showStream =
    store.running || store.streamText.length > 0 || store.streamThinking.length > 0;

  const usage = store.contextUsage;
  const usagePct = usage?.contextWindow ? usage.tokens / usage.contextWindow : 0;
  const fmtTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {session.cwd || 'unknown directory'}
        </span>
        {usage ? (
          <span
            title="Approximate context window usage (from the transcript tail)"
            className={cn(
              'shrink-0 rounded px-1.5 py-px text-[10px] font-medium',
              usagePct > 0.95
                ? 'bg-red-500/15 text-red-500'
                : usagePct > 0.8
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-background-1 text-muted-foreground'
            )}
          >
            ctx {fmtTokens(usage.tokens)}
            {usage.contextWindow ? `/${fmtTokens(usage.contextWindow)}` : ''}
          </span>
        ) : null}
        {store.running ? <Spinner className="size-3" /> : null}
      </div>
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto py-2"
      >
        {store.loading ? (
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
        {!store.loading && store.messages.length === 0 && !showStream ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No messages in this session yet — send the first one below.
          </div>
        ) : null}
        {store.messages.map((message: ChatMessage) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {showStream ? (
          <StreamingBubble text={store.streamText} thinking={store.streamThinking} />
        ) : null}
      </div>
      {store.runError ? (
        <div className="mx-3 mb-1 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-500">
          {store.runError}
        </div>
      ) : null}
      <div className="shrink-0 border-t border-border p-2">
        {slashOpen ? (
          <div className="mb-1 overflow-hidden rounded-lg border border-border bg-background-1 shadow-md">
            {slashMatches.map((cmd, i) => (
              <button
                key={`${cmd.source}:${cmd.name}`}
                type="button"
                className={cn(
                  'flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-xs',
                  i === highlight ? 'bg-background-2' : ''
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  completeSlash(cmd);
                }}
                onMouseEnter={() => setHighlight(i)}
              >
                <span className="shrink-0 font-medium">/{cmd.name}</span>
                {cmd.description ? (
                  <span className="truncate text-muted-foreground">{cmd.description}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background-1 px-2 py-1.5">
          <AutoResizingTextarea
            rows={1}
            value={text}
            placeholder={
              canSend
                ? 'Send a message… ( / for commands )'
                : session.cwd
                  ? 'Headless chat is not available for this provider'
                  : 'Cannot send — the session directory is unknown'
            }
            disabled={!canSend}
            className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(e) => {
              setText(e.target.value);
              setSlashHidden(false);
            }}
            onKeyDown={(e) => {
              if (slashOpen) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setHighlight((h) => (h + 1) % slashMatches.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setHighlight((h) => (h - 1 + slashMatches.length) % slashMatches.length);
                  return;
                }
                if (
                  e.key === 'Tab' ||
                  (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing)
                ) {
                  e.preventDefault();
                  completeSlash(slashMatches[highlight] ?? slashMatches[0]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSlashHidden(true);
                  return;
                }
              }
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
              disabled={!text.trim() || store.sendPending || !canSend}
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

function supportsHeadless(providerId: string): boolean {
  return providerId === 'claude' || providerId === 'codex';
}
