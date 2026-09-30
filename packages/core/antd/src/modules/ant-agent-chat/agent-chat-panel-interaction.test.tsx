// @vitest-environment jsdom
import { createElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AgentModule, ScriptedLlmClient, TOKEN_AGENT_SESSION, type ILlmResponse } from '@falang/agent';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentChatSessionStore } from './agent-chat.store.js';
import { FakeAgentSessionStore } from './fake-agent-session-store.js';
import { AgentChatPanel } from './agent-chat-panel.cmp.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.stubGlobal(
  'ResizeObserver',
  vi.fn(function ResizeObserverMock() {
    return { observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn() };
  }),
);

const setup = async () => {
  const store = new AgentChatSessionStore(new FakeAgentSessionStore());
  const client = new ScriptedLlmClient([
    (): ILlmResponse => ({
      text: '',
      toolCalls: [
        {
          id: 'q',
          input: { question: 'Which vendor?', options: [{ label: 'Telegram' }, { label: 'Email' }] },
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
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      createElement(AgentChatPanel, {
        agentSession,
        configured: true,
        configuredLoading: false,
        getActiveDocumentId: () => null,
        history: null,
        model: 'm',
        store,
      }),
    );
  });
  return { agentSession, container, root, store };
};

describe('AgentChatPanel clarifying questions (interaction)', () => {
  it('an option button calls store.answer, the input is disabled meanwhile', async () => {
    const { agentSession, container, root, store } = await setup();
    const spy = vi.spyOn(store, 'answer').mockResolvedValue();
    expect(container.querySelector('textarea')?.disabled).toBe(true);
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('Telegram'));
    act(() => {
      button?.click();
    });
    expect(spy).toHaveBeenCalledWith({ option: 'Telegram' }, { agentSession, activeDocumentId: null });
    act(() => root.unmount());
  });

  it("the Don't ask switch flips allowQuestions", async () => {
    const { container, root, store } = await setup();
    act(() => {
      container.querySelector<HTMLElement>('[role="switch"]')?.click();
    });
    expect(store.allowQuestions).toBe(false);
    act(() => root.unmount());
  });
});
