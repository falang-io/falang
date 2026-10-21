import { describe, expect, it } from 'vitest';
import { describeVariableType } from './describe-variable-type.js';

describe('describeVariableType', () => {
  it('describes number kinds', () => {
    expect(describeVariableType({ type: 'number', numberType: { type: 'integer', integerType: 'int32' } })).toBe(
      'int32',
    );
    expect(describeVariableType({ type: 'number', numberType: { type: 'integer', integerType: 'uint8' } })).toBe(
      'uint8',
    );
    expect(describeVariableType({ type: 'number', numberType: { type: 'float', floatType: 'float64' } })).toBe(
      'float64',
    );
    expect(describeVariableType({ type: 'number', numberType: { type: 'decimal', digits: 10, decimals: 2 } })).toBe(
      'decimal(10,2)',
    );
    expect(describeVariableType({ type: 'number', numberType: { type: 'any' } })).toBe('number');
  });

  it('describes scalars, arrays and structs', () => {
    expect(describeVariableType({ type: 'string' })).toBe('string');
    expect(
      describeVariableType({
        type: 'array',
        dimensions: 2,
        elementType: { type: 'number', numberType: { type: 'integer', integerType: 'uint16' } },
      }),
    ).toBe('uint16[][]');
    expect(describeVariableType({ type: 'struct', id: 'a' }, new Map([['a', 'Point']]))).toBe('Point');
    expect(describeVariableType({ type: 'struct', id: 'a' })).toBe('struct');
    expect(
      describeVariableType(
        { type: 'array', dimensions: 1, elementType: { type: 'struct', id: 'a' } },
        new Map([['a', 'P']]),
      ),
    ).toBe('P[]');
  });
});
