import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import type { ChatCommandInfo, ChatMessagesResult, ChatPendingSession } from '@shared/chat';
import { createRPCController } from '@shared/ipc/rpc';
import { err, ok } from '@shared/result';
import {
  abortHeadless,
  isHeadlessRunning,
  sendHeadless,
} from '@main/core/chats/headless-chat-service';
import {
  addPendingSession,
  listPendingSessions,
  removePendingSessions,
} from '@main/core/chats/pending-sessions';
import {
  claudeTranscriptRoot,
  codexTranscriptRoot,
  forgetSession,
  listSessions,
} from '@main/core/chats/session-index';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { transcriptService } from '@main/core/transcripts/transcript-service';
import { getChatTabs, setChatTabs } from './chat-tab-registry';
import { readContextUsage } from './context-usage';

/**
 * Chat center RPC: session discovery over the providers' own transcript
 * directories, history reads, and headless send/abort.
 */

export const chatsController = createRPCController({
  listSessions: async (args?: { cwdPrefix?: string }) => {
    try {
      return ok(await listSessions(args));
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  getHistory: async (args: { providerId: string; file: string }) => {
    try {
      // Defense in depth: only files under the providers' transcript roots.
      const allowed =
        args.file.startsWith(claudeTranscriptRoot()) || args.file.startsWith(codexTranscriptRoot());
      if (!allowed) return err({ type: 'forbidden' as const });
      await fs.access(args.file);
      const messages = await transcriptService.readSessionFile(args.providerId, args.file);
      const result: ChatMessagesResult = { messages, capability: 'transcript', hasMore: false };
      return ok(result);
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  send: async (args: {
    providerId: string;
    sessionId: string;
    cwd: string;
    text: string;
    newSession?: boolean;
    /** Stable event topic for the caller's subscriptions — renderer session
     * stores pass their construction-time id so adopting the CLI's own id
     * mid-store doesn't break event delivery. */
    topic?: string;
  }) => {
    try {
      const result = await sendHeadless(args);
      if (!result.ok) return err(result.error);
      return ok({ sessionId: args.sessionId });
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  /** Delete a session's transcript file and drop it from the index. */
  deleteSession: async (args: { providerId: string; file: string }) => {
    try {
      const allowed =
        args.file.startsWith(claudeTranscriptRoot()) || args.file.startsWith(codexTranscriptRoot());
      if (!allowed) return err({ type: 'forbidden' as const });
      const base = path.basename(args.file, '.jsonl');
      const match = base.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
      const sid = match?.[1] ?? base;
      // Only an in-flight headless run blocks deletion — a conversation tab's
      // mere existence must not (its transcript stays deletable on request).
      if (isHeadlessRunning(sid)) return err({ type: 'busy' as const });
      await fs.rm(args.file, { force: true });
      forgetSession(args.file);
      return ok({ deleted: true });
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  abort: async (args: { sessionId: string }) => {
    return ok({ aborted: abortHeadless(args.sessionId) });
  },

  listPendingSessions: async (args?: { cwdPrefix?: string }) => {
    try {
      return ok(await listPendingSessions(args));
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  addPendingSession: async (args: ChatPendingSession) => {
    try {
      await addPendingSession(args);
      return ok({ added: true });
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  removePendingSessions: async (args: { ids: string[] }) => {
    try {
      await removePendingSessions(args.ids);
      return ok({ removed: true });
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  /**
   * Transcript path for a started session, once it shows up in the index.
   * Pending (new) sessions call this after their first run so later messages
   * can resume instead of re-creating the session.
   */
  resolveSessionFile: async (args: { providerId: string; sessionId: string; cwd: string }) => {
    try {
      const sessions = await listSessions();
      const found = sessions.find((s) => s.sessionId === args.sessionId && s.file);
      if (found) {
        await fs.access(found.file);
        return ok(found.file);
      }
    } catch {
      // fall through
    }
    return ok(null);
  },

  /** Approximate context fill for the meter, read from the transcript tail. */
  getContextUsage: async (args: { providerId: string; file: string }) => {
    try {
      const allowed =
        args.file.startsWith(claudeTranscriptRoot()) || args.file.startsWith(codexTranscriptRoot());
      if (!allowed) return err({ type: 'forbidden' as const });
      return ok(await readContextUsage(args.providerId, args.file));
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  /** Slash commands for the chat input autocomplete: built-ins + custom files. */
  listCommands: async (args: { providerId: string; cwd?: string }) => {
    try {
      return ok(await listChatCommands(args.providerId, args.cwd));
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  /** Open agent chat tabs per task (persisted UI state). */
  getChatTabs: async () => {
    try {
      return ok(await getChatTabs());
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  setChatTabs: async (args: { taskId: string; providerIds: string[] }) => {
    try {
      const map = await getChatTabs();
      map[args.taskId] = args.providerIds;
      await setChatTabs(map);
      return ok({ saved: true });
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },
});

/** Built-in slash commands worth exposing in headless chat (passed through). */
const BUILTIN_COMMANDS: Record<string, ChatCommandInfo[]> = {
  claude: [
    { name: 'compact', description: 'Compact the conversation context', source: 'builtin' },
    { name: 'context', description: 'Show context usage breakdown', source: 'builtin' },
    { name: 'cost', description: 'Show token usage and cost', source: 'builtin' },
    { name: 'model', description: 'Switch the AI model', source: 'builtin' },
    { name: 'status', description: 'Show session and system status', source: 'builtin' },
    { name: 'memory', description: 'Edit CLAUDE.md memory files', source: 'builtin' },
    { name: 'init', description: 'Generate a project CLAUDE.md', source: 'builtin' },
    { name: 'review', description: 'Request a code review', source: 'builtin' },
  ],
  codex: [{ name: 'init', description: 'Generate an AGENTS.md for the repo', source: 'builtin' }],
};

async function listChatCommands(providerId: string, cwd?: string): Promise<ChatCommandInfo[]> {
  const out: ChatCommandInfo[] = [...(BUILTIN_COMMANDS[providerId] ?? [])];
  const dirs: string[] = [];
  if (providerId === 'claude') {
    const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), '.claude');
    dirs.push(path.join(claudeDir, 'commands'));
    if (cwd) dirs.push(path.join(cwd, '.claude', 'commands'));
  } else if (providerId === 'codex') {
    dirs.push(path.join(homedir(), '.codex', 'prompts'));
  }

  for (const dir of dirs) {
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const file = path.join(dir, name);
      let stat;
      try {
        stat = await fs.stat(file);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        // One level of namespacing, mirroring how the CLIs expose subfolders.
        let nested: string[];
        try {
          nested = (await fs.readdir(file)).filter((f) => f.endsWith('.md'));
        } catch {
          continue;
        }
        for (const n of nested) {
          out.push({
            name: `${name}:${n.slice(0, -3)}`,
            description: await commandDescription(path.join(file, n)),
            source: 'custom',
          });
        }
        continue;
      }
      if (!name.endsWith('.md')) continue;
      out.push({
        name: name.slice(0, -3),
        description: await commandDescription(file),
        source: 'custom',
      });
    }
  }
  return out;
}

async function commandDescription(file: string): Promise<string | undefined> {
  try {
    const buf = Buffer.alloc(2048);
    const fh = await fs.open(file, 'r');
    try {
      const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
      const head = buf.toString('utf8', 0, bytesRead);
      const match = head.match(/^description:\s*(.+)$/m);
      return match?.[1]?.trim() || undefined;
    } finally {
      await fh.close();
    }
  } catch {
    return undefined;
  }
}
