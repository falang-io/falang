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

describe('compileExpression: golang target', () => {
  it('emits arithmetic and comparison operators, mapping === / !== to == / !=', () => {
    const result = compileExpression({
      expression: 'a + 1 === b && a !== 0',
      scope: { a: numberType, b: numberType },
      target: 'golang',
    });
    expect(result).toEqual({ ok: true, code: 'a + 1 == b && a != 0' });
  });

  it('reports a diagnostic (not a throw) for a ternary — Go has no conditional-expression operator', () => {
    const result = compileExpression({
      expression: 'a > 0 ? a : -a',
      scope: { a: numberType },
      target: 'golang',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('ternary'))).toBe(true);
  });

  it('escapes a string literal for Go', () => {
    const result = compileExpression({
      expression: '"hello \\"world\\""',
      scope: {},
      target: 'golang',
    });
    expect(result).toEqual({ ok: true, code: '"hello \\"world\\""' });
  });

  it('compiles a template literal via fmt.Sprint-per-interpolation concatenation', () => {
    const result = compileExpression({
      expression: '`Hello, ${name}!`',
      scope: { name: stringType },
      target: 'golang',
    });
    expect(result).toEqual({ ok: true, code: '"Hello, " + fmt.Sprint(name) + "!"' });
  });

  it('compiles a template literal with no interpolation to a plain Go string literal', () => {
    const result = compileExpression({ expression: '`hello`', scope: {}, target: 'golang' });
    expect(result).toEqual({ ok: true, code: '"hello"' });
  });

  it('maps .length on a string scope variable to the len() builtin', () => {
    const result = compileExpression({ expression: 's.length', scope: { s: stringType }, target: 'golang' });
    expect(result).toEqual({ ok: true, code: 'len(s)' });
  });

  it('maps .length on an array scope variable to the len() builtin', () => {
    const result = compileExpression({
      expression: 'items.length',
      scope: { items: stringArrayType },
      target: 'golang',
    });
    expect(result).toEqual({ ok: true, code: 'len(items)' });
  });

  it('capitalizes a struct field access, matching Go export-field naming rules', () => {
    const result = compileExpression({
      expression: 'obj.z',
      scope: { obj: objAType },
      target: 'golang',
      structNames,
      structDefinitions,
    });
    expect(result).toEqual({ ok: true, code: 'obj.Z' });
  });

  it('maps array element access (arr[index]) to Go index syntax', () => {
    const result = compileExpression({
      expression: 'items[i]',
      scope: { items: stringArrayType, i: numberType },
      target: 'golang',
    });
    expect(result).toEqual({ ok: true, code: 'items[i]' });
  });

  it('reports a diagnostic for element access on a non-array receiver', () => {
    const result = compileExpression({ expression: 's[0]', scope: { s: stringType }, target: 'golang' });
    expect(result.ok).toBe(false);
  });

  it('maps Math.pow to math.Pow', () => {
    const result = compileExpression({ expression: 'Math.pow(a, 2)', scope: { a: numberType }, target: 'golang' });
    expect(result).toEqual({ ok: true, code: 'math.Pow(a, 2)' });
  });

  it('reports a diagnostic (not a throw) for a call with no Go mapping', () => {
    const result = compileExpression({ expression: 's.charAt(0)', scope: { s: stringType }, target: 'golang' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to Go'))).toBe(true);
  });

  it('reports a diagnostic for an unsupported expression shape (array literal)', () => {
    const result = compileExpression({ expression: '[1, 2, 3]', scope: {}, target: 'golang' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to golang'))).toBe(true);
  });

  it('still type-checks before attempting to emit Go — an undeclared variable is a diagnostic', () => {
    const result = compileExpression({ expression: 'undeclaredVar + 1', scope: {}, target: 'golang' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('undeclaredVar'))).toBe(true);
  });

  describe('numeric coercion (ADR 0019 (private) follow-up: Go has no implicit int/float conversion)', () => {
    it('casts an int32 operand up to float32 when mixed with a float32 one', () => {
      const result = compileExpression({ expression: 'a + b', scope: { a: numberType, b: floatType }, target: 'golang' });
      expect(result).toEqual({ ok: true, code: 'float32(a) + b' });
    });

    it('casts the right operand instead when the float32 one is on the left', () => {
      const result = compileExpression({ expression: 'b + a', scope: { a: numberType, b: floatType }, target: 'golang' });
      expect(result).toEqual({ ok: true, code: 'b + float32(a)' });
    });

    it("propagates the promoted width through a left-associative chain — objects' own ObjCSum shape", () => {
      const result = compileExpression({
        expression: 'c.x + c.y + c.x',
        scope: { c: objCType },
        target: 'golang',
        structNames: new Map([['obj-c', 'ObjC']]),
        structDefinitions,
      });
      expect(result).toEqual({ ok: true, code: 'float32(c.X) + c.Y + float32(c.X)' });
    });

    it('adds no cast at all when both operands already share the same width', () => {
      const result = compileExpression({ expression: 'a + a', scope: { a: numberType }, target: 'golang' });
      expect(result).toEqual({ ok: true, code: 'a + a' });
    });

    it('also coerces a comparison operator, not just arithmetic ones', () => {
      const result = compileExpression({ expression: 'a < b', scope: { a: numberType, b: floatType }, target: 'golang' });
      expect(result).toEqual({ ok: true, code: 'float32(a) < b' });
    });
  });
});
