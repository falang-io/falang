import { createHash, createPrivateKey, createPublicKey, sign, type KeyObject } from 'node:crypto';

/**
 * Minimal RS256 JWT signing + JWKS helpers for Temporal's default `ClaimMapper` (ADR 0057 (private)) —
 * `node:crypto` only, no `jose`. Shared by `TemporalTokenService` and the workflow-tier isolation spec,
 * so the spec signs with exactly the production code path.
 */

export interface IJwk {
  readonly kty: 'RSA';
  readonly use: 'sig';
  readonly alg: 'RS256';
  readonly kid: string;
  readonly n: string;
  readonly e: string;
}

export interface IJwks {
  readonly keys: readonly IJwk[];
}

const base64Url = (input: Buffer | string): string => Buffer.from(input).toString('base64url');

/** `\n` written as the two characters backslash-n (typical for a PEM in a single-line env var) becomes a real newline. */
export const normalizePem = (pem: string): string => pem.trim().replaceAll(String.raw`\n`, '\n');

export const parsePrivateKey = (pem: string): KeyObject => createPrivateKey(normalizePem(pem));

/** RFC 7638 JWK thumbprint of an RSA public key — the default `kid`. */
export const rsaThumbprint = (publicKey: KeyObject): string => {
  const { e, n } = publicKey.export({ format: 'jwk' });
  // Members in lexicographic order, no whitespace — exactly what RFC 7638 §3.2 prescribes for RSA.
  return createHash('sha256').update(`{"e":"${e}","kty":"RSA","n":"${n}"}`).digest('base64url');
};

export const toJwk = (publicKey: KeyObject, kid: string): IJwk => {
  const { e, n } = publicKey.export({ format: 'jwk' });
  return { kty: 'RSA', use: 'sig', alg: 'RS256', kid, n: n ?? '', e: e ?? '' };
};

export interface ISignJwtParams {
  readonly privateKey: KeyObject;
  readonly kid: string;
  readonly claims: Readonly<Record<string, unknown>>;
}

export const signJwt = ({ privateKey, kid, claims }: ISignJwtParams): string => {
  const header = { alg: 'RS256', typ: 'JWT', kid };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey);
  return `${signingInput}.${base64Url(signature)}`;
};

export const publicKeyOf = (privateKey: KeyObject): KeyObject => createPublicKey(privateKey);
