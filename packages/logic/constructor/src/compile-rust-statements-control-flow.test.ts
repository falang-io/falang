import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileRustStatements, type IRustCompileParams } from './compile-rust-statements.js';

/** `switch`/`match` and labeled-loop tests for the Rust target, split out of `compile-rust-statements.test.ts` purely to stay under `oxlint`'s `max-lines` — same reasoning `arrays-project-builders.ts` documents for its own split. */

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

describe('compileRustStatements: while', () => {
  it('compiles the condition as-is by default, with no parens', () => {
    const node: INode = { id: 'w1', name: 'while', data: 'x > 0', children: [{ id: 'l', name: 'log', data: 'x' }] };
    expect(compile([node], { x: int32Type })).toContain('while x > 0 {');
  });

  it('compiles the condition as-is when meta.trueIsMain is false', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: false },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: int32Type })).toContain('while x > 0 {');
  });

  it('negates the condition when meta.trueIsMain is true', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: true },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: int32Type })).toContain('while !(x > 0) {');
  });
});

describe('compileRustStatements: labeled break/continue (Rust has real labels, like the Go target and unlike cpp)', () => {
  it('a break with outLevel=2 through an intervening switch/match compiles to a labeled break, and the target loop prints its label', () => {
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

    // Rust's `break 'L1` reaches straight through the match to the outer loop in one jump — no
    // counter bookkeeping, no per-loop "re-check and propagate" line the cpp target needs.
    expect(code).toContain("break 'L1;");
    expect(code).toMatch(/'L1: while cond1 \{/);
    expect(code).not.toContain('L2:');
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
    expect(code).toContain("continue 'L1;");
    expect(code).toMatch(/'L1: for x_index in 0\.\.items\.len\(\) as i32 \{/);
  });

  it('a loop with no break/continue targeting it stays unlabeled', () => {
    const node: INode = { id: 'fe', name: 'foreach', data: { arr: 'items', item: 'item', index: '' }, children: [] };
    const code = compile([node], { items: arrayOfInt32 });
    expect(code).not.toContain('L1');
    expect(code).toContain('for item_index in 0..items.len() as i32 {');
  });

  it('two sibling loops at the same nesting depth (in different switch-options) get distinct labels, not both L2', () => {
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
    expect(code).toContain("'L1: while cond {");
    expect(code).toContain("'L2: while cond {");
    expect((code.match(/'L2:/g) ?? []).length).toBe(1);
    expect(code).toContain("break 'L2;");
    expect(code).toContain("break 'L1;");
  });
});

describe('compileRustStatements: switch/match exhaustiveness', () => {
  it('compiles a switch-option whose data is the "default" sentinel to Rust\'s own wildcard pattern `_`', () => {
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
    expect(code).toContain('0 => {');
    expect(code).toContain('_ => {');
    expect((code.match(/_ =>/g) ?? []).length).toBe(1);
  });

  it("synthesizes a wildcard `_ => {}` fallback when the DSL gives no default option at all — required for Rust's match to compile (unlike cpp/Go switch, which need no default), since a match over an arbitrary integer with no wildcard is a hard 'non-exhaustive patterns' error", () => {
    const node: INode = {
      id: 'sw',
      name: 'switch',
      data: 'x',
      children: [{ id: 'opt0', name: 'switch-option', data: '0', children: [{ id: 'l0', name: 'log', data: 'zero' }] }],
    };
    const code = compile([node], { x: int32Type });
    expect(code).toContain('0 => {');
    expect(code).toContain('_ => {},');
  });

  it("always emits the default/wildcard arm last, even when the DSL lists it first — a real bug found running `conditions`' TestNestedSwitch: Rust match arms are evaluated in order, so a `_` arm listed before `0 => ...` would swallow every value and make the specific arm dead code, unlike a cpp/Go switch where a default's textual position never matters", () => {
    const node: INode = {
      id: 'sw',
      name: 'switch',
      data: 'x',
      children: [
        { id: 'optd', name: 'switch-option', data: 'default', children: [{ id: 'ld', name: 'log', data: 'other' }] },
        { id: 'opt0', name: 'switch-option', data: '0', children: [{ id: 'l0', name: 'log', data: 'zero' }] },
      ],
    };
    const code = compile([node], { x: int32Type });
    expect(code.indexOf('0 => {')).toBeLessThan(code.indexOf('_ => {'));
  });
});
