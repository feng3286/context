import { eq } from 'drizzle-orm';
import { createRPCController } from '@shared/ipc/rpc';
import { err, ok } from '@shared/result';
import { db } from '@main/db/client';
import { conversations, tasks } from '@main/db/schema';
import type { TranscriptContext } from './parsers/types';
import { transcriptService } from './transcript-service';

/**
 * Rebuild transcript context from a session ID (`conversation:<taskId>:<id>`)
 * by reading the conversation/task rows. Keeps the renderer free of
 * work-directory knowledge.
 */
async function resolveContext(sessionId: string): Promise<TranscriptContext | null> {
  const parts = sessionId.split(':');
  if (parts.length !== 3 || parts[0] !== 'conversation') return null;
  const taskId = parts[1];
  const conversationId = parts[2];

  const [convRows, taskRows] = await Promise.all([
    db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1),
    db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1),
  ]);
  const conversation = convRows[0];
  if (!conversation) return null;
  const workDir = conversation.workDir ?? taskRows[0]?.workDir;
  if (!workDir) return null;

  const createdAtMs = conversation.createdAt ? Date.parse(conversation.createdAt) : NaN;
  return {
    sessionId,
    taskId,
    conversationId,
    // Provider column is nullable; '' safely resolves to "unsupported" in the parser registry.
    providerId: conversation.provider ?? '',
    workDir,
    sinceEpochMs: Number.isNaN(createdAtMs) ? undefined : createdAtMs,
  };
}

export const transcriptsController = createRPCController({
  getMessages: async (args: { sessionId: string; before?: string; limit?: number }) => {
    try {
      const ctx = await resolveContext(args.sessionId);
      if (!ctx) return err({ type: 'unknown_session' as const });
      const result = await transcriptService.getMessages(ctx, {
        before: args.before,
        limit: args.limit,
      });
      return ok(result);
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },
});
