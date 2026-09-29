import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileGoStatements, type IGoCompileParams } from './compile-go-statements.js';

/** `if`/`while`/labeled-loop/`switch` default-case tests for the Go target, split out of
 * `compile-go-statements.test.ts` purely to stay under `oxlint`'s `max-lines` — same split the
 * Rust/Sharp/TS targets already have (`compile-rust-statements-control-flow.test.ts`,
 * `compile-sharp-statements-control-flow.test.ts`, `compile-ts-control-flow.test.ts`). */

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

describe('compileGoStatements: if', () => {
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
    expect(code).toContain('fmt.Println("positive");');
    expect(code).toContain('} else {');
    expect(code).toContain('fmt.Println("not positive");');
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

describe('compileGoStatements: while', () => {
  it('compiles the condition as-is by default, into a condition-only for', () => {
    const node: INode = { id: 'w1', name: 'while', data: 'x > 0', children: [{ id: 'l', name: 'log', data: 'x' }] };
    expect(compile([node], { x: int32Type })).toContain('for x > 0 {');
  });

  it('compiles the condition as-is when meta.trueIsMain is false', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: false },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: int32Type })).toContain('for x > 0 {');
  });

  it('negates the condition when meta.trueIsMain is true', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: true },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: int32Type })).toContain('for !(x > 0) {');
  });
});

describe('compileGoStatements: labeled break/continue (Go has real labels, unlike the cpp target)', () => {
  it('a break with outLevel=2 through an intervening switch compiles to a labeled break, and the target loop prints its label', () => {
    const breakNode: INode = { id: 'brk', name: 'break', meta: { outLevel: 2 } };
    const switchNode: INode = {
      id: 'sw',
      name: 'switch',
      data: 'x',
      children: [{ id: 'opt1', name: 'switch-option', data: '1', children: [], out: breakNode }],
    };
    const innerFor: INode = { id: 'inner', name: 'while', data: 'cond2', children: [switchNode] };
    const outerFor: INode = { id: 'outer', name: 'while', data: 'cond1', children: [innerFor] };

    const scope = { cond1: { type: 'boolean' as const }, cond2: { type: 'boolean' as const }, x: int32Type };
    const code = compile([outerFor], scope);

    // Go's `break L1` reaches straight through the switch to the outer loop in one jump — no counter
    // bookkeeping, no per-loop "re-check and propagate" line the cpp target needs.
    expect(code).toContain('break L1;');
    expect(code).toMatch(/L1: for cond1 \{/);
    expect(code).not.toContain('L2:');
    expect(code).not.toContain('_break_level');
  });

  it('a continue with outLevel=1 inside a plain loop compiles to a labeled continue, and an unused label is never printed', () => {
    const continueNode: INode = { id: 'c', name: 'continue' };
    const inner: INode = {
      id: 'inner',
      name: 'foreach',
      data: { arr: 'items', item: 'x', index: '' },
      out: continueNode,
    };
    const code = compile([inner], { items: arrayOfInt32 });
    expect(code).toContain('continue L1;');
    expect(code).toContain('L1: for');
  });

  it('a loop with no break/continue targeting it stays unlabeled (an unused Go label is a compile error)', () => {
    const node: INode = { id: 'fe', name: 'foreach', data: { arr: 'items', item: 'item', index: '' }, children: [] };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).not.toContain('L1');
    expect(code).toContain('for _, item := range items {');
  });

  it('two sibling loops at the same nesting depth (in different switch-options) get distinct labels, not both L2', () => {
    // A real gotcha found migrating `conditions` to the Go target (ADR 0019 (private)): naming a
    // label after `loopLabels.length` (nesting depth) gives every loop at the same depth the same
    // name, regardless of which branch it's in — Go labels are scoped to the whole enclosing
    // function, not to the lexical block they're declared in, so two `L2`s in one function is a
    // `go build` error ("label L2 already defined"), even though the two loops never run together.
    const breakSelf: INode = { id: 'brk-self', name: 'break' };
    const breakOuter: INode = { id: 'brk-outer', name: 'break', meta: { outLevel: 2 } };
    const loopCase0: INode = { id: 'loop0', name: 'while', data: 'cond', out: breakSelf };
    const loopCase1: INode = { id: 'loop1', name: 'while', data: 'cond', out: breakOuter };
    const switchNode: INode = {
      id: 'sw',
      name: 'switch',
      data: 'x',
      children: [
        { id: 'opt0', name: 'switch-option', data: '0', children: [loopCase0] },
        { id: 'opt1', name: 'switch-option', data: '1', children: [loopCase1] },
      ],
    };
    const outerFor: INode = { id: 'outer', name: 'while', data: 'cond', children: [switchNode] };

    const code = compile([outerFor], { cond: { type: 'boolean' as const }, x: int32Type });

    // L1 is the outer loop, targeted by opt1's outLevel=2 break; L2 is opt0's own loop, targeted by its own break.
    expect(code).toContain('L1: for cond {');
    expect(code).toContain('L2: for cond {');
    expect((code.match(/L2:/g) ?? []).length).toBe(1);
    expect(code).toContain('break L2;');
    expect(code).toContain('break L1;');
  });
});

describe('compileGoStatements: switch default case', () => {
  it('compiles a switch-option whose data is the "default" sentinel to a plain `default:` label, and needs no fallthrough-preventing break at all (Go switch cases do not fall through)', () => {
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
    expect(code).toContain('case 0:');
    expect(code).toContain('default:');
    expect(code).not.toContain('case default');
    expect(code).not.toMatch(/break;\s*case/);
  });
});
