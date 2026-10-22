import { Loader2, MessageSquareOff, SendHorizontal } from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { forwardRef, useEffect, useRef, useState } from 'react';
import type { ConversationStore } from '@renderer/features/tasks/conversations/conversation-manager';
import { rpc } from '@renderer/lib/ipc';
import { pastePromptInjection } from '@renderer/lib/pty/prompt-injection';
import { Button } from '@renderer/lib/ui/button';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import { MessageBubble } from './message-bubble';

const AutoResizingTextarea = forwardRef<
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const send = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setText('');
    setSending(true);
    try {
      await pastePromptInjection({
        providerId: conversation.data.providerId,
        text: value,
        sendInput: (data) => rpc.pty.sendInput(conversation.session.sessionId, data),
      });
      conversation.setWorking();
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
      <div className="pt-1 text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line
      </div>
    </div>
  );
});

export const ChatView = observer(function ChatView({
  conversation,
}: {
  conversation: ConversationStore;
}) {
  const chat = conversation.chat;
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  useEffect(() => {
    conversation.ensureChat();
  }, [conversation]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [chat?.messages.length, chat]);

  if (!chat) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (chat.capability === 'unsupported') {
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

  const awaitingPermission =
    conversation.status === 'awaiting-input' && conversation.lastNotificationType != null;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background-secondary-1">
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
          <div className="py-8 text-center text-xs text-muted-foreground">
            Waiting for the agent to write its session transcript…
          </div>
        ) : null}
        {chat.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
      </div>
      <ChatInputBar conversation={conversation} />
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
