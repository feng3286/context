import type { ChatMessage } from '@shared/chat';

/**
 * Export a chat session's messages as a Markdown document. Works purely from
 * the structured messages the app already parsed — no CLI round-trip.
 */

type TFn = (key: string, options?: Record<string, unknown>) => string;

function blockText(block: ChatMessage['blocks'][number]): string {
  return block.kind === 'text' || block.kind === 'thinking' || block.kind === 'system'
    ? block.text
    : '';
}

export function buildChatMarkdown(title: string, messages: ChatMessage[], t: TFn): string {
  const out: string[] = [`# ${title}`, ''];
  for (const message of messages) {
    const time = message.timestamp ? new Date(message.timestamp).toLocaleString() : '';
    const header = time ? ` — ${time}` : '';
    if (message.role === 'user') {
      out.push(`## ${t('chat:you')}${header}`, '');
      for (const block of message.blocks) {
        const text = blockText(block);
        if (text) out.push(text, '');
      }
      if (message.failed) out.push(`> ${t('chat:notDelivered')}`, '');
    } else if (message.role === 'assistant') {
      out.push(`## ${t('chat:agent')}${header}`, '');
      for (const block of message.blocks) {
        if (block.kind === 'text') out.push(block.text, '');
        else if (block.kind === 'thinking') {
          out.push(
            block.text
              .split('\n')
              .map((l) => `> ${l}`)
              .join('\n'),
            ''
          );
        } else if (block.kind === 'tool_use') {
          out.push(
            `**${block.name}**`,
            '```json',
            JSON.stringify(block.input ?? {}, null, 2),
            '```',
            ''
          );
        }
      }
    } else if (message.role === 'tool') {
      for (const block of message.blocks) {
        if (block.kind !== 'tool_result') continue;
        const label = block.isError ? t('chat:toolError') : t('chat:toolResult');
        out.push(
          `<details><summary>${label}</summary>`,
          '',
          '```',
          block.content,
          '```',
          '',
          '</details>',
          ''
        );
      }
    } else {
      for (const block of message.blocks) {
        const text = blockText(block);
        if (text) out.push(`---`, '', `*${text}*`, '');
      }
    }
  }
  return out.join('\n');
}

/** Trigger a browser download of `content` as a Markdown file. */
export function downloadChatMarkdown(title: string, content: string): void {
  const safe =
    title
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || 'chat';
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${safe}.md`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}
