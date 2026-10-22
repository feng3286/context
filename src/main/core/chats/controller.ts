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

/** True when `file` is really inside `root` — not merely a string prefix
 * (startsWith would accept `~/.claude-evil/x.jsonl` for root `~/.claude`). */
function underTranscriptRoot(root: string, file: string): boolean {
  const rel = path.relative(root, file);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function underAnyTranscriptRoot(file: string): boolean {
  return (
    underTranscriptRoot(claudeTranscriptRoot(), file) ||
    underTranscriptRoot(codexTranscriptRoot(), file)
  );
}

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
      if (!underAnyTranscriptRoot(args.file)) return err({ type: 'forbidden' as const });
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
      if (!underAnyTranscriptRoot(args.file)) return err({ type: 'forbidden' as const });
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
      if (!underAnyTranscriptRoot(args.file)) return err({ type: 'forbidden' as const });
      return ok(await readContextUsage(args.providerId, args.file));
    } catch (e) {
      return err({ type: 'internal' as const, message: String(e) });
    }
  },

  /** Whether a conversation (TUI) terminal currently owns this session — used
   * to warn before deleting a transcript the CLI is still writing to. */
  isSessionInTerminal: async (args: { sessionId: string }) => {
    return ok(ptySessionRegistry.hasConversationSession(args.sessionId));
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

/** Built-in slash commands of each CLI (passed through — the CLI interprets
 * them). Mirrors the vendors' documented command tables; descriptions are the
 * English fallback — zh lives in the chat i18n namespace (`commands.<name>`).
 *
 * Deliberately excluded from claude's set: /heapdump (the CLI keeps it out of
 * its own menu — contains credentials), removed commands (/pr-comments, /vim,
 * /ultraplan), undocumented entries (/identity, /todos) and the /new alias
 * (this app owns /new for "fresh session in this tab"). */
function builtinCommand(name: string, description: string): ChatCommandInfo {
  return { name, description, source: 'builtin' };
}

const CLAUDE_BUILTIN_COMMANDS: ChatCommandInfo[] = [
  builtinCommand('add-dir', 'Add a working directory for this session'),
  builtinCommand(
    'advisor',
    'Enable or disable the advisor tool (a second model consulted at key moments)'
  ),
  builtinCommand('agents', 'Manage subagents and agent teams'),
  builtinCommand('artifact-capabilities', 'Load reference for artifact runtime capabilities'),
  builtinCommand('artifact-diagramming', 'Load diagramming guidance for artifacts'),
  builtinCommand('artifacts', 'List, attach, or open artifacts'),
  builtinCommand('auto-mode-setup', 'Draft autoMode.environment entries from your project'),
  builtinCommand('autocompact', 'Set how full the context gets before auto-compaction'),
  builtinCommand(
    'autofix-pr',
    'Watch the branch PR and push fixes when CI fails or reviewers comment'
  ),
  builtinCommand('background', 'Detach this session to run as a background agent'),
  builtinCommand('batch', 'Orchestrate large-scale changes across parallel worktree subagents'),
  builtinCommand('branch', 'Create a branch of this conversation and switch into it'),
  builtinCommand('btw', 'Ask a side question without adding to conversation history'),
  builtinCommand('bug', 'Report a bug or share your conversation'),
  builtinCommand('cd', 'Move this session to a new working directory'),
  builtinCommand('chrome', 'Configure Claude in Chrome settings'),
  builtinCommand('claude-api', 'Load Claude API reference for your project language'),
  builtinCommand('claude-in-chrome', 'Load browser-task guidance for Claude in Chrome'),
  builtinCommand('clear', 'Start a new conversation with empty context'),
  builtinCommand('code-review', 'Review the current diff or a PR for correctness bugs'),
  builtinCommand('color', 'Set the prompt bar color for this session'),
  builtinCommand('compact', 'Summarize the conversation to free up context'),
  builtinCommand('config', 'Open Settings (theme, model, output style, …)'),
  builtinCommand('context', 'Visualize current context usage as a colored grid'),
  builtinCommand('copy', 'Copy the last assistant response to the clipboard'),
  builtinCommand('cost', 'Show cost and plan usage (alias of /usage)'),
  builtinCommand('dataviz', 'Design guidance for charts and dashboards'),
  builtinCommand('debug', 'Enable debug logging and troubleshoot the session'),
  builtinCommand('deep-research', 'Fan out web searches and synthesize a cited report'),
  builtinCommand('design', 'Draft UI mockups, screens, pages, or posters as artifacts'),
  builtinCommand('design-login', 'Authorize design-system access for /design-sync'),
  builtinCommand('design-sync', "Convert your repo's design system and upload it to Claude Design"),
  builtinCommand('desktop', 'Continue this session in the Claude Code Desktop app'),
  builtinCommand('diff', 'Review the changes in your working tree'),
  builtinCommand('doctor', 'Run a setup checkup for installation and settings'),
  builtinCommand('effort', 'Set the effort level (low to max) or toggle ultracode'),
  builtinCommand('exit', 'Exit the CLI'),
  builtinCommand('export', 'Export the conversation as text to a file or clipboard'),
  builtinCommand('fast', 'Toggle fast mode on or off'),
  builtinCommand('feedback', 'Send product feedback about Claude Code'),
  builtinCommand('fewer-permission-prompts', 'Add an allowlist for common read-only tool calls'),
  builtinCommand('focus', 'Toggle the focus view (last prompt, tool summary, response)'),
  builtinCommand('fork', 'Copy this conversation into a new background session'),
  builtinCommand('goal', 'Set a goal Claude keeps working toward across turns'),
  builtinCommand('help', 'Show help and available commands'),
  builtinCommand('hooks', 'View hook configurations'),
  builtinCommand('ide', 'Manage IDE integrations and show status'),
  builtinCommand('import', 'Import configuration from Codex, Gemini CLI, or Cursor'),
  builtinCommand('init', 'Initialize the project with a CLAUDE.md guide'),
  builtinCommand('insights', 'Generate an HTML report analyzing your recent sessions'),
  builtinCommand('install-github-app', 'Install the Claude GitHub App for a repository'),
  builtinCommand('install-slack-app', 'Install the Claude Slack app via OAuth'),
  builtinCommand('keybindings', 'Open your keyboard shortcuts file'),
  builtinCommand('list-agents', 'List subagents, teammates, and messageable sessions'),
  builtinCommand('login', 'Sign in to your Anthropic account'),
  builtinCommand('logout', 'Sign out from your Anthropic account'),
  builtinCommand('loop', 'Run a prompt repeatedly while the session stays open'),
  builtinCommand('mcp', 'Manage MCP server connections and OAuth'),
  builtinCommand('memory', 'Edit CLAUDE.md files and manage auto memory'),
  builtinCommand('mobile', 'Show a QR code to download the Claude mobile app'),
  builtinCommand('model', 'Switch the AI model'),
  builtinCommand('output-style', 'List output styles or switch to one'),
  builtinCommand('passes', 'Share a free week of Claude Code with friends'),
  builtinCommand('permissions', 'Manage tool permission allow/ask/deny rules'),
  builtinCommand('plan', 'Enter plan mode, optionally with a starting task'),
  builtinCommand('plugin', 'Manage Claude Code plugins'),
  builtinCommand('plugin-authoring', 'Load the reference for writing plugin mods'),
  builtinCommand('powerup', 'Discover Claude Code features through interactive lessons'),
  builtinCommand('privacy-settings', 'View and update your privacy settings'),
  builtinCommand('radio', 'Open Claude FM lo-fi radio in your browser'),
  builtinCommand('rate-limit-options', 'Show ways to keep working at a usage limit'),
  builtinCommand('recap', 'Generate a one-line summary of this session'),
  builtinCommand('release-notes', 'View the changelog with a version picker'),
  builtinCommand('reload-plugins', 'Reload all active plugins without restarting'),
  builtinCommand('reload-skills', 'Re-scan skill and command directories'),
  builtinCommand('remote-control', 'Allow Remote Control of this session from claude.ai'),
  builtinCommand('remote-env', 'Choose the default cloud environment for cloud sessions'),
  builtinCommand('rename', 'Rename the current session'),
  builtinCommand('resume', 'Resume a conversation by ID or name'),
  builtinCommand('review', 'Alias of /code-review'),
  builtinCommand('rewind', 'Rewind the conversation and/or code to a checkpoint'),
  builtinCommand('run', 'Launch and drive your project app to verify a change'),
  builtinCommand('run-skill-generator', 'Teach /run and /verify how to drive your app'),
  builtinCommand('sandbox', 'Toggle sandbox mode'),
  builtinCommand('schedule', 'Create and manage cloud scheduled tasks'),
  builtinCommand('scroll-speed', 'Adjust mouse wheel scroll speed'),
  builtinCommand('security-review', "Analyze your branch's changes for security vulnerabilities"),
  builtinCommand('simplify', 'Review changed code for reuse and efficiency, then apply fixes'),
  builtinCommand('skill-doctor', 'Show what each skill costs in context and how often it is used'),
  builtinCommand('skills', 'List available skills with token counts'),
  builtinCommand('slides', 'Create a presentation artifact from your brief'),
  builtinCommand('stats', 'Show usage statistics (alias of /usage)'),
  builtinCommand('status', 'Show version, model, account, and connectivity'),
  builtinCommand('statusline', "Configure Claude Code's status line"),
  builtinCommand('stickers', 'Order Claude Code stickers'),
  builtinCommand('stop', "Stop the background session you're attached to"),
  builtinCommand('subtask', 'Spawn a forked subagent working in the background'),
  builtinCommand('tasks', 'View and manage background work'),
  builtinCommand('team-onboarding', 'Generate a team onboarding guide from your usage history'),
  builtinCommand('teleport', 'Pull a cloud session into this terminal'),
  builtinCommand('terminal-setup', 'Install a Shift+Enter keybinding for newlines'),
  builtinCommand('theme', 'Change the color theme'),
  builtinCommand('tui', 'Set the terminal UI renderer and relaunch'),
  builtinCommand('ultrareview', 'Run a deep multi-agent code review in a cloud sandbox'),
  builtinCommand('update-config', 'Describe a settings change and Claude edits settings.json'),
  builtinCommand('upgrade', 'Open the upgrade page to switch plan tier'),
  builtinCommand('usage', 'Show cost, plan usage limits, and activity stats'),
  builtinCommand('usage-credits', 'Configure usage credits or request them from your admin'),
  builtinCommand('verify', 'Confirm a change works by building and running the app'),
  builtinCommand('voice', 'Toggle voice dictation'),
  builtinCommand('web-setup', 'Connect your GitHub account for cloud sessions'),
  builtinCommand('workflow-authoring', 'Load the reference for writing workflow scripts'),
  builtinCommand('workflows', 'Open the workflow progress view'),
];
// The CLI only surfaces these when the matching provider env is set.
if (process.env.CLAUDE_CODE_USE_BEDROCK) {
  CLAUDE_BUILTIN_COMMANDS.push(
    builtinCommand('setup-bedrock', 'Configure Amazon Bedrock authentication')
  );
}
if (process.env.CLAUDE_CODE_USE_VERTEX) {
  CLAUDE_BUILTIN_COMMANDS.push(
    builtinCommand('setup-vertex', 'Configure Google Vertex authentication')
  );
}

/** Codex CLI commands per the official slash-commands table. /new is excluded
 * — this app owns it for "fresh session in this tab". */
const CODEX_BUILTIN_COMMANDS: ChatCommandInfo[] = [
  builtinCommand('permissions', 'Set what Codex can do without asking first'),
  builtinCommand('ide', 'Include IDE context'),
  builtinCommand('keymap', 'Remap TUI keyboard shortcuts'),
  builtinCommand('vim', 'Toggle Vim mode'),
  builtinCommand('sandbox-add-read-dir', 'Grant sandbox read access to a directory (Windows)'),
  builtinCommand('agent', 'Switch the active agent thread'),
  builtinCommand('apps', 'Browse and attach apps/connectors'),
  builtinCommand('plugins', 'Browse plugins'),
  builtinCommand('hooks', 'View lifecycle hooks'),
  builtinCommand('clear', 'Clear the terminal and start a fresh chat'),
  builtinCommand('archive', 'Archive the session and exit'),
  builtinCommand('delete', 'Delete the current session and exit'),
  builtinCommand('compact', 'Summarize the conversation to free tokens'),
  builtinCommand('copy', 'Copy the latest output to the clipboard'),
  builtinCommand('diff', 'Show the git diff of the working tree'),
  builtinCommand('exit', 'Exit the CLI (same as /quit)'),
  builtinCommand('experimental', 'Toggle experimental features'),
  builtinCommand('approve', 'Approve retry of an auto review denial'),
  builtinCommand('memories', 'Configure memory use'),
  builtinCommand('skills', 'Browse and use skills'),
  builtinCommand('import', 'Import Claude Code setup'),
  builtinCommand('feedback', 'Send logs and feedback'),
  builtinCommand('init', 'Generate an AGENTS.md for the project'),
  builtinCommand('logout', 'Sign out'),
  builtinCommand('mcp', 'List configured MCP tools'),
  builtinCommand('mention', 'Attach a file to the message'),
  builtinCommand('model', 'Choose the active model'),
  builtinCommand('fast', 'Toggle the Fast tier'),
  builtinCommand('plan', 'Set the task plan'),
  builtinCommand('goal', 'Set the task goal'),
  builtinCommand('personality', "Choose Codex's communication style"),
  builtinCommand('ps', 'View background terminals'),
  builtinCommand('stop', 'Stop background terminals'),
  builtinCommand('fork', 'Fork the conversation'),
  builtinCommand('side', 'Side conversation (alias /btw)'),
  builtinCommand('btw', 'Side conversation'),
  builtinCommand('raw', 'Toggle raw scrollback'),
  builtinCommand('resume', 'Resume a conversation'),
  builtinCommand('quit', 'Exit the CLI'),
  builtinCommand('review', 'Review the current working tree'),
  builtinCommand('status', 'Show session configuration and token usage'),
  builtinCommand('usage', 'Show account token usage'),
  builtinCommand('debug-config', 'Show config diagnostics'),
  builtinCommand('statusline', 'Choose status line fields'),
  builtinCommand('title', 'Choose terminal title fields'),
  builtinCommand('theme', 'Choose the syntax theme'),
];

const BUILTIN_COMMANDS: Record<string, ChatCommandInfo[]> = {
  claude: CLAUDE_BUILTIN_COMMANDS,
  codex: CODEX_BUILTIN_COMMANDS,
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
