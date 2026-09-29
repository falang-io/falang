import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import { preserveMeta } from './preserve-meta.js';

describe('preserveMeta', () => {
  it('copies old meta onto a surviving node with no own meta', () => {
    const oldRoot: INode = { id: 'root', name: 'function', meta: { x: 1 } };
    const newRoot: INode = { id: 'root', name: 'function' };
    expect(preserveMeta(oldRoot, newRoot)).toEqual({ id: 'root', name: 'function', meta: { x: 1 } });
  });

  it('keeps a node`s own meta instead of the old one', () => {
    const oldRoot: INode = { id: 'root', name: 'function', meta: { x: 1 } };
    const newRoot: INode = { id: 'root', name: 'function', meta: { y: 2 } };
    expect(preserveMeta(oldRoot, newRoot)).toEqual({ id: 'root', name: 'function', meta: { y: 2 } });
  });

  it('leaves a newly-added node (unknown id) without meta', () => {
    const oldRoot: INode = { id: 'root', name: 'function', meta: { x: 1 } };
    const newRoot: INode = { id: 'new-node', name: 'function' };
    expect(preserveMeta(oldRoot, newRoot)).toEqual({ id: 'new-node', name: 'function' });
  });

  it('recurses into children, restoring meta per surviving child and dropping removed ones', () => {
    const oldRoot: INode = {
      id: 'root',
      name: 'function-body',
      meta: { root: true },
      children: [
        { id: 'a', name: 'action', meta: { pos: 'a' } },
        { id: 'b', name: 'action', meta: { pos: 'b' } },
      ],
    };
    const newRoot: INode = {
      id: 'root',
      name: 'function-body',
      children: [
        { id: 'a', name: 'action' },
        { id: 'c', name: 'action' },
      ],
    };
    expect(preserveMeta(oldRoot, newRoot)).toEqual({
      id: 'root',
      name: 'function-body',
      meta: { root: true },
      children: [
        { id: 'a', name: 'action', meta: { pos: 'a' } },
        { id: 'c', name: 'action' },
      ],
    });
  });

  it('recurses into `out`, restoring meta on a surviving out-node', () => {
    const oldRoot: INode = {
      id: 'root',
      name: 'if-child',
      out: { id: 'out-1', name: 'return', meta: { shape: 'diamond' } },
    };
    const newRoot: INode = {
      id: 'root',
      name: 'if-child',
      out: { id: 'out-1', name: 'return' },
    };
    expect(preserveMeta(oldRoot, newRoot)).toEqual({
      id: 'root',
      name: 'if-child',
      out: { id: 'out-1', name: 'return', meta: { shape: 'diamond' } },
    });
  });

  it('recurses into `mods`, restoring meta on a surviving mod', () => {
    const oldRoot: INode = {
      id: 'root',
      name: 'action',
      mods: [{ id: 'mod-1', name: 'mod1', meta: { color: 'red' } }],
    };
    const newRoot: INode = {
      id: 'root',
      name: 'action',
      mods: [{ id: 'mod-1', name: 'mod1' }],
    };
    expect(preserveMeta(oldRoot, newRoot)).toEqual({
      id: 'root',
      name: 'action',
      mods: [{ id: 'mod-1', name: 'mod1', meta: { color: 'red' } }],
    });
  });

  it('is pure — never mutates either input', () => {
    const oldRoot: INode = { id: 'root', name: 'function', meta: { x: 1 }, children: [{ id: 'a', name: 'action' }] };
    const newRoot: INode = { id: 'root', name: 'function', children: [{ id: 'a', name: 'action' }] };
    const oldSnapshot = structuredClone(oldRoot);
    const newSnapshot = structuredClone(newRoot);
    preserveMeta(oldRoot, newRoot);
    expect(oldRoot).toEqual(oldSnapshot);
    expect(newRoot).toEqual(newSnapshot);
  });
});
