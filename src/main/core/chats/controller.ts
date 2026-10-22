import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChatMessagesResult } from '@shared/chat';
import { createRPCController } from '@shared/ipc/rpc';
import { err, ok } from '@shared/result';
import {
  abortHeadless,
  isHeadlessRunning,
  sendHeadless,
} from '@main/core/chats/headless-chat-service';
import {
  claudeTranscriptRoot,
  codexTranscriptRoot,
  forgetSession,
  listSessions,
} from '@main/core/chats/session-index';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { resolveContext } from '@main/core/transcripts/controller';
import { transcriptService } from '@main/core/transcripts/transcript-service';

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
      if (isHeadlessRunning(sid)) return err({ type: 'busy' as const });
      if (ptySessionRegistry.hasConversationSession(sid)) {
        return err({ type: 'live_in_terminal' as const });
      }
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

  /**
   * Send a message to an app-owned conversation without its TUI: falls back
   * to a headless `--resume` run in the conversation's spawn cwd. When the
   * TUI is still running we refuse — the renderer injects into the PTY
   * instead, keeping a single writer to the transcript.
   */
  sendToConversation: async (args: { taskId: string; conversationId: string; text: string }) => {
    try {
      const syntheticId = `conversation:${args.taskId}:${args.conversationId}`;
      if (ptySessionRegistry.get(syntheticId)) {
        return err({ type: 'live_in_terminal' as const });
      }
      const ctx = await resolveContext(syntheticId);
      if (!ctx) return err({ type: 'unknown_session' as const });

      let providerSessionId = args.conversationId;
      if (ctx.providerId === 'codex') {
        // Codex resumes by its own rollout uuid, not the app conversation id.
        const file = await transcriptService.getResolvedFile(syntheticId, ctx);
        const match = file?.match(
          /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i
        );
        if (!match) {
          return err({
            type: 'unsupported' as const,
            message:
              'No codex session found for this conversation yet — start it in the terminal once.',
          });
        }
        providerSessionId = match[1];
      }

      const result = await sendHeadless({
        providerId: ctx.providerId,
        sessionId: providerSessionId,
        cwd: ctx.workDir,
        text: args.text,
        topic: syntheticId,
      });
      if (!result.ok) return err(result.error);
      return ok({ sessionId: syntheticId });
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },
});
