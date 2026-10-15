import { describe, expect, it } from 'vitest';
import { createInternalOriginMatcher } from './internal-origin.js';

describe('createInternalOriginMatcher', () => {
  it('matches by protocol + host + port and normalises default ports', () => {
    const isInternal = createInternalOriginMatcher(['http://backend:3001', 'https://files.example.com']);
    expect(isInternal(new URL('http://backend:3001/x?y=1'))).toBe(true);
    expect(isInternal(new URL('https://files.example.com:443/'))).toBe(true);
    expect(isInternal(new URL('https://files.example.com/'))).toBe(true);
  });

  it('does not match another port, protocol or host', () => {
    const isInternal = createInternalOriginMatcher(['http://backend:3001', 'http://plain.example.com']);
    expect(isInternal(new URL('http://backend:3002'))).toBe(false);
    expect(isInternal(new URL('https://backend:3001'))).toBe(false);
    expect(isInternal(new URL('http://other:3001'))).toBe(false);
    expect(isInternal(new URL('http://plain.example.com:8080'))).toBe(false);
    expect(isInternal(new URL('http://plain.example.com:80'))).toBe(true);
  });

  it('ignores undefined, empty and unparsable entries without throwing', () => {
    const isInternal = createInternalOriginMatcher([undefined, '', 'not a url', 'http://ok:1']);
    expect(isInternal(new URL('http://ok:1'))).toBe(true);
    expect(isInternal(new URL('http://not:80'))).toBe(false);
    expect(createInternalOriginMatcher([])(new URL('http://a'))).toBe(false);
  });
});
