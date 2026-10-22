import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@shared/chat';
import { claudeParser } from './claude';

const CTX = {
  sessionId: 'conversation:task-1:conv-1',
  taskId: 'task-1',
  conversationId: 'conv-1',
  providerId: 'claude',
  workDir: 'C:\\repo\\demo',
};

describe('claudeParser.resolve', () => {
  it('maps the workDir to the project hash layout with the conversation id file', async () => {
    const paths = await claudeParser.resolve(CTX);
    expect(paths).toHaveLength(1);
    expect(paths[0]).toContain('projects');
    expect(paths[0]).toContain('C--repo-demo');
    expect(paths[0].endsWith('conv-1.jsonl')).toBe(true);
  });
});

describe('claudeParser.parseLine', () => {
  it('parses a typed user prompt', () => {
    const line = JSON.stringify({
      parentUuid: null,
      isSidechain: false,
      type: 'user',
      message: { role: 'user', content: 'Fix the login 500 error' },
      uuid: 'u1',
      timestamp: '2026-10-16T07:06:31.887Z',
    });
    const messages = claudeParser.parseLine(line);
    expect(messages).toHaveLength(1);
    expect(messages![0]).toMatchObject({
      id: 'u1',
      role: 'user',
      blocks: [{ kind: 'text', text: 'Fix the login 500 error' }],
      timestamp: '2026-10-16T07:06:31.887Z',
    });
  });

  it('skips injected reminders and sidechain rows', () => {
    const reminder = JSON.stringify({
      type: 'user',
      isSidechain: false,
      uuid: 'u2',
      message: { role: 'user', content: '<system-reminder>\n# Environment\n...</system-reminder>' },
    });
    expect(claudeParser.parseLine(reminder)).toBeNull();

    const sidechain = JSON.stringify({
      type: 'user',
      isSidechain: true,
      uuid: 'u3',
      message: { role: 'user', content: 'subagent prompt' },
    });
    expect(claudeParser.parseLine(sidechain)).toBeNull();
  });

  it('parses tool results from array content', () => {
    const line = JSON.stringify({
      type: 'user',
      isSidechain: false,
      uuid: 'u4',
      timestamp: '2026-10-16T07:07:00.000Z',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call_1',
            content: ' NAME   STATE\n* Ubuntu Running',
            is_error: false,
          },
        ],
      },
    });
    const messages = claudeParser.parseLine(line) as ChatMessage[];
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('tool');
    expect(messages[0].blocks[0]).toMatchObject({
      kind: 'tool_result',
      toolUseId: 'call_1',
      isError: false,
    });
  });

  it('parses assistant thinking, text and tool_use blocks with usage', () => {
    const line = JSON.stringify({
      type: 'assistant',
      isSidechain: false,
      uuid: 'a1',
      timestamp: '2026-10-16T07:06:51.000Z',
      message: {
        role: 'assistant',
        model: 'glm-5.3-flash',
        content: [
          { type: 'thinking', thinking: 'Let me check the router.' },
          { type: 'text', text: 'The issue is in the session middleware.' },
          { type: 'tool_use', id: 'call_9', name: 'Bash', input: { command: 'npm test' } },
        ],
        usage: { input_tokens: 27115, output_tokens: 246 },
      },
    });
    const messages = claudeParser.parseLine(line) as ChatMessage[];
    expect(messages).toHaveLength(1);
    const [message] = messages;
    expect(message.role).toBe('assistant');
    expect(message.blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool_use']);
    expect(message.tokens).toEqual({ input: 27115, output: 246 });
  });

  it('returns null for metadata lines and malformed JSON', () => {
    expect(claudeParser.parseLine('{"type":"cost-state","totalCostUSD":2.6}')).toBeNull();
    expect(
      claudeParser.parseLine('{"type":"attachment","attachment":{"type":"environment"}}')
    ).toBeNull();
    expect(claudeParser.parseLine('not json at all')).toBeNull();
  });
});
