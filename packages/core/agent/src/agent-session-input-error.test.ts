import { describe, expect, it } from 'vitest';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentModule } from './agent.module.js';
import { TOKEN_AGENT_SESSION } from './agent-session.token.js';
import type { ILlmResponse } from './llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

describe('AgentSession tool call with unparseable arguments', () => {
  it('answers with the input error and applies nothing', async () => {
    const scheme = schemeFactory({
      document: { ...getTestEmptyDoc(), type: 'function' },
      infra: getTestInfrastructure(),
      modules: [
        new HistoryModule(),
        new AgentModule({
          llmClient: new ScriptedLlmClient([
            (): ILlmResponse => ({
              text: '',
              toolCalls: [
                {
                  id: 'c1',
                  input: {},
                  inputError: 'The tool call\'s arguments were not valid JSON (Unexpected end): {"parentId":"2"',
                  name: 'insert_node',
                },
              ],
            }),
            (): ILlmResponse => ({ text: '', toolCalls: [{ id: 'f', input: { message: 'done' }, name: 'finish' }] }),
          ]),
        }),
      ],
    });
    const session = resolveService(TOKEN_AGENT_SESSION, scheme.container);

    await session.run('insert something');

    const result = session.steps[0]?.result;
    expect(result?.ok).toBe(false);
    expect(result && !result.ok && result.error).toContain('not valid JSON');
    expect(result && !result.ok && result.error).toContain('resend the call');
    expect(scheme.nodes.getNode('2').children).toHaveLength(0);
    expect(session.status).toBe('done');
  });
});
