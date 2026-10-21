import { describe, expect, it } from 'vitest';
import { divideRounded, formatDecimalText, parseDecimalLiteral, rescaleDecimalValue } from './decimal-literal.js';

describe('decimal literals (ADR 0069 (private) §4)', () => {
  it('parses a source spelling exactly', () => {
    expect(parseDecimalLiteral('19.99')).toEqual({ raw: 1999n, scale: 2 });
    expect(parseDecimalLiteral('0.1')).toEqual({ raw: 1n, scale: 1 });
    expect(parseDecimalLiteral('5')).toEqual({ raw: 5n, scale: 0 });
    expect(parseDecimalLiteral('5.')).toEqual({ raw: 5n, scale: 0 });
    expect(parseDecimalLiteral('.25')).toEqual({ raw: 25n, scale: 2 });
    expect(parseDecimalLiteral('1.50')).toEqual({ raw: 150n, scale: 2 });
    expect(parseDecimalLiteral('1_000.5')).toEqual({ raw: 10_005n, scale: 1 });
    expect(parseDecimalLiteral('1e3')).toEqual({ raw: 1000n, scale: 0 });
    expect(parseDecimalLiteral('1.5e2')).toEqual({ raw: 150n, scale: 0 });
    expect(parseDecimalLiteral('15e-3')).toEqual({ raw: 15n, scale: 3 });
  });

  it('leaves hex, binary and bigint spellings alone', () => {
    expect(parseDecimalLiteral('0xFF')).toBeUndefined();
    expect(parseDecimalLiteral('0b101')).toBeUndefined();
    expect(parseDecimalLiteral('10n')).toBeUndefined();
  });

  it('rounds half away from zero', () => {
    expect(divideRounded(5n, 2n)).toBe(3n);
    expect(divideRounded(-5n, 2n)).toBe(-3n);
    expect(divideRounded(4n, 3n)).toBe(1n);
    expect(divideRounded(-4n, 3n)).toBe(-1n);
    expect(divideRounded(7n, -2n)).toBe(-4n);
    expect(divideRounded(6n, 3n)).toBe(2n);
  });

  it('widens exactly and narrows with rounding', () => {
    expect(rescaleDecimalValue({ raw: 15n, scale: 1 }, 3)).toBe(1500n);
    expect(rescaleDecimalValue({ raw: 1005n, scale: 3 }, 2)).toBe(101n);
    expect(rescaleDecimalValue({ raw: -25n, scale: 1 }, 0)).toBe(-3n);
    expect(rescaleDecimalValue({ raw: 1004n, scale: 3 }, 2)).toBe(100n);
  });

  it('formats with exactly `scale` fraction digits', () => {
    expect(formatDecimalText(1999n, 2)).toBe('19.99');
    expect(formatDecimalText(-5n, 2)).toBe('-0.05');
    expect(formatDecimalText(0n, 2)).toBe('0.00');
    expect(formatDecimalText(3n, 0)).toBe('3');
    expect(formatDecimalText(-12_345n, 0)).toBe('-12345');
  });
});
