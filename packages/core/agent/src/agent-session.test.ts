import { describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { HistoryModule, schemeFactory, TOKEN_HISTORY } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentModule } from './agent.module.js';
import { TOKEN_AGENT_SESSION } from './agent-session.token.js';
import type { ILlmCompleteParams, ILlmResponse } from './llm-client.js';
import type { TScriptedStep } from './scripted-llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

const createScheme = (llmClient: ScriptedLlmClient): Scheme =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule(), new AgentModule({ llmClient })],
  });

const getLastToolResultContent = (params: ILlmCompleteParams): string => {
  const lastToolMessage = params.messages.findLast((m) => m.role === 'tool');
  if (!lastToolMessage || lastToolMessage.role !== 'tool') throw new Error('No tool message in history');
  return lastToolMessage.results[0].content;
};

describe('AgentSession', () => {
  it('happy path: insert, set_data, finish collapse into one history entry', async () => {
    const bodyId = '2';
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't1', input: { index: 0, name: 'action', parentId: bodyId }, name: 'insert_node' }],
      }),
      (params): ILlmResponse => {
        const insertedId = (JSON.parse(getLastToolResultContent(params)) as { insertedId: string }).insertedId;
        return { text: '', toolCalls: [{ id: 't2', input: { data: 'x', id: insertedId }, name: 'set_data' }] };
      },
      (): ILlmResponse => ({ text: '', toolCalls: [{ id: 't3', input: { message: 'done' }, name: 'finish' }] }),
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    await session.run('add a step');

    expect(session.status).toBe('done');
    expect(session.message).toBe('done');
    expect(session.steps).toHaveLength(3);
    if (!scheme.rootNode) throw new Error('Root not set');
    const body = scheme.nodes.getNode(bodyId);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].data).toBe('x');
    expect(history.isBackAvailable).toBe(true);

    history.back();
    expect(body.children).toHaveLength(0);
    history.forward();
    expect(body.children).toHaveLength(1);
    expect(body.children[0].data).toBe('x');
  });

  it('self-correction: an invalid call is reported back as an error, then the agent recovers', async () => {
    const bodyId = '2';
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't1', input: { index: 0, name: 'no-such', parentId: bodyId }, name: 'insert_node' }],
      }),
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't2', input: { index: 0, name: 'action', parentId: bodyId }, name: 'insert_node' }],
      }),
      (): ILlmResponse => ({ text: '', toolCalls: [] }),
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('add a step');

    const secondRequest = client.requests[1];
    const toolMessage = secondRequest.messages.find((m) => m.role === 'tool');
    expect(toolMessage && toolMessage.role === 'tool' && toolMessage.results[0].isError).toBe(true);

    expect(session.status).toBe('done');
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(1);
  });

  it('fatal mid-way: applied steps stay, the group closes, one back reverts them', async () => {
    const bodyId = '2';
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't1', input: { index: 0, name: 'action', parentId: bodyId }, name: 'insert_node' }],
      }),
      (): ILlmResponse => {
        throw new Error('network');
      },
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    await session.run('add a step');

    expect(session.status).toBe('error');
    expect(session.error).toContain('network');
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(1);
    expect(history.isGrouping).toBe(false);

    history.back();
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(0);
  });

  it('step limit: exhausting maxSteps without finish is a fatal error', async () => {
    const bodyId = '2';
    const alwaysGetTree = (): ILlmResponse => ({
      text: '',
      toolCalls: [{ id: 't', input: { nodeId: bodyId }, name: 'get_tree' }],
    });
    const script: TScriptedStep[] = [alwaysGetTree, alwaysGetTree, alwaysGetTree, alwaysGetTree, alwaysGetTree];
    const client = new ScriptedLlmClient(script);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('loop forever', { maxSteps: 3 });

    expect(session.status).toBe('error');
    expect(session.error).toContain('Step limit');
    expect(client.requests).toHaveLength(3);
  });

  it('step limit: the default (no maxSteps passed) comfortably outlasts the old 20-step cap', async () => {
    // Regression test for a real user-hit gap: a non-trivial multi-document workflow build (see
    // ADR 0009 (private)'s 2026-09-22 "third real misreading" note) needs well over 20 tool calls —
    // several of which are read-only discovery (get_tree/get_node_kinds), not just mutations — so the
    // old default cut runs short. 25 scripted turns exceeds the old default (20) but stays under the
    // new one (40, see DEFAULT_MAX_STEPS), so this run must finish normally rather than hit the cap.
    const bodyId = '2';
    const alwaysGetTree = (): ILlmResponse => ({
      text: '',
      toolCalls: [{ id: 't', input: { nodeId: bodyId }, name: 'get_tree' }],
    });
    const script: TScriptedStep[] = Array.from({ length: 25 }, () => alwaysGetTree);
    const client = new ScriptedLlmClient(script);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('build the whole thing');

    expect(session.status).toBe('done');
    expect(client.requests).toHaveLength(26);
  });

  it('cancel: aborting mid-run stops before the next turn but keeps applied steps', async () => {
    const bodyId = '2';
    const controller = new AbortController();
    const script: TScriptedStep[] = [
      (): ILlmResponse => {
        controller.abort();
        return {
          text: '',
          toolCalls: [{ id: 't1', input: { index: 0, name: 'action', parentId: bodyId }, name: 'insert_node' }],
        };
      },
      (): ILlmResponse => ({ text: '', toolCalls: [] }),
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('add a step', { signal: controller.signal });

    expect(client.requests).toHaveLength(1);
    expect(session.status).toBe('error');
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(1);
  });

  it('a document with no HistoryModule is a fatal run error, not a fail-fast rejection (ADR 0036: checked lazily on first touch, not before the loop)', async () => {
    const bodyId = '2';
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({
        text: '',
        toolCalls: [{ id: 't1', input: { index: 0, name: 'action', parentId: bodyId }, name: 'insert_node' }],
      }),
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new AgentModule({ llmClient: client })],
    });
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('add a step');

    expect(session.status).toBe('error');
    expect(session.error).toContain('HistoryModule');
  });

  it('includes context-provider text and the active-document line in the system prompt, but no tree or node-kinds catalog (ADR 0036)', async () => {
    const client = new ScriptedLlmClient([]);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [
        new HistoryModule(),
        new AgentModule({ contextProviders: [{ describe: () => 'SCOPE-MARKER' }], llmClient: client }),
      ],
    });
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('add a step');

    expect(session.status).toBe('done');
    const system = client.requests[0].system;
    expect(system).toContain('SCOPE-MARKER');
    expect(system).toContain(`document ${scheme.id} open in the editor`);
    expect(system).not.toContain('"id":"2"');
    expect(system).not.toContain('Node kinds');
  });

  it('finish ends the run even alongside other calls in the same response', async () => {
    const bodyId = '2';
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({
        text: '',
        toolCalls: [
          { id: 't1', input: { index: 0, name: 'action', parentId: bodyId }, name: 'insert_node' },
          { id: 't2', input: { message: 'done' }, name: 'finish' },
        ],
      }),
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('add a step');

    expect(session.status).toBe('done');
    expect(client.requests).toHaveLength(1);
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(1);
  });

  it('priorMessages are prepended ahead of the new user message', async () => {
    const client = new ScriptedLlmClient([(): ILlmResponse => ({ text: 'a normal reply', toolCalls: [] })]);
    const scheme = createScheme(client);
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);
    const priorMessages: ILlmCompleteParams['messages'] = [
      { content: 'earlier question', role: 'user' },
      { content: 'earlier answer', role: 'assistant', toolCalls: [] },
    ];

    await session.run('follow-up question', { priorMessages });

    expect(session.status).toBe('done');
    expect(session.message).toBe('a normal reply');
    // ScriptedLlmClient records the live `messages` array reference, which the loop keeps appending to after
    // this call — compare only the prefix sent on this (the only) request.
    expect(client.requests[0].messages.slice(0, 3)).toEqual([
      ...priorMessages,
      { content: 'follow-up question', role: 'user' },
    ]);
  });
});
