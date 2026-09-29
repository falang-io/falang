import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileCppStatements, type ICppCompileParams } from './compile-cpp-statements.js';
import { cppAdapter } from './languages/cpp-adapter.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const arrayOfInt32: TVariableInfo = { type: 'array', elementType: int32Type, dimensions: 1 };

const emptyParams: ICppCompileParams = {
  structNames: new Map(),
  structDefinitions: new Map(),
  functionSignatures: new Map(),
  adapter: cppAdapter,
  apiEndpoints: new Map(),
};

const compile = (
  nodes: readonly INode[],
  scope: Readonly<Record<string, TVariableInfo>> = {},
  params = emptyParams,
): string => compileCppStatements(nodes, scope, params);

describe('compileCppStatements: leaf statements', () => {
  it('compiles create-var with a value and without one', () => {
    const withValue: INode = {
      id: 'a',
      name: 'create-var',
      data: { name: 'x', variableType: int32Type, value: '1 + 2' },
    };
    const withoutValue: INode = { id: 'b', name: 'create-var', data: { name: 'y', variableType: int32Type } };
    expect(compile([withValue])).toContain('int x = 1 + 2;');
    expect(compile([withoutValue])).toContain('int y{};');
  });

  it('compiles an action node (raw assignment expression) translated to C++', () => {
    const node: INode = { id: 'a', name: 'action', data: 'x = x + 1' };
    expect(compile([node], { x: int32Type })).toContain('x = x + 1;');
  });

  it('compiles a log node, splitting literal text and ${...} interpolations', () => {
    const node: INode = { id: 'l', name: 'log', data: 'sum is: ${x}' };
    expect(compile([node], { x: int32Type })).toContain('std::cout << "sum is: " << x << std::endl;');
  });

  it('compiles return with and without an expression', () => {
    expect(compile([{ id: 'r', name: 'return', data: 'x + 1' }], { x: int32Type })).toContain('return x + 1;');
    expect(compile([{ id: 'r', name: 'return', data: '' }])).toContain('return;');
  });

  it('folds create-var into scope for later statements in the same list', () => {
    const nodes: INode[] = [
      { id: 'a', name: 'create-var', data: { name: 'x', variableType: int32Type, value: '5' } },
      { id: 'b', name: 'log', data: 'x is ${x}' },
    ];
    expect(compile(nodes)).toContain('std::cout << "x is " << x << std::endl;');
  });
});

describe('compileCppStatements: call-function', () => {
  it('declares returnVariable with the callee’s C++ return type and threads it into later scope', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: ['1'], returnVariable: 'sum' } },
      { id: 'l', name: 'log', data: 'sum: ${sum}' },
    ];
    const params: ICppCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([['callee', { cppName: 'ObjASum', returnValue: int32Type }]]),
    };
    const code = compile(nodes, {}, params);
    expect(code).toContain('int sum = ObjASum(1);');
    expect(code).toContain('std::cout << "sum: " << sum << std::endl;');
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-function', data: { schemeId: 'callee', parameters: [], returnVariable: '' } },
    ];
    const params: ICppCompileParams = {
      ...emptyParams,
      functionSignatures: new Map([['callee', { cppName: 'doSomething' }]]),
    };
    expect(compile(nodes, {}, params)).toContain('doSomething();');
  });
});

describe('compileCppStatements: call-api', () => {
  const sumEndpoint = {
    apiId: 'api-1',
    apiName: 'Sum',
    name: 'NumberSum',
    parameters: [],
    returnValue: int32Type,
    documentId: 'doc-api',
    documentName: 'Api1',
  };

  it('calls through the global API pointer and declares returnVariable with the endpoint’s return type', () => {
    const nodes: INode[] = [
      {
        id: 'c',
        name: 'call-api',
        data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: ['1'], returnVariable: 'sum' },
      },
    ];
    const params: ICppCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', sumEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('int sum = (*g_Sum).NumberSum(1);');
  });

  it('omits the declaration entirely when returnVariable is blank', () => {
    const { returnValue: _unusedReturnValue, ...voidEndpoint } = sumEndpoint;
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'ep-1', parameters: [], returnVariable: '' } },
    ];
    const params: ICppCompileParams = { ...emptyParams, apiEndpoints: new Map([['ep-1', voidEndpoint]]) };
    expect(compile(nodes, {}, params)).toContain('(*g_Sum).NumberSum();');
  });

  it('throws when iconId does not resolve to a known endpoint', () => {
    const nodes: INode[] = [
      { id: 'c', name: 'call-api', data: { schemeId: 'doc-1', iconId: 'missing', parameters: [], returnVariable: '' } },
    ];
    expect(() => compile(nodes)).toThrow(/unknown endpoint/);
  });
});

describe('compileCppStatements: if', () => {
  it('compiles then/else branches positionally, then-first by default', () => {
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
    expect(code).toContain('if (x > 0) {');
    expect(code).toContain('std::cout << "positive" << std::endl;');
    expect(code).toContain('} else {');
    expect(code).toContain('std::cout << "not positive" << std::endl;');
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
    // "right" is the then-branch, so its body appears right after the `if (...) {` line.
    expect(code.indexOf('right branch')).toBeLessThan(code.indexOf('left branch'));
  });
});

describe('compileCppStatements: while', () => {
  it('compiles the condition as-is by default', () => {
    const node: INode = { id: 'w1', name: 'while', data: 'x > 0', children: [{ id: 'l1', name: 'log', data: 'x' }] };
    const code = compile([node], { x: int32Type });
    expect(code).toContain('while (x > 0) {');
  });

  it('compiles the condition as-is when meta.trueIsMain is false', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: false },
      children: [{ id: 'l1', name: 'log', data: 'x' }],
    };
    const code = compile([node], { x: int32Type });
    expect(code).toContain('while (x > 0) {');
  });

  it('negates the condition when meta.trueIsMain is true', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: true },
      children: [{ id: 'l1', name: 'log', data: 'x' }],
    };
    const code = compile([node], { x: int32Type });
    expect(code).toContain('while (!(x > 0)) {');
  });
});

describe('compileCppStatements: foreach over a plain array-typed identifier', () => {
  it('declares the loop counter and element variable and compiles the body against them', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: '' },
      children: [{ id: 'l', name: 'log', data: 'item: ${item}' }],
    };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).toContain('for (int item_index = 0; item_index < static_cast<int>(items.size()); item_index++) {');
    expect(code).toContain('int item = items[item_index];');
    expect(code).toContain('std::cout << "item: " << item << std::endl;');
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

describe('compileCppStatements: multi-level break/continue through a nested switch', () => {
  it('propagates a break with outLevel=2 out through an intervening switch and one loop level, using the _break_level/_switch_break bookkeeping mechanism (C++ has no labeled break unlike the TS target)', () => {
    const breakNode: INode = { id: 'brk', name: 'break', meta: { outLevel: 2 } };
    const switchNode: INode = {
      id: 'sw',
      name: 'switch',
      data: 'x',
      children: [{ id: 'opt1', name: 'switch-option', data: '1', children: [], out: breakNode }],
    };
    const innerWhile: INode = { id: 'inner', name: 'while', data: 'cond2', children: [switchNode] };
    const outerWhile: INode = { id: 'outer', name: 'while', data: 'cond1', children: [innerWhile] };

    const scope = { cond1: { type: 'boolean' as const }, cond2: { type: 'boolean' as const }, x: int32Type };
    const code = compile([outerWhile], scope);

    // The break sets the level counter (outLevel - 1) and the switch-escape flag, then does a native break.
    expect(code).toContain('_break_level = 1;\n        _switch_break = true;\n        break;');
    // The switch resets the flag before itself and checks it right after its own closing brace.
    expect(code).toMatch(/_switch_break = false;\n\s*switch \(x\)/);
    expect(code).toMatch(/}\n\s*if \(_switch_break\) \{ break; \}/);
    // The inner while (nested inside the outer one) re-checks the counter right after its own closing
    // brace so the break keeps propagating outward; the outer while has no such check (nothing above it).
    expect(code).toMatch(/while \(cond2\) \{[\s\S]*}\n {2}if \(_break_level > 0\) \{ _break_level--; break; }/);
    expect(code.match(/_break_level > 0/g)).toHaveLength(1);
  });

  it('a continue with outLevel=1 inside a plain nested loop compiles to a bare native continue', () => {
    const continueNode: INode = { id: 'c', name: 'continue' };
    const inner: INode = {
      id: 'inner',
      name: 'foreach',
      data: { arr: 'items', item: 'x', index: '' },
      out: continueNode,
    };
    const code = compile([inner], { items: arrayOfInt32 });
    expect(code).toContain('continue;');
    expect(code).not.toContain('_continue_level');
  });
});

describe('compileCppStatements: switch default case', () => {
  it('compiles a switch-option whose data is the "default" sentinel to a plain `default:` label, not `case default:`', () => {
    const node: INode = {
      id: 'sw',
      name: 'switch',
      data: 'x',
      children: [
        { id: 'opt0', name: 'switch-option', data: '0', children: [{ id: 'l0', name: 'log', data: 'zero' }] },
        { id: 'optd', name: 'switch-option', data: 'default', children: [{ id: 'ld', name: 'log', data: 'other' }] },
      ],
    };
    const code = compile([node], { x: int32Type });
    expect(code).toContain('case 0: {');
    expect(code).toContain('default: {');
    expect(code).not.toContain('case default');
  });
});
