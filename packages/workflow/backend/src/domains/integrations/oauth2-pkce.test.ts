import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildPkcePair, computePkceChallenge } from './oauth2-pkce.js';

describe('computePkceChallenge', () => {
  it('S256 matches the RFC 7636 Appendix B reference vector', () => {
    expect(computePkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', 'S256')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('plain returns the verifier unchanged', () => {
    expect(computePkceChallenge('some-verifier', 'plain')).toBe('some-verifier');
  });
});

describe('buildPkcePair', () => {
  const unreserved = /^[A-Za-z0-9_-]+$/;

  it('S256: verifier is 43 url-safe chars and challenge = base64url(sha256(verifier))', () => {
    const { verifier, challenge } = buildPkcePair('S256');
    expect(verifier).toHaveLength(43);
    expect(verifier).toMatch(unreserved);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
    expect(challenge).not.toBe(verifier);
  });

  it('plain: challenge equals the verifier', () => {
    const { verifier, challenge } = buildPkcePair('plain');
    expect(verifier).toHaveLength(43);
    expect(challenge).toBe(verifier);
  });

  it('generates a fresh verifier every time', () => {
    expect(buildPkcePair('S256').verifier).not.toBe(buildPkcePair('S256').verifier);
  });
});
