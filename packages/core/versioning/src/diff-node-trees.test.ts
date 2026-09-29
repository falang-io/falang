import type { INode } from '@falang/dto';
import { assert, describe, it } from 'vitest';
import { diffNodeTrees } from './diff-node-trees.js';

const mkNode = (
  id: string,
  name = 'stmt',
  opts: Partial<Pick<INode, 'data' | 'meta' | 'children' | 'mods' | 'out'>> = {},
): INode => ({
  id,
  name,
  ...opts,
});

describe('diffNodeTrees', () => {
  it('reports an added subtree once at its top, but lists every descendant id', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x1')] });
    const b = mkNode('root', 'root', {
      children: [mkNode('x1'), mkNode('y1', 'stmt', { children: [mkNode('y2')] })],
    });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.addedIds.toSorted(), ['y1', 'y2']);
    assert.equal(diff.removedIds.length, 0);
    assert.isFalse(diff.isEmpty);

    const y1Change = diff.changes.find((change) => change.id === 'y1');
    const y2Change = diff.changes.find((change) => change.id === 'y2');
    assert.equal(y1Change?.kind, 'added');
    assert.isTrue(y1Change?.topLevel);
    assert.equal(y2Change?.kind, 'added');
    assert.isFalse(y2Change?.topLevel);
  });

  it('reports a removed subtree once at its top, but lists every descendant id', () => {
    const a = mkNode('root', 'root', {
      children: [mkNode('x1'), mkNode('y1', 'stmt', { children: [mkNode('y2')] })],
    });
    const b = mkNode('root', 'root', { children: [mkNode('x1')] });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.removedIds.toSorted(), ['y1', 'y2']);
    assert.equal(diff.addedIds.length, 0);

    const y1Change = diff.changes.find((change) => change.id === 'y1');
    const y2Change = diff.changes.find((change) => change.id === 'y2');
    assert.equal(y1Change?.kind, 'removed');
    assert.isTrue(y1Change?.topLevel);
    assert.equal(y2Change?.kind, 'removed');
    assert.isFalse(y2Change?.topLevel);
  });

  it('does not count a pure sibling insertion before a node as a move', () => {
    const a = mkNode('root', 'root', { children: [mkNode('c1'), mkNode('c2')] });
    const b = mkNode('root', 'root', { children: [mkNode('c0'), mkNode('c1'), mkNode('c2')] });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.movedIds, []);
    assert.deepEqual(diff.addedIds, ['c0']);
    assert.isUndefined(diff.changes.find((change) => change.id === 'c1'));
    assert.isUndefined(diff.changes.find((change) => change.id === 'c2'));
  });

  it('detects a move within one skewer (children reordered)', () => {
    const a = mkNode('root', 'root', { children: [mkNode('c1'), mkNode('c2')] });
    const b = mkNode('root', 'root', { children: [mkNode('c2'), mkNode('c1')] });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.movedIds.toSorted(), ['c1', 'c2']);
    const c1Change = diff.changes.find((change) => change.id === 'c1');
    assert.equal(c1Change?.kind, 'moved');
    assert.equal(c1Change?.move?.from.index, 0);
    assert.equal(c1Change?.move?.to.index, 1);
  });

  it('detects a move across parents', () => {
    const a = mkNode('root', 'root', {
      children: [mkNode('p1', 'stmt', { children: [mkNode('m1')] }), mkNode('p2', 'stmt', { children: [] })],
    });
    const b = mkNode('root', 'root', {
      children: [mkNode('p1', 'stmt', { children: [] }), mkNode('p2', 'stmt', { children: [mkNode('m1')] })],
    });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.movedIds, ['m1']);
    const m1Change = diff.changes.find((change) => change.id === 'm1');
    assert.equal(m1Change?.kind, 'moved');
    assert.equal(m1Change?.move?.from.parentId, 'p1');
    assert.equal(m1Change?.move?.to.parentId, 'p2');
  });

  it('detects a slot change between mods and children', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { mods: [mkNode('mod1')] })] });
    const b = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { children: [mkNode('mod1')] })] });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.movedIds, ['mod1']);
    const change = diff.changes.find((c) => c.id === 'mod1');
    assert.equal(change?.move?.from.slot, 'mods');
    assert.equal(change?.move?.to.slot, 'children');
  });

  it('detects an out-slot move from one parent to another', () => {
    const a = mkNode('root', 'root', { children: [mkNode('a', 'stmt', { out: mkNode('o1') }), mkNode('b')] });
    const b = mkNode('root', 'root', { children: [mkNode('a'), mkNode('b', 'stmt', { out: mkNode('o1') })] });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.movedIds, ['o1']);
    const change = diff.changes.find((c) => c.id === 'o1');
    assert.equal(change?.move?.from.parentId, 'a');
    assert.equal(change?.move?.to.parentId, 'b');
    assert.equal(change?.move?.from.slot, 'out');
  });

  it('reports a meta-only change as modified, with meta. paths', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { meta: { collapsed: false } })] });
    const b = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { meta: { collapsed: true } })] });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.modifiedIds, ['x']);
    const change = diff.changes.find((c) => c.id === 'x');
    assert.equal(change?.kind, 'modified');
    assert.deepEqual(change?.fields, [{ path: 'meta.collapsed', oldValue: false, newValue: true }]);
  });

  it('reports nested data field paths', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { a: { b: 1, c: 2 } } })] });
    const b = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { a: { b: 1, c: 3 } } })] });

    const diff = diffNodeTrees(a, b);

    const change = diff.changes.find((c) => c.id === 'x');
    assert.equal(change?.kind, 'modified');
    assert.deepEqual(change?.fields, [{ path: 'data.a.c', oldValue: 2, newValue: 3 }]);
  });

  it('treats an array field as a leaf, comparing by content not element key order', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { arr: [{ a: 1, b: 2 }] } })] });
    const b = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { arr: [{ b: 2, a: 1 }] } })] });

    const diff = diffNodeTrees(a, b);

    assert.isTrue(diff.isEmpty);
    assert.isUndefined(diff.changes.find((c) => c.id === 'x'));
  });

  it('reports an array element change as one field change for the whole array', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { arr: [1, 2, 3] } })] });
    const b = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { arr: [1, 2, 4] } })] });

    const diff = diffNodeTrees(a, b);

    const change = diff.changes.find((c) => c.id === 'x');
    assert.deepEqual(change?.fields, [{ path: 'data.arr', oldValue: [1, 2, 3], newValue: [1, 2, 4] }]);
  });

  it('reports a replaced name as a removed + added pair for the same id', () => {
    const a = mkNode('root', 'root', { children: [mkNode('n1', 'foo')] });
    const b = mkNode('root', 'root', { children: [mkNode('n1', 'bar')] });

    const diff = diffNodeTrees(a, b);

    assert.deepEqual(diff.removedIds, ['n1']);
    assert.deepEqual(diff.addedIds, ['n1']);
    const removed = diff.changes.find((c) => c.id === 'n1' && c.kind === 'removed');
    const added = diff.changes.find((c) => c.id === 'n1' && c.kind === 'added');
    assert.equal(removed?.name, 'foo');
    assert.equal(added?.name, 'bar');
  });

  it('is empty for identical trees', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { a: 1 }, meta: { m: 1 } })] });
    const b = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { a: 1 }, meta: { m: 1 } })] });

    const diff = diffNodeTrees(a, b);

    assert.isTrue(diff.isEmpty);
    assert.deepEqual(diff.changes, []);
  });

  it('is empty when both sides are null', () => {
    assert.isTrue(diffNodeTrees(null, null).isEmpty);
  });

  it('treats a key-order-only difference in data as not modified', () => {
    const a = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { a: 1, b: 2 } })] });
    const b = mkNode('root', 'root', { children: [mkNode('x', 'stmt', { data: { b: 2, a: 1 } })] });

    const diff = diffNodeTrees(a, b);

    assert.isTrue(diff.isEmpty);
  });
});
