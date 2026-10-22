import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ChatSessionSummary } from '@shared/chat';
import { claudeParser } from '@main/core/transcripts/parsers/claude';
import { codexParser } from '@main/core/transcripts/parsers/codex';
import { log } from '@main/lib/logger';

/**
 * Discovers chat sessions by scanning the providers' own transcript files.
 * There is no app-side session registry: the CLI's transcript directory IS the
 * session store, so sessions started in an external terminal show up here too.
 *
 * Titles are extracted from the first user message (both parsers already skip
 * injected/system payloads). File metadata is cached by path+mtime so repeat
 * listings only stat files.
 */

const MAX_SESSIONS = 300;
const MAX_FILES_SCANNED = 1500;
const HEAD_BYTES = 96 * 1024;
const TITLE_MAX = 120;

interface IndexEntry {
  mtimeMs: number;
  size: number;
  summary: ChatSessionSummary;
}

const cache = new Map<string, IndexEntry>();

export function claudeTranscriptRoot(): string {
  const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), '.claude');
  return path.join(claudeDir, 'projects');
}

export function codexTranscriptRoot(): string {
  return path.join(homedir(), '.codex', 'sessions');
}

export async function listSessions(opts?: { cwdPrefix?: string }): Promise<ChatSessionSummary[]> {
  const files = [...(await scanClaudeFiles()), ...(await scanCodexFiles())].slice(
    0,
    MAX_FILES_SCANNED
  );

  const summaries: ChatSessionSummary[] = [];
  await Promise.all(
    files.map(async (file) => {
      const summary = await resolveSummary(file);
      if (summary) summaries.push(summary);
    })
  );

  const prefix = opts?.cwdPrefix ? opts.cwdPrefix.toLowerCase() : null;
  const filtered = prefix ? summaries.filter((s) => cwdMatches(s.cwd, prefix)) : summaries;
  filtered.sort((a, b) => b.updatedAt - a.updatedAt);
  return filtered.slice(0, MAX_SESSIONS);
}

/** Sessions of the directory itself or any subdirectory (multi-project tasks). */
function cwdMatches(cwd: string, prefixLower: string): boolean {
  if (!cwd) return false;
  const lower = cwd.toLowerCase();
  return lower === prefixLower || lower.startsWith(prefixLower + path.sep.toLowerCase());
}

/** All top-level .jsonl files under every claude project (cwd hash) dir. */
async function scanClaudeFiles(): Promise<string[]> {
  const root = claudeTranscriptRoot();
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const project of projects) {
    let files: string[];
    try {
      files = await fs.readdir(path.join(root, project));
    } catch {
      continue;
    }
    for (const file of files) {
      if (file.endsWith('.jsonl')) out.push(path.join(root, project, file));
    }
  }
  return out;
}

/** Rollout files under ~/.codex/sessions/<Y>/<M>/<D>/ (newest date dirs first). */
async function scanCodexFiles(): Promise<string[]> {
  const root = codexTranscriptRoot();
  let years: string[];
  try {
    years = (await fs.readdir(root)).sort().reverse();
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const year of years) {
    let months: string[];
    try {
      months = (await fs.readdir(path.join(root, year))).sort().reverse();
    } catch {
      continue;
    }
    for (const month of months) {
      let days: string[];
      try {
        days = (await fs.readdir(path.join(root, year, month))).sort().reverse();
      } catch {
        continue;
      }
      for (const day of days) {
        let files: string[];
        try {
          files = await fs.readdir(path.join(root, year, month, day));
        } catch {
          continue;
        }
        for (const file of files) {
          if (file.endsWith('.jsonl')) {
            out.push(path.join(root, year, month, day, file));
          }
        }
      }
    }
  }
  // Date-dir order only approximates recency; the caller sorts by mtime anyway.
  return out;
}

async function resolveSummary(file: string): Promise<ChatSessionSummary | null> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    cache.delete(file);
    return null;
  }
  if (!stat.isFile()) return null;

  const cached = cache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.summary;
  }

  const providerId = file.startsWith(codexTranscriptRoot()) ? 'codex' : 'claude';
  try {
    const summary = await parseHead(file, providerId, stat.mtimeMs);
    if (!summary) {
      cache.delete(file);
      return null;
    }
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, summary });
    return summary;
  } catch (e) {
    log.warn('chats: failed to index transcript', { file, error: String(e) });
    return null;
  }
}

interface HeadRow {
  type?: string;
  isSidechain?: boolean;
  cwd?: string;
  payload?: { id?: string; cwd?: string };
}

/**
 * Read the head of a transcript and extract session metadata + title.
 * Returns null for files that are not indexable (sidechain/subagent logs,
 * unreadable, empty).
 */
async function parseHead(
  file: string,
  providerId: string,
  mtimeMs: number
): Promise<ChatSessionSummary | null> {
  const fh = await fs.open(file, 'r');
  let head: string;
  try {
    const buf = Buffer.alloc(Math.min(HEAD_BYTES, (await fh.stat()).size));
    if (buf.length === 0) return null;
    await fh.read(buf, 0, buf.length, 0);
    head = buf.toString('utf8');
  } finally {
    await fh.close();
  }

  const parser = providerId === 'codex' ? codexParser : claudeParser;
  const lines = head.split('\n');

  // Subagent transcripts are sidechain-only — exclude them from the list.
  let isSidechainFile = false;
  let cwd = '';
  // claude: the file name IS the session id. codex: taken from session_meta.
  let sessionId = path.basename(file, '.jsonl');
  let sessionIdResolved = providerId !== 'codex';

  let title = '';
  const capped = lines.length > 60 ? lines.slice(0, 60) : lines;
  for (let i = 0; i < capped.length; i++) {
    const line = capped[i];
    if (!line.trim()) continue;
    let row: HeadRow | null = null;
    try {
      row = JSON.parse(line) as HeadRow;
    } catch {
      // Truncated final line (head cut mid-JSON) or noise — skip.
    }
    if (row?.isSidechain) isSidechainFile = true;
    if (row?.cwd && !cwd) cwd = row.cwd;
    if (providerId === 'codex' && row?.payload?.cwd && !cwd) cwd = row.payload.cwd;
    if (providerId === 'codex' && row?.payload?.id && !sessionIdResolved) {
      sessionId = row.payload.id;
      sessionIdResolved = true;
    }
    if (!title) {
      try {
        const parsed = parser.parseLine(line);
        const user = parsed?.find((m) => m.role === 'user');
        if (user) {
          const text = user.blocks.find((b) => b.kind === 'text');
          title = text && 'text' in text ? text.text.slice(0, TITLE_MAX) : '';
        }
      } catch {
        // Parser failures must not break indexing.
      }
    }
    if (isSidechainFile) return null;
  }

  return {
    sessionId,
    providerId,
    cwd,
    title: title || '(empty session)',
    updatedAt: mtimeMs,
    file,
  };
}
