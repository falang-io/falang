// oxlint-disable no-undefined
import { describe, expect, it } from 'vitest';
import { describeVariableType, describeVariableTypeForMode } from './describe-variable-type.js';
import { buildDefaultVariableType, choiceOf, getTypeChoices } from './variable-type-model.js';

const int32 = { type: 'number', numberType: { type: 'integer', integerType: 'int32' } } as const;

describe('variable type model', () => {
  it('offers integer/float/decimal instead of number, and no any/enum, in portable mode', () => {
    const portable = getTypeChoices({ mode: 'portable' });
    expect(portable).toContain('integer');
    expect(portable).not.toContain('number');
    expect(portable).not.toContain('any');
    expect(portable).not.toContain('enum');
    expect(getTypeChoices({ mode: 'typescript' })).toEqual(expect.arrayContaining(['number', 'any', 'enum', 'array']));
    expect(getTypeChoices({ mode: 'portable', isElement: true })).not.toContain('array');
  });

  it('builds defaults: int32, project float, decimal(10,2), number any', () => {
    expect(buildDefaultVariableType('integer', null)).toEqual(int32);
    expect(buildDefaultVariableType('float', { defaultFloatType: 'float32' })).toEqual({
      type: 'number',
      numberType: { type: 'float', floatType: 'float32' },
    });
    expect(buildDefaultVariableType('float', null)).toMatchObject({ numberType: { floatType: 'float64' } });
    expect(buildDefaultVariableType('decimal', null)).toMatchObject({ numberType: { digits: 10, decimals: 2 } });
    expect(buildDefaultVariableType('number', null)).toEqual({ type: 'number', numberType: { type: 'any' } });
  });

  it('maps a value to its choice; number(any) is an empty choice in portable mode', () => {
    expect(choiceOf(int32, 'portable')).toBe('integer');
    expect(choiceOf(int32, 'typescript')).toBe('number');
    expect(choiceOf({ type: 'number', numberType: { type: 'any' } }, 'portable')).toBe('');
    expect(choiceOf(undefined, 'portable')).toBe('none');
  });

  it('describes types', () => {
    expect(describeVariableType(int32)).toBe('int32');
    expect(describeVariableType({ type: 'number', numberType: { type: 'decimal', digits: 10, decimals: 2 } })).toBe(
      'decimal(10,2)',
    );
    expect(describeVariableType({ type: 'number', numberType: { type: 'any' } })).toBe('number');
    expect(describeVariableType({ type: 'array', elementType: int32, dimensions: 1 })).toBe('int32[]');
    expect(describeVariableTypeForMode(int32, 'typescript')).toBe('number');
  });
});
