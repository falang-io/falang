import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileExpression } from './compile-expression.js';
import type { IStructDefinition } from './struct-definition.js';

const numberType: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const floatType: TVariableInfo = { type: 'number', numberType: { type: 'float', floatType: 'float32' } };
const stringType: TVariableInfo = { type: 'string' };
const stringArrayType: TVariableInfo = { type: 'array', elementType: { type: 'string' }, dimensions: 1 };
const objAType: TVariableInfo = { type: 'struct', id: 'obj-a' };
const objCType: TVariableInfo = { type: 'struct', id: 'obj-c' };
const structNames = new Map([['obj-a', 'ObjA']]);
const structDefinitions = new Map<string, IStructDefinition>([
  ['obj-a', { name: 'ObjA', properties: { z: numberType } }],
  ['obj-c', { name: 'ObjC', properties: { x: numberType, y: floatType } }],
]);

describe('compileExpression: rust target', () => {
  it('emits arithmetic and comparison operators, mapping === / !== to == / !=', () => {
    const result = compileExpression({
      expression: 'a + 1 === b && a !== 0',
      scope: { a: numberType, b: numberType },
      target: 'rust',
    });
    expect(result).toEqual({ ok: true, code: 'a + 1 == b && a != 0' });
  });

  it('emits a ternary as a Rust if-expression — Rust has no ?: operator but if is expression-valued', () => {
    const result = compileExpression({
      expression: 'a > 0 ? a : -a',
      scope: { a: numberType },
      target: 'rust',
    });
    expect(result).toEqual({ ok: true, code: 'if a > 0 { a } else { -a }' });
  });

  it('wraps the RHS of a plain assignment into a string-typed left-hand side with .to_string()', () => {
    const result = compileExpression({ expression: 'a = "x"', scope: { a: stringType }, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 'a = ("x").to_string()' });
  });

  it('compiles a template literal into a format! macro call', () => {
    const result = compileExpression({
      expression: '`Hello, ${name}!`',
      scope: { name: stringType },
      target: 'rust',
    });
    expect(result).toEqual({ ok: true, code: 'format!("Hello, {}!", name)' });
  });

  it('compiles a template literal with no interpolation to a bare format! call, escaping literal braces', () => {
    const result = compileExpression({ expression: '`a {b}`', scope: {}, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 'format!("a {{b}}")' });
  });

  it('leaves a non-string assignment unwrapped', () => {
    const result = compileExpression({ expression: 'a = 1', scope: { a: numberType }, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 'a = 1' });
  });

  it('wraps the RHS of a struct/array-typed plain assignment in .clone() — a real gap found compiling the user\'s own example-snake project (ADR 0019 (private)\'s "Rust target — old-app layout"), since a struct/array-typed RHS may be a borrowed function parameter or a local read again later', () => {
    const structResult = compileExpression({
      expression: 'a = b',
      scope: { a: objAType, b: objAType },
      target: 'rust',
      structNames,
      structDefinitions,
    });
    expect(structResult).toEqual({ ok: true, code: 'a = (b).clone()' });

    const arrayResult = compileExpression({
      expression: 'a = b',
      scope: { a: stringArrayType, b: stringArrayType },
      target: 'rust',
    });
    expect(arrayResult).toEqual({ ok: true, code: 'a = (b).clone()' });
  });

  it('reports a diagnostic (not a throw) for unary plus — Rust has no unary + operator', () => {
    const result = compileExpression({ expression: '+a', scope: { a: numberType }, target: 'rust' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to Rust'))).toBe(true);
  });

  it('preserves a numeric literal exactly as spelled (.0), not the TypeScript-normalized value', () => {
    // Regression test for a real bug found migrating MonteCarlo (ADR 0019 (private)): TypeScript's
    // own `ts.NumericLiteral.text` normalizes `5.0` down to `"5"`, silently dropping exactly the
    // formatting that makes a literal a *float*-literal token in Rust (which has no implicit
    // int-literal-to-float conversion, unlike every other target this compiler supports).
    const result = compileExpression({ expression: 'a = 5.0', scope: { a: numberType }, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 'a = 5.0' });
  });

  it('escapes a string literal for Rust', () => {
    const result = compileExpression({
      expression: '"hello \\"world\\""',
      scope: {},
      target: 'rust',
    });
    expect(result).toEqual({ ok: true, code: '"hello \\"world\\""' });
  });

  it('maps .length on a string scope variable to .len()', () => {
    const result = compileExpression({ expression: 's.length', scope: { s: stringType }, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 's.len()' });
  });

  it('maps .length on an array scope variable to .len()', () => {
    const result = compileExpression({ expression: 'items.length', scope: { items: stringArrayType }, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 'items.len()' });
  });

  it('leaves a struct field access unchanged, unlike Go — Rust has no export-capitalization rule', () => {
    const result = compileExpression({
      expression: 'obj.z',
      scope: { obj: objAType },
      target: 'rust',
      structNames,
      structDefinitions,
    });
    expect(result).toEqual({ ok: true, code: 'obj.z' });
  });

  it('maps array element access (arr[index]) to Rust index syntax with an explicit `as usize` cast', () => {
    const result = compileExpression({
      expression: 'items[i]',
      scope: { items: stringArrayType, i: numberType },
      target: 'rust',
    });
    expect(result).toEqual({ ok: true, code: 'items[i as usize]' });
  });

  it('reports a diagnostic for element access on a non-array receiver', () => {
    const result = compileExpression({ expression: 's[0]', scope: { s: stringType }, target: 'rust' });
    expect(result.ok).toBe(false);
  });

  it('maps Math.pow to the f64 .powf() method', () => {
    const result = compileExpression({ expression: 'Math.pow(a, 2)', scope: { a: numberType }, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 'a.powf(2 as f64)' });
  });

  it('reports a diagnostic (not a throw) for a call with no Rust mapping', () => {
    const result = compileExpression({ expression: 's.charAt(0)', scope: { s: stringType }, target: 'rust' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to Rust'))).toBe(true);
  });

  it('emits a TS array literal as alloc::vec![...], with every element wrapped in .clone() (always correct, and needed for a real "borrow of moved value" case a real cargo build found — see languages/rust-adapter.ts) — needed by the user\'s own example-snake project (ADR 0019 (private)\'s "Rust target — old-app layout")', () => {
    const result = compileExpression({ expression: '[1, 2, 3]', scope: {}, target: 'rust' });
    expect(result).toEqual({ ok: true, code: 'alloc::vec![(1).clone(), (2).clone(), (3).clone()]' });
  });

  it('still type-checks before attempting to emit Rust — an undeclared variable is a diagnostic', () => {
    const result = compileExpression({ expression: 'undeclaredVar + 1', scope: {}, target: 'rust' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('undeclaredVar'))).toBe(true);
  });

  describe('numeric coercion (ADR 0019 (private) follow-up: Rust has no implicit int/float conversion)', () => {
    it('casts an int32 operand up to f32 when mixed with an f32 one', () => {
      const result = compileExpression({ expression: 'a + b', scope: { a: numberType, b: floatType }, target: 'rust' });
      expect(result).toEqual({ ok: true, code: '(a) as f32 + b' });
    });

    it('casts the right operand instead when the f32 one is on the left', () => {
      const result = compileExpression({ expression: 'b + a', scope: { a: numberType, b: floatType }, target: 'rust' });
      expect(result).toEqual({ ok: true, code: 'b + (a) as f32' });
    });

    it("propagates the promoted width through a left-associative chain — objects' own ObjCSum shape", () => {
      const result = compileExpression({
        expression: 'c.x + c.y + c.x',
        scope: { c: objCType },
        target: 'rust',
        structNames: new Map([['obj-c', 'ObjC']]),
        structDefinitions,
      });
      expect(result).toEqual({ ok: true, code: '(c.x) as f32 + c.y + (c.x) as f32' });
    });

    it('adds no cast at all when both operands already share the same width', () => {
      const result = compileExpression({ expression: 'a + a', scope: { a: numberType }, target: 'rust' });
      expect(result).toEqual({ ok: true, code: 'a + a' });
    });

    it('also coerces a comparison operator, not just arithmetic ones', () => {
      const result = compileExpression({ expression: 'a < b', scope: { a: numberType, b: floatType }, target: 'rust' });
      expect(result).toEqual({ ok: true, code: '(a) as f32 < b' });
    });
  });
});
