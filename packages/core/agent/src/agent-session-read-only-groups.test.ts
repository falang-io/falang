import { describe, expect, it } from 'vitest';
import { HistoryModule, schemeFactory, TOKEN_HISTORY, type HistoryStore } from '@falang/scheme';
import { resolveService } from '@falang/di';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { AgentSession } from './agent-session.js';
import type { ILlmResponse } from './llm-client.js';
import { ScriptedLlmClient } from './scripted-llm-client.js';

const call = (id: string, name: string, input: unknown): ILlmResponse => ({
  text: '',
  toolCalls: [{ id, input, name }],
});
const build = () =>
  schemeFactory({
    document: { ...getTestEmptyDoc(), type: 'function' },
    infra: getTestInfrastructure(),
    modules: [new HistoryModule()],
  });

describe('AgentSession undo groups', () => {
  it('a read-only run never opens a group', async () => {
    const scheme = build();
    const history: HistoryStore = resolveService(TOKEN_HISTORY, scheme.container);
    const seen: boolean[] = [];
    const client = new ScriptedLlmClient([
      call('t1', 'get_tree', { documentId: scheme.id }),
      () => {
        seen.push(history.isGrouping);
        return call('t2', 'get_node_kinds', {});
      },
      () => {
        seen.push(history.isGrouping);
        return call('t3', 'finish', { message: 'ok' });
      },
    ]);
    await new AgentSession(scheme, client, []).run('go');
    expect(seen).toEqual([false, false]);
    expect(history.isGrouping).toBe(false);
  });

  it('a mutating run still gets one group, open until the run ends', async () => {
    const scheme = build();
    const history: HistoryStore = resolveService(TOKEN_HISTORY, scheme.container);
    const seen: boolean[] = [];
    const client = new ScriptedLlmClient([
      call('t1', 'get_tree', { documentId: scheme.id }),
      call('t2', 'insert_node', { index: 0, name: 'action', parentId: '2' }),
      () => {
        seen.push(history.isGrouping);
        return call('t3', 'insert_node', { index: 1, name: 'action', parentId: '2' });
      },
      call('t4', 'finish', { message: 'ok' }),
    ]);
    await new AgentSession(scheme, client, []).run('go');
    expect(seen).toEqual([true]);
    expect(history.isGrouping).toBe(false);
    expect(scheme.nodes.getNode('2').children).toHaveLength(2);
    history.back();
    expect(scheme.nodes.getNode('2').children).toHaveLength(0);
  });
});
