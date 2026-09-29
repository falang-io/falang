import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileSharpStatements, type ISharpCompileParams } from './compile-sharp-statements.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
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

/**
 * The control-flow half of `compile-sharp-statements.test.ts` (`if`/`foreach`/`switch` and the
 * multi-level break/continue bookkeeping), split into its own file purely to stay under oxlint's
 * `max-lines` — same split the Rust target already has
 * (`compile-rust-statements-control-flow.test.ts`).
 */

describe('compileSharpStatements: control flow', () => {
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
    expect(code).toContain('} else {');
  });

  it('compiles foreach into an index-based loop over .Count, copying each element into the item variable', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: '' },
      children: [{ id: 'l', name: 'log', data: 'item: ${item}' }],
    };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).toContain('for (int item_index = 0; item_index < items.Count; item_index++) {');
    expect(code).toContain('int item = items[item_index];');
  });

  it('clones a struct-typed foreach element, since C# would otherwise bind item to the list’s own element', () => {
    const arrayOfStructs: TVariableInfo = { type: 'array', elementType: structType, dimensions: 1 };
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'objects', item: 'obj', index: 'i' },
      children: [{ id: 'a', name: 'action', data: 'obj.x = 1' }],
    };
    expect(compile([node], { objects: arrayOfStructs }, structParams)).toContain('ObjA obj = (objects[i]).Clone();');
  });

  it('throws a clear error when a foreach arr is not a plain array-typed identifier already in scope', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items.slice(1)', item: 'item', index: '' },
      children: [],
    };
    expect(() => compile([node], {})).toThrow(/must be a plain array-typed identifier/);
  });
});

describe('compileSharpStatements: while', () => {
  it('compiles the condition as-is by default', () => {
    const node: INode = { id: 'w1', name: 'while', data: 'x > 0', children: [{ id: 'l', name: 'log', data: 'x' }] };
    expect(compile([node], { x: int32Type })).toContain('while (x > 0) {');
  });

  it('compiles the condition as-is when meta.trueIsMain is false', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: false },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: int32Type })).toContain('while (x > 0) {');
  });

  it('negates the condition when meta.trueIsMain is true', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: true },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: int32Type })).toContain('while (!(x > 0)) {');
  });
});

describe('compileSharpStatements: switch', () => {
  it('compiles the "default" sentinel to a plain default: label, not `case default:`', () => {
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

  it('terminates every case section with a break — mandatory in C# (CS0163), not just fallthrough prevention as in C++', () => {
    const node: INode = {
      id: 'sw',
      name: 'switch',
      data: 'x',
      children: [{ id: 'opt0', name: 'switch-option', data: '0', children: [{ id: 'l0', name: 'log', data: 'zero' }] }],
    };
    // The `break;` closes the case section itself, after the option body's own icon-end marker line.
    expect(compile([node], { x: int32Type })).toMatch(/\/\/ icon-end:log:l0\n {4}break;\n {2}}/);
  });

  it('does not double the break when a case option’s own .out is already a break node', () => {
    // The switch sits inside a loop because a `break` node always targets a *loop* in this DSL (see
    // `cycle-info.ts`'s `crossesSwitchToTarget`, shared with the cpp target) — an outLevel=1 break with
    // no enclosing loop at all is rejected up front, on every target, not just this one.
    const node: INode = {
      id: 'loop',
      name: 'while',
      data: 'cond',
      children: [
        {
          id: 'sw',
          name: 'switch',
          data: 'x',
          children: [
            {
              id: 'opt0',
              name: 'switch-option',
              data: '0',
              children: [{ id: 'l0', name: 'log', data: 'zero' }],
              out: { id: 'brk', name: 'break' },
            },
          ],
        },
      ],
    };
    const code = compile([node], { x: int32Type, cond: { type: 'boolean' } });
    // The option's own `break;` (plus the `_switch_break` flag, since a level-1 break inside a switch
    // still has to escape the enclosing loop) is the case section's terminator — `buildCaseContent`
    // must not append a second, dead one right after it.
    expect(code).not.toMatch(/break;\n\s*break;/);
    expect(code).toContain('if (_switch_break) { break; }');
  });
});

describe('compileSharpStatements: multi-level break/continue through a nested switch', () => {
  it('uses the same _break_level/_switch_break bookkeeping as the cpp target — C# has no labeled break either, unlike Go/Rust', () => {
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

    expect(code).toContain('_break_level = 1;\n        _switch_break = true;\n        break;');
    expect(code).toMatch(/_switch_break = false;\n\s*switch \(x\)/);
    expect(code).toMatch(/}\n\s*if \(_switch_break\) \{ break; \}/);
    expect(code).toMatch(/while \(cond2\) \{[\s\S]*}\n {2}if \(_break_level > 0\) \{ _break_level--; break; }/);
    expect(code.match(/_break_level > 0/g)).toHaveLength(1);
    // Never Go's/Rust's label mechanism.
    expect(code).not.toContain('break L');
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
