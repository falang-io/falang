import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileRustStatements, type IRustCompileParams } from './compile-rust-statements.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const arrayOfInt32: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };

const emptyParams: IRustCompileParams = {
  structNames: new Map(),
  structDefinitions: new Map(),
  structDocuments: new Map(),
  functionSignatures: new Map(),
  apiEndpoints: new Map(),
};

const compile = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>> = {},
  params = emptyParams,
): string => compileRustStatements(nodes, scope, params);

describe('compileRustStatements: leaf statements', () => {
  it('compiles create-var with a value and without one', () => {
    const withValue: INode = {
      id: 'a',
      name: 'create-var',
      data: { name: 'x', variableType: int32Type, value: '1 + 2' },
    };
    const withoutValue: INode = { id: 'b', name: 'create-var', data: { name: 'y', variableType: int32Type } };
    expect(compile([withValue])).toContain('let mut x: i32 = 1 + 2;');
    expect(compile([withoutValue])).toContain('let mut y: i32 = Default::default();');
  });

  it("wraps a string-typed create-var value in .to_string() — a compiled string literal is a borrowed &str, which cannot be assigned directly to the owned String this DSL's string type always compiles to (a real bug found running `arrays' TestStringArray)", () => {
    const node: INode = {
      id: 'a',
      name: 'create-var',
      data: { name: 'str', variableType: { type: 'string' }, value: '"hello"' },
    };
    expect(compile([node])).toContain('let mut str: alloc::string::String = ("hello").to_string();');
  });

  it('compiles an action node (raw assignment expression) translated to Rust', () => {
    const node: INode = { id: 'a', name: 'action', data: 'x = x + 1' };
    expect(compile([node], { x: int32Type })).toContain('x = x + 1;');
  });

  it('compiles a log node to a println! format string with {} placeholders', () => {
    const node: INode = { id: 'l', name: 'log', data: 'sum is: ${x}' };
    expect(compile([node], { x: int32Type })).toContain('println!("sum is: {}", x);');
  });

  it("doubles literal braces in a log message so they survive as literal text through println!'s own escape syntax", () => {
    const node: INode = { id: 'l', name: 'log', data: 'literal {brace} and ${x}' };
    expect(compile([node], { x: int32Type })).toContain('println!("literal {{brace}} and {}", x);');
  });

  it('compiles return with and without an expression', () => {
    expect(compile([{ id: 'r', name: 'return', data: 'x + 1' }], { x: int32Type })).toContain('return x + 1;');
    expect(compile([{ id: 'r', name: 'return', data: '' }])).toContain('return;');
  });

  it('compiles throw to a panic! call formatted with Debug', () => {
    expect(compile([{ id: 't', name: 'throw', data: '"boom"' }])).toContain('panic!("{:?}", "boom");');
  });

  it('folds create-var into scope for later statements in the same list', () => {
    const nodes: INode[] = [
      { id: 'a', name: 'create-var', data: { name: 'x', variableType: int32Type, value: '5' } },
      { id: 'b', name: 'log', data: 'x is ${x}' },
    ];
    expect(compile(nodes)).toContain('println!("x is {}", x);');
  });
});

describe('compileRustStatements: call-function', () => {
  it('declares returnVariable with a plain let, calls through the fully-qualified crate::falang::<Doc>::<fn> path, and threads _apis last', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: ['1'], returnVariable: 'sum' } },
      { id: 'l', name: 'log', data: 'sum: ${sum}' },
    ];
    const params: IRustCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([
        [
          'callee',
          {
            rustName: 'objASum',
            documentName: 'ObjASum',
            parameters: [{ name: 'n', type: int32Type }],
            returnValue: int32Type,
          },
        ],
      ]),
    };
    const code = compile(nodes, {}, params);
    expect(code).toContain('let mut sum = crate::falang::ObjASum::objASum(1, _apis);');
    expect(code).toContain('println!("sum: {}", sum);');
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: [], returnVariable: '' } },
    ];
    const params: IRustCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([
        ['callee', { rustName: 'doSomething', documentName: 'DoSomething', parameters: [] }],
      ]),
    };
    expect(compile(nodes, {}, params)).toContain('crate::falang::DoSomething::doSomething(_apis);');
  });

  it('passes array/struct-typed arguments as & references (no .clone() needed — the callee borrows) and string args still .to_string()s, while Copy-typed (number/boolean) arguments pass straight through', () => {
    const nodes: INode[] = [
      {
        id: 'c',
        name: 'call-function',
        data: { schemeId: 'callee', parameters: ['arr', 'n', 's'], returnVariable: '' },
      },
    ];
    const params: IRustCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([
        [
          'callee',
          {
            rustName: 'process',
            documentName: 'Process',
            parameters: [
              { name: 'arrParam', type: arrayOfInt32 },
              { name: 'nParam', type: int32Type },
              { name: 'sParam', type: { type: 'string' } },
            ],
          },
        ],
      ]),
    };
    const code = compile(nodes, { arr: arrayOfInt32, n: int32Type, s: { type: 'string' } }, params);
    expect(code).toContain('crate::falang::Process::process(&(arr), n, (s).to_string(), _apis);');
  });
});

describe('compileRustStatements: call-api', () => {
  const sumEndpoint = {
    apiId: 'api-1',
    apiName: 'Sum',
    name: 'NumberSum',
    parameters: [],
    returnValue: int32Type,
    documentId: 'doc-api',
    documentName: 'Api1',
  };

  it('calls through the _apis parameter (Api1_Sum_NumberSum) and declares returnVariable with a plain let', () => {
    const nodes: INode[] = [
      {
        id: 'c',
        name: 'call-api',
        data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: ['1'], returnVariable: 'sum' },
      },
    ];
    const params: IRustCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', sumEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('let mut sum = _apis.Api1_Sum_NumberSum(1);');
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const { returnValue: _unusedReturnValue, ...voidEndpoint } = sumEndpoint;
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: [], returnVariable: '' } },
    ];
    const params: IRustCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', voidEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('_apis.Api1_Sum_NumberSum();');
  });

  it('passes a struct-typed argument as a & reference (no .clone() needed) so the caller keeps its own copy', () => {
    const structType: TVariableInfo = { type: 'struct', id: 'obj-a' };
    const endpoint = { ...sumEndpoint, parameters: [{ name: 'a', type: structType }] };
    const nodes: INode[] = [
      {
        id: 'c',
        name: 'call-api',
        data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: ['obj'], returnVariable: '' },
      },
    ];
    const params: IRustCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', endpoint]]) };
    expect(compile(nodes, { obj: structType }, params)).toContain('_apis.Api1_Sum_NumberSum(&(obj));');
  });

  it('throws when iconId does not resolve to a known endpoint', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'missing', parameters: [], returnVariable: '' } },
    ];
    expect(() => compile(nodes)).toThrow(/unknown endpoint/);
  });
});

describe('compileRustStatements: if', () => {
  it('compiles then/else branches positionally, then-first by default, with no parens around the condition', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      data: 'x > 0',
      children: [
        { id: 'then', name: 'if-child', children: [{ id: 't1', name: 'log', data: 'positive' }] },
        { id: 'else', name: 'if-child', children: [{ id: 'e1', name: 'log', data: 'not positive' }] },
      ],
    };
    const code = compile([node], { x: int32Type });
    expect(code).toContain('if x > 0 {');
    expect(code).toContain('println!("positive");');
    expect(code).toContain('} else {');
    expect(code).toContain('println!("not positive");');
  });

  it('flips then/else when meta.trueOnRight is set', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      data: 'x > 0',
      meta: { trueOnRight: true },
      children: [
        { id: 'left', name: 'if-child', children: [{ id: 'l1', name: 'log', data: 'left branch' }] },
        { id: 'right', name: 'if-child', children: [{ id: 'r1', name: 'log', data: 'right branch' }] },
      ],
    };
    const code = compile([node], { x: int32Type });
    expect(code.indexOf('right branch')).toBeLessThan(code.indexOf('left branch'));
  });
});

describe('compileRustStatements: foreach over a plain array-typed identifier', () => {
  it('compiles to an index-based loop with a cloned per-iteration item binding, not a native `for x in arr.iter()` (which would bind a reference, not an owned value)', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: '' },
      children: [{ id: 'l', name: 'log', data: 'item: ${item}' }],
    };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).toContain('for item_index in 0..items.len() as i32 {');
    expect(code).toContain('let mut item: i32 = items[item_index as usize].clone();');
    expect(code).toContain('println!("item: {}", item);');
  });

  it('uses the given index name instead of a synthesized one when one is provided', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: 'i' },
      children: [{ id: 'l', name: 'log', data: 'index: ${i}' }],
    };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).toContain('for i in 0..items.len() as i32 {');
    expect(code).toContain('items[i as usize].clone()');
  });

  it('throws a clear error when arr does not resolve to an array-typed expression', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items.slice(1)', item: 'item', index: '' },
      children: [],
    };
    expect(() => compile([node], {})).toThrow(/must resolve to an array-typed expression/);
  });

  it("resolves a property-path expression (not just a plain identifier) via resolveRustArrayType — a real, load-bearing shape in the user's own example-snake project (ADR 0019 (private))", () => {
    const structId = 'thread-snake';
    const snakeType: TVariableInfo = { type: 'struct', id: structId };
    const params: IRustCompileParams = {
      ...emptyParams,
      structNames: new Map([[structId, 'Snake']]),
      structDefinitions: new Map([[structId, { name: 'Snake', properties: { body: arrayOfInt32 } }]]),
    };
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'snake.body', item: 'item', index: '' },
      children: [{ id: 'l', name: 'log', data: 'item: ${item}' }],
    };
    const code = compile([node], { snake: snakeType }, params);
    expect(code).toContain('for item_index in 0..snake.body.len() as i32 {');
    expect(code).toContain('let mut item: i32 = snake.body[item_index as usize].clone();');
  });
});
