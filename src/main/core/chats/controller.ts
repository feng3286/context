import fs from 'node:fs/promises';
import type { ChatMessagesResult } from '@shared/chat';
import { createRPCController } from '@shared/ipc/rpc';
import { err, ok } from '@shared/result';
import { abortHeadless, sendHeadless } from '@main/core/chats/headless-chat-service';
import {
  claudeTranscriptRoot,
  codexTranscriptRoot,
  listSessions,
} from '@main/core/chats/session-index';
import { transcriptService } from '@main/core/transcripts/transcript-service';

/**
 * Chat center RPC: session discovery over the providers' own transcript
 * directories, history reads, and headless send/abort.
 */

export const chatsController = createRPCController({
  listSessions: async () => {
    try {
      return ok(await listSessions());
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

  send: async (args: { providerId: string; sessionId: string; cwd: string; text: string }) => {
    try {
      const result = await sendHeadless(args);
      if (!result.ok) return err(result.error);
      return ok({ sessionId: args.sessionId });
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  abort: async (args: { sessionId: string }) => {
    return ok({ aborted: abortHeadless(args.sessionId) });
  },
});
