import { describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { HistoryModule, schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { AgentSession } from './agent-session.js';
import type { IAgentContextProvider, IAgentRunContext } from './context-provider.js';
import type { ILlmResponse } from './llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';
import { executeToolCall } from './tool-executor.js';
import { validateNodeSpecs } from './insert-nodes.js';

const BODY_ID = '2';

const createScheme = (): Scheme =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule()],
  });

const call = (id: string, name: string, input: unknown): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input, name }],
});

describe('AgentSession coreTools', () => {
  it('offers only allowlisted core tools plus finish and rejects others', async () => {
    const scheme = createScheme();
    const client = new ScriptedLlmClient([
      call('t1', 'get_tree', { documentId: scheme.id }),
      call('t2', 'finish', { message: 'ok' }),
    ]);
    const session = new AgentSession(scheme, client, [], { coreTools: ['insert_node'] });
    await session.run('go', { allowQuestions: false });
    const names = client.requests[0].tools.map((tool) => tool.name);
    expect(names).toContain('insert_node');
    expect(names).toContain('finish');
    expect(names).not.toContain('get_tree');
    expect(names).not.toContain('ask_user');
    expect(session.steps[0].result.ok).toBe(false);
  });

  it('keeps finish when omitted from the allowlist and ask_user governed by allowQuestions', async () => {
    const client = new ScriptedLlmClient([call('t1', 'finish', { message: 'x' })]);
    await new AgentSession(createScheme(), client, [], { coreTools: [] }).run('go');
    const names = client.requests[0].tools.map((tool) => tool.name);
    expect(names).toContain('finish');
    expect(names).toContain('ask_user');
    expect(names).not.toContain('insert_node');
  });
});

describe('AgentSession focusNodeId and systemPrompt', () => {
  it('passes focusNodeId to context providers', async () => {
    const seen: (string | undefined)[] = [];
    const provider: IAgentContextProvider = {
      describe: (context: IAgentRunContext) => {
        seen.push(context.focusNodeId);
        return 'PROVIDER-OUTPUT';
      },
    };
    const client = new ScriptedLlmClient([call('t1', 'finish', { message: 'x' })]);
    await new AgentSession(createScheme(), client, [provider]).run('go', { focusNodeId: BODY_ID });
    expect(seen).toEqual([BODY_ID]);
  });

  it('uses a host system prompt but still appends ask rules and provider output', async () => {
    const provider: IAgentContextProvider = { describe: () => 'PROVIDER-OUTPUT' };
    const client = new ScriptedLlmClient([call('t1', 'finish', { message: 'x' })]);
    await new AgentSession(createScheme(), client, [provider]).run('go', { systemPrompt: 'HOST PROMPT' });
    const { system } = client.requests[0];
    expect(system.startsWith('HOST PROMPT')).toBe(true);
    expect(system).toContain('PROVIDER-OUTPUT');
    expect(system).toContain('ask_user');
    expect(system).not.toContain('You edit a project');
  });
});

describe('validateNodeSpecs', () => {
  it('builds a valid two-element list', () => {
    const scheme = createScheme();
    const result = validateNodeSpecs(scheme, BODY_ID, [
      { data: 'a = 1', name: 'action' },
      { name: 'action', data: 'b = 2' },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nodes).toHaveLength(2);
      expect(result.nodes[0].id).not.toBe(result.nodes[1].id);
    }
    expect(scheme.nodes.getNode(BODY_ID).children).toHaveLength(0);
  });

  it('rejects an out on the first element', () => {
    const scheme = createScheme();
    const inserted = executeToolCall(
      { id: 'c', input: { index: 0, name: 'switch', parentId: BODY_ID }, name: 'insert_node' },
      scheme,
    );
    expect(inserted.ok).toBe(true);
    const switchId = scheme.nodes.getNode(BODY_ID).children[0].id;
    const bad = validateNodeSpecs(scheme, switchId, [
      { name: 'switch-option', out: { name: 'out' } },
      { name: 'switch-option' },
    ]);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('children[0].out');
    const good = validateNodeSpecs(scheme, switchId, [
      { name: 'switch-option' },
      { name: 'switch-option', out: { name: 'out' } },
    ]);
    expect(good.ok).toBe(true);
  });

  it('rejects a nested first-child out with its path', () => {
    const result = validateNodeSpecs(createScheme(), BODY_ID, [
      { name: 'if', children: [{ name: 'if-child', out: { name: 'out' } }, { name: 'if-child' }] },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('children[0].children[0].out');
  });

  it('names the path of a bad nested spec and is atomic', () => {
    const scheme = createScheme();
    const result = validateNodeSpecs(scheme, BODY_ID, [{ name: 'action', data: '' }, { name: 'no-such-kind' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('children[1]');
  });

  it('decodes JSON-encoded specs and rejects an unknown parent', () => {
    const scheme = createScheme();
    const decoded = validateNodeSpecs(scheme, BODY_ID, [JSON.stringify({ name: 'action', data: 'x' })]);
    expect(decoded.ok).toBe(true);
    expect(validateNodeSpecs(scheme, 'missing', []).ok).toBe(false);
  });
});
