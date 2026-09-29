import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileExpression } from './compile-expression.js';
import type { IStructDefinition } from './struct-definition.js';

const numberType: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const stringType: TVariableInfo = { type: 'string' };
const stringArrayType: TVariableInfo = { type: 'array', elementType: { type: 'string' }, dimensions: 1 };
const objAType: TVariableInfo = { type: 'struct', id: 'obj-a' };
const structNames = new Map([['obj-a', 'ObjA']]);
const structDefinitions = new Map<string, IStructDefinition>([
  ['obj-a', { name: 'ObjA', properties: { z: numberType } }],
]);

describe('compileExpression: sharp (C#) target', () => {
  it('emits arithmetic and comparison operators, mapping === / !== to == / !=', () => {
    const result = compileExpression({
      expression: 'a + 1 === b && a !== 0',
      scope: { a: numberType, b: numberType },
      target: 'sharp',
    });
    expect(result).toEqual({ ok: true, code: 'a + 1 == b && a != 0' });
  });

  it('emits a ternary conditional as-is — C# has a native ?: operator', () => {
    const result = compileExpression({
      expression: 'a > 0 ? a : -a',
      scope: { a: numberType },
      target: 'sharp',
    });
    expect(result).toEqual({ ok: true, code: 'a > 0 ? a : -a' });
  });

  it('escapes a string literal for C#', () => {
    const result = compileExpression({
      expression: '"hello \\"world\\""',
      scope: {},
      target: 'sharp',
    });
    expect(result).toEqual({ ok: true, code: '"hello \\"world\\""' });
  });

  it('compiles a template literal into a "" + (…) + "…" concatenation chain', () => {
    const result = compileExpression({
      expression: '`Hello, ${name}!`',
      scope: { name: stringType },
      target: 'sharp',
    });
    expect(result).toEqual({ ok: true, code: '"Hello, " + (name) + "!"' });
  });

  it('guards a leading interpolation with a "" so + resolves to string concatenation, not numeric addition', () => {
    const result = compileExpression({
      expression: '`${a}!`',
      scope: { a: numberType },
      target: 'sharp',
    });
    expect(result).toEqual({ ok: true, code: '"" + (a) + "!"' });
  });

  it('compiles a template literal with no interpolation to a plain C# string literal', () => {
    const result = compileExpression({ expression: '`hello`', scope: {}, target: 'sharp' });
    expect(result).toEqual({ ok: true, code: '"hello"' });
  });

  it('maps .length on a string scope variable to .Length', () => {
    const result = compileExpression({ expression: 's.length', scope: { s: stringType }, target: 'sharp' });
    expect(result).toEqual({ ok: true, code: 's.Length' });
  });

  it('maps .length on an array scope variable to .Count — arrays render as List<T>', () => {
    const result = compileExpression({
      expression: 'items.length',
      scope: { items: stringArrayType },
      target: 'sharp',
    });
    expect(result).toEqual({ ok: true, code: 'items.Count' });
  });

  it('leaves a struct field access unchanged — C# needs no export-capitalization rule, unlike Go', () => {
    const result = compileExpression({
      expression: 'obj.z',
      scope: { obj: objAType },
      target: 'sharp',
      structNames,
      structDefinitions,
    });
    expect(result).toEqual({ ok: true, code: 'obj.z' });
  });

  it('maps array element access (arr[index]) to C# indexer syntax', () => {
    const result = compileExpression({
      expression: 'items[i]',
      scope: { items: stringArrayType, i: numberType },
      target: 'sharp',
    });
    expect(result).toEqual({ ok: true, code: 'items[i]' });
  });

  it('reports a diagnostic for element access on a non-array receiver', () => {
    const result = compileExpression({ expression: 's[0]', scope: { s: stringType }, target: 'sharp' });
    expect(result.ok).toBe(false);
  });

  it('maps Math.pow to Math.Pow', () => {
    const result = compileExpression({ expression: 'Math.pow(a, 2)', scope: { a: numberType }, target: 'sharp' });
    expect(result).toEqual({ ok: true, code: 'Math.Pow(a, 2)' });
  });

  it('maps Math.ceil to Math.Ceiling, not Math.Ceil', () => {
    const result = compileExpression({ expression: 'Math.ceil(a)', scope: { a: numberType }, target: 'sharp' });
    expect(result).toEqual({ ok: true, code: 'Math.Ceiling(a)' });
  });

  it('reports a diagnostic (not a throw) for a call with no C# mapping', () => {
    const result = compileExpression({ expression: 's.charAt(0)', scope: { s: stringType }, target: 'sharp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to C#'))).toBe(true);
  });

  it('reports a diagnostic for an unsupported expression shape (array literal)', () => {
    const result = compileExpression({ expression: '[1, 2, 3]', scope: {}, target: 'sharp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to sharp'))).toBe(true);
  });

  it('still type-checks before attempting to emit C# — an undeclared variable is a diagnostic', () => {
    const result = compileExpression({ expression: 'undeclaredVar + 1', scope: {}, target: 'sharp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('undeclaredVar'))).toBe(true);
  });
});
