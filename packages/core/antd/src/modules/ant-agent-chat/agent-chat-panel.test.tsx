import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
  AgentModule,
  TOKEN_AGENT_SESSION,
  ScriptedLlmClient,
  type IAgentSessionStore,
  type IChatSession,
  type IChatTurn,
  type IChatSessionSummary,
  type ILlmResponse,
} from '@falang/agent';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentChatSessionStore } from './agent-chat.store.js';
import { AgentChatPanel } from './agent-chat-panel.cmp.js';

let nextId = 0;
const generateId = (): string => {
  nextId += 1;
  return `session-${nextId}`;
};

/** A minimal in-memory `IAgentSessionStore` for the tests below — no IndexedDB/IPC, just a `Map`. */
class FakeAgentSessionStore implements IAgentSessionStore {
  private readonly sessions = new Map<string, IChatSession>();

  listSessions(): Promise<IChatSessionSummary[]> {
    return Promise.resolve(
      [...this.sessions.values()].map(({ id, title, createdAt, updatedAt }) => ({ createdAt, id, title, updatedAt })),
    );
  }

  createSession(title = 'New session'): Promise<IChatSession> {
    const now = new Date().toISOString();
    const session: IChatSession = { createdAt: now, id: generateId(), title, turns: [], updatedAt: now };
    this.sessions.set(session.id, session);
    return Promise.resolve(session);
  }

  getSession(id: string): Promise<IChatSession | null> {
    return Promise.resolve(this.sessions.get(id) ?? null);
  }

  renameSession(id: string, title: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) this.sessions.set(id, { ...session, title });
    return Promise.resolve();
  }

  deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
    return Promise.resolve();
  }

  appendTurn(sessionId: string, turn: IChatSession['turns'][number]): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`No session ${sessionId}`);
    this.sessions.set(sessionId, { ...session, turns: [...session.turns, turn], updatedAt: turn.createdAt });
    return Promise.resolve();
  }
}

const isQuota = (error: unknown): boolean => error instanceof Error && 'quota' in error;

const failedSetup = async () => {
  const store = new AgentChatSessionStore(new FakeAgentSessionStore());
  const thrown = Object.assign(new Error('out of credits'), { quota: true });
  const client = new ScriptedLlmClient([
    (): ILlmResponse => {
      throw thrown;
    },
  ]);
  const scheme = schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
  });
  const agentSession = resolveService(TOKEN_AGENT_SESSION, scheme.container);
  await store.send('do it', { agentSession, activeDocumentId: null });
  return { agentSession, store, thrown };
};

const render = (props: Parameters<typeof createElement<typeof AgentChatPanel>>[1] & object): string =>
  renderToStaticMarkup(createElement(AgentChatPanel, props));

describe('AgentChatPanel renderError', () => {
  it('keeps the raw error in memory only, the persisted turn holds just the message', async () => {
    const { store, thrown } = await failedSetup();
    const turn = store.activeSession?.turns[0] as IChatTurn;
    expect(store.getTurnError(turn.id)).toBe(thrown);
    expect(JSON.stringify(turn)).not.toContain('rawError');
  });

  it('renders the plain error text without renderError', async () => {
    const { agentSession, store } = await failedSetup();
    const html = render({
      agentSession,
      store,
      history: null,
      getActiveDocumentId: () => null,
      configured: true,
      configuredLoading: false,
      model: 'm',
    });
    expect(html).toContain('out of credits');
  });

  it('renders the renderError node and passes the original error object', async () => {
    const { agentSession, store, thrown } = await failedSetup();
    const seen: unknown[] = [];
    const html = render({
      agentSession,
      store,
      history: null,
      getActiveDocumentId: () => null,
      configured: true,
      configuredLoading: false,
      model: 'm',
      renderError: (error) => {
        seen.push(error);
        return isQuota(error) ? createElement('b', null, 'BUY CREDITS') : null;
      },
    });
    expect(html).toContain('BUY CREDITS');
    expect(html).not.toContain('out of credits');
    expect(seen[0]).toBe(thrown);
  });
});

describe('AgentChatPanel clarifying questions', () => {
  const askedSetup = async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const client = new ScriptedLlmClient([
      (): ILlmResponse => ({
        text: '',
        toolCalls: [
          {
            id: 'q',
            input: {
              question: 'Which vendor?',
              options: [{ label: 'Telegram', description: 'chat bot' }, { label: 'Email' }],
            },
            name: 'ask_user',
          },
        ],
      }),
    ]);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
    });
    const agentSession = resolveService(TOKEN_AGENT_SESSION, scheme.container);
    await store.send('build', { agentSession, activeDocumentId: null });
    return { agentSession, store };
  };
  const props = {
    history: null,
    getActiveDocumentId: () => null,
    configured: true,
    configuredLoading: false,
    model: 'm',
  };

  it('renders option buttons and disables the input while a question is open', async () => {
    const { agentSession, store } = await askedSetup();
    const html = render({ ...props, agentSession, store });
    expect(html).toContain('Which vendor?');
    expect(html).toContain('Telegram');
    expect(html).toContain('chat bot');
    expect(html).toContain('Email');
    expect(html).toMatch(/<textarea[^>]*disabled/);
  });
});
