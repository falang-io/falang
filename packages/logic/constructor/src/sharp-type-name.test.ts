import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { defaultSharpValue, variableInfoToSharpType } from './sharp-type-name.js';

const int32Type: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };

describe('variableInfoToSharpType', () => {
  it('renders primitives', () => {
    expect(variableInfoToSharpType({ type: 'string' }, new Map())).toBe('string');
    expect(variableInfoToSharpType({ type: 'boolean' }, new Map())).toBe('bool');
    expect(variableInfoToSharpType({ type: 'void' }, new Map())).toBe('void');
  });

  it("renders integer/float number types via C#'s own aliases, including a real 8-bit sbyte (the old app widened int8 to short)", () => {
    expect(
      variableInfoToSharpType({ type: 'number', numberType: { type: 'integer', integerType: 'int8' } }, new Map()),
    ).toBe('sbyte');
    expect(
      variableInfoToSharpType({ type: 'number', numberType: { type: 'integer', integerType: 'int16' } }, new Map()),
    ).toBe('short');
    expect(variableInfoToSharpType(int32Type, new Map())).toBe('int');
    expect(
      variableInfoToSharpType({ type: 'number', numberType: { type: 'integer', integerType: 'int64' } }, new Map()),
    ).toBe('long');
    expect(
      variableInfoToSharpType({ type: 'number', numberType: { type: 'float', floatType: 'float32' } }, new Map()),
    ).toBe('float');
    expect(
      variableInfoToSharpType({ type: 'number', numberType: { type: 'float', floatType: 'float64' } }, new Map()),
    ).toBe('double');
  });

  it('renders an array as a List<T>, not a fixed-size C# array, honoring dimensions', () => {
    expect(variableInfoToSharpType({ type: 'array', elementType: int32Type, dimensions: 1 }, new Map())).toBe(
      'List<int>',
    );
    expect(variableInfoToSharpType({ type: 'array', elementType: int32Type, dimensions: 2 }, new Map())).toBe(
      'List<List<int>>',
    );
  });

  it('resolves a struct id via structNames', () => {
    expect(variableInfoToSharpType({ type: 'struct', id: 'thread-1' }, new Map([['thread-1', 'ObjA']]))).toBe('ObjA');
  });

  it('throws for an unresolvable struct id instead of falling back to object/dynamic', () => {
    expect(() => variableInfoToSharpType({ type: 'struct', id: 'missing' }, new Map())).toThrow(/Unknown struct id/);
  });

  it('throws for types with no portable C# mapping', () => {
    expect(() => variableInfoToSharpType({ type: 'any' }, new Map())).toThrow(/not portable to C#/);
    expect(() => variableInfoToSharpType({ type: 'enum', schemeId: 's', iconId: 'i' }, new Map())).toThrow(
      /not portable to C#/,
    );
  });
});

describe('defaultSharpValue', () => {
  it('constructs reference types explicitly — C# would leave a List<T>/struct field null, unlike C++ value-initialization or Go zero values', () => {
    expect(defaultSharpValue({ type: 'array', elementType: int32Type, dimensions: 1 }, new Map())).toBe(
      'new List<int>()',
    );
    expect(defaultSharpValue({ type: 'struct', id: 'thread-1' }, new Map([['thread-1', 'ObjA']]))).toBe('new ObjA()');
  });

  it('uses plain literals for value types, needing no cast (a constant literal converts implicitly to every numeric type here)', () => {
    expect(defaultSharpValue(int32Type, new Map())).toBe('0');
    expect(defaultSharpValue({ type: 'number', numberType: { type: 'float', floatType: 'float32' } }, new Map())).toBe(
      '0',
    );
    expect(defaultSharpValue({ type: 'string' }, new Map())).toBe('""');
    expect(defaultSharpValue({ type: 'boolean' }, new Map())).toBe('false');
  });
});
