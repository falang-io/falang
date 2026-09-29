import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import type { IDebugTracePoint } from '@falang/debug';
import { computeCycleInfo } from './cycle-info.js';
import { compileStatementList } from './compile-cpp-statements.js';
import type { ICppCompileParams, IDebugCompileOptions, ITraceEmitter } from './compile-cpp-statements.js';
import { compileCppFunction } from './compile-cpp-function.js';
import { cppAdapter } from './languages/cpp-adapter.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

const emptyParams: ICppCompileParams = {
  structNames: new Map(),
  structDefinitions: new Map(),
  functionSignatures: new Map(),
  adapter: cppAdapter,
  apiEndpoints: new Map(),
};

/** A tracer that emits an easy-to-read placeholder line, so tests assert on shape (index/scope threading), not a real target's own wire format — `falang-debug-header.ts`'s own tests cover the real Arduino text. */
const fakeTracer: ITraceEmitter = {
  emitTrace: (node, index, scope) => `TRACE(${index}, ${JSON.stringify(Object.keys(scope))});`,
  emitEnter: () => 'ENTER();',
  emitLeave: () => 'LEAVE();',
};

const testDebugOptions = (documentId = 'doc-1'): IDebugCompileOptions & { sites: IDebugTracePoint[] } => {
  const sites: IDebugTracePoint[] = [];
  let next = 0;
  return {
    tracer: fakeTracer,
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

const compile = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>> = {},
  debug?: IDebugCompileOptions,
): string =>
  compileStatementList(nodes, { scope, nesting: [], cycleInfo: computeCycleInfo(nodes), params: emptyParams, debug });

describe('compileStatementList — debug instrumentation (ADR 0021 (private) §4/§6)', () => {
  it('is off by default: no `debug` in ctx emits no trace call', () => {
    const node: INode = { id: 'l1', name: 'log', data: 'hi' };
    expect(compile([node])).toBe(
      ['// icon-start:log:l1', 'std::cout << "hi" << std::endl;', '// icon-end:log:l1'].join('\n'),
    );
  });

  it('emits a trace call before a single statement, with an empty scope', () => {
    const debug = testDebugOptions();
    const node: INode = { id: 'l1', name: 'log', data: 'hi' };
    expect(compile([node], {}, debug)).toBe(
      ['// icon-start:log:l1', 'TRACE(0, []);', 'std::cout << "hi" << std::endl;', '// icon-end:log:l1'].join('\n'),
    );
    expect(debug.sites).toEqual([{ index: 0, documentId: 'doc-1', nodeId: 'l1', variables: [] }]);
  });

  it('a `create-var` does not see its own binding in its own trace point (no TDZ), but later siblings do', () => {
    const debug = testDebugOptions();
    const createVar: INode = { id: 'v1', name: 'create-var', data: { name: 'total', variableType: int32Type } };
    const log: INode = { id: 'l1', name: 'log', data: 'x' };

    expect(compile([createVar, log], {}, debug)).toBe(
      [
        '// icon-start:create-var:v1',
        'TRACE(0, []);',
        'int total{};',
        '// icon-end:create-var:v1',
        '// icon-start:log:l1',
        'TRACE(1, ["total"]);',
        'std::cout << "x" << std::endl;',
        '// icon-end:log:l1',
      ].join('\n'),
    );
    expect(debug.sites).toEqual([
      { index: 0, documentId: 'doc-1', nodeId: 'v1', variables: [] },
      { index: 1, documentId: 'doc-1', nodeId: 'l1', variables: [{ name: 'total', type: 'int' }] },
    ]);
  });

  it('nests markers for a node inside a recursive block, innermost first — index allocation order follows compilation order (children before their container), not source order', () => {
    const debug = testDebugOptions();
    const log: INode = { id: 'l1', name: 'log', data: 'x' };
    const thenChild: INode = { id: 'then', name: 'if-child', children: [log] };
    const elseChild: INode = { id: 'else', name: 'if-child', children: [] };
    const ifNode: INode = { id: 'if1', name: 'if', data: 'true', children: [thenChild, elseChild] };

    expect(compile([ifNode], {}, debug)).toBe(
      [
        '// icon-start:if:if1',
        'TRACE(1, []);',
        'if (true) {',
        '  // icon-start:log:l1',
        '  TRACE(0, []);',
        '  std::cout << "x" << std::endl;',
        '  // icon-end:log:l1',
        '}',
        '// icon-end:if:if1',
      ].join('\n'),
    );
  });
});

describe('compileCppFunction — debug enter/leave (ADR 0021 (private) §4)', () => {
  const functionNode: INode = {
    id: 'fn1',
    name: 'function',
    children: [
      { id: 'fn1-header', name: 'function-header', data: '' },
      {
        id: 'fn1-body',
        name: 'function-body',
        data: { parameters: [] },
        children: [{ id: 'l1', name: 'log', data: 'hi' }],
      },
      { id: 'fn1-footer', name: 'function-footer', data: '' },
    ],
  };

  it('is byte-identical to a pre-debug compile when `debug` is omitted', () => {
    expect(compileCppFunction(functionNode, 'doIt', emptyParams)).toBe(
      [
        'void doIt() {',
        '  // icon-start:log:l1',
        '  std::cout << "hi" << std::endl;',
        '  // icon-end:log:l1',
        '}',
      ].join('\n'),
    );
  });

  it('brackets the body with emitEnter/emitLeave and traces the one statement', () => {
    const debug = testDebugOptions();
    expect(compileCppFunction(functionNode, 'doIt', emptyParams, debug)).toBe(
      [
        'void doIt() {',
        '  ENTER();',
        '  // icon-start:log:l1',
        '  TRACE(0, []);',
        '  std::cout << "hi" << std::endl;',
        '  // icon-end:log:l1',
        '  LEAVE();',
        '}',
      ].join('\n'),
    );
  });
});
