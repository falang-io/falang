import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EgressGuardModule from '../../net/egress-guard.js';
import { launchOAuth2 } from '../../test-utils/oauth2-flow.js';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

// The real egress guard talks to the network; these tests stub the global `fetch`, so route the guard's `fetch` to it.
vi.mock('../../net/egress-guard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof EgressGuardModule>()),
  getBackendEgress: () => ({
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
    resolveHost: (host: string) => Promise.resolve(host),
  }),
}));

const catalogFor = (oauth2Extra: Record<string, unknown>) => [
  {
    pieceName: 'oauthpiece',
    displayName: 'OAuth Piece',
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
        { name: 'oauth_data', kind: 'text', displayName: 'OAuth data', hidden: true },
      ],
      oauth2: {
        authUrl: 'https://vendor.test/authorize',
        tokenUrl: 'https://vendor.test/token',
        scope: ['profile'],
        ...oauth2Extra,
      },
    },
    actions: [],
    triggers: [],
  },
];

const VENDOR = 'activepieces-oauthpiece';

describe('OAuth2 flow: PKCE, prompt and a credential deleted mid-flow', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let fetchMock: ReturnType<typeof vi.fn>;
  let catalog = catalogFor({});

  beforeEach(() => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('ACTIVEPIECES_SERVICE_URL', 'http://activepieces.test');
    vi.stubEnv('ACTIVEPIECES_SERVICE_SECRET', 'test-activepieces-secret');
    vi.stubEnv('BACKEND_PUBLIC_URL', 'http://backend.test');
    fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url === 'http://activepieces.test/pieces') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(catalog) });
      }
      if (url === 'https://vendor.test/token') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'tok-abc' }) });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const startFlow = async (oauth2Extra: Record<string, unknown>) => {
    catalog = catalogFor(oauth2Extra);
    app = await createTestApp();
    const token = await login(app);
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = created.body.id;
    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    const docId: string = tree.body.documents[0].id;
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({ data: { instances: [{ id: 'cred-1', vendor: VENDOR, name: 'My OAuth', fields: {} }] } })
      .expect(200);
    await request(app.getHttpServer())
      .put(`/admin/oauth-credentials/${VENDOR}`)
      .set(auth(token))
      .send({ clientId: 'cid-1', clientSecret: 'csecret-1' })
      .expect(200);
    const start = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-1/oauth2/start`)
      .set(auth(token));
    expect(start.status).toBe(201);
    const launched = await launchOAuth2(app, start.body.authorizeUrl);
    return {
      token,
      projectId,
      docId,
      authorizeUrl: launched.vendorUrl,
      state: launched.state,
      cookie: launched.cookie,
    };
  };

  const tokenRequestBody = (): URLSearchParams | undefined =>
    fetchMock.mock.calls.find((call) => call[0] === 'https://vendor.test/token')?.[1]?.body as
      | URLSearchParams
      | undefined;

  it('defaults to S256: the authorize URL carries the challenge and the callback sends the stored verifier', async () => {
    const { authorizeUrl, state, cookie } = await startFlow({ pkce: true });

    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const challenge = authorizeUrl.searchParams.get('code_challenge') ?? '';
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const callback = await request(app.getHttpServer())
      .get(`/oauth2/callback/${VENDOR}?code=c1&state=${state}`)
      .set('Cookie', cookie);
    expect(callback.text).toContain('Connected');

    const verifier = tokenRequestBody()?.get('code_verifier') ?? '';
    expect(verifier).toHaveLength(43);
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
  });

  it("pkceMethod 'plain': challenge equals the verifier sent on callback", async () => {
    const { authorizeUrl, state, cookie } = await startFlow({ pkce: true, pkceMethod: 'plain' });

    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('plain');
    const challenge = authorizeUrl.searchParams.get('code_challenge');
    await request(app.getHttpServer()).get(`/oauth2/callback/${VENDOR}?code=c1&state=${state}`).set('Cookie', cookie);

    expect(tokenRequestBody()?.get('code_verifier')).toBe(challenge);
  });

  it('a vendor without pkce gets neither code_challenge nor code_verifier', async () => {
    const { authorizeUrl, state, cookie } = await startFlow({});

    expect(authorizeUrl.searchParams.has('code_challenge')).toBe(false);
    expect(authorizeUrl.searchParams.has('code_challenge_method')).toBe(false);
    await request(app.getHttpServer()).get(`/oauth2/callback/${VENDOR}?code=c1&state=${state}`).set('Cookie', cookie);
    expect(tokenRequestBody()?.has('code_verifier')).toBe(false);
  });

  it("prompt 'omit' removes the parameter even when an extra supplies one", async () => {
    const { authorizeUrl } = await startFlow({ extra: { prompt: 'consent' }, prompt: 'omit' });

    expect(authorizeUrl.searchParams.has('prompt')).toBe(false);
  });

  it('an extra prompt is kept when the vendor does not say omit', async () => {
    const { authorizeUrl } = await startFlow({ extra: { prompt: 'consent' } });

    expect(authorizeUrl.searchParams.get('prompt')).toBe('consent');
  });

  it('callback for a credential deleted during the flow: error page, no token exchange, nothing stored', async () => {
    const { token, projectId, docId, state, cookie } = await startFlow({});
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({ data: { instances: [] } })
      .expect(200);

    const callback = await request(app.getHttpServer())
      .get(`/oauth2/callback/${VENDOR}?code=c1&state=${state}`)
      .set('Cookie', cookie);

    expect(callback.status).toBe(200);
    expect(callback.text).toContain('Connection failed');
    expect(callback.text).toContain('no longer exists');
    expect(tokenRequestBody()).toBeUndefined();
    const documents = await request(app.getHttpServer()).get(`/projects/${projectId}/documents`).set(auth(token));
    const integrationsDoc = documents.body.find((doc: { id: string }) => doc.id === docId);
    expect(integrationsDoc.data.instances).toEqual([]);
  });
});
