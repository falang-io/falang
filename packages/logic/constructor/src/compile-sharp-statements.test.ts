import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileSharpStatements, type ISharpCompileParams } from './compile-sharp-statements.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const float32Type: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float32' } };
const arrayOfInt32: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };
const structType: TVariableInfo = { type: 'struct', id: 'thread-objA' };

const emptyParams: ISharpCompileParams = {
  structNames: new Map(),
  structDefinitions: new Map(),
  functionSignatures: new Map(),
  apiEndpoints: new Map(),
};

const structParams: ISharpCompileParams = {
  structNames: new Map([['thread-objA', 'ObjA']]),
  structDefinitions: new Map([['thread-objA', { name: 'ObjA', properties: { x: int32Type } }]]),
  functionSignatures: new Map(),
  apiEndpoints: new Map(),
};

const compile = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>> = {},
  params = emptyParams,
  returnValue?: TVariableInfo,
): string => compileSharpStatements(nodes, scope, params, returnValue);

describe('compileSharpStatements: leaf statements', () => {
  it('compiles create-var with a value and without one, constructing reference types explicitly', () => {
    const withValue: INode = {
      id: 'a',
      name: 'create-var',
      data: { name: 'x', variableType: int32Type, value: '1 + 2' },
    };
    const withoutValue: INode = { id: 'b', name: 'create-var', data: { name: 'y', variableType: int32Type } };
    const arrayVar: INode = { id: 'c', name: 'create-var', data: { name: 'items', variableType: arrayOfInt32 } };
    expect(compile([withValue])).toContain('int x = (int)(1 + 2);');
    expect(compile([withoutValue])).toContain('int y = 0;');
    expect(compile([arrayVar])).toContain('List<int> items = new List<int>();');
  });

  it('casts a create-var initializer to its declared numeric type — C#, unlike C++, has no implicit narrowing and no float literal suffix here', () => {
    const node: INode = { id: 'a', name: 'create-var', data: { name: 'f', variableType: float32Type, value: 'x / 2' } };
    expect(compile([node], { x: float32Type })).toContain('float f = (float)(x / 2);');
  });

  it('compiles an action node (raw assignment expression) translated to C#', () => {
    const node: INode = { id: 'a', name: 'action', data: 'x = x + 1' };
    expect(compile([node], { x: int32Type })).toContain('x = x + 1;');
  });

  it('compiles a log node into a concatenated Console.WriteLine', () => {
    const node: INode = { id: 'l', name: 'log', data: 'sum is: ${x}' };
    expect(compile([node], { x: int32Type })).toContain('Console.WriteLine("sum is: " + (x));');
  });

  it('guards a log message starting with an interpolation with an empty string, so C# concatenates instead of adding numbers', () => {
    const node: INode = { id: 'l', name: 'log', data: '${x}${y}' };
    expect(compile([node], { x: int32Type, y: int32Type })).toContain('Console.WriteLine("" + (x) + (y));');
  });

  it('compiles return with and without an expression, casting to the function’s own declared return type', () => {
    expect(compile([{ id: 'r', name: 'return', data: 'x + 1' }], { x: int32Type }, emptyParams, int32Type)).toContain(
      'return (int)(x + 1);',
    );
    expect(compile([{ id: 'r', name: 'return', data: '' }])).toContain('return;');
  });

  it('compiles throw into a C# exception', () => {
    expect(compile([{ id: 't', name: 'throw', data: '"boom"' }])).toContain('throw new Exception("boom");');
  });

  it('folds create-var into scope for later statements in the same list', () => {
    const nodes: INode[] = [
      { id: 'a', name: 'create-var', data: { name: 'x', variableType: int32Type, value: '5' } },
      { id: 'b', name: 'log', data: 'x is ${x}' },
    ];
    expect(compile(nodes)).toContain('Console.WriteLine("x is " + (x));');
  });
});

describe('compileSharpStatements: call-function', () => {
  it('declares returnVariable with the callee’s C# return type and threads it into later scope', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: ['1'], returnVariable: 'sum' } },
      { id: 'l', name: 'log', data: 'sum: ${sum}' },
    ];
    const params: ISharpCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([
        ['callee', { sharpName: 'ObjASum', parameters: [{ name: 'n', type: int32Type }], returnValue: int32Type }],
      ]),
    };
    const code = compile(nodes, {}, params);
    expect(code).toContain('int sum = ObjASum((int)(1));');
    expect(code).toContain('Console.WriteLine("sum: " + (sum));');
  });

  it('deep-copies reference-typed arguments at the call site, so a callee mutating its own List/struct can never affect the caller', () => {
    const node: INode = {
      id: 'c',
      name: 'call-function',
      data: { schemeId: 'callee', parameters: ['items', 'obj'], returnVariable: '' },
    };
    const params: ISharpCompileParams = {
      ...structParams,
      functionSignatures: new Map([
        [
          'callee',
          {
            sharpName: 'Consume',
            parameters: [
              { name: 'a', type: arrayOfInt32 },
              { name: 'o', type: structType },
            ],
          },
        ],
      ]),
    };
    expect(compile([node], { items: arrayOfInt32, obj: structType }, params)).toContain(
      'Consume(new List<int>(items), (obj).Clone());',
    );
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: [], returnVariable: '' } },
    ];
    const params: ISharpCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([['callee', { sharpName: 'doSomething', parameters: [] }]]),
    };
    expect(compile(nodes, {}, params)).toContain('doSomething();');
  });
});

describe('compileSharpStatements: call-api', () => {
  const sumEndpoint = {
    apiId: 'api-1',
    apiName: 'Sum',
    name: 'NumberSum',
    parameters: [],
    returnValue: int32Type,
    documentId: 'doc-api',
    documentName: 'Api1',
  };

  it('calls through Program.<ApiName> and declares returnVariable with the endpoint’s C# return type', () => {
    const nodes: INode[] = [
      {
        id: 'c',
        name: 'call-api',
        data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: ['1'], returnVariable: 'sum' },
      },
    ];
    const params: ISharpCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', sumEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('int sum = Program.Sum.NumberSum(1);');
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const { returnValue: _unusedReturnValue, ...voidEndpoint } = sumEndpoint;
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: [], returnVariable: '' } },
    ];
    const params: ISharpCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', voidEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('Program.Sum.NumberSum();');
  });

  it('deep-copies a struct-typed argument at the call site', () => {
    const endpoint = { ...sumEndpoint, parameters: [{ name: 'a', type: structType }] };
    const nodes: INode[] = [
      {
        id: 'c',
        name: 'call-api',
        data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: ['obj'], returnVariable: '' },
      },
    ];
    const params: ISharpCompileParams = { ...structParams, apiEndpoints: new Map([['ep-1', endpoint]]) };
    expect(compile(nodes, { obj: structType }, params)).toContain('Program.Sum.NumberSum((obj).Clone());');
  });

  it('throws when iconId does not resolve to a known endpoint', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'missing', parameters: [], returnVariable: '' } },
    ];
    expect(() => compile(nodes)).toThrow(/unknown endpoint/);
  });
});

describe('compileSharpStatements: arr-* operations map onto List<T>', () => {
  it('compiles push/unshift/pop/shift', () => {
    const push: INode = { id: 'p', name: 'arr-push', data: { arr: 'items', value: '1' } };
    const unshift: INode = { id: 'u', name: 'arr-unshift', data: { arr: 'items', value: '2' } };
    const pop: INode = { id: 'o', name: 'arr-pop', data: { arr: 'items', variable: 'last' } };
    const shift: INode = { id: 's', name: 'arr-shift', data: { arr: 'items', variable: '' } };
    const scope = { items: arrayOfInt32 };
    expect(compile([push], scope)).toContain('items.Add(1);');
    expect(compile([unshift], scope)).toContain('items.Insert(0, 2);');
    expect(compile([pop], scope)).toContain('int last = items[items.Count - 1];\nitems.RemoveAt(items.Count - 1);');
    expect(compile([shift], scope)).toContain('items.RemoveAt(0);');
  });

  it('compiles arr-slice onto GetRange, converting the DSL’s half-open [start, end) range into an index + count', () => {
    const node: INode = { id: 'sl', name: 'arr-slice', data: { arr: 'items', variable: 'part', start: '1', end: '3' } };
    expect(compile([node], { items: arrayOfInt32 })).toContain('List<int> part = items.GetRange(1, (3) - (1));');
  });

  it('compiles arr-insert onto InsertRange', () => {
    const node: INode = { id: 'ins', name: 'arr-insert', data: { arr: 'items', start: '1', insertArr: 'other' } };
    expect(compile([node], { items: arrayOfInt32, other: arrayOfInt32 })).toContain('items.InsertRange(1, other);');
  });
});
