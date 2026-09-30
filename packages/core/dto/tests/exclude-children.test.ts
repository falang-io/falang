import { describe, expect, it } from 'vitest';
import * as zod from 'zod';
import { NodesGroup, NodesStack, action } from '../src';

describe('excludeChildren', () => {
  const stringType = { type: zod.string(), default: () => '' };
  const stack = new NodesStack([
    new NodesGroup([
      action('action', stringType),
      action('other', stringType),
      { name: 'box', children: true, excludeChildren: ['box'] },
      { name: 'free', children: true },
    ]),
  ]);

  it('rejects an excluded kind as a child', () => {
    expect(() =>
      stack.parseNode({ id: '1', name: 'box', children: [{ id: '2', name: 'box', children: [] }] }),
    ).toThrow();
  });

  it('accepts other kinds next to it and the excluded kind under another container', () => {
    expect(() =>
      stack.parseNode({
        id: '1',
        name: 'box',
        children: [
          { id: '2', name: 'action', data: '' },
          { id: '3', name: 'other', data: '' },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      stack.parseNode({ id: '1', name: 'free', children: [{ id: '2', name: 'box', children: [] }] }),
    ).not.toThrow();
  });
});
