import { describe, expect, it } from 'vitest';
import { buildArrayElementTypeExpression, buildArrayTypeExpression } from './array-element-type.js';

describe('buildArrayTypeExpression', () => {
  it('returns unknown for an empty expression', () => {
    expect(buildArrayTypeExpression('')).toBe('unknown');
    expect(buildArrayTypeExpression('   ')).toBe('unknown');
  });

  it('wraps a plain identifier in typeof', () => {
    expect(buildArrayTypeExpression('someArr')).toBe('typeof someArr');
  });

  it('converts dotted property access to bracket notation', () => {
    expect(buildArrayTypeExpression('obj.arr')).toBe("typeof obj['arr']");
  });

  it('normalizes bracket indices to the number keyword', () => {
    expect(buildArrayTypeExpression('items[x + 1]')).toBe('typeof items[number]');
  });

  it('handles a mix of dynamic indices and dotted access', () => {
    expect(buildArrayTypeExpression('someobj[x + 1].someArr')).toBe("typeof someobj[number]['someArr']");
  });

  it('handles chains with multiple dots and brackets', () => {
    expect(buildArrayTypeExpression('a[0].b[i].c.d[j]')).toBe("typeof a[number]['b'][number]['c']['d'][number]");
  });
});

describe('buildArrayElementTypeExpression', () => {
  it('returns unknown for an empty expression', () => {
    expect(buildArrayElementTypeExpression('')).toBe('unknown');
  });

  it('appends a trailing [number] to peel the array type to its element type', () => {
    expect(buildArrayElementTypeExpression('someobj[x + 1].someArr')).toBe("typeof someobj[number]['someArr'][number]");
  });

  it('works for a plain array identifier', () => {
    expect(buildArrayElementTypeExpression('numbers')).toBe('typeof numbers[number]');
  });
});
