import fs from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { getProvider } from '@shared/agent-provider-registry';
import type { AgentSessionConfig } from '@shared/agent-session';
import { Conversation } from '@shared/conversations';
import { agentSessionExitedChannel } from '@shared/events/agentEvents';
import { makePtyId } from '@shared/ptyId';
import { makeConversationSessionId } from '@shared/ptySessionId';
import { agentHookService } from '@main/core/agent-hooks/agent-hook-service';
import { wireAgentClassifier } from '@main/core/agent-hooks/classifier-wiring';
import { claudeTrustService } from '@main/core/agent-hooks/claude-trust-service';
import { HookConfigWriter } from '@main/core/agent-hooks/hook-config';
import type { ConversationProvider } from '@main/core/conversations/types';
import { LocalFileSystem } from '@main/core/fs/impl/local-fs';
import { spawnLocalPty } from '@main/core/pty/local-pty';
import { Pty } from '@main/core/pty/pty';
import { buildAgentEnv } from '@main/core/pty/pty-env';
import { ptySessionRegistry } from '@main/core/pty/pty-session-registry';
import { resolveSpawnParams } from '@main/core/pty/spawn-utils';
import { killTmuxSession, makeTmuxSessionName } from '@main/core/pty/tmux-session-name';
import { appSettingsService } from '@main/core/settings/settings-service';
import type { ExecFn } from '@main/core/utils/exec';
import { events } from '@main/lib/events';
import { log } from '@main/lib/logger';
import { capture } from '@main/lib/telemetry';
import { buildAgentCommand } from './agent-command';

const DEFAULT_COLS = 80;
const DEFAULT_ROWS = 24;
const MAX_RESPAWNS = 2;

export class LocalConversationProvider implements ConversationProvider {
  private sessions = new Map<string, Pty>();
  private knownSessionIds = new Set<string>();
  private respawnCounts = new Map<string, number>();
  private readonly taskWorkDir: string;
  private readonly taskId: string;
  private readonly tmux: boolean;
  private readonly shellSetup?: string;
  private readonly exec: ExecFn;
  private readonly taskEnvVars: Record<string, string>;
  private readonly preparedHookProviders = new Map<string, boolean>();

  constructor({
    taskWorkDir,
    taskId,
    tmux = false,
    shellSetup,
    exec,
    taskEnvVars = {},
  }: {
    taskWorkDir: string;
    taskId: string;
    tmux?: boolean;
    shellSetup?: string;
    exec: ExecFn;
    taskEnvVars?: Record<string, string>;
  }) {
    this.taskWorkDir = taskWorkDir;
    this.taskId = taskId;
    this.tmux = tmux;
    this.shellSetup = shellSetup;
    this.exec = exec;
    this.taskEnvVars = taskEnvVars;
  }

  async startSession(
    conversation: Conversation,
    initialSize: { cols: number; rows: number } = { cols: DEFAULT_COLS, rows: DEFAULT_ROWS },
    isResuming: boolean = false,
    initialPrompt?: string
  ): Promise<void> {
    const sessionId = makeConversationSessionId(conversation.taskId, conversation.id);
    this.knownSessionIds.add(sessionId);
    if (this.sessions.has(sessionId)) return;

    const cwd = conversation.workDir ?? this.taskWorkDir;

    await claudeTrustService.maybeAutoTrustLocal({
      providerId: conversation.providerId,
      cwd,
      homedir: homedir(),
    });
    await this.prepareHookConfig(conversation.providerId, cwd);

    // Only resume if a session was actually persisted for this conversation.
    // For Claude we can tell by checking its transcript file; resuming a
    // non-existent session prints "No conversation found" and exits, so we
    // start fresh instead. Other providers don't expose a checkable transcript,
    // so we attempt the resume and rely on the respawn fallback.
    const effectiveResume = isResuming && (await this.hasResumableSession(conversation));

    const { command, args, providerDef, customAgent } = await buildAgentCommand({
      providerId: conversation.providerId,
      autoApprove: conversation.autoApprove,
      sessionId: conversation.id,
      isResuming: effectiveResume,
      initialPrompt,
    });

    log.warn('[resume-debug] startSession', {
      conversationId: conversation.id,
      requestedResume: isResuming,
      effectiveResume,
      cwd,
      args,
    });

    const effectiveProviderId = providerDef.id;

    const tmuxSessionName = this.tmux ? makeTmuxSessionName(sessionId) : undefined;

    const cfg: AgentSessionConfig = {
      taskId: this.taskId,
      conversationId: conversation.id,
      providerId: effectiveProviderId,
      command,
      args,
      cwd,
      shellSetup: this.shellSetup,
      tmuxSessionName,
      autoApprove: conversation.autoApprove ?? false,
      resume: effectiveResume,
    };

    const spawnParams = resolveSpawnParams('agent', cfg);

    const ptyId = makePtyId(conversation.providerId, conversation.id);
    const port = agentHookService.getPort();
    const token = agentHookService.getToken();
    const pty = spawnLocalPty({
      id: sessionId,
      command: spawnParams.command,
      args: spawnParams.args,
      cwd,
      env: {
        ...buildAgentEnv({
          hook: port > 0 ? { port, ptyId, token } : undefined,
          customVars: customAgent?.env,
        }),
        ...this.taskEnvVars,
      },
      cols: initialSize.cols,
      rows: initialSize.rows,
    });

    const hookActive = port > 0;
    const useHooksOnly = hookActive && providerDef?.supportsHooks;

    if (!useHooksOnly) {
      wireAgentClassifier({
        pty,
        providerId: effectiveProviderId,
        taskId: conversation.taskId,
        conversationId: conversation.id,
      });
    }

    pty.onExit(({ exitCode }) => {
      ptySessionRegistry.unregister(sessionId);
      const shouldRespawn = this.sessions.has(sessionId);
      this.sessions.delete(sessionId);
      capture('agent_run_finished', {
        provider: effectiveProviderId,
        exit_code: typeof exitCode === 'number' ? exitCode : -1,
        task_id: conversation.taskId,
        conversation_id: conversation.id,
      });
      events.emit(agentSessionExitedChannel, {
        sessionId,
        conversationId: conversation.id,
        taskId: conversation.taskId,
        exitCode,
      });
      if (shouldRespawn && !this.tmux) {
        const count = (this.respawnCounts.get(sessionId) ?? 0) + 1;
        this.respawnCounts.set(sessionId, count);

        if (count > MAX_RESPAWNS) {
          log.error('LocalConversationProvider: respawn limit reached, giving up', {
            conversationId: conversation.id,
          });
          this.respawnCounts.delete(sessionId);
          return;
        }

        // A --resume that exited with an error (non-zero, e.g. "No conversation
        // found" because no transcript was ever persisted for this id) cannot
        // succeed by retrying — fall back to a fresh session, which creates a
        // new transcript under this conversation id so future resumes work.
        // A clean (exit 0) resumed session is re-resumed to restore its history.
        const resumeNext = isResuming && exitCode === 0;

        setTimeout(() => {
          this.startSession(conversation, initialSize, resumeNext, initialPrompt).catch((e) => {
            log.error('LocalConversationProvider: respawn failed', {
              conversationId: conversation.id,
              error: String(e),
            });
          });
        }, 500);
      }
    });

    ptySessionRegistry.register(sessionId, pty);
    this.sessions.set(sessionId, pty);
    capture('agent_run_started', {
      provider: effectiveProviderId,
      task_id: conversation.taskId,
      conversation_id: conversation.id,
    });
  }

  /**
   * Whether the agent has a persisted session for this conversation that can be
   * resumed. Claude Code stores one transcript per session at
   * `<configDir>/projects/<cwdHash>/<sessionId>.jsonl`, so for Claude we probe
   * that file. For other providers there is no checkable artifact, so we assume
   * resumable and let the respawn fallback handle a missed resume.
   */
  private async hasResumableSession(conversation: Conversation): Promise<boolean> {
    if (conversation.providerId !== 'claude') return true;
    const claudeDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), '.claude');
    const cwdHash = (conversation.workDir ?? this.taskWorkDir).replace(/[:\\/]/g, '-');
    const transcript = path.join(claudeDir, 'projects', cwdHash, `${conversation.id}.jsonl`);
    try {
      await fs.access(transcript);
      return true;
    } catch {
      return false;
    }
  }

  private async prepareHookConfig(
    providerId: Conversation['providerId'],
    cwd: string
  ): Promise<void> {
    try {
      const localProjectSettings = await appSettingsService.get('localProject');
      const writeGitIgnoreEntries = localProjectSettings.writeAgentConfigToGitIgnore ?? true;
      const cacheKey = `${providerId}:${cwd}`;
      const previousWriteGitIgnoreEntries = this.preparedHookProviders.get(cacheKey);
      const shouldPrepareHookConfig =
        previousWriteGitIgnoreEntries === undefined ||
        (!previousWriteGitIgnoreEntries && writeGitIgnoreEntries);
      if (!shouldPrepareHookConfig) return;

      const writer = new HookConfigWriter(new LocalFileSystem(cwd), this.exec);
      await writer.writeForProvider(providerId, {
        writeGitIgnoreEntries,
      });
      this.preparedHookProviders.set(cacheKey, writeGitIgnoreEntries);
    } catch (error) {
      log.warn('LocalConversationProvider: failed to prepare hook config', {
        providerId,
        cwd,
        error: String(error),
      });
    }
  }

  async stopSession(conversationId: string): Promise<void> {
    const sessionId = makeConversationSessionId(this.taskId, conversationId);
    this.knownSessionIds.delete(sessionId);
    const pty = this.sessions.get(sessionId);
    if (pty) {
      try {
        pty.kill();
      } catch (e) {
        log.warn('LocalAgentProvider: error killing PTY', { sessionId, error: String(e) });
      }
      this.sessions.delete(sessionId);
      ptySessionRegistry.unregister(sessionId);
    }
    if (this.tmux) {
      await killTmuxSession(this.exec, makeTmuxSessionName(sessionId));
    }
  }

  async destroyAll(): Promise<void> {
    const sessionIds = Array.from(this.knownSessionIds);
    await this.detachAll();
    if (this.tmux) {
      await Promise.all(
        sessionIds.map((id) => killTmuxSession(this.exec, makeTmuxSessionName(id)))
      );
    }
    this.knownSessionIds.clear();
  }

  async detachAll(): Promise<void> {
    for (const [sessionId, pty] of this.sessions) {
      try {
        pty.kill();
      } catch {}
      ptySessionRegistry.unregister(sessionId);
    }
    this.sessions.clear();
  }
}
