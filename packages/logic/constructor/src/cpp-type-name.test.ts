import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { variableInfoToCppType } from './cpp-type-name.js';

describe('variableInfoToCppType', () => {
  it('renders primitives', () => {
    expect(variableInfoToCppType({ type: 'string' }, new Map())).toBe('std::string');
    expect(variableInfoToCppType({ type: 'boolean' }, new Map())).toBe('bool');
    expect(variableInfoToCppType({ type: 'void' }, new Map())).toBe('void');
  });

  it('renders integer/float number types', () => {
    expect(
      variableInfoToCppType({ type: 'number', numberType: { type: 'integer', integerType: 'int32' } }, new Map()),
    ).toBe('int');
    expect(
      variableInfoToCppType({ type: 'number', numberType: { type: 'integer', integerType: 'int64' } }, new Map()),
    ).toBe('int64_t');
    expect(
      variableInfoToCppType({ type: 'number', numberType: { type: 'float', floatType: 'float64' } }, new Map()),
    ).toBe('double');
  });

  it('renders an array wrapped in std::vector, honoring dimensions', () => {
    const elementType: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
    expect(variableInfoToCppType({ type: 'array', elementType, dimensions: 1 }, new Map())).toBe('std::vector<int>');
    expect(variableInfoToCppType({ type: 'array', elementType, dimensions: 2 }, new Map())).toBe(
      'std::vector<std::vector<int>>',
    );
  });

  it('resolves a struct id via structNames', () => {
    const structNames = new Map([['thread-1', 'ObjA']]);
    expect(variableInfoToCppType({ type: 'struct', id: 'thread-1' }, structNames)).toBe('ObjA');
  });

  it('throws for an unresolvable struct id instead of falling back to a placeholder type', () => {
    expect(() => variableInfoToCppType({ type: 'struct', id: 'missing' }, new Map())).toThrow(/Unknown struct id/);
  });

  it('throws for types with no portable C++ mapping', () => {
    expect(() => variableInfoToCppType({ type: 'any' }, new Map())).toThrow(/not portable to C\+\+/);
    expect(() => variableInfoToCppType({ type: 'enum', schemeId: 's', iconId: 'i' }, new Map())).toThrow(
      /not portable to C\+\+/,
    );
  });
});
