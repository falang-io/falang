import { describe, expect, it } from 'vitest';
import { HistoryModule, schemeFactory, TOKEN_HISTORY } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { resolveService } from '@falang/di';
import { AgentModule } from './agent.module.js';
import { TOKEN_AGENT_SESSION } from './agent-session.token.js';
import type { ILlmResponse } from './llm-client.js';
import type { TScriptedStep } from './scripted-llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';
import type { IAgentToolProvider } from './tool-provider.js';
import type { TToolExecutionResult } from './tool-executor.js';

const finishCall = (id: string): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input: { message: 'done' }, name: 'finish' }],
});

describe('AgentSession — IAgentToolProvider (ADR 0034 §4)', () => {
  it("sends a provider's tools alongside AGENT_TOOLS", async () => {
    const provider: IAgentToolProvider = {
      execute: () => ({ content: '{}', ok: true }),
      tools: [{ description: 'does a thing', inputSchema: { properties: {}, type: 'object' }, name: 'do_thing' }],
    };
    const client = new ScriptedLlmClient([(): ILlmResponse => ({ text: 'ok', toolCalls: [] })]);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new AgentModule({ llmClient: client, toolProviders: [provider] })],
    });
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('go');

    const toolNames = client.requests[0].tools.map((tool) => tool.name);
    expect(toolNames).toContain('do_thing');
    expect(toolNames).toContain('insert_node');
  });

  it("routes a provider tool's call to execute() and never touches the tree, with no undo entry", async () => {
    const seen: unknown[] = [];
    const provider: IAgentToolProvider = {
      execute: (call): TToolExecutionResult => {
        seen.push(call.input);
        return { content: JSON.stringify({ id: 'created-1' }), ok: true };
      },
      tools: [{ description: '', inputSchema: { type: 'object' }, name: 'create_thing' }],
    };
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({ text: '', toolCalls: [{ id: 't1', input: { name: 'X' }, name: 'create_thing' }] }),
      (): ILlmResponse => finishCall('t2'),
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new AgentModule({ llmClient: client, toolProviders: [provider] })],
    });
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);
    const history = resolveService(TOKEN_HISTORY, scheme.container);

    await session.run('create it');

    expect(seen).toEqual([{ name: 'X' }]);
    expect(session.status).toBe('done');
    expect(session.steps[0].result).toEqual({ content: JSON.stringify({ id: 'created-1' }), ok: true });
    expect(history.isBackAvailable).toBe(false);
  });

  it('a call to a name no core tool and no provider owns fails gracefully instead of throwing', async () => {
    const script: TScriptedStep[] = [
      (): ILlmResponse => ({ text: '', toolCalls: [{ id: 't1', input: {}, name: 'nonexistent_tool' }] }),
      (): ILlmResponse => finishCall('t2'),
    ];
    const client = new ScriptedLlmClient(script);
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
    });
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('go');

    expect(session.status).toBe('done');
    expect(session.steps[0].result).toEqual({ error: 'Unknown tool: nonexistent_tool', ok: false });
  });
});
