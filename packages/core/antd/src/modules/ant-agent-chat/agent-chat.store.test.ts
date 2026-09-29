import { describe, expect, it } from 'vitest';
import {
  AgentModule,
  TOKEN_AGENT_SESSION,
  ScriptedLlmClient,
  type IAgentSessionStore,
  type IChatSession,
  type IChatSessionSummary,
  type ILlmResponse,
} from '@falang/agent';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentChatSessionStore } from './agent-chat.store.js';

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

const createAgentSession = (script: ILlmResponse[]) => {
  const client = new ScriptedLlmClient(script.map((response) => (): ILlmResponse => response));
  const scheme = schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
  });
  return { agentSession: resolveService(TOKEN_AGENT_SESSION, scheme.container), client, scheme };
};

describe('AgentChatSessionStore', () => {
  it('auto-creates a session on the first send and persists the turn', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const { agentSession } = createAgentSession([{ text: 'Hi there!', toolCalls: [] }]);

    await store.send('hello', { agentSession, activeDocumentId: 'doc-1' });

    expect(store.sessions).toHaveLength(1);
    expect(store.activeSession?.turns).toHaveLength(1);
    expect(store.activeSession?.turns[0].request).toBe('hello');
    expect(store.activeSession?.turns[0].message).toBe('Hi there!');
    expect(store.activeSession?.turns[0].status).toBe('done');
    expect(store.activeSession?.turns[0].documentId).toBe('doc-1');
    expect(store.sending).toBe(false);
  });

  it('sends fine with no active document at all (ADR 0036 — "no home document")', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const { agentSession } = createAgentSession([{ text: 'Sure, starting from scratch.', toolCalls: [] }]);

    await store.send('build me something', { agentSession, activeDocumentId: null });

    expect(store.activeSession?.turns[0].status).toBe('done');
    expect(store.activeSession?.turns[0].documentId).toBeNull();
  });

  it('a second send includes prior turns as priorMessages', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const first = createAgentSession([{ text: 'first answer', toolCalls: [] }]);
    await store.send('first question', { agentSession: first.agentSession, activeDocumentId: null });

    const second = createAgentSession([{ text: 'second answer', toolCalls: [] }]);
    await store.send('second question', { agentSession: second.agentSession, activeDocumentId: null });

    expect(store.activeSession?.turns).toHaveLength(2);
    const sentMessages = second.client.requests[0].messages;
    expect(sentMessages[0]).toEqual({ content: 'first question', role: 'user' });
    expect(sentMessages[1]).toMatchObject({ content: 'first answer', role: 'assistant' });
    expect(sentMessages[2]).toEqual({ content: 'second question', role: 'user' });
  });

  it('a fatal error still records the turn as status error', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const client = new ScriptedLlmClient([
      (): ILlmResponse => {
        throw new Error('network down');
      },
    ]);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
    });
    const agentSession = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await store.send('do something', { agentSession, activeDocumentId: null });

    expect(store.activeSession?.turns[0].status).toBe('error');
    expect(store.activeSession?.turns[0].error).toContain('network down');
  });

  it('pendingRequest is set before run() and cleared once send() settles (ADR 0036 §2)', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const { promise: gate, resolve: resolveTurn } = Promise.withResolvers<undefined>();
    const client = new ScriptedLlmClient([
      async (): Promise<ILlmResponse> => {
        await gate;
        return { text: 'done', toolCalls: [] };
      },
    ]);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
    });
    const agentSession = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    expect(store.pendingRequest).toBeNull();
    const sendPromise = store.send('hello', { agentSession, activeDocumentId: null });
    // pendingRequest is set synchronously (well before the scripted step's own gate resolves) — flush
    // microtasks until it shows up rather than guessing a tick count.
    while (store.pendingRequest === null) {
      // oxlint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
    expect(store.pendingRequest).toBe('hello');
    expect(store.sending).toBe(true);

    // oxlint-disable-next-line no-undefined, unicorn/no-useless-undefined -- Promise.withResolvers<undefined>'s resolve() genuinely takes one required argument.
    resolveTurn(undefined);
    await sendPromise;

    expect(store.pendingRequest).toBeNull();
    expect(store.sending).toBe(false);
    expect(store.activeSession?.turns[0].message).toBe('done');
  });

  it('creates, renames and deletes sessions', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    await store.createSession('First');
    const id = store.activeSession?.id;
    if (!id) throw new Error('No active session');

    await store.rename(id, 'Renamed');
    expect(store.sessions.find((s) => s.id === id)?.title).toBe('Renamed');
    expect(store.activeSession?.title).toBe('Renamed');

    await store.deleteSession(id);
    expect(store.sessions).toHaveLength(0);
    expect(store.activeSession).toBeNull();
  });

  it('loadSessions selects the most recently updated session', async () => {
    const backing = new FakeAgentSessionStore();
    await backing.createSession('Old');
    await new Promise((resolve) => {
      setTimeout(resolve, 2);
    });
    const newer = await backing.createSession('Newer');

    const store = new AgentChatSessionStore(backing);
    await store.loadSessions();

    expect(store.activeSession?.id).toBe(newer.id);
  });
});
