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

describe('AgentSession.closeOpenGroups', () => {
  it('ends open groups mid-run, and later mutations reopen one lazily on the scheme the resolver now returns', async () => {
    let current = build();
    const first = current;
    const firstHistory: HistoryStore = resolveService(TOKEN_HISTORY, first.container);
    const second = build();
    const secondHistory: HistoryStore = resolveService(TOKEN_HISTORY, second.container);
    const seen: boolean[] = [];
    const holder: { current: AgentSession | null } = { current: null };
    const provider = {
      execute: () => {
        holder.current?.closeOpenGroups();
        seen.push(firstHistory.isGrouping);
        current = second;
        return { content: 'rebuilt', ok: true as const };
      },
      tools: [{ description: 'rebuild', inputSchema: { properties: {}, type: 'object' }, name: 'rebuild' }],
    };
    const client = new ScriptedLlmClient([
      call('t1', 'insert_node', { index: 0, name: 'action', parentId: '2' }),
      call('t2', 'rebuild', {}),
      call('t3', 'insert_node', { index: 0, name: 'action', parentId: '2' }),
      () => {
        seen.push(secondHistory.isGrouping);
        return call('t4', 'finish', { message: 'ok' });
      },
    ]);
    const session = new AgentSession(null, client, [], {
      documentResolver: { resolve: () => current },
      toolProviders: [provider],
    });
    holder.current = session;
    await session.run('go', { activeDocumentId: first.id });
    expect(seen).toEqual([false, true]);
    expect(firstHistory.isGrouping).toBe(false);
    expect(secondHistory.isGrouping).toBe(false);
    expect(second.nodes.getNode('2').children).toHaveLength(1);
  });

  it('is a no-op outside a run', () => {
    expect(() => new AgentSession(null, new ScriptedLlmClient([]), []).closeOpenGroups()).not.toThrow();
  });
});
