import { describe, expect, it } from 'vitest';
import { NodeStore } from '@falang/scheme';
import type { INode } from '@falang/dto';
import { collectScopeVariables } from './collect-scope-variables.js';

const makeNode = (node: INode, parent: NodeStore | null = null): NodeStore => {
  const store = new NodeStore(node);
  store.parent = parent;
  const children = (node.children ?? []).map((child) => makeNode(child, store));
  store.children.replace(children);
  return store;
};

describe('collectScopeVariables', () => {
  it('collects function parameters and create-var siblings visible from the current position', () => {
    const functionHeader: INode = {
      id: 'header',
      name: 'function-header',
    };
    const createVarX: INode = {
      id: 'x',
      name: 'create-var',
      data: { name: 'x', variableType: { type: 'number', numberType: { type: 'any' } } },
    };
    const createVarY: INode = {
      id: 'y',
      name: 'create-var',
      data: { name: 'y', variableType: { type: 'struct', id: 'struct1' } },
    };
    const currentAction: INode = { id: 'current', name: 'action', data: 'a + x + y' };
    const ifChild: INode = { id: 'if-child', name: 'if-child', children: [createVarY, currentAction] };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [createVarX, ifChild],
      data: {
        name: 'fn',
        parameters: [{ name: 'a', type: { type: 'string' } }],
      },
    };
    const functionNode: INode = { id: 'fn', name: 'function', children: [functionHeader, functionBody] };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    const ifChildStore = bodyStore?.children.find((child) => child.name === 'if-child');
    const currentStore = ifChildStore?.children.find((child) => child.name === 'action');
    if (!currentStore) throw new Error('test setup failed');

    const result = collectScopeVariables(currentStore);

    expect(result).toEqual([
      { name: 'a', type: { type: 'string', constant: true } },
      { name: 'x', type: { type: 'number', numberType: { type: 'any' } } },
      { name: 'y', type: { type: 'struct', id: 'struct1' } },
    ]);
  });

  it("exposes a non-void function-body's auto-managed returnValue local as a mutable scope variable", () => {
    const currentAction: INode = { id: 'current', name: 'action', data: 'returnValue = a' };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [currentAction],
      data: {
        parameters: [{ name: 'a', type: { type: 'number', numberType: { type: 'any' } } }],
        returnValue: { type: 'number', numberType: { type: 'any' } },
      },
    };
    const functionNode: INode = { id: 'fn', name: 'function', children: [functionBody] };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    const currentStore = bodyStore?.children.find((child) => child.name === 'action');
    if (!currentStore) throw new Error('test setup failed');

    const result = collectScopeVariables(currentStore);

    expect(result).toEqual([
      { name: 'a', type: { type: 'number', numberType: { type: 'any' }, constant: true } },
      { name: 'returnValue', type: { type: 'number', numberType: { type: 'any' }, constant: false } },
    ]);
  });

  it('exposes arr-pop/arr-shift results as raw-typed constants, and arr-slice results as raw-typed arrays', () => {
    const arrPop: INode = {
      id: 'pop',
      name: 'arr-pop',
      data: { arr: 'numbers', variable: 'popped' },
    };
    const arrShift: INode = {
      id: 'shift',
      name: 'arr-shift',
      data: { arr: 'items[i].values', variable: 'shifted' },
    };
    const arrSlice: INode = {
      id: 'slice',
      name: 'arr-slice',
      data: { arr: 'numbers', variable: 'sliced', start: '0', end: '1' },
    };
    const currentAction: INode = { id: 'current', name: 'action', data: '' };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [arrPop, arrShift, arrSlice, currentAction],
      data: { name: 'fn', parameters: [] },
    };
    const functionNode: INode = { id: 'fn', name: 'function', children: [functionBody] };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    const currentStore = bodyStore?.children.find((child) => child.name === 'action');
    if (!currentStore) throw new Error('test setup failed');

    expect(collectScopeVariables(currentStore)).toEqual([
      { name: 'popped', type: { type: 'raw', expression: 'typeof numbers[number]', constant: true } },
      {
        name: 'shifted',
        type: { type: 'raw', expression: "typeof items[number]['values'][number]", constant: true },
      },
      { name: 'sliced', type: { type: 'raw', expression: 'typeof numbers', constant: true } },
    ]);
  });

  it('exposes foreach item/index and from-to-cycle item as scope variables, nested inside a function', () => {
    const currentAction: INode = { id: 'current', name: 'action', data: '' };
    const fromToCycle: INode = {
      id: 'from-to',
      name: 'from-to-cycle',
      data: { from: '0', to: 'n', item: 'j' },
      children: [currentAction],
    };
    const foreach: INode = {
      id: 'foreach',
      name: 'foreach',
      data: { arr: 'numbers', item: 'n', index: 'i' },
      children: [fromToCycle],
    };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [foreach],
      data: { name: 'fn', parameters: [{ name: 'p', type: { type: 'string' } }] },
    };
    const functionNode: INode = { id: 'fn', name: 'function', children: [functionBody] };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    const foreachStore = bodyStore?.children.find((child) => child.name === 'foreach');
    const fromToStore = foreachStore?.children.find((child) => child.name === 'from-to-cycle');
    const currentStore = fromToStore?.children.find((child) => child.name === 'action');
    if (!currentStore) throw new Error('test setup failed');

    expect(collectScopeVariables(currentStore)).toEqual([
      { name: 'p', type: { type: 'string', constant: true } },
      { name: 'n', type: { type: 'raw', expression: 'typeof numbers[number]', constant: true } },
      { name: 'i', type: { type: 'number', numberType: { type: 'any' }, constant: true } },
      { name: 'j', type: { type: 'number', numberType: { type: 'any' }, constant: false } },
    ]);
  });

  it('omits foreach index from scope when unused, and while introduces no variable', () => {
    const currentAction: INode = { id: 'current', name: 'action', data: '' };
    const whileNode: INode = { id: 'while', name: 'while', data: 'true', children: [currentAction] };
    const foreach: INode = {
      id: 'foreach',
      name: 'foreach',
      data: { arr: 'numbers', item: 'n', index: '' },
      children: [whileNode],
    };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [foreach],
      data: { name: 'fn', parameters: [] },
    };
    const functionNode: INode = { id: 'fn', name: 'function', children: [functionBody] };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    const foreachStore = bodyStore?.children.find((child) => child.name === 'foreach');
    const whileStore = foreachStore?.children.find((child) => child.name === 'while');
    const currentStore = whileStore?.children.find((child) => child.name === 'action');
    if (!currentStore) throw new Error('test setup failed');

    expect(collectScopeVariables(currentStore)).toEqual([
      { name: 'n', type: { type: 'raw', expression: 'typeof numbers[number]', constant: true } },
    ]);
  });

  it('ignores create-var nodes declared after the current position', () => {
    const functionHeader: INode = { id: 'header', name: 'function-header' };
    const currentAction: INode = { id: 'current', name: 'action', data: '' };
    const createVarLater: INode = {
      id: 'later',
      name: 'create-var',
      data: { name: 'later', variableType: { type: 'string' } },
    };
    const functionBody: INode = {
      id: 'body',
      name: 'function-body',
      children: [currentAction, createVarLater],
      data: { name: 'fn', parameters: [] },
    };
    const functionNode: INode = { id: 'fn', name: 'function', children: [functionHeader, functionBody] };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'function-body');
    const currentStore = bodyStore?.children.find((child) => child.name === 'action');
    if (!currentStore) throw new Error('test setup failed');

    expect(collectScopeVariables(currentStore)).toEqual([]);
  });

  it("exposes a trigger-function-body's bound payload as a scope variable, and stops the walk there", () => {
    const currentAction: INode = { id: 'current', name: 'action', data: '' };
    const triggerFunctionBody: INode = {
      id: 'body',
      name: 'trigger-function-body',
      children: [currentAction],
      data: {
        vendor: 'telegram',
        triggerName: 'telegram-trigger',
        credentialId: 'cred-1',
        scopeVariableName: 'message',
        scopeType: { type: 'struct', id: 'telegram/Message' },
      },
    };
    const functionNode: INode = {
      id: 'fn',
      name: 'trigger-function',
      children: [{ id: 'header', name: 'function-header' }, triggerFunctionBody],
    };

    const functionStore = makeNode(functionNode);
    const bodyStore = functionStore.children.find((child) => child.name === 'trigger-function-body');
    const currentStore = bodyStore?.children.find((child) => child.name === 'action');
    if (!currentStore) throw new Error('test setup failed');

    expect(collectScopeVariables(currentStore)).toEqual([
      { name: 'message', type: { type: 'struct', id: 'telegram/Message', constant: true } },
    ]);
  });
});
