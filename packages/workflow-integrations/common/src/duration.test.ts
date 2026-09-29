import { describe, expect, it } from 'vitest';
import { parseDurationToMs } from './duration.js';

describe('parseDurationToMs', () => {
  it('parses milliseconds', () => {
    expect(parseDurationToMs('500ms')).toBe(500);
  });

  it('parses seconds', () => {
    expect(parseDurationToMs('30s')).toBe(30_000);
  });

  it('parses minutes', () => {
    expect(parseDurationToMs('10m')).toBe(600_000);
  });

  it('parses hours', () => {
    expect(parseDurationToMs('48h')).toBe(48 * 3_600_000);
  });

  it('parses days', () => {
    expect(parseDurationToMs('3d')).toBe(3 * 86_400_000);
  });

  it('trims surrounding whitespace', () => {
    expect(parseDurationToMs('  10m  ')).toBe(600_000);
  });

  it('allows a fractional amount', () => {
    expect(parseDurationToMs('1.5h')).toBe(1.5 * 3_600_000);
  });

  it('throws on an empty string', () => {
    expect(() => parseDurationToMs('')).toThrow(/Invalid duration/);
  });

  it('throws on an unrecognized unit', () => {
    expect(() => parseDurationToMs('3w')).toThrow(/Invalid duration/);
  });

  it('throws on a bare number with no unit', () => {
    expect(() => parseDurationToMs('10')).toThrow(/Invalid duration/);
  });
});
