import { NodesGroup, NodesStack } from '@falang/dto';
import { functionNodesGroup } from '@falang/typescript-dto';
import { describe, expect, it } from 'vitest';
import { triggerFunctionNodesGroup } from '../trigger-function/trigger-function-nodes.js';
import { magicFunctionNodesGroup, magicNodesGroup } from './magic-nodes.js';

const stack = new NodesStack([
  functionNodesGroup,
  new NodesGroup(triggerFunctionNodesGroup),
  new NodesGroup(magicNodesGroup),
]);
const popupStack = new NodesStack([new NodesGroup(magicNodesGroup), new NodesGroup(magicFunctionNodesGroup)]);

const magic = (id: string, children: unknown[] = [], extra: Record<string, unknown> = {}) => ({
  id,
  name: 'magic',
  data: { spell: 'x' },
  children,
  ...extra,
});
const action = (id: string) => ({ id, name: 'action', data: '' });
const fn = (bodyChildren: unknown[]) => ({
  id: 'doc',
  name: 'fn',
  root: {
    id: 'root',
    name: 'function',
    children: [
      { id: 'h', name: 'function-header', data: '' },
      { id: 'b', name: 'function-body', data: { parameters: [] }, children: bodyChildren },
      { id: 'f', name: 'function-footer', data: '' },
    ],
  },
});

describe('magic node kind', () => {
  it('factory makes an empty magic node', () => {
    expect(stack.factory('magic')).toMatchObject({ name: 'magic', data: { spell: '' }, children: [] });
  });

  it('parseDocument accepts a function containing an empty magic node and one with statements', () => {
    expect(() => stack.parseDocument(fn([magic('m')]))).not.toThrow();
    expect(() => stack.parseDocument(fn([magic('m', [action('a')])]))).not.toThrow();
  });

  it('rejects a magic node inside a magic node', () => {
    expect(() => stack.parseDocument(fn([magic('m', [magic('n')])]))).toThrow();
  });

  it('rejects an out on the magic first child (ADR 0035 rule)', () => {
    const ret = { id: 'r', name: 'return', data: '' };
    expect(() => stack.parseDocument(fn([magic('m', [{ ...action('a'), out: ret }])]))).toThrow();
  });

  it('accepts an out on the magic container itself when it is not its parent first child', () => {
    const ret = { id: 'r', name: 'return', data: '' };
    expect(() => stack.parseDocument(fn([action('a'), magic('m', [], { out: ret })]))).not.toThrow();
  });
});

const popup = (bodyChildren: unknown[]) => ({
  id: 'p',
  name: 'popup',
  root: {
    id: 'root',
    name: 'magic-function',
    children: [
      { id: 'h', name: 'magic-function-header', data: { spell: 's' } },
      { id: 'b', name: 'magic-function-body', data: { outerScope: [] }, children: bodyChildren },
      { id: 'f', name: 'magic-function-footer' },
    ],
  },
});

describe('magic-function popup root', () => {
  it('parses with statements in its body and factory builds a valid tree', () => {
    expect(() => popupStack.parseDocument(popup([]))).not.toThrow();
    expect(popupStack.factory('magic-function').children).toHaveLength(3);
  });

  it('rejects a nested magic node in its body', () => {
    expect(() => popupStack.parseDocument(popup([magic('m')]))).toThrow();
  });
});
