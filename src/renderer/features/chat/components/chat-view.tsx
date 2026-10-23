import {
  ChevronDown,
  Download,
  FileDiff,
  GitBranch,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  SendHorizontal,
  Square,
  Trash2,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CHAT_MODEL_OPTIONS,
  type ChatCommandInfo,
  type ChatMessage,
  type ChatSessionSummary,
} from '@shared/chat';
import { useProviderSettings } from '@renderer/features/settings/use-provider-settings';
import { useTaskViewNavigation } from '@renderer/features/tasks/hooks/use-task-view-navigation';
import { rpc } from '@renderer/lib/ipc';
import { Button } from '@renderer/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { Spinner } from '@renderer/lib/ui/spinner';
import { cn } from '@renderer/utils/utils';
import type { ChatTab } from '../chat-tabs-store';
import { buildChatMarkdown, downloadChatMarkdown } from '../export-chat';
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
  const { t } = useTranslation();
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
        <span className="animate-pulse text-xs text-muted-foreground">{t('chat:thinking')}</span>
      )}
    </div>
  );
}

function formatRelative(
  ms: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return t('chat:relativeNow');
  if (minutes < 60) return t('chat:relativeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('chat:relativeHours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('chat:relativeDays', { n: days });
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
  contextProjects,
}: {
  chatTab: ChatTab;
  workDir: string;
  /** Context projects the task can run against — same options the TUI
   * conversation modal offers, mirrored so chat sessions land in the same
   * directories. */
  contextProjects?: Array<{ name: string; path: string }>;
}) {
  const sessionsStore = useMemo(() => new TaskSessionsStore(), []);
  const { t } = useTranslation();
  const externalChat = sessionsStore.externalChat;
  // Stable key so the scan re-runs only when the option set really changes.
  const contextDirKey = (contextProjects ?? []).map((p) => p.path).join('|');
  // Same effective cwd the TUI conversation provider falls back to
  // (local-project-provider): a single-context-project task works inside that
  // project's worktree, not the task container dir.
  const defaultCwd = contextProjects?.length === 1 ? contextProjects[0].path : workDir;

  useEffect(() => {
    if (workDir) void sessionsStore.load(workDir, contextDirKey ? contextDirKey.split('|') : []);
    return () => sessionsStore.dispose();
  }, [sessionsStore, workDir, contextDirKey]);

  return (
    <div className="flex h-full min-h-0 flex-1 bg-background-secondary-1">
      <SessionsRail
        store={sessionsStore}
        chatTab={chatTab}
        workDir={workDir}
        contextProjects={contextProjects}
      />
      {sessionsStore.selectedExternal && externalChat ? (
        <ExternalSessionPane
          key={externalChat.session.file}
          store={externalChat}
          onNewSession={() => {
            sessionsStore.createLocalSession(
              chatTab.providerId,
              sessionsStore.selectedExternal?.cwd ?? defaultCwd
            );
          }}
          onBranch={(source, messageId, text) => sessionsStore.branchFrom(source, messageId, text)}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
          <MessageSquare className="size-6 text-muted-foreground" />
          <div className="text-sm font-medium">{t('chat:noSessionSelected')}</div>
          <div className="max-w-xs text-xs text-muted-foreground">
            {t('chat:noSessionSelectedHint')}
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
  contextProjects,
}: {
  store: TaskSessionsStore;
  chatTab: ChatTab;
  workDir: string;
  contextProjects?: Array<{ name: string; path: string }>;
}) {
  // Only this tab's agent sessions — one tab per agent.
  const external = store.railSessions.filter((s) => s.providerId === chatTab.providerId);
  const { t } = useTranslation();
  const [choosingContext, setChoosingContext] = useState(false);
  // Same gate as the TUI conversation modal: only offer a choice when there
  // is more than one context project; otherwise everything runs in task dir.
  const hasContextChoice = (contextProjects?.length ?? 0) > 1;
  // Same effective cwd as the TUI provider fallback (see ChatTabView).
  const defaultCwd = contextProjects?.length === 1 ? contextProjects[0].path : workDir;
  const contextOptions = [
    { label: t('chat:taskDirectory'), path: workDir },
    ...(contextProjects ?? []).map((p) => ({ label: p.name, path: p.path })),
  ];

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-border">
      <div className="flex items-center justify-between px-2.5 pt-2.5 pb-1">
        <span className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t('chat:sessions')}
        </span>
        <div className="flex items-center gap-0.5">
          {/* One click creates + activates a session on the current context
              dir; the context picker stays one chevron away. */}
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            onClick={() =>
              store.createLocalSession(
                chatTab.providerId,
                store.selectedExternal?.cwd ?? defaultCwd
              )
            }
            aria-label={t('chat:newSession')}
          >
            <Plus className="size-3" />
          </Button>
          {hasContextChoice ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-5"
              onClick={() => setChoosingContext((v) => !v)}
              aria-label={t('chat:contextDirectory')}
            >
              <ChevronDown className="size-3" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="size-5"
            disabled={store.loading}
            onClick={() => void store.refresh()}
            aria-label={t('chat:refreshSessions')}
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
          <div className="px-1.5 pb-1 text-[10px] text-muted-foreground">
            {t('chat:contextDirectory')}
          </div>
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
      {store.railError ? (
        <button
          type="button"
          className="mx-1.5 mb-1 rounded-md bg-red-500/10 px-2 py-1 text-left text-[10px] leading-relaxed text-red-500"
          onClick={() => (store.railError = null)}
          title={t('chat:railErrorDismiss')}
        >
          {store.railError}
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
            onRename={(title) => void store.renameSession(session, title)}
          />
        ))}
        {store.loaded && external.length === 0 ? (
          <div className="px-2 py-3 text-[10px] leading-relaxed text-muted-foreground/70">
            {t('chat:noSessionsYet')}
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
  onRename,
}: {
  session: ChatSessionSummary;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onRename?: (title: string) => void;
}) {
  // Two-step delete: arm on first click, confirm on the second.
  const { t } = useTranslation();
  const [armed, setArmed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // The transcript may belong to a TUI session that is still running — the
  // CLI keeps writing (claude even recreates the file), so say so up front.
  const [liveInTerminal, setLiveInTerminal] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => {
      setArmed(false);
      setLiveInTerminal(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [armed]);

  const startRename = () => {
    setDraft(session.title);
    setEditing(true);
  };
  const commitRename = () => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== session.title) onRename?.(trimmed);
  };

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
      {active ? (
        <span
          aria-hidden
          className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitRename}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') setEditing(false);
          }}
          className="w-full rounded bg-background-2 px-1 py-0.5 text-xs outline-none"
        />
      ) : (
        <span
          className="line-clamp-2 pr-5 text-xs leading-snug"
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (onRename) startRename();
          }}
        >
          {/* Pending stubs keep a placeholder title as data — localize it at render. */}
          {session.title === 'New session' ? t('chat:newSessionTitle') : session.title}
        </span>
      )}
      <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-background-1 px-1 py-px font-medium">{session.providerId}</span>
        {session.cwd ? <span className="truncate">{session.cwd.split(/[\\/]/).pop()}</span> : null}
        <span className="ml-auto shrink-0">{formatRelative(session.updatedAt, t)}</span>
      </span>
      {onRename && !editing ? (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-1 right-6 size-5 opacity-0 group-hover:opacity-100"
          aria-label={t('chat:renameSession')}
          title={t('chat:renameSession')}
          onClick={(e) => {
            e.stopPropagation();
            startRename();
          }}
        >
          <Pencil className="size-3" />
        </Button>
      ) : null}
      {onDelete ? (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'absolute right-1 top-1 size-5',
            armed ? 'text-red-500 opacity-100' : 'opacity-0 group-hover:opacity-100'
          )}
          aria-label={
            armed
              ? liveInTerminal
                ? t('chat:deleteLiveInTerminal')
                : t('chat:confirmDelete')
              : t('chat:deleteSession')
          }
          title={
            armed
              ? liveInTerminal
                ? t('chat:deleteLiveInTerminalDetail')
                : t('chat:clickAgainToDelete')
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation();
            if (armed) onDelete();
            else {
              setArmed(true);
              void rpc.chats
                .isSessionInTerminal({ sessionId: session.sessionId })
                .then((result) => {
                  if (result.success) setLiveInTerminal(result.data);
                })
                .catch(() => {});
            }
          }}
        >
          <Trash2 className="size-3" />
        </Button>
      ) : null}
    </div>
  );
}

/** Header model picker — persisted as a provider override, sent as
 * `--model` / `-m` on every headless run. */
const ModelPicker = observer(function ModelPicker({ providerId }: { providerId: string }) {
  const { t } = useTranslation();
  const providerSettings = useProviderSettings(providerId);
  const options = CHAT_MODEL_OPTIONS[providerId] ?? [];
  const model = providerSettings.value?.model?.trim() ?? '';
  if (options.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button
          variant="ghost"
          className="h-5 shrink-0 gap-0.5 rounded px-1.5 text-[10px] font-medium text-muted-foreground"
          title={t('chat:modelTitle')}
        >
          {model || t('chat:modelDefault')}
          <ChevronDown className="size-2.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={model || '__default__'}
          onValueChange={(value) =>
            providerSettings.update({ model: value === '__default__' ? '' : String(value) })
          }
        >
          <DropdownMenuRadioItem value="__default__">
            {t('chat:modelDefault')}
          </DropdownMenuRadioItem>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {option}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});

/** Empty `/` shows a curated palette; typing searches everything. */
const INTERNALIZED_COMMANDS = new Set(['resume', 'rewind', 'diff', 'export', 'copy', 'cost']);
const PINNED_COMMANDS: Record<string, string[]> = {
  claude: ['compact', 'model', 'context', 'review', 'init', 'memory', 'mcp', 'usage'],
  codex: ['compact', 'model', 'review', 'init', 'mcp', 'status', 'plan'],
};

type CommandGroup = 'app' | 'common' | 'custom' | 'all';
type CommandEntry = ChatCommandInfo & { group: CommandGroup };

/** A session from the rail — headless send with streaming replies. */
const ExternalSessionPane = observer(function ExternalSessionPane({
  store,
  onNewSession,
  onBranch,
}: {
  store: SessionChatStore;
  onNewSession?: () => void;
  onBranch: (source: ChatSessionSummary, messageId: string, text: string) => Promise<boolean>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const { t } = useTranslation();
  const { openDiffView } = useTaskViewNavigation();
  const [text, setText] = useState('');
  const [commands, setCommands] = useState<ChatCommandInfo[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [slashHidden, setSlashHidden] = useState(false);
  const [showAllCommands, setShowAllCommands] = useState(false);
  // Set when the user picks "branch from here" on an earlier message: the
  // message text lands in the input (editable), and sending forks the
  // transcript at that point instead of continuing the live session.
  const [branchBase, setBranchBase] = useState<{ messageId: string; text: string } | null>(null);
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
            description: t('chat:newCommand'),
            source: 'app',
          });
        }
        setCommands(list);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session.providerId, session.cwd, onNewSession, t]);

  // Slash autocomplete while the whole input is a `/query` fragment; a trailing
  // space (after completing) no longer matches, so Enter then sends.
  const slashQuery = text.match(/^\/([a-zA-Z0-9:_-]*)$/)?.[1] ?? null;
  const groupedMenu = slashQuery === '';
  const slashMatches = useMemo(() => {
    if (slashQuery == null) return [];
    const query = slashQuery.toLowerCase();
    const matching = commands.filter((c) => c.name.toLowerCase().startsWith(query));
    if (!groupedMenu) {
      // Typing searches everything, internalized commands included.
      return matching.slice(0, 8).map((c) => ({ ...c, group: 'all' as CommandGroup }));
    }
    const withGroup = (c: ChatCommandInfo, group: CommandGroup): CommandEntry => ({
      ...c,
      group,
    });
    const app = matching.filter((c) => c.source === 'app').map((c) => withGroup(c, 'app'));
    const pinnedNames = PINNED_COMMANDS[session.providerId] ?? [];
    const common = matching
      .filter(
        (c) =>
          c.source === 'builtin' &&
          pinnedNames.includes(c.name) &&
          !INTERNALIZED_COMMANDS.has(c.name)
      )
      .map((c) => withGroup(c, 'common'));
    const custom = matching.filter((c) => c.source === 'custom').map((c) => withGroup(c, 'custom'));
    const rest = matching
      .filter(
        (c) =>
          c.source === 'builtin' &&
          !pinnedNames.includes(c.name) &&
          !INTERNALIZED_COMMANDS.has(c.name)
      )
      .map((c) => withGroup(c, 'all'));
    return [...app, ...common, ...custom, ...(showAllCommands ? rest : [])];
  }, [commands, slashQuery, groupedMenu, session.providerId, showAllCommands]);
  const slashOpen = slashMatches.length > 0 && !slashHidden;
  const hiddenBuiltinCount = commands.filter(
    (c) =>
      c.source === 'builtin' &&
      !INTERNALIZED_COMMANDS.has(c.name) &&
      !(PINNED_COMMANDS[session.providerId] ?? []).includes(c.name)
  ).length;

  useEffect(() => {
    setHighlight(0);
  }, [slashQuery, showAllCommands]);

  const completeSlash = (cmd: ChatCommandInfo) => {
    setText(`/${cmd.name} `);
  };

  const startBranch = (message: ChatMessage) => {
    const block = message.blocks.find((b) => b.kind === 'text');
    const source = block && block.kind === 'text' ? block.text : '';
    if (!source) return;
    setBranchBase({ messageId: message.id, text: source });
    setText(source);
  };
  const cancelBranch = () => {
    setBranchBase(null);
    setText('');
  };

  const send = async () => {
    const value = text.trim();
    if (!value || store.running || store.sendPending) return;
    if (value === '/new' && onNewSession) {
      setText('');
      onNewSession();
      return;
    }
    if (branchBase) {
      // The branch flow re-sends the (possibly edited) message text into a
      // forked copy of the transcript; this pane is replaced by the branch's.
      const source = store.session;
      const base = branchBase;
      setText('');
      setBranchBase(null);
      void onBranch(source, base.messageId, value).catch(() => {});
      return;
    }
    if (await store.send(value)) setText('');
  };

  const showStream =
    store.running || store.streamText.length > 0 || store.streamThinking.length > 0;

  const usage = store.contextUsage;
  const usagePct = usage?.contextWindow ? usage.tokens / usage.contextWindow : 0;
  const compactRecommended = usagePct > 0.8;
  const fmtTokens = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n));

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {session.cwd || t('chat:unknownDirectory')}
        </span>
        {usage ? (
          <Button
            variant="ghost"
            className={cn(
              'h-5 shrink-0 rounded px-1.5 text-[10px] font-medium',
              usagePct > 0.95
                ? 'bg-red-500/15 text-red-500'
                : usagePct > 0.8
                  ? 'bg-amber-500/15 text-amber-500'
                  : 'bg-background-1 text-muted-foreground'
            )}
            title={compactRecommended ? t('chat:compactTitle') : t('chat:ctxTitle')}
            onClick={() => void store.send('/compact')}
          >
            {t('chat:ctx')} {fmtTokens(usage.tokens)}
            {usage.contextWindow ? `/${fmtTokens(usage.contextWindow)}` : ''}
          </Button>
        ) : null}
        {store.running ? <Spinner className="size-3" /> : null}
        <ModelPicker providerId={session.providerId} />
        <Button
          variant="ghost"
          size="icon"
          className="size-5 shrink-0"
          onClick={openDiffView}
          aria-label={t('chat:changes')}
          title={t('chat:changes')}
        >
          <FileDiff className="size-3" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button
              variant="ghost"
              size="icon"
              className="size-5 shrink-0"
              aria-label={t('chat:moreActions')}
            >
              <MoreHorizontal className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                const content = buildChatMarkdown(session.title, store.messages, t);
                downloadChatMarkdown(session.title, content);
              }}
            >
              <Download className="size-3.5" />
              {t('chat:exportMd')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
            {t('chat:loadingConversation')}
          </div>
        ) : null}
        {store.historyError ? (
          <div className="py-6 text-center text-xs text-red-500">{t('chat:historyError')}</div>
        ) : null}
        {!store.loading && store.messages.length === 0 && !showStream ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            {t('chat:emptySession')}
          </div>
        ) : null}
        {store.messages.map((message: ChatMessage) => (
          <MessageBubble
            key={message.id}
            message={message}
            onBranch={message.role === 'user' && canSend ? () => startBranch(message) : undefined}
          />
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
        {branchBase ? (
          <div className="mb-1 flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-500">
            <GitBranch className="size-3 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{t('chat:branchHint')}</span>
            <button
              type="button"
              className="shrink-0 underline-offset-2 hover:underline"
              onClick={cancelBranch}
            >
              {t('chat:branchDismiss')}
            </button>
          </div>
        ) : null}
        {slashOpen ? (
          <div className="mb-1 overflow-hidden rounded-lg border border-border bg-background-1 shadow-md">
            {slashMatches.map((cmd, i) => {
              const previous = i > 0 ? slashMatches[i - 1] : null;
              const showLabel = groupedMenu && (!previous || previous.group !== cmd.group);
              return (
                <div key={`${cmd.group}:${cmd.source}:${cmd.name}`}>
                  {showLabel ? (
                    <div className="bg-background-1/60 px-3 pt-1.5 pb-0.5 text-[9px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                      {t(`chat:commandGroups.${cmd.group}`)}
                    </div>
                  ) : null}
                  <button
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
                      <span className="truncate text-muted-foreground">
                        {/* Builtin descriptions localize by command name; custom
                            commands keep their frontmatter text as the fallback. */}
                        {t(`chat:commands.${cmd.name}`, { defaultValue: cmd.description })}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
            {groupedMenu && !showAllCommands && hiddenBuiltinCount > 0 ? (
              <button
                type="button"
                className="w-full border-t border-border px-3 py-1.5 text-left text-[10px] text-muted-foreground hover:bg-background-2"
                onClick={() => setShowAllCommands(true)}
              >
                {t('chat:commandGroups.showAll', { n: hiddenBuiltinCount })}
              </button>
            ) : null}
            {groupedMenu ? (
              <div className="border-t border-border px-3 py-1 text-[9px] text-muted-foreground/60">
                {t('chat:menuHint')}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-end gap-2 rounded-lg border border-border bg-background-1 px-2 py-1.5">
          <AutoResizingTextarea
            rows={1}
            autoFocus
            value={text}
            placeholder={
              branchBase
                ? t('chat:placeholderBranch')
                : canSend
                  ? t('chat:placeholder')
                  : session.cwd
                    ? t('chat:placeholderUnsupported')
                    : t('chat:placeholderNoCwd')
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
              aria-label={t('chat:stop')}
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
              aria-label={t('chat:send')}
            >
              {store.sendPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <SendHorizontal className="size-3.5" />
              )}
            </Button>
          )}
        </div>
        <div className="pt-1 text-[10px] text-muted-foreground">{t('chat:inputHint')}</div>
      </div>
    </div>
  );
});

function supportsHeadless(providerId: string): boolean {
  return providerId === 'claude' || providerId === 'codex';
}
