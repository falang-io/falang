import { describe, expect, it } from 'vitest';
import { resolveService } from '@falang/di';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentModule } from './agent.module.js';
import { TOKEN_AGENT_SESSION } from './agent-session.token.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

const setup = (client: ScriptedLlmClient) => {
  const scheme = schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule(), new AgentModule({ llmClient: client })],
  });
  return resolveService(TOKEN_AGENT_SESSION, scheme.container);
};

describe('AgentSession usage', () => {
  it('sums usage across steps and resets on the next run', async () => {
    const finish = { id: 'f', input: { message: 'ok' }, name: 'finish' };
    const client = new ScriptedLlmClient([
      {
        text: '',
        toolCalls: [{ id: 't1', input: { nodeId: '2' }, name: 'get_tree' }],
        usage: { completionTokens: 5, promptTokens: 10, totalTokens: 15 },
      },
      { text: '', toolCalls: [finish], usage: { completionTokens: 2, promptTokens: 20, totalTokens: 22 } },
      { text: '', toolCalls: [finish] },
    ]);
    const session = setup(client);

    await session.run('one');
    expect(session.usage).toEqual({ calls: 2, completionTokens: 7, promptTokens: 30, totalTokens: 37 });

    await session.run('two');
    expect(session.usage).toEqual({ calls: 0, completionTokens: 0, promptTokens: 0, totalTokens: 0 });
  });
});
