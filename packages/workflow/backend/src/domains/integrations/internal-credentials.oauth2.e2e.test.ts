import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EgressGuardModule from '../../net/egress-guard.js';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';

// The real egress guard talks to the network; these tests stub the global `fetch`, so route the guard's `fetch` to it.
vi.mock('../../net/egress-guard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof EgressGuardModule>()),
  getBackendEgress: () => ({
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
    resolveHost: (host: string) => Promise.resolve(host),
  }),
}));

// See ADR 0016 (private) security audit P0-9: the platform OAuth2 client secret must never be
// handed to a pod/the activepieces service; refresh happens on the backend.
const catalog = [
  {
    pieceName: 'oauthpiece',
    displayName: 'OAuth Piece',
    auth: {
      type: 'OAUTH2',
      displayName: 'Account',
      required: true,
      fields: [
        { name: 'access_token', kind: 'secret', displayName: 'Access token', hidden: true, secretProdOptional: true },
        { name: 'refresh_token', kind: 'secret', displayName: 'Refresh token', hidden: true, secretProdOptional: true },
        { name: 'expires_at', kind: 'text', displayName: 'Expires at', hidden: true },
        { name: 'oauth_data', kind: 'text', displayName: 'OAuth data', hidden: true },
      ],
      oauth2: { authUrl: 'https://vendor.test/authorize', tokenUrl: 'https://vendor.test/token', scope: ['profile'] },
    },
    actions: [],
    triggers: [],
  },
];

describe('internal credentials — platform OAuth2 client stays on the backend', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;
  const vendor = 'activepieces-oauthpiece';

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('ACTIVEPIECES_SERVICE_URL', 'http://activepieces.test');
    vi.stubEnv('ACTIVEPIECES_SERVICE_SECRET', 'test-activepieces-secret');
    vi.stubEnv('BACKEND_PUBLIC_URL', 'http://backend.test');
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://activepieces.test/pieces') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(catalog) });
      }
      if (url === 'https://vendor.test/token') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'tok-fresh', refresh_token: 'refresh-2', expires_in: 3600 }),
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const setUp = async (): Promise<{ projectId: string; projectToken: string; token: string }> => {
    const token = await login(app);
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = created.body.id;
    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    const docId: string = tree.body.documents[0].id;
    await request(app.getHttpServer())
      .put(`/admin/oauth-credentials/${vendor}`)
      .set(auth(token))
      .send({ clientId: 'cid-1', clientSecret: 'platform-secret' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            {
              id: 'cred-1',
              vendor,
              name: 'c',
              fields: {
                access_token: { dev: 'tok-old', prod: '' },
                refresh_token: { dev: 'refresh-1', prod: '' },
                expires_at: String(Date.now() - 1000),
              },
            },
          ],
        },
      })
      .expect(200);
    return { projectId, token, projectToken: app.get(ProjectTokenService).getOrCreateToken(projectId) };
  };

  const post = (path: string, projectToken: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/internal/credentials/${path}`)
      .set({ [INTERNAL_PROJECT_TOKEN_HEADER]: projectToken })
      .send(body);

  it.each(['client_secret', 'client_id'])('does not resolve the platform %s', async (field) => {
    const { projectId, projectToken } = await setUp();

    const response = await post('resolve', projectToken, {
      credentialId: 'cred-1',
      vendor,
      field,
      env: 'dev',
      projectId,
    });

    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('platform-secret');
  });

  it('refreshes an expired token on the backend with the platform client and persists it', async () => {
    const { projectId, projectToken } = await setUp();

    const response = await post('oauth2-access-token', projectToken, { credentialId: 'cred-1', vendor, projectId });

    expect(response.status).toBe(201);
    expect(response.body.accessToken).toBe('tok-fresh');
    const tokenCall = fetchMock.mock.calls.find((call) => call[0] === 'https://vendor.test/token');
    const body = tokenCall?.[1]?.body as URLSearchParams;
    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('client_secret')).toBe('platform-secret');
    expect(JSON.stringify(response.body)).not.toContain('platform-secret');

    // second call: persisted token is fresh, no more vendor calls
    fetchMock.mockClear();
    const again = await post('oauth2-access-token', projectToken, { credentialId: 'cred-1', vendor, projectId });
    expect(again.body.accessToken).toBe('tok-fresh');
    expect(fetchMock.mock.calls.some((call) => call[0] === 'https://vendor.test/token')).toBe(false);
  });

  it('rejects a request without a valid project token', async () => {
    const { projectId } = await setUp();
    const response = await post('oauth2-access-token', 'wrong', { credentialId: 'cred-1', vendor, projectId });
    expect([401, 403]).toContain(response.status);
  });
});
