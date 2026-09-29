import { describe, expect, it } from 'vitest';
import { defaultValueExpression } from './default-value-expression.js';

describe('defaultValueExpression', () => {
  it('renders literal defaults for scalar and container types', () => {
    expect(defaultValueExpression({ type: 'string' })).toBe("''");
    expect(defaultValueExpression({ type: 'boolean' })).toBe('false');
    expect(defaultValueExpression({ type: 'number', numberType: { type: 'any' } })).toBe('0');
    expect(defaultValueExpression({ type: 'array', elementType: { type: 'string' }, dimensions: 1 })).toBe('[]');
    expect(defaultValueExpression({ type: 'struct', id: 'unresolved' })).toBe('{}');
  });

  it('recurses into the first union member', () => {
    expect(
      defaultValueExpression({
        type: 'union',
        unionTypes: [{ type: 'boolean' }, { type: 'string' }],
      }),
    ).toBe('false');
  });

  it('returns undefined for types with no synthesizable default', () => {
    expect(defaultValueExpression({ type: 'enum', schemeId: 's', iconId: 'i' })).toBeUndefined();
    expect(defaultValueExpression({ type: 'any' })).toBeUndefined();
    expect(defaultValueExpression({ type: 'void' })).toBeUndefined();
    expect(defaultValueExpression({ type: 'never' })).toBeUndefined();
  });

  it('returns undefined for an empty union', () => {
    expect(defaultValueExpression({ type: 'union', unionTypes: [] })).toBeUndefined();
  });
});
