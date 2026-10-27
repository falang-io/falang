// oxlint-disable no-undefined, unicorn/no-useless-undefined -- the env var is genuinely unset.
import { describe, expect, it } from 'vitest';
import { parseTrustProxy } from './trust-proxy.js';

describe('parseTrustProxy', () => {
  it('defaults to false', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('  ')).toBe(false);
    expect(parseTrustProxy('false')).toBe(false);
  });
  it('parses true, hop counts and lists', () => {
    expect(parseTrustProxy('true')).toBe(true);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('loopback, 10.0.0.0/8 ,')).toEqual(['loopback', '10.0.0.0/8']);
  });
});
