import { describe, expect, it } from 'vitest';
import { variableInfoToTsType } from './render-variable-type.js';

describe('variableInfoToTsType', () => {
  it('renders scalar types verbatim', () => {
    expect(variableInfoToTsType({ type: 'string' })).toBe('string');
    expect(variableInfoToTsType({ type: 'boolean' })).toBe('boolean');
    expect(variableInfoToTsType({ type: 'number', numberType: { type: 'any' } })).toBe('number');
    expect(variableInfoToTsType({ type: 'void' })).toBe('void');
    expect(variableInfoToTsType({ type: 'never' })).toBe('never');
    expect(variableInfoToTsType({ type: 'any' })).toBe('any');
  });

  it('renders array types, wrapping unions in parens', () => {
    expect(variableInfoToTsType({ type: 'array', elementType: { type: 'string' }, dimensions: 1 })).toBe('string[]');
    expect(variableInfoToTsType({ type: 'array', elementType: { type: 'string' }, dimensions: 2 })).toBe('string[][]');
    expect(
      variableInfoToTsType({
        type: 'array',
        elementType: {
          type: 'union',
          unionTypes: [{ type: 'string' }, { type: 'number', numberType: { type: 'any' } }],
        },
        dimensions: 1,
      }),
    ).toBe('((string | number))[]');
  });

  it('renders union types', () => {
    expect(variableInfoToTsType({ type: 'union', unionTypes: [{ type: 'string' }, { type: 'boolean' }] })).toBe(
      '(string | boolean)',
    );
  });

  it('falls back to any for struct/enum types without a name registry', () => {
    expect(variableInfoToTsType({ type: 'struct', id: 'unresolved' })).toBe('any');
    expect(variableInfoToTsType({ type: 'enum', schemeId: 's', iconId: 'i' })).toBe('any');
  });

  it('resolves struct types from the provided name map', () => {
    const structNames = new Map([['person-id', 'Person']]);
    expect(variableInfoToTsType({ type: 'struct', id: 'person-id' }, structNames)).toBe('Person');
  });
});
