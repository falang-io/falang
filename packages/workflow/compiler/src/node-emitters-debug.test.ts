import type { INode } from '@falang/dto';
import { describe, expect, it } from 'vitest';
import type { IDebugEmitOptions, IDebugTraceSite } from './node-emitters.js';
import { compileStatements } from './node-emitters.js';
import { throwUnresolvedCallFunction } from './resolve-function-name.js';

/** A debug context that records every trace site and allocates dense indexes in call order. */
const testDebugOptions = (documentId = 'doc-1'): IDebugEmitOptions & { sites: IDebugTraceSite[] } => {
  const sites: IDebugTraceSite[] = [];
  let next = 0;
  return {
    documentId,
    allocateIndex: () => {
      const index = next;
      next += 1;
      return index;
    },
    onTracePoint: (site) => sites.push(site),
    sites,
  };
};

describe('compileStatements — debug instrumentation (ADR 0021 (private))', () => {
  it('is off by default: no `debug` argument emits no `__falangDebug` call', () => {
    const node: INode = { id: 'l1', name: 'log', data: 'hi' };
    expect(compileStatements([node])).toBe(
      [
        '// icon-start:log:l1',
        "__falangJournal({ kind: 'log', level: 'info', message: `hi` });",
        '// icon-end:log:l1',
      ].join('\n'),
    );
  });

  it('emits a trace call before a single statement, with an empty scope', () => {
    const debug = testDebugOptions();
    const node: INode = { id: 'l1', name: 'log', data: 'hi' };
    expect(compileStatements([node], throwUnresolvedCallFunction, {}, {}, false, debug)).toBe(
      [
        '// icon-start:log:l1',
        'await __falangDebug.trace(0, () => ({}));',
        "__falangJournal({ kind: 'log', level: 'info', message: `hi` });",
        '// icon-end:log:l1',
      ].join('\n'),
    );
    expect(debug.sites).toEqual([{ index: 0, documentId: 'doc-1', nodeId: 'l1', variables: [] }]);
  });

  it('a `create-var` does not see its own binding in its own trace point (no TDZ), but later siblings do', () => {
    const debug = testDebugOptions();
    const createVar: INode = {
      id: 'v1',
      name: 'create-var',
      data: { name: 'total', variableType: { type: 'number', numberType: { type: 'any' } } },
    };
    const log: INode = { id: 'l1', name: 'log', data: 'x' };

    expect(compileStatements([createVar, log], throwUnresolvedCallFunction, {}, {}, false, debug)).toBe(
      [
        '// icon-start:create-var:v1',
        'await __falangDebug.trace(0, () => ({}));',
        'let total: number = 0;',
        '// icon-end:create-var:v1',
        '// icon-start:log:l1',
        'await __falangDebug.trace(1, () => ({ total }));',
        "__falangJournal({ kind: 'log', level: 'info', message: `x` });",
        '// icon-end:log:l1',
      ].join('\n'),
    );
    expect(debug.sites).toEqual([
      { index: 0, documentId: 'doc-1', nodeId: 'v1', variables: [] },
      { index: 1, documentId: 'doc-1', nodeId: 'l1', variables: [{ name: 'total', type: 'number' }] },
    ]);
  });

  it("a `foreach`'s `item` is visible inside its body but not to statements after the loop", () => {
    const debug = testDebugOptions();
    const log: INode = { id: 'l1', name: 'log', data: 'x' };
    const foreachNode: INode = {
      id: 'fe1',
      name: 'foreach',
      data: { arr: 'items', item: 'x', index: '' },
      children: [log],
    };
    const after: INode = { id: 'l2', name: 'log', data: 'y' };

    const result = compileStatements([foreachNode, after], throwUnresolvedCallFunction, {}, {}, false, debug);
    expect(result).toBe(
      [
        '// icon-start:foreach:fe1',
        'await __falangDebug.trace(1, () => ({}));',
        'for (const x of items) {',
        '  // icon-start:log:l1',
        '  await __falangDebug.trace(0, () => ({ x }));',
        "  __falangJournal({ kind: 'log', level: 'info', message: `x` });",
        '  // icon-end:log:l1',
        '}',
        '// icon-end:foreach:fe1',
        '// icon-start:log:l2',
        'await __falangDebug.trace(2, () => ({}));',
        "__falangJournal({ kind: 'log', level: 'info', message: `y` });",
        '// icon-end:log:l2',
      ].join('\n'),
    );
    const byNodeId = new Map(debug.sites.map((site) => [site.nodeId, site]));
    expect(byNodeId.get('l1')?.variables).toEqual([{ name: 'x', type: 'typeof items[number]' }]);
    expect(byNodeId.get('l2')?.variables).toEqual([]);
  });

  it('nests markers for a node inside a recursive block, innermost first — index allocation order follows compilation order (children before their container), not source order', () => {
    const debug = testDebugOptions();
    const log: INode = { id: 'l1', name: 'log', data: 'x' };
    const thenChild: INode = { id: 'then', name: 'if-child', children: [log] };
    const elseChild: INode = { id: 'else', name: 'if-child', children: [] };
    const ifNode: INode = { id: 'if1', name: 'if', data: 'true', children: [thenChild, elseChild] };

    expect(compileStatements([ifNode], throwUnresolvedCallFunction, {}, {}, false, debug)).toBe(
      [
        '// icon-start:if:if1',
        'await __falangDebug.trace(1, () => ({}));',
        'if (true) {',
        '  // icon-start:log:l1',
        '  await __falangDebug.trace(0, () => ({}));',
        "  __falangJournal({ kind: 'log', level: 'info', message: `x` });",
        '  // icon-end:log:l1',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });

  it('emits both `__falangAt` and `__falangDebug.trace` when position tracking and debug are both on, position first', () => {
    const debug = testDebugOptions();
    const node: INode = { id: 'l1', name: 'log', data: 'hi' };
    expect(compileStatements([node], throwUnresolvedCallFunction, {}, {}, true, debug)).toBe(
      [
        '// icon-start:log:l1',
        '__falangAt("l1");',
        'await __falangDebug.trace(0, () => ({}));',
        "__falangJournal({ kind: 'log', level: 'info', message: `hi` });",
        '// icon-end:log:l1',
      ].join('\n'),
    );
  });
});
