import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileTsStatements, type ITsCompileParams } from './compile-ts-statements.js';

const numberType: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const structType = (id: string): TVariableInfo => ({ type: 'struct', id });

const emptyParams: ITsCompileParams = {
  structNames: new Map(),
  structDefinitions: new Map(),
  functionSignatures: new Map(),
  apiEndpoints: new Map(),
};

const compile = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>> = {},
  params = emptyParams,
): string => compileTsStatements(nodes, scope, params);

describe('compileTsStatements: leaf statements', () => {
  it('compiles create-var with a value and without one', () => {
    const withValue: INode = {
      id: 'a',
      name: 'create-var',
      data: { name: 'x', variableType: numberType, value: '1 + 2' },
    };
    const withoutValue: INode = { id: 'b', name: 'create-var', data: { name: 'y', variableType: numberType } };
    expect(compile([withValue])).toContain('let x: number = 1 + 2;');
    expect(compile([withoutValue])).toContain('let y: number = 0;');
  });

  it('fills every field recursively for a struct create-var with no value', () => {
    const params: ITsCompileParams = {
      ...emptyParams,
      structNames: new Map([['point', 'Point']]),
      structDefinitions: new Map([['point', { name: 'Point', properties: { x: numberType, y: numberType } }]]),
    };
    const node: INode = { id: 'a', name: 'create-var', data: { name: 'p', variableType: structType('point') } };
    expect(compile([node], {}, params)).toContain('let p: Point = {x:0,y:0};');
  });

  it('compiles an action node (raw assignment expression) verbatim', () => {
    const node: INode = { id: 'a', name: 'action', data: 'x = x + 1' };
    expect(compile([node], { x: numberType })).toContain('x = x + 1;');
  });

  it('compiles a log node into a template literal', () => {
    const node: INode = { id: 'l', name: 'log', data: 'sum is: ${x}' };
    expect(compile([node], { x: numberType })).toContain('console.log(`sum is: ${x}`);');
  });

  it('compiles return with and without an expression', () => {
    expect(compile([{ id: 'r', name: 'return', data: 'x + 1' }], { x: numberType })).toContain('return x + 1;');
    expect(compile([{ id: 'r', name: 'return', data: '' }])).toContain('return;');
  });

  it('compiles throw to `throw new Error(...)`', () => {
    expect(compile([{ id: 't', name: 'throw', data: '"boom"' }])).toContain('throw new Error("boom");');
  });

  it('folds create-var into scope for later statements in the same list', () => {
    const nodes: INode[] = [
      { id: 'a', name: 'create-var', data: { name: 'x', variableType: numberType, value: '5' } },
      { id: 'b', name: 'log', data: 'x is ${x}' },
    ];
    expect(compile(nodes)).toContain('console.log(`x is ${x}`);');
  });
});

describe('compileTsStatements: call-function', () => {
  it('builds a single keyed-object call, zipping positional arguments to the callee’s own parameter names, plus _falangGlobal', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: ['1', 'x'], returnVariable: 'sum' } },
      { id: 'l', name: 'log', data: 'sum: ${sum}' },
    ];
    const params: ITsCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([
        [
          'callee',
          {
            tsName: 'objASum',
            parameters: [
              { name: 'a', type: numberType },
              { name: 'b', type: numberType },
            ],
            returnValue: numberType,
          },
        ],
      ]),
    };
    const code = compile(nodes, { x: numberType }, params);
    expect(code).toContain('let sum: number = await objASum({ a: 1, b: x, _falangGlobal });');
    expect(code).toContain('console.log(`sum: ${sum}`);');
  });

  it('omits the declaration entirely when returnVariable is blank, and passes an empty-args call as just { _falangGlobal }', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: [], returnVariable: '' } },
    ];
    const params: ITsCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([['callee', { tsName: 'doSomething', parameters: [] }]]),
    };
    expect(compile(nodes, {}, params)).toContain('await doSomething({ _falangGlobal });');
  });

  it('throws when the returnVariable is set but the callee returns void', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: [], returnVariable: 'x' } },
    ];
    const params: ITsCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([
        ['callee', { tsName: 'doSomething', parameters: [], returnValue: { type: 'void' } }],
      ]),
    };
    expect(() => compile(nodes, {}, params)).toThrow(/returns void/);
  });
});

describe('compileTsStatements: call-api', () => {
  const sumEndpoint = {
    apiDocName: 'MathApi',
    groupId: 'group-1',
    groupName: 'Sum',
    name: 'NumberSum',
    parameters: [],
    returnValue: numberType,
  };

  it('calls through the three-level _falangGlobal.apis.<ApiDoc>.<Group>.<Endpoint> path', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { iconId: 'ep-1', parameters: [], returnVariable: 'sum' } },
    ];
    const params: ITsCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', sumEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain(
      'let sum: number = await _falangGlobal.apis.MathApi.Sum.NumberSum({ });',
    );
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const { returnValue: _unusedReturnValue, ...voidEndpoint } = sumEndpoint;
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { iconId: 'ep-1', parameters: [], returnVariable: '' } },
    ];
    const params: ITsCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', voidEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('await _falangGlobal.apis.MathApi.Sum.NumberSum({ });');
  });

  it('throws when iconId does not resolve to a known endpoint', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { iconId: 'missing', parameters: [], returnVariable: '' } },
    ];
    expect(() => compile(nodes)).toThrow(/unknown endpoint/);
  });
});

// `if`/`switch`/loop/`arr-*`/compile-error coverage lives in `compile-ts-control-flow.test.ts` — split
// out purely to stay under `oxlint`'s `max-lines` (same rationale as
// `compile-ts-project.test-fixtures.ts`'s own split).
