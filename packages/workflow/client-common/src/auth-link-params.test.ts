import { describe, expect, it } from 'vitest';
import { parseAuthLinkParams, stripAuthLinkParams } from './auth-link-params.js';

describe('parseAuthLinkParams', () => {
  it('reads either token', () => {
    expect(parseAuthLinkParams('?verifyEmail=abc')).toEqual({ verifyEmail: 'abc' });
    expect(parseAuthLinkParams('?resetPassword=xyz')).toEqual({ resetPassword: 'xyz' });
  });

  it('reads the sign-up flag', () => {
    expect(parseAuthLinkParams('?signup=1')).toEqual({ signup: true });
    expect(parseAuthLinkParams('?signup=true')).toEqual({ signup: true });
    expect(parseAuthLinkParams('?signup')).toEqual({ signup: true });
    expect(parseAuthLinkParams('?signup=0')).toEqual({});
    expect(parseAuthLinkParams('?signup=false')).toEqual({});
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
    expect(stripAuthLinkParams('?signup=1&utm_source=site')).toBe('?utm_source=site');
  });
});
