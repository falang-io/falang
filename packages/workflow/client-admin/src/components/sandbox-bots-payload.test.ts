import { describe, expect, it } from 'vitest';
import { buildSandboxPlatformPayload, formatTtl, isValidCommandName, isValidTtl } from './sandbox-bots-payload.js';

describe('buildSandboxPlatformPayload', () => {
  it('omits a blank token', () => {
    expect(buildSandboxPlatformPayload({ token: '  ', commandName: ' falang ' })).toEqual({ commandName: 'falang' });
  });
  it('includes a provided token', () => {
    expect(buildSandboxPlatformPayload({ token: ' 123:abc ', commandName: 'f' })).toEqual({
      token: '123:abc',
      commandName: 'f',
    });
  });
});

describe('validation', () => {
  it('validates command names', () => {
    expect(isValidCommandName('falang_2')).toBe(true);
    expect(isValidCommandName('Falang')).toBe(false);
    expect(isValidCommandName('')).toBe(false);
    expect(isValidCommandName('a'.repeat(33))).toBe(false);
    expect(isValidCommandName('a-b')).toBe(false);
  });
  it('validates the ttl range', () => {
    expect(isValidTtl(1)).toBe(true);
    expect(isValidTtl(10_080)).toBe(true);
    expect(isValidTtl(0)).toBe(false);
    expect(isValidTtl(10_081)).toBe(false);
    expect(isValidTtl(1.5)).toBe(false);
    expect(isValidTtl(null)).toBe(false);
  });
});

describe('formatTtl', () => {
  it('formats minutes, hours and days', () => {
    expect(formatTtl(15)).toBe('15 min');
    expect(formatTtl(120)).toBe('2 h');
    expect(formatTtl(1560)).toBe('1 d 2 h');
  });
});
