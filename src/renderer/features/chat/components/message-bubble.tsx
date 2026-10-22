import { Brain, ChevronRight, Sparkles, User, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ChatBlock, ChatMessage } from '@shared/chat';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { cn } from '@renderer/utils/utils';

function formatTime(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '';
  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === new Date().toDateString()) return hm;
  return `${date.getMonth() + 1}/${date.getDate()} ${hm}`;
}

function summarize(text: string, max = 120): string {
  const firstLine = text.split('\n').find((l) => l.trim()) ?? '';
  const trimmed = firstLine.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

function CollapsibleRow({
  icon,
  label,
  detail,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group my-1 rounded-md border border-border bg-background-1/60">
      <summary className="flex cursor-pointer select-none items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-3 shrink-0 transition-transform group-open:rotate-90" />
        {icon}
        <span className="shrink-0 font-medium">{label}</span>
        {detail ? <span className="truncate opacity-70">{detail}</span> : null}
      </summary>
      <div className="px-3 pb-2">{children}</div>
    </details>
  );
}

function preText(text: string): React.ReactNode {
  return (
    <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">
      {text}
    </pre>
  );
}

function ChatBlockView({ block }: { block: ChatBlock }) {
  const { t } = useTranslation();
  switch (block.kind) {
    case 'text':
      return <MarkdownRenderer content={block.text} />;
    case 'thinking':
      return (
        <CollapsibleRow icon={<Brain className="size-3" />} label={t('chat:thoughtProcess')}>
          {preText(block.text)}
        </CollapsibleRow>
      );
    case 'tool_use': {
      const input = block.input;
      const detail =
        typeof input === 'string'
          ? summarize(input)
          : input != null
            ? summarize(JSON.stringify(input))
            : undefined;
      return (
        <CollapsibleRow icon={<Wrench className="size-3" />} label={block.name} detail={detail}>
          {preText(typeof input === 'string' ? input : JSON.stringify(input ?? {}, null, 2))}
        </CollapsibleRow>
      );
    }
    case 'tool_result':
      return (
        <CollapsibleRow
          icon={<ChevronRight className="size-3" />}
          label={block.isError ? t('chat:toolError') : t('chat:toolResult')}
          detail={summarize(block.content)}
        >
          {preText(block.content)}
        </CollapsibleRow>
      );
    default:
      return null;
  }
}

export const MessageBubble = function MessageBubble({ message }: { message: ChatMessage }) {
  const { t } = useTranslation();
  const time = formatTime(message.timestamp);

  // System events (e.g. context compaction) render as centered timeline dividers.
  if (message.role === 'system') {
    const text = message.blocks
      .map((block) => {
        if (block.kind !== 'system') return '';
        if (block.notice === 'compacted') {
          return t('chat:compactedDetail', {
            trigger:
              block.values?.trigger === 'manual'
                ? t('chat:compactedManual')
                : t('chat:compactedAuto'),
            pre: block.values?.pre ?? '?',
            post: block.values?.post ?? '?',
          });
        }
        return block.text;
      })
      .filter(Boolean)
      .join(' · ');
    return (
      <div className="flex items-center gap-2 px-6 py-2" title={time}>
        <div className="h-px flex-1 bg-border" />
        <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
          <Sparkles className="size-3 shrink-0" />
          {text}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="px-3 py-1.5">
        <div className="flex items-center gap-1.5 pb-1 text-[11px] text-muted-foreground">
          <User className="size-3" />
          {t('chat:you')}
          {time ? <span>· {time}</span> : null}
          {message.failed ? (
            <span className="font-medium text-red-500">· {t('chat:notDelivered')}</span>
          ) : null}
        </div>
        <div
          className={cn(
            'rounded-lg border bg-background-1 px-3 py-2',
            message.failed ? 'border-red-500/60' : 'border-border'
          )}
        >
          {message.blocks.map((block, i) =>
            block.kind === 'text' ? (
              <MarkdownRenderer key={i} content={block.text} variant="compact" />
            ) : null
          )}
        </div>
      </div>
    );
  }

  if (message.role === 'tool') {
    return (
      <div className="px-3">
        {message.blocks.map((block, i) => (
          <ChatBlockView key={i} block={block} />
        ))}
      </div>
    );
  }

  const tokens = message.tokens
    ? t('chat:tokensAbbrev', {
        n: ((message.tokens.input + message.tokens.output) / 1000).toFixed(1),
      })
    : null;

  return (
    <div className="px-3 py-1.5">
      <div className="flex items-center gap-1.5 pb-0.5 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground/70">{t('chat:agent')}</span>
        {time ? <span>· {time}</span> : null}
        {tokens ? <span className={cn('opacity-70')}>· {tokens}</span> : null}
      </div>
      <div className="flex flex-col">
        {message.blocks.map((block, i) => (
          <ChatBlockView key={i} block={block} />
        ))}
      </div>
    </div>
  );
};
