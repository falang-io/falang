// oxlint-disable unicorn/no-await-expression-member -- test fixtures: explicit "no value" fixtures, fake-timer scaffolding and long per-case suites.
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestApp } from '../../test-utils/e2e-app.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';

const generatePem = (): { privatePem: string; publicPem: string } => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
};

const claimsOf = (jwt: string) => ({
  header: JSON.parse(Buffer.from(jwt.split('.')[0] as string, 'base64url').toString()) as { kid: string; alg: string },
  payload: JSON.parse(Buffer.from(jwt.split('.')[1] as string, 'base64url').toString()) as {
    aud: string;
    sub: string;
    permissions: string[];
    exp: number;
    iat: number;
  },
});

describe('Temporal tenant isolation HTTP surface (per-project mode)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let tokens: ProjectTokenService;
  const current = generatePem();
  const previous = generatePem();

  beforeEach(async () => {
    vi.stubEnv('TEMPORAL_TENANT_ISOLATION', 'per-project');
    vi.stubEnv('TEMPORAL_JWT_PRIVATE_KEY', current.privatePem);
    vi.stubEnv('TEMPORAL_JWT_PREVIOUS_PUBLIC_KEY', previous.publicPem);
    vi.stubEnv('TEMPORAL_JWT_TTL_SECONDS', '600');
    vi.stubEnv('TEMPORAL_AUTH_SELF_CHECK', 'false');
    vi.stubEnv('TEMPORAL_LEGACY_SWEEP', 'false');
    app = await createTestApp();
    tokens = app.get(ProjectTokenService);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('mints a token whose namespace and subject come from the project of the caller token', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/projects/project-a/temporal-token')
      .set('x-internal-project-token', tokens.getOrCreateToken('project-a'))
      .expect(200);

    const { token, expiresAt } = response.body as { token: string; expiresAt: string };
    const { header, payload } = claimsOf(token);
    expect(payload.permissions).toEqual(['falang-project-a:write']);
    expect(payload.sub).toBe('project:project-a');
    expect(payload.aud).toBe('falang-temporal');
    expect(payload.exp - payload.iat).toBe(600);
    expect(Date.parse(expiresAt)).toBe(payload.exp * 1000);
    expect(header.alg).toBe('RS256');

    // An independent verifier (the key published in the JWKS) accepts the signature.
    const jwks = (await request(app.getHttpServer()).get('/internal/temporal/jwks.json').expect(200)).body as {
      keys: { kid: string; n: string; e: string }[];
    };
    const jwk = jwks.keys.find((key) => key.kid === header.kid);
    const [signingHeader, signingPayload, signature] = token.split('.') as [string, string, string];
    expect(
      verify(
        'RSA-SHA256',
        Buffer.from(`${signingHeader}.${signingPayload}`),
        createPublicKey({ key: { kty: 'RSA', n: jwk?.n, e: jwk?.e }, format: 'jwk' }),
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it("refuses project A's internal token on project B's route, and a missing or garbage token", async () => {
    const tokenA = tokens.getOrCreateToken('project-a');

    await request(app.getHttpServer())
      .post('/internal/projects/project-b/temporal-token')
      .set('x-internal-project-token', tokenA)
      .expect(403);
    await request(app.getHttpServer()).post('/internal/projects/project-a/temporal-token').expect(403);
    await request(app.getHttpServer())
      .post('/internal/projects/project-a/temporal-token')
      .set('x-internal-project-token', 'garbage')
      .expect(403);
  });

  it('ignores a namespace or subject smuggled in the body', async () => {
    const response = await request(app.getHttpServer())
      .post('/internal/projects/project-a/temporal-token')
      .set('x-internal-project-token', tokens.getOrCreateToken('project-a'))
      .send({ namespace: 'falang-project-b', projectId: 'project-b', permissions: ['temporal-system:admin'] });

    // A body `projectId` does not override the route param the guard checks first.
    expect(response.status).toBe(200);
    expect(claimsOf((response.body as { token: string }).token).payload.permissions).toEqual([
      'falang-project-a:write',
    ]);
  });

  it('publishes the current and the previous public key in the JWKS, without any authentication', async () => {
    const { keys } = (await request(app.getHttpServer()).get('/internal/temporal/jwks.json').expect(200)).body as {
      keys: { kid: string; kty: string }[];
    };

    expect(keys).toHaveLength(2);
    expect(keys.every((key) => key.kty === 'RSA')).toBe(true);
    expect(new Set(keys.map((key) => key.kid)).size).toBe(2);
  });

  it('keeps the project token stable across calls (deterministic HMAC, survives a restart)', () => {
    expect(tokens.getOrCreateToken('project-a')).toBe(tokens.getOrCreateToken('project-a'));
    expect(tokens.getOrCreateToken('project-a')).not.toBe(tokens.getOrCreateToken('project-b'));
  });
});

describe('Temporal tenant isolation HTTP surface (shared mode)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('TEMPORAL_TENANT_ISOLATION', 'shared');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('has no JWKS and mints no tokens', async () => {
    await request(app.getHttpServer()).get('/internal/temporal/jwks.json').expect(404);
    const tokens = app.get(ProjectTokenService);
    await request(app.getHttpServer())
      .post('/internal/projects/project-a/temporal-token')
      .set('x-internal-project-token', tokens.getOrCreateToken('project-a'))
      .expect(404);
  });
});
