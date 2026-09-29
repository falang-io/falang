import { describe, expect, it } from 'vitest';
import { asExpression, asStatement } from './raw-code.js';

describe('asStatement', () => {
  it('appends a trailing semicolon when missing', () => {
    expect(asStatement('x = 1')).toBe('x = 1;');
  });

  it('does not duplicate an existing trailing semicolon', () => {
    expect(asStatement('x = 1;')).toBe('x = 1;');
  });

  it('trims surrounding whitespace', () => {
    expect(asStatement('  x = 1  ')).toBe('x = 1;');
  });

  it('returns an empty string for empty/nullish input', () => {
    expect(asStatement('')).toBe('');
    expect(asStatement('   ')).toBe('');
    expect(asStatement(null)).toBe('');
  });
});

describe('asExpression', () => {
  it('trims whitespace and strips a trailing semicolon', () => {
    expect(asExpression('  x + 1;  ')).toBe('x + 1');
  });

  it('leaves an expression without a semicolon untouched', () => {
    expect(asExpression('x + 1')).toBe('x + 1');
  });

  it('returns an empty string for nullish input', () => {
    expect(asExpression(null)).toBe('');
  });
});
