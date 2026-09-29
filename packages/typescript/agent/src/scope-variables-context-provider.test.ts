import { describe, expect, it } from 'vitest';
import { NodeStore } from '@falang/scheme';
import type { Scheme } from '@falang/scheme';
import type { IAgentRunContext } from '@falang/agent';
import type { INode } from '@falang/dto';
import { ScopeVariablesContextProvider } from './scope-variables-context-provider.js';

const makeNode = (node: INode, parent: NodeStore | null = null): NodeStore => {
  const store = new NodeStore(node);
  store.parent = parent;
  const children = (node.children ?? []).map((child) => makeNode(child, store));
  store.children.replace(children);
  return store;
};

/** A context whose `getActiveScheme()` resolves to a scheme-shaped object exposing just `rootNode` — the
 *  provider only reads that one property (`getActiveScheme()?.rootNode`), so this stands in for a real
 *  `Scheme` without needing a full `schemeFactory`/infrastructure setup. `null` reproduces "no active
 *  document". */
const contextWithRoot = (root: NodeStore | null): IAgentRunContext => ({
  activeDocumentId: root ? 'doc-1' : null,
  getActiveScheme: () => (root ? ({ rootNode: root } as unknown as Scheme) : null),
});

describe('ScopeVariablesContextProvider', () => {
  it("describes the identifiers in scope at the active document's root node", () => {
    const createVarX: INode = {
      id: 'x',
      name: 'create-var',
      data: { name: 'x', variableType: { type: 'number', numberType: { type: 'any' } } },
    };
    const currentAction: INode = { id: 'current', name: 'action', data: '' };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [createVarX, currentAction],
      data: { name: 'fn', parameters: [{ name: 'a', type: { type: 'string' } }] },
    };
    const functionNode: INode = {
      id: 'fn',
      name: 'function',
      children: [{ id: 'header', name: 'function-header' }, functionBody],
    };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    // `getActiveScheme()?.rootNode` stands in here for the node collectScopeVariables should walk up
    // from — see `contextWithRoot`'s own doc comment.
    const rootStandIn = bodyStore?.children.find((child) => child.name === 'action');
    if (!rootStandIn) throw new Error('test setup failed');

    const provider = new ScopeVariablesContextProvider();
    const description = provider.describe(contextWithRoot(rootStandIn));

    expect(description).toContain('a: string');
    expect(description).toContain('x: number');
  });

  it('returns null when the resolved root has no scope variables', () => {
    const currentAction: INode = { id: 'current', name: 'action', data: '' };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [currentAction],
      data: { name: 'fn', parameters: [] },
    };
    const functionNode: INode = { id: 'fn', name: 'function', children: [functionBody] };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    const rootStandIn = bodyStore?.children.find((child) => child.name === 'action');
    if (!rootStandIn) throw new Error('test setup failed');

    const provider = new ScopeVariablesContextProvider();
    expect(provider.describe(contextWithRoot(rootStandIn))).toBeNull();
  });

  it('returns null when there is no active document', () => {
    const provider = new ScopeVariablesContextProvider();
    expect(provider.describe(contextWithRoot(null))).toBeNull();
  });
});
