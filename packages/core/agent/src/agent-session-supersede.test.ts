import { describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentModule } from './agent.module.js';
import { TOKEN_AGENT_SESSION } from './agent-session.token.js';
import type { ILlmCompleteParams, ILlmResponse } from './llm-client.js';
import type { TScriptedStep } from './scripted-llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';
import { SUPERSEDED_RESULT } from './supersede-tool-results.js';

// `AgentSession`-level coverage of `supersede-tool-results.ts` (the rules themselves are unit-tested in
// `supersede-tool-results.test.ts`): what the model is actually sent on a later step.
const createScheme = (llmClient: ScriptedLlmClient): Scheme =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule(), new AgentModule({ llmClient })],
  });

describe('AgentSession superseded tool results', () => {
  it('keeps only the latest get_node_kinds result in the conversation sent to the model', async () => {
    const bodyId = '2';
    const kindsCall = (id: string) => ({ id, input: { parentId: bodyId }, name: 'get_node_kinds' });
    let messagesAtFinish = '';
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({ text: '', toolCalls: [kindsCall('k1')] }),
      (): ILlmResponse => ({ text: '', toolCalls: [kindsCall('k2')] }),
      (params): ILlmResponse => {
        messagesAtFinish = JSON.stringify(params.messages);
        return { text: '', toolCalls: [{ id: 'f', input: { message: 'done' }, name: 'finish' }] };
      },
    ];
    const client = new ScriptedLlmClient(script);
    const session = resolveService(TOKEN_AGENT_SESSION, createScheme(client).container);

    await session.run('look around');

    const toolResults = (JSON.parse(messagesAtFinish) as ILlmCompleteParams['messages'])
      .flatMap((message) => (message.role === 'tool' ? message.results : []))
      .map((result) => [result.toolCallId, result.content]);
    expect(toolResults[0]).toEqual(['k1', SUPERSEDED_RESULT]);
    expect(toolResults[1]?.[1]).toContain('nodeKinds');
    // The UI trace keeps every full result.
    expect(session.steps[0]?.result.ok && session.steps[0].result.content).toContain('nodeKinds');
  });

  it('supersedes an earlier get_tree of the active document with a later documentId-less one', async () => {
    let messagesAtFinish = '';
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({ text: '', toolCalls: [{ id: 't1', input: { documentId: 'doc-1' }, name: 'get_tree' }] }),
      (): ILlmResponse => ({ text: '', toolCalls: [{ id: 't2', input: {}, name: 'get_tree' }] }),
      (params): ILlmResponse => {
        messagesAtFinish = JSON.stringify(params.messages);
        return { text: '', toolCalls: [{ id: 'f', input: { message: 'done' }, name: 'finish' }] };
      },
    ];
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      id: 'doc-1',
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new AgentModule({ llmClient: new ScriptedLlmClient(script) })],
    });
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('look around');

    const toolResults = (JSON.parse(messagesAtFinish) as ILlmCompleteParams['messages'])
      .flatMap((message) => (message.role === 'tool' ? message.results : []))
      .map((result) => [result.toolCallId, result.content]);
    expect(toolResults[0]).toEqual(['t1', SUPERSEDED_RESULT]);
    expect(toolResults[1]?.[1]).toContain('function-body');
    // The UI trace keeps every full result.
    expect(session.steps[0]?.result.ok && session.steps[0].result.content).toContain('function-body');
  });
});
