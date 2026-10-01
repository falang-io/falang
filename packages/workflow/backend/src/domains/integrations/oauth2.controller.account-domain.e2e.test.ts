import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EgressGuardModule from '../../net/egress-guard.js';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

// The real egress guard talks to the network; these tests stub the global `fetch`, so route the guard's `fetch` to it.
vi.mock('../../net/egress-guard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof EgressGuardModule>()),
  getBackendEgress: () => ({
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
    resolveHost: (host: string) => Promise.resolve(host),
  }),
}));

// Exercises the amoCRM-shaped vendor-variance options (see ADR 0017 (private)'s "OAuth2
// credential-kind gap") through the same piece-catalog vehicle other oauth2.controller tests use —
// `pieceToCredentialIntegration` spreads `auth.oauth2` verbatim, so this is a convenient way to
// reach `oauth2.controller.ts`'s account-domain/JSON-body handling end-to-end without a real
// native amoCRM package existing yet. Split out of `oauth2.controller.e2e.test.ts` (oxlint max-lines).
const accountDomainPieceCatalog = [
  {
    pieceName: 'accountdomainpiece',
    displayName: 'Account Domain Piece',
    auth: {
      type: 'OAUTH2',
      displayName: 'Account',
      required: true,
      fields: [
        { name: 'client_id', kind: 'text', displayName: 'Client ID' },
        { name: 'client_secret', kind: 'secret', displayName: 'Client secret', secretProdOptional: true },
        { name: 'access_token', kind: 'secret', displayName: 'Access token', hidden: true, secretProdOptional: true },
        { name: 'refresh_token', kind: 'secret', displayName: 'Refresh token', hidden: true, secretProdOptional: true },
        { name: 'expires_at', kind: 'text', displayName: 'Expires at', hidden: true },
        { name: 'account_domain', kind: 'text', displayName: 'Account domain', hidden: true },
      ],
      oauth2: {
        authUrl: 'https://vendor.test/authorize',
        tokenUrl: 'https://{accountDomain}/oauth2/access_token',
        scope: ['profile'],
        tokenRequestFormat: 'json',
        accountDomainCallbackParam: 'referer',
        accountDomainSuffixes: ['.amocrm.test'],
      },
    },
    actions: [],
    triggers: [],
  },
];

describe('OAuth2 authorization-code flow — per-account tokenUrl / JSON body (amoCRM-shaped vendor)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('ACTIVEPIECES_SERVICE_URL', 'http://activepieces.test');
    vi.stubEnv('ACTIVEPIECES_SERVICE_SECRET', 'test-activepieces-secret');
    vi.stubEnv('BACKEND_PUBLIC_URL', 'http://backend.test');
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://activepieces.test/pieces') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(accountDomainPieceCatalog) });
      }
      if (url === 'https://my-account.amocrm.test/oauth2/access_token') {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ access_token: 'tok-account', refresh_token: 'refresh-account', expires_in: 3600 }),
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

  const setUpProject = async (token: string): Promise<{ projectId: string; integrationsDocId: string }> => {
    const createResponse = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = createResponse.body.id;
    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    return { projectId, integrationsDocId: tree.body.documents[0].id };
  };

  /** A platform-owned OAuth2 client — see ADR 0030 (private). */
  const createPlatformCredential = (adminToken: string) =>
    request(app.getHttpServer())
      .put('/admin/oauth-credentials/activepieces-accountdomainpiece')
      .set(auth(adminToken))
      .send({ clientId: 'cid-2', clientSecret: 'csecret-2' })
      .expect(200);

  it('captures the account-domain callback param, resolves a per-account tokenUrl, and sends a JSON body', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            { id: 'cred-2', vendor: 'activepieces-accountdomainpiece', name: 'My Account-Domain OAuth', fields: {} },
          ],
        },
      })
      .expect(200);
    await createPlatformCredential(token);
    const startResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-2/oauth2/start`)
      .set(auth(token));
    const state = new URL(startResponse.body.authorizeUrl).searchParams.get('state');

    const callbackResponse = await request(app.getHttpServer()).get(
      `/oauth2/callback/activepieces-accountdomainpiece?code=fake-code&state=${state}&referer=https://my-account.amocrm.test`,
    );

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.text).toContain('Connected');
    const tokenCall = fetchMock.mock.calls.find(
      (call) => call[0] === 'https://my-account.amocrm.test/oauth2/access_token',
    );
    expect(tokenCall).toBeTruthy();
    const headers = tokenCall?.[1]?.headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
    const tokenRequestBody = JSON.parse(tokenCall?.[1]?.body as string) as Record<string, string>;
    expect(tokenRequestBody).toMatchObject({
      grant_type: 'authorization_code',
      code: 'fake-code',
      client_id: 'cid-2',
      client_secret: 'csecret-2',
    });

    const documentsResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents`)
      .set(auth(token));
    const integrationsDoc = documentsResponse.body.find((doc: { id: string }) => doc.id === integrationsDocId);
    const instance = integrationsDoc.data.instances.find((candidate: { id: string }) => candidate.id === 'cred-2');
    expect(instance.fields.account_domain).toBe('my-account.amocrm.test');
  });

  it('refuses a callback whose account domain is outside the vendor allowlist (SSRF) without calling it', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [{ id: 'cred-2', vendor: 'activepieces-accountdomainpiece', name: 'x', fields: {} }],
        },
      })
      .expect(200);
    await createPlatformCredential(token);
    const startResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-2/oauth2/start`)
      .set(auth(token));
    const state = new URL(startResponse.body.authorizeUrl).searchParams.get('state');

    const callbackResponse = await request(app.getHttpServer()).get(
      `/oauth2/callback/activepieces-accountdomainpiece?code=fake-code&state=${state}&referer=https://169.254.169.254`,
    );

    expect(callbackResponse.text).toContain('Connection failed');
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes('169.254.169.254'))).toBe(false);
  });

  it('400s the callback when the account-domain callback param is required but missing', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            { id: 'cred-2', vendor: 'activepieces-accountdomainpiece', name: 'My Account-Domain OAuth', fields: {} },
          ],
        },
      })
      .expect(200);
    await createPlatformCredential(token);
    const startResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-2/oauth2/start`)
      .set(auth(token));
    const state = new URL(startResponse.body.authorizeUrl).searchParams.get('state');

    const callbackResponse = await request(app.getHttpServer()).get(
      `/oauth2/callback/activepieces-accountdomainpiece?code=fake-code&state=${state}`,
    );

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.text).toContain('Connection failed');
  });
});
