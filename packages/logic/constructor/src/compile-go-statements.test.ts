import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileGoStatements, type IGoCompileParams } from './compile-go-statements.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const arrayOfInt32: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };

const emptyParams: IGoCompileParams = {
  structNames: new Map(),
  structDefinitions: new Map(),
  functionSignatures: new Map(),
  apiEndpoints: new Map(),
};

const compile = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>> = {},
  params = emptyParams,
): string => compileGoStatements(nodes, scope, params);

describe('compileGoStatements: leaf statements', () => {
  it('compiles create-var with a value and without one', () => {
    const withValue: INode = {
      id: 'a',
      name: 'create-var',
      data: { name: 'x', variableType: int32Type, value: '1 + 2' },
    };
    const withoutValue: INode = { id: 'b', name: 'create-var', data: { name: 'y', variableType: int32Type } };
    expect(compile([withValue])).toContain('var x int32 = 1 + 2;');
    expect(compile([withoutValue])).toContain('var y int32;');
  });

  it('compiles an action node (raw assignment expression) translated to Go', () => {
    const node: INode = { id: 'a', name: 'action', data: 'x = x + 1' };
    expect(compile([node], { x: int32Type })).toContain('x = x + 1;');
  });

  it('compiles a log node, wrapping interpolated segments in fmt.Sprint and concatenating with +', () => {
    const node: INode = { id: 'l', name: 'log', data: 'sum is: ${x}' };
    expect(compile([node], { x: int32Type })).toContain('fmt.Println("sum is: " + fmt.Sprint(x));');
  });

  it('compiles return with and without an expression', () => {
    expect(compile([{ id: 'r', name: 'return', data: 'x + 1' }], { x: int32Type })).toContain('return x + 1;');
    expect(compile([{ id: 'r', name: 'return', data: '' }])).toContain('return;');
  });

  it('compiles throw to a panic call', () => {
    expect(compile([{ id: 't', name: 'throw', data: '"boom"' }])).toContain('panic("boom");');
  });

  it('folds create-var into scope for later statements in the same list', () => {
    const nodes: INode[] = [
      { id: 'a', name: 'create-var', data: { name: 'x', variableType: int32Type, value: '5' } },
      { id: 'b', name: 'log', data: 'x is ${x}' },
    ];
    expect(compile(nodes)).toContain('fmt.Println("x is " + fmt.Sprint(x));');
  });
});

describe('compileGoStatements: call-function', () => {
  it('declares returnVariable with := and threads it into later scope', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: ['1'], returnVariable: 'sum' } },
      { id: 'l', name: 'log', data: 'sum: ${sum}' },
    ];
    const params: IGoCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([['callee', { goName: 'objASum', returnValue: int32Type }]]),
    };
    const code = compile(nodes, {}, params);
    expect(code).toContain('sum := objASum(1);');
    expect(code).toContain('fmt.Println("sum: " + fmt.Sprint(sum));');
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: [], returnVariable: '' } },
    ];
    const params: IGoCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([['callee', { goName: 'doSomething' }]]),
    };
    expect(compile(nodes, {}, params)).toContain('doSomething();');
  });
});

describe('compileGoStatements: call-api', () => {
  const sumEndpoint = {
    apiId: 'api-1',
    apiName: 'Sum',
    name: 'NumberSum',
    parameters: [],
    returnValue: int32Type,
    documentId: 'doc-api',
    documentName: 'Api1',
  };

  it('calls through the package-level API variable and declares returnVariable with :=', () => {
    const nodes: INode[] = [
      {
        id: 'c',
        name: 'call-api',
        data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: ['1'], returnVariable: 'sum' },
      },
    ];
    const params: IGoCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', sumEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('sum := GSum.NumberSum(1);');
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const { returnValue: _unusedReturnValue, ...voidEndpoint } = sumEndpoint;
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: [], returnVariable: '' } },
    ];
    const params: IGoCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', voidEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('GSum.NumberSum();');
  });

  it('throws when iconId does not resolve to a known endpoint', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'missing', parameters: [], returnVariable: '' } },
    ];
    expect(() => compile(nodes)).toThrow(/unknown endpoint/);
  });
});

describe('compileGoStatements: foreach over a plain array-typed identifier', () => {
  it('compiles to a native range loop, with no manual index-counter bookkeeping', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: '' },
      children: [{ id: 'l', name: 'log', data: 'item: ${item}' }],
    };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).toContain('for _, item := range items {');
    expect(code).toContain('fmt.Println("item: " + fmt.Sprint(item));');
  });

  it('uses the given index name instead of the blank identifier when one is provided', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: 'i' },
      children: [{ id: 'l', name: 'log', data: 'index: ${i}' }],
    };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).toContain('for i, item := range items {');
  });

  it('throws a clear error when arr is not a plain array-typed identifier already in scope', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items.slice(1)', item: 'item', index: '' },
      children: [],
    };
    expect(() => compile([node], {})).toThrow(/must be a plain array-typed identifier/);
  });
});
