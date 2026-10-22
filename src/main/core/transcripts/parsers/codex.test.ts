import { homedir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '@shared/chat';
import { codexParser } from './codex';

const CTX = {
  sessionId: 'conversation:task-1:conv-1',
  taskId: 'task-1',
  conversationId: 'conv-1',
  providerId: 'codex',
  workDir: 'D:\\workspace\\demo',
  sinceEpochMs: Date.parse('2026-02-04T08:58:00.000Z'),
};

describe('codexParser.validateFile', () => {
  it('accepts a session_meta line with matching cwd and a recent timestamp', () => {
    const firstLine = JSON.stringify({
      timestamp: '2026-02-04T08:58:44.431Z',
      type: 'session_meta',
      payload: {
        session_id: '019c27e0-1acf',
        cwd: 'D:\\workspace\\demo',
        timestamp: '2026-02-04T08:58:44.304Z',
      },
    });
    expect(codexParser.validateFile!(firstLine, CTX)).toBe(true);
  });

  it('rejects other working directories and stale files', () => {
    const otherCwd = JSON.stringify({
      type: 'session_meta',
      timestamp: '2026-02-04T08:58:44.431Z',
      payload: { cwd: 'D:\\other' },
    });
    expect(codexParser.validateFile!(otherCwd, CTX)).toBe(false);

    const stale = JSON.stringify({
      type: 'session_meta',
      timestamp: '2025-01-01T00:00:00.000Z',
      payload: { cwd: 'D:\\workspace\\demo', timestamp: '2025-01-01T00:00:00.000Z' },
    });
    expect(codexParser.validateFile!(stale, CTX)).toBe(false);
  });
});

describe('codexParser.parseLine', () => {
  it('parses assistant and user messages from response_item rows', () => {
    const assistant = JSON.stringify({
      timestamp: '2026-02-04T08:59:30.000Z',
      ordinal: 12,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Here is the plan.' }],
      },
    });
    const user = JSON.stringify({
      timestamp: '2026-02-04T08:59:01.000Z',
      ordinal: 7,
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '给我一个开发计划' }],
      },
    });
    const assistantOut = codexParser.parseLine(assistant) as ChatMessage[];
    const userOut = codexParser.parseLine(user) as ChatMessage[];
    expect(assistantOut[0]).toMatchObject({
      id: 'm-12',
      role: 'assistant',
      blocks: [{ kind: 'text', text: 'Here is the plan.' }],
    });
    expect(userOut[0]).toMatchObject({ id: 'm-7', role: 'user' });
  });

  it('skips developer instructions and injected user payloads', () => {
    const developer = JSON.stringify({
      type: 'response_item',
      ordinal: 1,
      payload: {
        type: 'message',
        role: 'developer',
        content: [{ type: 'input_text', text: '<permissions instructions>' }],
      },
    });
    const injected = JSON.stringify({
      type: 'response_item',
      ordinal: 2,
      payload: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: '<user_instructions>\nAGENTS.md' }],
      },
    });
    expect(codexParser.parseLine(developer)).toBeNull();
    expect(codexParser.parseLine(injected)).toBeNull();
  });

  it('parses function calls and outputs, reasoning summaries', () => {
    const call = JSON.stringify({
      timestamp: '2026-03-24T01:59:46.920Z',
      ordinal: 12,
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'shell_command',
        arguments: '{"command":"rg --files"}',
        call_id: 'call_dVZ',
      },
    });
    const output = JSON.stringify({
      timestamp: '2026-03-24T01:59:50.482Z',
      ordinal: 16,
      type: 'response_item',
      payload: {
        type: 'function_call_output',
        call_id: 'call_dVZ',
        output: 'Exit code: 0\nOutput:\n指南.md',
      },
    });
    const reasoning = JSON.stringify({
      timestamp: '2026-03-24T01:59:42.455Z',
      ordinal: 9,
      type: 'response_item',
      payload: {
        type: 'reasoning',
        summary: [{ type: 'summary_text', text: 'Searching files first.' }],
      },
    });

    const callOut = codexParser.parseLine(call) as ChatMessage[];
    const outputOut = codexParser.parseLine(output) as ChatMessage[];
    const reasoningOut = codexParser.parseLine(reasoning) as ChatMessage[];

    expect(callOut[0].blocks[0]).toMatchObject({
      kind: 'tool_use',
      name: 'shell_command',
      toolUseId: 'call_dVZ',
    });
    expect(outputOut[0].blocks[0]).toMatchObject({ kind: 'tool_result', toolUseId: 'call_dVZ' });
    expect(reasoningOut[0].blocks[0]).toMatchObject({ kind: 'thinking' });
  });

  it('returns null for event_msg / turn_context / session_meta rows', () => {
    expect(
      codexParser.parseLine('{"type":"event_msg","payload":{"type":"task_started"}}')
    ).toBeNull();
    expect(codexParser.parseLine('{"type":"turn_context","payload":{"cwd":"x"}}')).toBeNull();
    expect(codexParser.parseLine('broken {')).toBeNull();
  });
});

describe('codexParser.resolve', () => {
  it('returns a candidate list under the sessions dir without throwing', async () => {
    const files = await codexParser.resolve(CTX);
    expect(Array.isArray(files)).toBe(true);
    for (const file of files) {
      expect(file.startsWith(path.join(homedir(), '.codex', 'sessions'))).toBe(true);
    }
  });
});
