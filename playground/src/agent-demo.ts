import type { NodeStore, Scheme } from '@falang/scheme';
import { ScriptedLlmClient } from '@falang/agent';
import type { ILlmCompleteParams, ILlmResponse } from '@falang/agent';

interface IInsertTarget {
  readonly parent: NodeStore;
  readonly childName: string;
}

// Finds its target the same way a real model would have to — the first node that accepts children
// by name — rather than hardcoding a node id, so it works for every base icon the toolbar offers.
const findInsertTarget = (scheme: Scheme): IInsertTarget => {
  if (!scheme.rootNode) throw new Error('Playground agent demo: scheme has no root node yet');
  const stack = scheme.infra.structure;
  const visit = (node: NodeStore): IInsertTarget | null => {
    const { children } = stack.getConfig(node.name);
    if (children === true) return { parent: node, childName: 'action' };
    if (Array.isArray(children) && children.length > 0) return { parent: node, childName: children[0] };
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return null;
  };
  const found = visit(scheme.rootNode);
  if (!found) throw new Error('Playground agent demo: no node accepting children found');
  return found;
};

const getFirstInsertedId = (params: ILlmCompleteParams): string => {
  const firstToolMessage = params.messages.find((m) => m.role === 'tool');
  if (!firstToolMessage || firstToolMessage.role !== 'tool') {
    throw new Error('Playground agent demo: no tool message in history yet');
  }
  return (JSON.parse(firstToolMessage.results[0].content) as { insertedId: string }).insertedId;
};

const insertStep = (scheme: Scheme, id: string, index: number, data: string): ILlmResponse => {
  const { parent, childName } = findInsertTarget(scheme);
  return {
    text: '',
    toolCalls: [{ id, input: { data, index, name: childName, parentId: parent.id }, name: 'insert_node' }],
  };
};

/**
 * ADR 0009 demo: a scripted "LLM" that adds two statements then edits the first one, driving
 * AgentModule/HistoryModule end to end without a real vendor call. One client per scheme — a
 * scripted client is consumed by a single run.
 */
export const createDemoLlmClient = (getScheme: () => Scheme): ScriptedLlmClient =>
  new ScriptedLlmClient([
    () => insertStep(getScheme(), 'demo-1', 0, 'Шаг агента 1'),
    () => insertStep(getScheme(), 'demo-2', 1, 'Шаг агента 2'),
    (params: ILlmCompleteParams): ILlmResponse => ({
      text: '',
      toolCalls: [
        { id: 'demo-3', input: { data: 'Шаг агента 1 (обновлён)', id: getFirstInsertedId(params) }, name: 'set_data' },
      ],
    }),
    (): ILlmResponse => ({
      text: '',
      toolCalls: [{ id: 'demo-4', input: { message: 'Added two demo steps' }, name: 'finish' }],
    }),
  ]);
