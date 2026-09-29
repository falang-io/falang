import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileTsStatements, type ITsCompileParams } from './compile-ts-statements.js';

/**
 * `if`/`switch`/loop/`arr-*` coverage for the TS target's statement compiler — split out from
 * `compile-ts-statements.test.ts` purely to stay under `oxlint`'s `max-lines` (same rationale as
 * `compile-ts-project.test-fixtures.ts`'s own split).
 */
const numberType: TVariableInfo = { type: 'number', numberType: { type: 'any' } };
const arrayOfNumber: TVariableInfo = { type: 'array', elementType: numberType, dimensions: 1 };

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

describe('compileTsStatements: if/switch', () => {
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
    const code = compile([node], { x: numberType });
    expect(code).toContain('if (x > 0) {');
    expect(code).toContain('console.log(`positive`);');
    expect(code).toContain('} else {');
    expect(code).toContain('console.log(`not positive`);');
  });

  it('flips then/else when meta.trueOnRight is set', () => {
    const node: INode = {
      id: 'if1',
      name: 'if',
      data: 'x > 0',
      meta: { trueOnRight: true },
      children: [
        { id: 'first', name: 'if-child', children: [{ id: 'a', name: 'log', data: 'else-branch' }] },
        { id: 'second', name: 'if-child', children: [{ id: 'b', name: 'log', data: 'then-branch' }] },
      ],
    };
    const code = compile([node], { x: numberType });
    expect(code.indexOf('then-branch')).toBeLessThan(code.indexOf('else-branch'));
  });

  it('wraps every case body in its own block and appends an unlabeled break to prevent fallthrough', () => {
    const node: INode = {
      id: 'sw1',
      name: 'switch',
      data: 'x',
      children: [
        { id: 'case1', name: 'switch-option', data: '1', children: [{ id: 'l1', name: 'log', data: 'one' }] },
        { id: 'def', name: 'switch-option', data: 'default', children: [{ id: 'l2', name: 'log', data: 'other' }] },
      ],
    };
    const code = compile([node], { x: numberType });
    expect(code).toContain('switch (x) {');
    expect(code).toContain('case 1: {');
    expect(code).toContain('default: {');
    expect(code.match(/break;/g)).toHaveLength(2);
  });
});

describe('compileTsStatements: while', () => {
  it('compiles the condition as-is by default', () => {
    const node: INode = { id: 'w1', name: 'while', data: 'x > 0', children: [{ id: 'l', name: 'log', data: 'x' }] };
    expect(compile([node], { x: numberType })).toContain('while (x > 0) {');
  });

  it('compiles the condition as-is when meta.trueIsMain is false', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: false },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: numberType })).toContain('while (x > 0) {');
  });

  it('negates the condition when meta.trueIsMain is true', () => {
    const node: INode = {
      id: 'w1',
      name: 'while',
      data: 'x > 0',
      meta: { trueIsMain: true },
      children: [{ id: 'l', name: 'log', data: 'x' }],
    };
    expect(compile([node], { x: numberType })).toContain('while (!(x > 0)) {');
  });
});

describe('compileTsStatements: multi-level break/continue use real labels', () => {
  it('labels an outer loop only when a nested break/continue actually targets it', () => {
    const inner: INode = {
      id: 'inner',
      name: 'while',
      data: 'true',
      children: [{ id: 'b', name: 'break', meta: { outLevel: 2 }, data: null } as unknown as INode],
    };
    const outer: INode = { id: 'outer', name: 'while', data: 'true', children: [inner] };
    const code = compile([outer]);
    expect(code).toMatch(/L1: while \(true\) \{/);
    expect(code).toContain('break L1;');
  });

  it('leaves an unused loop label out entirely', () => {
    const node: INode = { id: 'w', name: 'while', data: 'true', children: [{ id: 'l', name: 'log', data: 'x' }] };
    const code = compile([node]);
    expect(code).not.toContain('L1:');
    expect(code).toContain('while (true) {');
  });

  it('continue on the outer pseudo-cycle re-runs its body instead of falling through the trailing break — the real getNewFoodPoint retry pattern (ADR 0019 (private))', () => {
    const foreachContinue: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'body', item: 'item', index: '' },
      children: [{ id: 'ic', name: 'continue', meta: { outLevel: 2 }, data: null } as unknown as INode],
    };
    const pseudo: INode = {
      id: 'pc',
      name: 'pseudo-cycle',
      children: [foreachContinue, { id: 'l', name: 'log', data: 'picked' }],
    };
    const code = compile([pseudo], { body: arrayOfNumber });
    expect(code).toMatch(/L1: for \(;;\) \{/);
    expect(code).toContain('continue L1;');
    expect(code).toContain('break;');
  });
});

describe('compileTsStatements: foreach/from-to-cycle', () => {
  it('compiles foreach with an explicit index as a manual counting loop', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: 'i' },
      children: [{ id: 'l', name: 'log', data: 'item: ${item}, i: ${i}' }],
    };
    const code = compile([node], { items: arrayOfNumber });
    expect(code).toContain('for (let i = 0; i < items.length; i++) {');
    expect(code).toContain('let item: number = items[i];');
  });

  it('mints a synthetic index name when the DSL index field is blank', () => {
    const node: INode = {
      id: 'fe',
      name: 'foreach',
      data: { arr: 'items', item: 'item', index: '' },
      children: [{ id: 'l', name: 'log', data: 'item: ${item}' }],
    };
    const code = compile([node], { items: arrayOfNumber });
    expect(code).toMatch(/for \(let __i\d+ = 0; __i\d+ < items\.length; __i\d+\+\+\) \{/);
  });

  it('compiles from-to-cycle without needing any numeric cast (unlike the Go target)', () => {
    const node: INode = {
      id: 'ftc',
      name: 'from-to-cycle',
      data: { from: '0', to: '9', item: 'i' },
      children: [{ id: 'l', name: 'log', data: 'i: ${i}' }],
    };
    expect(compile([node])).toContain('for (let i = 0; i <= 9; i++) {');
  });
});

describe('compileTsStatements: arr-* operations', () => {
  it('compiles push/unshift/insert/pop/shift/slice to native Array methods', () => {
    const scope = { arr: arrayOfNumber };
    expect(compile([{ id: '1', name: 'arr-push', data: { arr: 'arr', value: '1' } }], scope)).toContain('arr.push(1);');
    expect(compile([{ id: '2', name: 'arr-unshift', data: { arr: 'arr', value: '1' } }], scope)).toContain(
      'arr.unshift(1);',
    );
    expect(
      compile([{ id: '3', name: 'arr-insert', data: { arr: 'arr', start: '0', insertArr: 'arr' } }], scope),
    ).toContain('arr.splice(0, 0, ...arr);');
    expect(compile([{ id: '4', name: 'arr-pop', data: { arr: 'arr', variable: 'x' } }], scope)).toContain(
      'let x: number = arr.pop()!;',
    );
    expect(compile([{ id: '5', name: 'arr-shift', data: { arr: 'arr', variable: 'x' } }], scope)).toContain(
      'let x: number = arr.shift()!;',
    );
    expect(
      compile([{ id: '6', name: 'arr-slice', data: { arr: 'arr', variable: 'x', start: '0', end: '1' } }], scope),
    ).toContain('let x: number[] = arr.slice(0, 1);');
  });
});

describe("compileTsStatements: collects a per-node compile error, mirroring the Go target's own posture", () => {
  it('wraps a non-NodeCompileError thrown mid-compile into a NodeCompileError pointing at the offending node', () => {
    expect(() => compile([{ id: 'x', name: 'unknown-node-kind' } as unknown as INode])).toThrow(
      /No TS compiler emitter registered/,
    );
  });
});
