import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentModule, TOKEN_AGENT_SESSION, ScriptedLlmClient, type IChatTurn, type ILlmResponse } from '@falang/agent';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentChatSessionStore, countConsecutiveQuestions } from './agent-chat.store.js';
import { FakeAgentSessionStore } from './fake-agent-session-store.js';

const createAgentSession = (script: ILlmResponse[]) => {
  const client = new ScriptedLlmClient(script.map((response) => (): ILlmResponse => response));
  const scheme = schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
  });
  return { agentSession: resolveService(TOKEN_AGENT_SESSION, scheme.container), client, scheme };
};

const makeTurn = (id: string, status: IChatTurn['status'], answersTurnId?: string): IChatTurn => ({
  createdAt: '',
  documentId: null,
  id,
  message: '',
  request: '',
  status,
  steps: [],
  ...(answersTurnId ? { answersTurnId } : {}),
});

const askResponse = (question = 'Which vendor?'): ILlmResponse => ({
  text: '',
  toolCalls: [
    {
      id: 'q1',
      input: { question, options: [{ label: 'Telegram', description: 'chat bot' }, { label: 'Email' }] },
      name: 'ask_user',
    },
  ],
});

describe('AgentChatSessionStore clarifying questions (ADR 0047)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('persists an awaiting turn with its question', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const { agentSession } = createAgentSession([askResponse()]);
    await store.send('build a bot', { agentSession, activeDocumentId: null });

    const turn = store.activeSession?.turns[0];
    expect(turn?.status).toBe('awaiting-answer');
    expect(turn?.message).toBe('');
    expect(turn?.question?.question).toBe('Which vendor?');
    expect(store.awaitingTurn?.id).toBe(turn?.id);
  });

  it('answer() continues on the in-memory messages and links answersTurnId', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const { agentSession, client } = createAgentSession([askResponse(), { text: 'built', toolCalls: [] }]);
    await store.send('build a bot', { agentSession, activeDocumentId: null });
    const asked = store.awaitingTurn;
    const held = agentSession.pendingMessages;
    expect(held).not.toBeNull();

    const spy = vi.spyOn(agentSession, 'run');
    await store.answer({ option: 'Telegram' }, { agentSession, activeDocumentId: null });

    expect(spy.mock.calls[0][1]).toMatchObject({ consecutiveQuestions: 1, allowQuestions: true });
    expect(spy.mock.calls[0][1]?.priorMessages).toEqual(held);
    const turns = store.activeSession?.turns ?? [];
    expect(turns).toHaveLength(2);
    expect(turns[1].request).toBe('Answer: Telegram');
    expect(turns[1].answersTurnId).toBe(asked?.id);
    expect(turns[1].status).toBe('done');
    expect(store.awaitingTurn).toBeNull();
    expect(client.requests).toHaveLength(2);
  });

  it('after a reload the answer uses the condensed history with the (asked: …) line', async () => {
    const backing = new FakeAgentSessionStore();
    const first = new AgentChatSessionStore(backing);
    await first.send('build a bot', {
      agentSession: createAgentSession([askResponse()]).agentSession,
      activeDocumentId: null,
    });

    const reloaded = new AgentChatSessionStore(backing);
    await reloaded.loadSessions();
    const second = createAgentSession([{ text: 'built', toolCalls: [] }]);
    await reloaded.answer({ other: 'Slack' }, { agentSession: second.agentSession, activeDocumentId: null });

    const sent = second.client.requests[0].messages;
    expect(sent[0]).toEqual({ content: 'build a bot', role: 'user' });
    expect(sent[1]).toMatchObject({
      content: '(asked: Which vendor? — options: Telegram / Email)',
      role: 'assistant',
    });
    expect(sent[2]).toEqual({ content: 'Answer: Slack', role: 'user' });
  });

  it('answer() is a no-op when nothing is awaiting', async () => {
    const store = new AgentChatSessionStore(new FakeAgentSessionStore());
    const { agentSession, client } = createAgentSession([{ text: 'hi', toolCalls: [] }]);
    await store.send('hello', { agentSession, activeDocumentId: null });
    await store.answer({ decideYourself: true }, { agentSession, activeDocumentId: null });
    expect(store.activeSession?.turns).toHaveLength(1);
    expect(client.requests).toHaveLength(1);
  });

  it('persists allowQuestions in localStorage and passes it to run()', async () => {
    const data = new Map<string, string>([['k', 'false']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    });
    const store = new AgentChatSessionStore(new FakeAgentSessionStore(), { allowQuestionsStorageKey: 'k' });
    expect(store.allowQuestions).toBe(false);

    const { agentSession } = createAgentSession([{ text: 'ok', toolCalls: [] }]);
    const spy = vi.spyOn(agentSession, 'run');
    await store.send('go', { agentSession, activeDocumentId: null });
    expect(spy.mock.calls[0][1]).toMatchObject({ allowQuestions: false, consecutiveQuestions: 0 });

    store.setAllowQuestions(true);
    expect(data.get('k')).toBe('true');
  });
});

describe('countConsecutiveQuestions', () => {
  it('counts the chain of awaiting turns ending at the last turn', () => {
    expect(countConsecutiveQuestions([])).toBe(0);
    expect(countConsecutiveQuestions([makeTurn('a', 'done')])).toBe(0);
    expect(countConsecutiveQuestions([makeTurn('a', 'awaiting-answer')])).toBe(1);
    expect(
      countConsecutiveQuestions([
        makeTurn('a', 'awaiting-answer'),
        makeTurn('b', 'awaiting-answer', 'a'),
        makeTurn('c', 'awaiting-answer', 'b'),
      ]),
    ).toBe(3);
    expect(
      countConsecutiveQuestions([
        makeTurn('a', 'awaiting-answer'),
        makeTurn('b', 'done', 'a'),
        makeTurn('c', 'awaiting-answer'),
      ]),
    ).toBe(1);
  });
});
