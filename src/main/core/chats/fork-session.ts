import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { log } from '@main/lib/logger';

/**
 * Branch a chat session at an earlier point: copy the transcript prefix into
 * a NEW file (fresh session id) and let the caller resume that — the original
 * transcript is never touched. This is the app-side equivalent of the CLIs'
 * rewind/branch, expressed as pure file surgery so it works headlessly.
 *
 * Safety: the source file is only ever read; all ids inside the copy are
 * rewritten so the two sessions share nothing (no parentUuid/turn collisions
 * if the CLI ever cross-references them).
 */

export type ForkError =
  | { type: 'not_found' }
  | { type: 'forbidden' }
  | { type: 'empty' }
  | { type: 'io'; message: string };

export interface ForkResult {
  sessionId: string;
  file: string;
}

const FORK_TITLE_PREFIX = '↳ ';

/** Fork a claude project transcript before the line carrying `messageId`
 * (a provider row uuid). Every row gets a fresh uuid/parentUuid/sessionId. */
async function forkClaude(file: string, messageId: string): Promise<ForkResult | ForkError> {
  const lines = await readLines(file);
  if (!lines) return { type: 'io', message: 'unreadable transcript' };
  const cut = lines.findIndex((line) => lineHasUuid(line, messageId));
  if (cut <= 0) return { type: 'not_found' };
  // Rewind to the chosen user message itself: the copy EXCLUDES it so the
  // caller's (editable) re-send becomes the branch point.
  const sessionId = randomUUID();
  const uuidMap = new Map<string, string>();
  const out: string[] = [];
  for (const line of lines.slice(0, cut)) {
    out.push(rewriteClaudeLine(line, sessionId, uuidMap));
  }
  if (!out.some((l) => l.trim())) return { type: 'empty' };
  const target = path.join(path.dirname(file), `${sessionId}.jsonl`);
  try {
    await fs.writeFile(target, out.join('\n') + '\n');
  } catch (e) {
    return { type: 'io', message: String(e) };
  }
  return { sessionId, file: target };
}

/** Fork a codex rollout before the response_item line `m-<ordinal>` (the
 * ordinal counts non-blank lines, matching the parser's id assignment). */
async function forkCodex(file: string, messageId: string): Promise<ForkResult | ForkError> {
  const match = /^m-(\d+)$/.exec(messageId);
  if (!match) return { type: 'not_found' };
  const lines = await readLines(file);
  if (!lines) return { type: 'io', message: 'unreadable transcript' };
  const cut = Number(match[1]);
  if (!Number.isInteger(cut) || cut <= 1 || cut >= lines.length) return { type: 'not_found' };
  // Sanity: the cut must land on the message row itself, not on unrelated
  // structure — otherwise the id mapping has gone stale.
  try {
    const row = JSON.parse(lines[cut]) as { type?: string; payload?: { role?: string } };
    if (row.type !== 'response_item' || row.payload?.role !== 'user') {
      return { type: 'not_found' };
    }
  } catch {
    return { type: 'not_found' };
  }
  const sessionId = randomUUID();
  const out: string[] = [];
  for (const line of lines.slice(0, cut)) {
    let row: { payload?: { id?: string } } | null = null;
    try {
      row = JSON.parse(line);
    } catch {
      // Keep unknown rows verbatim — only session_meta carries the thread id.
    }
    if (row?.payload?.id) {
      row.payload.id = sessionId;
      out.push(JSON.stringify(row));
    } else {
      out.push(line);
    }
  }
  const stem = path.basename(file).replace(/(-)[0-9a-f-]{36}(?=\.jsonl$)/i, `$1${sessionId}`);
  const target = path.join(path.dirname(file), stem);
  try {
    await fs.writeFile(target, out.join('\n') + '\n');
  } catch (e) {
    return { type: 'io', message: String(e) };
  }
  return { sessionId, file: target };
}

export async function forkTranscript(args: {
  providerId: string;
  file: string;
  messageId: string;
  /** Original display title, for the branch override label. */
  sourceTitle?: string;
}): Promise<ForkResult | ForkError> {
  const result =
    args.providerId === 'claude'
      ? await forkClaude(args.file, args.messageId)
      : await forkCodex(args.file, args.messageId);
  if ('sessionId' in result) {
    log.info('chats: forked session transcript', {
      providerId: args.providerId,
      from: args.file,
      to: result.file,
    });
  }
  return result;
}

async function readLines(file: string): Promise<string[] | null> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return raw.split('\n').filter((l) => l.trim());
  } catch {
    return null;
  }
}

function lineHasUuid(line: string, messageId: string): boolean {
  try {
    const row = JSON.parse(line) as { uuid?: string; type?: string };
    return row.uuid === messageId && (row.type === 'user' || row.type === 'assistant');
  } catch {
    return false;
  }
}

/** Fresh uuids everywhere, chained through the map so parent links survive. */
function rewriteClaudeLine(line: string, sessionId: string, uuidMap: Map<string, string>): string {
  let row: {
    uuid?: string;
    parentUuid?: string | null;
    sessionId?: string;
    type?: string;
  } | null = null;
  try {
    row = JSON.parse(line);
  } catch {
    return line;
  }
  if (!row || typeof row !== 'object') return line;
  if (row.sessionId) row.sessionId = sessionId;
  if (row.uuid) {
    const fresh = randomUUID();
    uuidMap.set(row.uuid, fresh);
    row.uuid = fresh;
  }
  if (row.parentUuid) row.parentUuid = uuidMap.get(row.parentUuid) ?? row.parentUuid;
  return JSON.stringify(row);
}

export { FORK_TITLE_PREFIX };
