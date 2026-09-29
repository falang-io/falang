import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { variableInfoToGoType } from './golang-type-name.js';

describe('variableInfoToGoType', () => {
  it('renders primitives', () => {
    expect(variableInfoToGoType({ type: 'string' }, new Map())).toBe('string');
    expect(variableInfoToGoType({ type: 'boolean' }, new Map())).toBe('bool');
    expect(variableInfoToGoType({ type: 'void' }, new Map())).toBe('void');
  });

  it('renders integer/float number types', () => {
    expect(
      variableInfoToGoType({ type: 'number', numberType: { type: 'integer', integerType: 'int32' } }, new Map()),
    ).toBe('int32');
    expect(
      variableInfoToGoType({ type: 'number', numberType: { type: 'integer', integerType: 'int64' } }, new Map()),
    ).toBe('int64');
    expect(
      variableInfoToGoType({ type: 'number', numberType: { type: 'float', floatType: 'float64' } }, new Map()),
    ).toBe('float64');
  });

  it('renders an array wrapped in a Go slice, honoring dimensions', () => {
    const elementType: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
    expect(variableInfoToGoType({ type: 'array', elementType, dimensions: 1 }, new Map())).toBe('[]int32');
    expect(variableInfoToGoType({ type: 'array', elementType, dimensions: 2 }, new Map())).toBe('[][]int32');
  });

  it('resolves a struct id via structNames', () => {
    const structNames = new Map([['thread-1', 'ObjA']]);
    expect(variableInfoToGoType({ type: 'struct', id: 'thread-1' }, structNames)).toBe('ObjA');
  });

  it('throws for an unresolvable struct id instead of falling back to a placeholder type', () => {
    expect(() => variableInfoToGoType({ type: 'struct', id: 'missing' }, new Map())).toThrow(/Unknown struct id/);
  });

  it('throws for types with no portable Go mapping', () => {
    expect(() => variableInfoToGoType({ type: 'any' }, new Map())).toThrow(/not portable to Go/);
    expect(() => variableInfoToGoType({ type: 'enum', schemeId: 's', iconId: 'i' }, new Map())).toThrow(
      /not portable to Go/,
    );
  });
});
