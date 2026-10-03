// oxlint-disable init-declarations, unicorn/prefer-string-raw -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ITemporalJwtConfig } from './temporal-config.js';
import { TemporalTokenService } from './temporal-token.service.js';
import { normalizePem, rsaThumbprint } from './temporal-jwt.js';

const generatePem = (): { privatePem: string; publicPem: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
};

const decode = (jwt: string) => {
  const [header, payload, signature] = jwt.split('.') as [string, string, string];
  return {
    header: JSON.parse(Buffer.from(header, 'base64url').toString()) as Record<string, unknown>,
    payload: JSON.parse(Buffer.from(payload, 'base64url').toString()) as Record<string, unknown>,
    signingInput: `${header}.${payload}`,
    signature: Buffer.from(signature, 'base64url'),
  };
};

describe('TemporalTokenService', () => {
  let current: { privatePem: string; publicPem: string };
  let previous: { privatePem: string; publicPem: string };
  const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

  const config = (overrides: Partial<ITemporalJwtConfig> = {}): ITemporalJwtConfig => ({
    privateKeyPem: current.privatePem,
    ttlSeconds: 3600,
    audience: 'falang-temporal',
    ...overrides,
  });

  beforeAll(() => {
    current = generatePem();
    previous = generatePem();
  });

  it('mints a project token that grants write on exactly its own namespace', () => {
    const service = new TemporalTokenService(config(), () => NOW);

    const { token, expiresAt } = service.mintProjectToken('11111111-2222-3333-4444-555555555555');
    const { header, payload } = decode(token);

    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: service.currentKeyId });
    expect(payload).toEqual({
      iss: 'falang-backend',
      aud: 'falang-temporal',
      sub: 'project:11111111-2222-3333-4444-555555555555',
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
      permissions: ['falang-11111111-2222-3333-4444-555555555555:write'],
    });
    expect(expiresAt).toBe(new Date(NOW + 3600 * 1000).toISOString());
  });

  it('honours the configured TTL and audience', () => {
    const service = new TemporalTokenService(config({ ttlSeconds: 20, audience: 'other-aud' }), () => NOW);

    const { payload } = decode(service.mintProjectToken('p').token);

    expect(payload.exp).toBe(NOW / 1000 + 20);
    expect(payload.aud).toBe('other-aud');
  });

  it('mints a short-lived backend admin token with the system admin permission', () => {
    const service = new TemporalTokenService(config(), () => NOW);

    const { token, expiresAt } = service.mintAdminToken();
    const { payload } = decode(token);

    expect(payload.sub).toBe('falang-backend');
    expect(payload.permissions).toEqual(['temporal-system:admin']);
    expect(payload.exp).toBe(NOW / 1000 + 300);
    expect(expiresAt).toBe(new Date(NOW + 300 * 1000).toISOString());
  });

  it('signs with a key an independent verifier accepts from the published JWKS, and rejects a tampered token', () => {
    const service = new TemporalTokenService(config(), () => NOW);
    const { token } = service.mintProjectToken('p1');
    const { header, signingInput, signature } = decode(token);

    const jwk = service.getJwks().keys.find((key) => key.kid === header.kid);
    expect(jwk).toBeDefined();
    const publicKey = createPublicKey({ key: { kty: 'RSA', n: jwk?.n, e: jwk?.e }, format: 'jwk' });
    expect(verify('RSA-SHA256', Buffer.from(signingInput), publicKey, signature)).toBe(true);
    expect(verify('RSA-SHA256', Buffer.from(`${signingInput}x`), publicKey, signature)).toBe(false);
  });

  it('defaults the key id to the RFC 7638 thumbprint, and lets TEMPORAL_JWT_KEY_ID override it', () => {
    const thumbprint = rsaThumbprint(createPublicKey(normalizePem(current.publicPem)));

    expect(new TemporalTokenService(config()).currentKeyId).toBe(thumbprint);
    expect(new TemporalTokenService(config({ keyId: 'falang-1' })).currentKeyId).toBe('falang-1');
  });

  it('publishes only the current key in the JWKS when no previous key is configured', () => {
    const jwks = new TemporalTokenService(config()).getJwks();

    expect(jwks.keys).toHaveLength(1);
    expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' });
  });

  it('publishes the current key first and the previous public key second while rotating', () => {
    const service = new TemporalTokenService(config({ previousPublicKeyPem: previous.publicPem }));

    const { keys } = service.getJwks();

    expect(keys).toHaveLength(2);
    expect(keys[0]?.kid).toBe(service.currentKeyId);
    expect(keys[1]?.kid).toBe(rsaThumbprint(createPublicKey(normalizePem(previous.publicPem))));
    expect(keys[0]?.n).not.toBe(keys[1]?.n);
  });

  it('accepts a PEM written on one line with literal \\n escapes (typical env var)', () => {
    const oneLine = current.privatePem.trim().replaceAll('\n', '\\n');

    const service = new TemporalTokenService(config({ privateKeyPem: oneLine }));

    expect(service.currentKeyId).toBe(new TemporalTokenService(config()).currentKeyId);
  });
});
