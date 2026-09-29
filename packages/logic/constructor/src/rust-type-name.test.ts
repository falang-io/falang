import { describe, expect, it } from 'vitest';
import type { TVariableInfo } from '@falang/typescript-dto';
import { isRustByRefType, variableInfoToRustParamType, variableInfoToRustType } from './rust-type-name.js';

describe('variableInfoToRustType', () => {
  it('renders primitives — string/void through alloc rather than std, so the same output stays #![no_std]-compatible', () => {
    expect(variableInfoToRustType({ type: 'string' }, new Map())).toBe('alloc::string::String');
    expect(variableInfoToRustType({ type: 'boolean' }, new Map())).toBe('bool');
    expect(variableInfoToRustType({ type: 'void' }, new Map())).toBe('()');
  });

  it("renders integer/float number types, with float type names already matching Rust's own (f32/f64)", () => {
    expect(
      variableInfoToRustType({ type: 'number', numberType: { type: 'integer', integerType: 'int32' } }, new Map()),
    ).toBe('i32');
    expect(
      variableInfoToRustType({ type: 'number', numberType: { type: 'integer', integerType: 'int64' } }, new Map()),
    ).toBe('i64');
    expect(
      variableInfoToRustType({ type: 'number', numberType: { type: 'float', floatType: 'float32' } }, new Map()),
    ).toBe('f32');
    expect(
      variableInfoToRustType({ type: 'number', numberType: { type: 'float', floatType: 'float64' } }, new Map()),
    ).toBe('f64');
  });

  it('renders an array wrapped in an alloc::vec::Vec, honoring dimensions', () => {
    const elementType: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
    expect(variableInfoToRustType({ type: 'array', elementType, dimensions: 1 }, new Map())).toBe(
      'alloc::vec::Vec<i32>',
    );
    expect(variableInfoToRustType({ type: 'array', elementType, dimensions: 2 }, new Map())).toBe(
      'alloc::vec::Vec<alloc::vec::Vec<i32>>',
    );
  });

  it('resolves a struct id via structNames, as a bare name when no structDocuments map is given', () => {
    const structNames = new Map([['thread-1', 'ObjA']]);
    expect(variableInfoToRustType({ type: 'struct', id: 'thread-1' }, structNames)).toBe('ObjA');
  });

  it('fully-qualifies a struct type as crate::falang::<DocName>::<StructName> when structDocuments resolves it', () => {
    const structNames = new Map([['thread-1', 'ObjA']]);
    const structDocuments = new Map([['thread-1', 'State']]);
    expect(variableInfoToRustType({ type: 'struct', id: 'thread-1' }, structNames, structDocuments)).toBe(
      'crate::falang::State::ObjA',
    );
  });

  it('throws for an unresolvable struct id instead of falling back to a placeholder type', () => {
    expect(() => variableInfoToRustType({ type: 'struct', id: 'missing' }, new Map())).toThrow(/Unknown struct id/);
  });

  it('throws for types with no portable Rust mapping', () => {
    expect(() => variableInfoToRustType({ type: 'any' }, new Map())).toThrow(/not portable to Rust/);
    expect(() => variableInfoToRustType({ type: 'enum', schemeId: 's', iconId: 'i' }, new Map())).toThrow(
      /not portable to Rust/,
    );
  });
});

describe('isRustByRefType / variableInfoToRustParamType', () => {
  const structNames = new Map([['thread-1', 'ObjA']]);
  const structDocuments = new Map([['thread-1', 'State']]);
  const int32: TVariableInfo = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } };
  const structType: TVariableInfo = { type: 'struct', id: 'thread-1' };
  const arrayType: TVariableInfo = { type: 'array', elementType: int32, dimensions: 1 };

  it('is true only for struct/array, matching the by-reference parameter contract', () => {
    expect(isRustByRefType(structType)).toBe(true);
    expect(isRustByRefType(arrayType)).toBe(true);
    expect(isRustByRefType(int32)).toBe(false);
    expect(isRustByRefType({ type: 'string' })).toBe(false);
    expect(isRustByRefType({ type: 'boolean' })).toBe(false);
  });

  it('renders struct/array params as & references and everything else by value', () => {
    expect(variableInfoToRustParamType(structType, structNames, structDocuments)).toBe('&crate::falang::State::ObjA');
    expect(variableInfoToRustParamType(arrayType, structNames)).toBe('&alloc::vec::Vec<i32>');
    expect(variableInfoToRustParamType(int32, structNames)).toBe('i32');
    expect(variableInfoToRustParamType({ type: 'string' }, structNames)).toBe('alloc::string::String');
  });
});
