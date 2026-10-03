import { describe, expect, it } from 'vitest';
import { pickTabTarget } from './tab-navigation.js';

describe('pickTabTarget', () => {
  const fields = ['a', 'b', 'c'];
  it('moves forward and backward', () => {
    expect(pickTabTarget(fields, 'b', 'next')).toBe('c');
    expect(pickTabTarget(fields, 'b', 'previous')).toBe('a');
  });
  it('returns null past either end (nothing is inserted, focus stays)', () => {
    expect(pickTabTarget(fields, 'c', 'next')).toBeNull();
    expect(pickTabTarget(fields, 'a', 'previous')).toBeNull();
  });
  it('returns null for an unknown current field', () => {
    expect(pickTabTarget(fields, 'x', 'next')).toBeNull();
  });
});
