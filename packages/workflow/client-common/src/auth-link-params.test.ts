import { describe, expect, it } from 'vitest';
import { parseAuthLinkParams, stripAuthLinkParams } from './auth-link-params.js';

describe('parseAuthLinkParams', () => {
  it('reads either token', () => {
    expect(parseAuthLinkParams('?verifyEmail=abc')).toEqual({ verifyEmail: 'abc' });
    expect(parseAuthLinkParams('?resetPassword=xyz')).toEqual({ resetPassword: 'xyz' });
  });

  it('ignores empty and unrelated parameters', () => {
    expect(parseAuthLinkParams('')).toEqual({});
    expect(parseAuthLinkParams('?verifyEmail=&foo=1')).toEqual({});
  });
});

describe('stripAuthLinkParams', () => {
  it('removes only the token parameters', () => {
    expect(stripAuthLinkParams('?verifyEmail=abc')).toBe('');
    expect(stripAuthLinkParams('?foo=1&resetPassword=x')).toBe('?foo=1');
  });
});
