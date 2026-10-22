import {
  Loader2,
  MessageSquareOff,
  Plus,
  RefreshCw,
  SendHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage, ChatSessionSummary } from '@shared/chat';
import type { ConversationStore } from '@renderer/features/tasks/conversations/conversation-manager';
import { rpc } from '@renderer/lib/ipc';
import { pastePromptInjection } from '@renderer/lib/pty/prompt-injection';
import { Button } from '@renderer/lib/ui/button';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import {
  describeSendError,
  SessionChatStore,
  supportsHeadlessChat,
  TaskSessionsStore,
} from '../session-chat-store';
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

const ChatInputBar = observer(function ChatInputBar({
  conversation,
}: {
  conversation: ConversationStore;
}) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSendError(null);
    setText('');
    setSending(true);
    try {
      if (conversation.session.status === 'ready') {
        // TUI alive: inject into the PTY so the terminal stays authoritative.
        await pastePromptInjection({
          providerId: conversation.data.providerId,
          text: value,
          sendInput: async (data) => {
            const result = await rpc.pty.sendInput(conversation.session.sessionId, data);
            // Failing loudly keeps the message from being silently dropped.
            if (!result.success) throw new Error('send_failed');
          },
        });
        conversation.setWorking();
      } else {
        // No live TUI: drive the CLI headlessly with --resume.
        const result = await rpc.chats.sendToConversation({
          taskId: conversation.taskId,
          conversationId: conversation.data.id,
          text: value,
        });
        if (!result.success) {
          setText((prev) => (prev ? prev : value));
          setSendError(describeSendError(result.error));
        } else {
          conversation.setWorking();
        }
      }
    } catch {
      setText((prev) => (prev ? prev : value));
      setSendError('Message not delivered — the agent terminal is not running.');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  return (
    <div className="shrink-0 border-t border-border p-2">
      <div className="flex items-end gap-2 rounded-lg border border-border bg-background-1 px-2 py-1.5">
        <AutoResizingTextarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder="Send a message to the agent…"
          className="max-h-40 min-h-6 flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          disabled={!text.trim() || sending}
          onClick={() => void send()}
        >
          {sending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <SendHorizontal className="size-3.5" />
          )}
        </Button>
      </div>
      {sendError ? <div className="pt-1 text-[10px] text-red-500">{sendError}</div> : null}
      <div className="pt-1 text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line
      </div>
    </div>
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
 * Chat mode of a task conversation. Left rail: the sessions recorded under the
 * task's working directory (the conversation itself pinned first). Right: the
 * selected session — the conversation's own transcript with PTY input, or an
 * external session driven headlessly with streaming replies.
 */
export const ChatView = observer(function ChatView({
  conversation,
  projectDir,
  workDir,
}: {
  conversation: ConversationStore;
  projectDir?: string;
  workDir?: string;
}) {
  const sessionsStore = useMemo(() => new TaskSessionsStore(), []);
  const externalChat = sessionsStore.externalChat;

  useEffect(() => {
    conversation.ensureChat();
  }, [conversation]);

  useEffect(() => {
    if (workDir) void sessionsStore.load(workDir);
    return () => sessionsStore.dispose();
  }, [sessionsStore, workDir]);

  if (conversation.chat?.capability === 'unsupported' && !sessionsStore.selectedExternal) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <MessageSquareOff className="size-6 text-muted-foreground" />
        <div className="text-sm font-medium">
          Structured chat is not available for {conversation.data.providerId} yet
        </div>
        <div className="max-w-xs text-xs text-muted-foreground">
          This agent does not expose a parseable session transcript. Use the terminal to interact
          with it.
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 bg-background-secondary-1">
      {workDir ? (
        <SessionsRail
          store={sessionsStore}
          conversation={conversation}
          workDir={workDir}
          projectDir={projectDir}
        />
      ) : null}
      {sessionsStore.selectedExternal && externalChat ? (
        <ExternalSessionPane key={externalChat.session.file} store={externalChat} />
      ) : (
        <ConversationPane conversation={conversation} />
      )}
    </div>
  );
});

const SessionsRail = observer(function SessionsRail({
  store,
  conversation,
  workDir,
  projectDir,
}: {
  store: TaskSessionsStore;
  conversation: ConversationStore;
  workDir: string;
  projectDir?: string;
}) {
  // Claude's file name IS the conversation id — dedupe the pinned item.
  const external = store.railSessions.filter(
    (s) => !(s.providerId === conversation.data.providerId && s.sessionId === conversation.data.id)
  );
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
                store.createLocalSession(conversation.data.providerId, option.path);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        <button
          type="button"
          onClick={() => store.selectExternal(null)}
          className={cn(
            'mb-0.5 flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
            !store.selectedExternal ? 'bg-background-1 shadow-sm' : 'hover:bg-background-1/60'
          )}
        >
          <span className="line-clamp-2 text-xs leading-snug">
            {conversation.data.title || 'Current conversation'}
          </span>
          <span className="text-[10px] text-muted-foreground">
            <span className="rounded bg-background-1 px-1 py-px font-medium">
              {conversation.data.providerId}
            </span>
            {' · this task'}
          </span>
        </button>
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
            No other sessions found under this working directory.
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

/** The conversation's own session — transcript projection + PTY input. */
const ConversationPane = observer(function ConversationPane({
  conversation,
}: {
  conversation: ConversationStore;
}) {
  const chat = conversation.chat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [chat?.messages.length, chat]);

  if (!chat) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  const awaitingPermission =
    conversation.status === 'awaiting-input' && conversation.lastNotificationType != null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
      {awaitingPermission ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-amber-500/10 px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400">
          <span className="flex-1">
            The agent is waiting for input or permission — handle it in the terminal.
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => conversation.setViewMode('terminal')}
          >
            Open terminal
          </Button>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto py-2"
      >
        {chat.hasOlder ? (
          <div className="flex justify-center pb-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-muted-foreground"
              disabled={chat.loading}
              onClick={() => void chat.loadOlder()}
            >
              Load earlier messages
            </Button>
          </div>
        ) : null}
        {chat.messages.length === 0 && chat.loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
            <Spinner className="size-4" />
            Loading conversation…
          </div>
        ) : null}
        {chat.messages.length === 0 && !chat.loading && chat.capability === 'pending' ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div className="text-xs text-muted-foreground">
              Waiting for the agent to write its session transcript…
            </div>
            <div className="max-w-xs text-[11px] text-muted-foreground/70">
              The transcript appears once the agent processes its first message. If you already sent
              one, it may not have reached the agent — check the terminal.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={() => conversation.setViewMode('terminal')}
            >
              Open terminal
            </Button>
          </div>
        ) : null}
        {chat.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {chat.running || chat.streamText || chat.streamThinking ? (
          <StreamingBubble text={chat.streamText} thinking={chat.streamThinking} />
        ) : null}
      </div>
      {chat.runError ? (
        <div className="mx-3 mb-1 rounded-md bg-red-500/10 px-3 py-1.5 text-xs text-red-500">
          {chat.runError}
        </div>
      ) : null}
      <ChatInputBar conversation={conversation} />
    </div>
  );
});

/** An external session from the rail — headless send with streaming replies. */
const ExternalSessionPane = observer(function ExternalSessionPane({
  store,
}: {
  store: SessionChatStore;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [text, setText] = useState('');
  const session = store.session;
  const canSend = supportsHeadlessChat(session.providerId) && !!session.cwd;

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [store.messages.length, store.streamText, store.streamThinking, store]);

  const send = async () => {
    const value = text.trim();
    if (!value || store.running || store.sendPending) return;
    if (await store.send(value)) setText('');
  };

  const showStream =
    store.running || store.streamText.length > 0 || store.streamThinking.length > 0;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {session.cwd || 'unknown directory'}
        </span>
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
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background-1 px-2 py-1.5">
          <AutoResizingTextarea
            rows={1}
            value={text}
            placeholder={
              canSend
                ? 'Send a message…'
                : session.cwd
                  ? 'Headless chat is not available for this provider'
                  : 'Cannot send — the session directory is unknown'
            }
            disabled={!canSend}
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

/** Small helper reused by the toolbar toggle. */
export function ToggleOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors',
        active
          ? 'bg-background-1 text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      {label}
    </button>
  );
}
