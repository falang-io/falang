import { describe, expect, it } from 'vitest';
import {
  decodeDropdownValue,
  decodeMultiDropdownValue,
  encodeMultiDropdownValue,
  toOptionKey,
} from './activepieces-dropdown-codec.js';

describe('toOptionKey', () => {
  it('JSON-stringifies the raw option value', () => {
    expect(toOptionKey('abc')).toBe('"abc"');
    expect(toOptionKey(42)).toBe('42');
    expect(toOptionKey({ id: 1 })).toBe('{"id":1}');
  });
});

describe('decodeDropdownValue', () => {
  it('round-trips a JSON literal', () => {
    expect(decodeDropdownValue('"abc"')).toBe('"abc"');
    expect(decodeDropdownValue('42')).toBe('42');
  });

  it('returns undefined for empty text', () => {
    expect(decodeDropdownValue('')).toBeUndefined();
    expect(decodeDropdownValue('   ')).toBeUndefined();
  });

  it('returns undefined for a pre-existing hand-written expression', () => {
    expect(decodeDropdownValue('foo.bar + 1')).toBeUndefined();
  });
});

describe('decodeMultiDropdownValue', () => {
  it('decodes a JSON array into per-item JSON keys', () => {
    expect(decodeMultiDropdownValue('["a","b"]')).toEqual(['"a"', '"b"']);
    expect(decodeMultiDropdownValue('[1,2]')).toEqual(['1', '2']);
  });

  it('returns [] for empty text', () => {
    expect(decodeMultiDropdownValue('')).toEqual([]);
  });

  it('returns [] for a non-array JSON value', () => {
    expect(decodeMultiDropdownValue('"abc"')).toEqual([]);
  });

  it('returns [] for a pre-existing hand-written expression', () => {
    expect(decodeMultiDropdownValue('foo.bar')).toEqual([]);
  });
});

describe('encodeMultiDropdownValue', () => {
  it('joins keys into a JSON array literal', () => {
    expect(encodeMultiDropdownValue(['"a"', '"b"'])).toBe('["a","b"]');
    expect(encodeMultiDropdownValue([])).toBe('[]');
  });
});
