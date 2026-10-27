import { describe, expect, it } from 'vitest';
import { constantTimeEqual } from './constant-time-equal.js';

describe('constantTimeEqual', () => {
  it('compares equal and different strings, including different lengths and empties', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true);
    expect(constantTimeEqual('abc', 'abd')).toBe(false);
    expect(constantTimeEqual('abc', 'abcd')).toBe(false);
    expect(constantTimeEqual('', 'a')).toBe(false);
    expect(constantTimeEqual('', '')).toBe(true);
  });
});
