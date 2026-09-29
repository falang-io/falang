import { describe, expect, it } from 'vitest';
import type { IChatSession } from '@falang/agent';
import { buildAgentChatSessionExport, buildAgentChatSessionExportFileName } from './export-agent-chat-session.js';

const makeSession = (overrides: Partial<IChatSession> = {}): IChatSession => ({
  createdAt: '2026-09-22T10:00:00.000Z',
  id: 'session-1',
  title: 'Debug the login flow',
  turns: [
    {
      createdAt: '2026-09-22T10:00:05.000Z',
      documentId: 'doc-1',
      id: 'turn-1',
      message: 'Done.',
      request: 'Add a retry button',
      status: 'done',
      steps: [
        {
          call: {
            id: 'call-1',
            input: { data: { text: 'Retry' }, name: 'button', parentId: 'p1' },
            name: 'insert_node',
          },
          result: { content: '{"id":"n1"}', ok: true },
        },
      ],
    },
  ],
  updatedAt: '2026-09-22T10:00:05.000Z',
  ...overrides,
});

describe('buildAgentChatSessionExport', () => {
  it('wraps the session verbatim with export metadata', () => {
    const session = makeSession();
    const exported = buildAgentChatSessionExport(session);
    expect(exported.format).toBe('falang-agent-chat-session');
    expect(exported.formatVersion).toBe(1);
    expect(exported.session).toBe(session);
    expect(() => new Date(exported.exportedAt).toISOString()).not.toThrow();
  });
});

describe('buildAgentChatSessionExportFileName', () => {
  it('sanitizes the title and appends the session id', () => {
    expect(buildAgentChatSessionExportFileName(makeSession())).toBe('agent-chat-Debug-the-login-flow-session-1.json');
  });

  it('collapses non-alphanumeric characters and falls back when the title is blank', () => {
    expect(buildAgentChatSessionExportFileName(makeSession({ title: '  ', id: 'a/b c' }))).toBe(
      'agent-chat-session-a-b-c.json',
    );
  });
});
