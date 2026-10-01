import { describe, expect, it } from 'vitest';
import { NodeStore } from '@falang/scheme';
import type { INode } from '@falang/dto';
import { collectScopeVariables } from './collect-scope-variables.js';
import { getContainerScopeContribution, getScopeContributions } from './node-scope-contribution.js';

const makeNode = (node: INode, parent: NodeStore | null = null): NodeStore => {
  const store = new NodeStore(node);
  store.parent = parent;
  store.children.replace((node.children ?? []).map((child) => makeNode(child, store)));
  return store;
};

const numVar = (id: string, name: string): INode => ({
  id,
  name: 'create-var',
  data: { name, variableType: { type: 'number', numberType: { type: 'any' } } },
});

const findById = (store: NodeStore, id: string): NodeStore => {
  if (store.id === id) return store;
  for (const child of store.children) {
    const found = (() => {
      try {
        return findById(child, id);
      } catch {
        return null;
      }
    })();
    if (found) return found;
  }
  throw new Error(`not found: ${id}`);
};

describe('magic node scope (ADR 0046 (private))', () => {
  it('a magic sibling contributes its children recursively, in order', () => {
    const magic: INode = {
      id: 'm',
      name: 'magic',
      data: { spell: 's' },
      children: [numVar('a', 'a'), numVar('b', 'b')],
    };
    expect(getScopeContributions(magic).map((v) => v.name)).toEqual(['a', 'b']);
    expect(getScopeContributions(numVar('x', 'x')).map((v) => v.name)).toEqual(['x']);
    expect(getScopeContributions({ name: 'log', data: 'x' })).toEqual([]);

    const body: INode = {
      id: 'body',
      name: 'function-body',
      data: { name: 'fn', parameters: [] },
      children: [magic, { id: 'cur', name: 'action', data: 'a + b' }],
    };
    const root = makeNode(body);
    expect(collectScopeVariables(findById(root, 'cur')).map((v) => v.name)).toEqual(['a', 'b']);
  });

  it('a magic parent is transparent: earlier outer siblings and earlier siblings inside both count', () => {
    const body: INode = {
      id: 'body',
      name: 'function-body',
      data: { name: 'fn', parameters: [{ name: 'p', type: { type: 'string' } }] },
      children: [
        numVar('o', 'outer'),
        {
          id: 'm',
          name: 'magic',
          data: { spell: 's' },
          children: [numVar('i', 'inner'), { id: 'cur', name: 'action', data: '' }],
        },
      ],
    };
    const root = makeNode(body);
    expect(collectScopeVariables(findById(root, 'cur')).map((v) => v.name)).toEqual(['p', 'outer', 'inner']);
  });

  it('magic-function-body contributes data.outerScope and is a boundary', () => {
    const outerScope = [{ name: 'o', type: { type: 'string' } }];
    expect(getContainerScopeContribution({ name: 'magic-function-body', data: { outerScope } })).toEqual(outerScope);
    const root = makeNode({
      id: 'mf',
      name: 'magic-function',
      children: [
        { id: 'h', name: 'magic-function-header', data: { spell: '' } },
        {
          id: 'b',
          name: 'magic-function-body',
          data: { outerScope },
          children: [numVar('v', 'v'), { id: 'cur', name: 'action', data: '' }],
        },
        { id: 'f', name: 'magic-function-footer' },
      ],
    });
    expect(collectScopeVariables(findById(root, 'cur')).map((v) => v.name)).toEqual(['o', 'v']);
  });
});
