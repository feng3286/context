import { homedir } from 'node:os';
import path from 'node:path';
import type { ChatBlock, ChatMessage } from '@shared/chat';
import type { TranscriptContext, TranscriptParser } from './types';

/**
 * Claude Code transcript parser.
 *
 * One JSONL file per session at
 * `<configDir>/projects/<cwdHash>/<conversationId>.jsonl` — the file name IS
 * the conversation id because the app passes it to `--session-id` on spawn
 * (see hasResumableSession in local-conversation.ts for the same layout).
 *
 * Interesting line types (everything else is metadata: mode, attachment,
 * file-history-*, cost-state, queue-operation, api-request*, ...):
 * - `user`:      message.content is a string (typed/pasted prompt) or a block
 *                array (tool results, injected reminders)
 * - `assistant`: message.content is a block array (thinking/text/tool_use)
 *
 * The format is not an official contract — every field access is defensive
 * and unknown shapes degrade to `null` (line skipped).
 */

interface ClaudeBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  id?: string;
  input?: unknown;
  /** tool_result payload: string or a content-block array. */
  content?: unknown;
  tool_use_id?: string;
  is_error?: boolean;
}

interface ClaudeUsage {
  input_tokens?: number;
  output_tokens?: number;
}

interface ClaudeLine {
  type?: string;
  isSidechain?: boolean;
  uuid?: string;
  timestamp?: string;
  message?: { role?: string; content?: string | ClaudeBlock[]; usage?: ClaudeUsage };
}

/** Injected/user-invisible payloads that must not render as user messages. */
const SKIPPED_TEXT_PREFIXES = [
  '<system-reminder>',
  '<task-notification>',
  '<local-command',
  'Caveat: the messages below',
];

function isSkippedText(text: string): boolean {
  return SKIPPED_TEXT_PREFIXES.some((p) => text.startsWith(p));
}

export const claudeParser: TranscriptParser = {
  provider: 'claude',
  version: 1,

  async resolve(ctx: TranscriptContext): Promise<string[]> {
    const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), '.claude');
    const cwdHash = ctx.workDir.replace(/[:\\/]/g, '-');
    return [path.join(claudeDir, 'projects', cwdHash, `${ctx.conversationId}.jsonl`)];
  },

  parseLine(line: string): ChatMessage[] | null {
    let row: ClaudeLine;
    try {
      row = JSON.parse(line) as ClaudeLine;
    } catch {
      return null;
    }
    // Sidechain rows are subagent internals — skip to keep the timeline readable.
    if (row.isSidechain) return null;
    const ts = row.timestamp ?? new Date(0).toISOString();

    if (row.type === 'user') {
      const content = row.message?.content;
      const out: ChatMessage[] = [];
      if (typeof content === 'string') {
        const text = content.trim();
        if (text && !isSkippedText(text)) {
          out.push({
            id: row.uuid ?? `u-${ts}`,
            role: 'user',
            blocks: [{ kind: 'text', text }],
            timestamp: ts,
          });
        }
        return out.length ? out : null;
      }
      if (Array.isArray(content)) {
        content.forEach((block, i) => {
          if (block.type === 'text') {
            const text = (block.text ?? '').trim();
            if (text && !isSkippedText(text)) {
              out.push({
                id: `${row.uuid ?? 'u'}-t${i}`,
                role: 'user',
                blocks: [{ kind: 'text', text }],
                timestamp: ts,
              });
            }
          } else if (block.type === 'tool_result') {
            const result = block.content;
            const text =
              typeof result === 'string'
                ? result
                : Array.isArray(result)
                  ? result
                      .map((part: unknown) =>
                        typeof part === 'string' ? part : String((part as ClaudeBlock)?.text ?? '')
                      )
                      .join('\n')
                  : '';
            out.push({
              id: `${row.uuid ?? 'u'}-r${i}`,
              role: 'tool',
              blocks: [
                {
                  kind: 'tool_result',
                  toolUseId: block.tool_use_id ?? '',
                  content: text,
                  isError: block.is_error,
                },
              ],
              timestamp: ts,
            });
          }
        });
      }
      return out.length ? out : null;
    }

    if (row.type === 'assistant') {
      const blocks = row.message?.content;
      if (!Array.isArray(blocks)) return null;
      const out: ChatBlock[] = [];
      for (const block of blocks) {
        if (block.type === 'text') {
          const text = (block.text ?? '').trim();
          if (text) out.push({ kind: 'text', text });
        } else if (block.type === 'thinking') {
          const text = (block.thinking ?? '').trim();
          if (text) out.push({ kind: 'thinking', text });
        } else if (block.type === 'tool_use') {
          out.push({
            kind: 'tool_use',
            name: block.name ?? 'tool',
            input: block.input,
            toolUseId: block.id ?? '',
          });
        }
      }
      if (out.length === 0) return null;
      const usage = row.message?.usage;
      return [
        {
          id: row.uuid ?? `a-${ts}`,
          role: 'assistant',
          blocks: out,
          timestamp: ts,
          tokens:
            usage && (usage.input_tokens != null || usage.output_tokens != null)
              ? { input: usage.input_tokens ?? 0, output: usage.output_tokens ?? 0 }
              : undefined,
        },
      ];
    }

    return null;
  },
};

// Re-exported for tests that assert against the skip list.
export const claudeSkippedTextPrefixes = SKIPPED_TEXT_PREFIXES;
