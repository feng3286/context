import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ChatMessage } from '@shared/chat';
import type { TranscriptContext, TranscriptParser } from './types';

/**
 * Codex CLI rollout transcript parser.
 *
 * Files live at `~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<uuid>.jsonl`
 * where the UUID is Codex's OWN session id — not the app's conversation id.
 * Resume also forks a new file, so ownership is established by:
 *   1. first line `session_meta.payload.cwd === workDir`
 *   2. first line timestamp >= conversation creation (minus a small skew)
 * Two conversations sharing one workDir in the same window remain ambiguous —
 * accepted limitation for v1 (claude has an exact mapping).
 */

interface CodexPayload {
  type?: string;
  role?: string;
  session_id?: string;
  id?: string;
  cwd?: string;
  content?: Array<{ type?: string; text?: string }>;
  name?: string;
  arguments?: string;
  input?: unknown;
  call_id?: string;
  output?: unknown;
  summary?: Array<{ text?: string }>;
  timestamp?: string;
}

interface CodexLine {
  type?: string;
  ordinal?: number;
  timestamp?: string;
  payload?: CodexPayload;
}

const SESSIONS_DIR = () => path.join(homedir(), '.codex', 'sessions');

/** XML-ish payloads Codex injects as user messages — not real user input. */
const SKIPPED_TEXT_PREFIXES = [
  '<user_instructions>',
  '<environment_context>',
  '<permissions',
  '<turn_context',
  '<ENVIRONMENT_CONTEXT>',
  '<repo_layout>',
];

function isSkippedText(text: string): boolean {
  return SKIPPED_TEXT_PREFIXES.some((p) => text.trimStart().startsWith(p));
}

function safeJsonParse(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** Recursively collect rollout files under the sessions dir (3 date levels). */
async function collectRollouts(dir: string, depth: number, out: string[]): Promise<void> {
  if (depth > 3 || out.length > 500) return;
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (entry.endsWith('.jsonl')) {
      out.push(full);
    } else {
      await collectRollouts(full, depth + 1, out);
    }
  }
}

export const codexParser: TranscriptParser = {
  provider: 'codex',
  version: 1,

  async resolve(ctx: TranscriptContext): Promise<string[]> {
    const files: string[] = [];
    await collectRollouts(SESSIONS_DIR(), 0, files);
    const stats = await Promise.all(
      files.map(async (file) => {
        try {
          const stat = await fs.stat(file);
          return { file, mtimeMs: stat.mtimeMs };
        } catch {
          return null;
        }
      })
    );
    return stats
      .filter((s): s is { file: string; mtimeMs: number } => s !== null)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, 30)
      .map((s) => s.file);
  },

  validateFile(firstLine: string, ctx: TranscriptContext): boolean {
    try {
      const row = JSON.parse(firstLine) as CodexLine;
      if (row.type !== 'session_meta') return false;
      if (row.payload?.cwd !== ctx.workDir) return false;
      const since = ctx.sinceEpochMs ? ctx.sinceEpochMs - 5 * 60_000 : 0;
      if (since) {
        const ts = Date.parse(row.timestamp ?? row.payload?.timestamp ?? '');
        if (!Number.isNaN(ts) && ts < since) return false;
      }
      return true;
    } catch {
      return false;
    }
  },

  parseLine(line: string): ChatMessage[] | null {
    let row: CodexLine;
    try {
      row = JSON.parse(line) as CodexLine;
    } catch {
      return null;
    }
    if (row.type !== 'response_item') return null;
    const payload = row.payload ?? {};
    const ts = row.timestamp ?? new Date(0).toISOString();
    const ordinal = String(row.ordinal ?? 'x');

    switch (payload.type) {
      case 'message': {
        const role = payload.role;
        const text = (payload.content ?? [])
          .map((part) => part.text ?? '')
          .filter(Boolean)
          .join('\n\n');
        if (!text.trim() || isSkippedText(text)) return null;
        if (role === 'assistant') {
          return [
            {
              id: `m-${ordinal}`,
              role: 'assistant',
              blocks: [{ kind: 'text', text }],
              timestamp: ts,
            },
          ];
        }
        if (role === 'user') {
          return [
            { id: `m-${ordinal}`, role: 'user', blocks: [{ kind: 'text', text }], timestamp: ts },
          ];
        }
        return null; // developer / system
      }
      case 'function_call':
        return [
          {
            id: `fc-${payload.call_id ?? ordinal}`,
            role: 'tool',
            blocks: [
              {
                kind: 'tool_use',
                name: payload.name ?? 'tool',
                input: safeJsonParse(payload.arguments),
                toolUseId: payload.call_id ?? ordinal,
              },
            ],
            timestamp: ts,
          },
        ];
      case 'custom_tool_call':
        return [
          {
            id: `fc-${payload.call_id ?? ordinal}`,
            role: 'tool',
            blocks: [
              {
                kind: 'tool_use',
                name: payload.name ?? 'tool',
                input: payload.input,
                toolUseId: payload.call_id ?? ordinal,
              },
            ],
            timestamp: ts,
          },
        ];
      case 'function_call_output':
      case 'custom_tool_call_output': {
        const output = payload.output;
        const text = typeof output === 'string' ? output : JSON.stringify(output ?? '');
        return [
          {
            id: `fo-${payload.call_id ?? ordinal}`,
            role: 'tool',
            blocks: [{ kind: 'tool_result', toolUseId: payload.call_id ?? ordinal, content: text }],
            timestamp: ts,
          },
        ];
      }
      case 'reasoning': {
        const summary = (payload.summary ?? [])
          .map((part) => part.text ?? '')
          .filter(Boolean)
          .join('\n')
          .trim();
        if (!summary) return null;
        return [
          {
            id: `r-${ordinal}`,
            role: 'assistant',
            blocks: [{ kind: 'thinking', text: summary }],
            timestamp: ts,
          },
        ];
      }
      default:
        return null;
    }
  },
};
