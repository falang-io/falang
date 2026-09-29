import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { compileExpression } from './compile-expression.js';

const numberType: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
const stringType: TVariableInfo = { type: 'string' };
const stringArrayType: TVariableInfo = { type: 'array', elementType: { type: 'string' }, dimensions: 1 };

describe('compileExpression: cpp target', () => {
  it('emits arithmetic and comparison operators, mapping === / !== to == / !=', () => {
    const result = compileExpression({
      expression: 'a + 1 === b && a !== 0',
      scope: { a: numberType, b: numberType },
      target: 'cpp',
    });
    expect(result).toEqual({ ok: true, code: 'a + 1 == b && a != 0' });
  });

  it('emits a ternary conditional as-is', () => {
    const result = compileExpression({
      expression: 'a > 0 ? a : -a',
      scope: { a: numberType },
      target: 'cpp',
    });
    expect(result).toEqual({ ok: true, code: 'a > 0 ? a : -a' });
  });

  it('escapes a string literal for C++', () => {
    const result = compileExpression({
      expression: '"hello \\"world\\""',
      scope: {},
      target: 'cpp',
    });
    expect(result).toEqual({ ok: true, code: '"hello \\"world\\""' });
  });

  it('compiles a template literal into a std::ostringstream-based std::string expression', () => {
    const result = compileExpression({
      expression: '`Hello, ${name}!`',
      scope: { name: stringType },
      target: 'cpp',
    });
    expect(result).toEqual({
      ok: true,
      code: '([&]{ std::ostringstream _oss; _oss << "Hello, " << name << "!"; return _oss.str(); }())',
    });
  });

  it('compiles a template literal with no interpolation the same way', () => {
    const result = compileExpression({ expression: '`hello`', scope: {}, target: 'cpp' });
    expect(result).toEqual({ ok: true, code: '([&]{ std::ostringstream _oss; _oss << "hello"; return _oss.str(); }())' });
  });

  it('maps .length on a string scope variable to .size()', () => {
    const result = compileExpression({ expression: 's.length', scope: { s: stringType }, target: 'cpp' });
    expect(result).toEqual({ ok: true, code: 's.size()' });
  });

  it('maps .length on an array scope variable to .size()', () => {
    const result = compileExpression({ expression: 'items.length', scope: { items: stringArrayType }, target: 'cpp' });
    expect(result).toEqual({ ok: true, code: 'items.size()' });
  });

  it('maps array element access (arr[index]) to C++ operator[]', () => {
    const result = compileExpression({
      expression: 'items[i]',
      scope: { items: stringArrayType, i: numberType },
      target: 'cpp',
    });
    expect(result).toEqual({ ok: true, code: 'items[i]' });
  });

  it('reports a diagnostic for element access on a non-array receiver', () => {
    const result = compileExpression({ expression: 's[0]', scope: { s: stringType }, target: 'cpp' });
    expect(result.ok).toBe(false);
  });

  it('maps Math.pow to std::pow', () => {
    const result = compileExpression({ expression: 'Math.pow(a, 2)', scope: { a: numberType }, target: 'cpp' });
    expect(result).toEqual({ ok: true, code: 'std::pow(a, 2)' });
  });

  it('reports a diagnostic (not a throw) for a call with no C++ mapping', () => {
    const result = compileExpression({ expression: 's.charAt(0)', scope: { s: stringType }, target: 'cpp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to C++'))).toBe(true);
  });

  it('reports a diagnostic for an argument expression shape with no mapping at all (arrow function)', () => {
    const result = compileExpression({
      expression: 'items.filter((x) => x.length > 0)',
      scope: { items: stringArrayType },
      target: 'cpp',
    });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to cpp'))).toBe(true);
  });

  it('reports a diagnostic for a property with no C++ mapping', () => {
    const result = compileExpression({ expression: 's.toUpperCase', scope: { s: stringType }, target: 'cpp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('toUpperCase'))).toBe(true);
  });

  it('reports a diagnostic for an unsupported expression shape (array literal)', () => {
    const result = compileExpression({ expression: '[1, 2, 3]', scope: {}, target: 'cpp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('not portable to cpp'))).toBe(true);
  });

  it('still type-checks before attempting to emit C++ — an undeclared variable is a diagnostic', () => {
    const result = compileExpression({ expression: 'undeclaredVar + 1', scope: {}, target: 'cpp' });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.diagnostics.some((d) => d.includes('undeclaredVar'))).toBe(true);
  });
});
