import { describe, expect, it } from 'vitest';
import { AgentModule, TOKEN_AGENT_SESSION, ScriptedLlmClient, type ILlmResponse } from '@falang/agent';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentChatSessionStore, buildSessionTitle } from './agent-chat.store.js';
import { SESSION_TITLE_MAX_LENGTH } from './agent-chat-helpers.js';
import { FakeAgentSessionStore } from './fake-agent-session-store.js';

const createAgentSession = (replies: string[]) => {
  const client = new ScriptedLlmClient(replies.map((text) => (): ILlmResponse => ({ text, toolCalls: [] })));
  const scheme = schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
  });
  return resolveService(TOKEN_AGENT_SESSION, scheme.container);
};

describe('buildSessionTitle', () => {
  it('keeps a short request as is, whitespace collapsed', () => {
    expect(buildSessionTitle('  Build a\n Telegram   bot ')).toBe('Build a Telegram bot');
  });

  it('cuts a long request at a word boundary with an ellipsis', () => {
    const title = buildSessionTitle(
      'Build me a Telegram bot that asks the user for their name and greets them politely every morning',
    );
    expect(title).toBe('Build me a Telegram bot that asks the user for…');
    expect(title.length).toBeLessThanOrEqual(SESSION_TITLE_MAX_LENGTH);
  });

  it('cuts mid-word when there is no word boundary in the second half', () => {
    const title = buildSessionTitle('x'.repeat(80));
    expect(title).toBe(`${'x'.repeat(SESSION_TITLE_MAX_LENGTH - 1)}…`);
  });
});

describe('AgentChatSessionStore session titles', () => {
  it('titles an auto-created session after the first request', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    await store.send('Build a Telegram bot', { agentSession: createAgentSession(['ok']), activeDocumentId: null });
    expect(store.activeSession?.title).toBe('Build a Telegram bot');
    expect(store.sessions[0].title).toBe('Build a Telegram bot');
  });

  it('renames an empty session still carrying the default title, but only on its first turn', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    await store.createSession();
    expect(store.activeSession?.title).toBe('New session');
    const agentSession = createAgentSession(['ok', 'ok again']);
    await store.send('First request', { agentSession, activeDocumentId: null });
    await store.send('Second request', { agentSession, activeDocumentId: null });
    expect(store.activeSession?.title).toBe('First request');
    expect(store.sessions[0].title).toBe('First request');
  });

  it('keeps a title the user chose', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    await store.createSession('My chat');
    await store.send('First request', { agentSession: createAgentSession(['ok']), activeDocumentId: null });
    expect(store.activeSession?.title).toBe('My chat');
  });
});
