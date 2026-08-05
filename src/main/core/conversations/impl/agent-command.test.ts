import { describe, expect, it, vi } from 'vitest';
import { buildAgentCommand } from './agent-command';

// Claude's default provider config — mirrors providerConfigDefaults for 'claude'
// (see src/main/core/settings/schema.ts).
vi.mock('@main/core/settings/provider-settings-service', () => ({
  providerOverrideSettings: {
    getItem: vi.fn(async () => ({
      cli: 'claude',
      resumeFlag: '--resume',
      autoApproveFlag: '--dangerously-skip-permissions',
      initialPromptFlag: '',
      sessionIdFlag: '--session-id',
    })),
  },
}));

vi.mock('@main/core/settings/custom-agent-service', () => ({
  customAgentService: {
    getById: vi.fn(async () => undefined),
  },
}));

const SESSION_ID = '11111111-2222-3333-4444-555555555555';

describe('buildAgentCommand – Claude resume/fresh session id wiring', () => {
  it('passes the session id as the value of --resume, never as a standalone --session-id flag', async () => {
    const { args } = await buildAgentCommand({
      providerId: 'claude',
      sessionId: SESSION_ID,
      isResuming: true,
    });

    // Regression: must be `claude --resume <id>`, not `claude --resume --session-id`.
    // Claude Code rejects `--session-id` combined with `--resume` unless
    // `--fork-session` is also supplied.
    expect(args).toEqual(['--resume', SESSION_ID]);
    expect(args).not.toContain('--session-id');
  });

  it('starts a fresh session with --session-id <id>', async () => {
    const { args } = await buildAgentCommand({
      providerId: 'claude',
      sessionId: SESSION_ID,
      isResuming: false,
    });

    expect(args).toEqual(['--session-id', SESSION_ID]);
  });

  it('appends the auto-approve flag after the resume value', async () => {
    const { args } = await buildAgentCommand({
      providerId: 'claude',
      sessionId: SESSION_ID,
      isResuming: true,
      autoApprove: true,
    });

    expect(args).toEqual(['--resume', SESSION_ID, '--dangerously-skip-permissions']);
  });
});
