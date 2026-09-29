import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

const oauthPieceCatalog = [
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
        // What the ActivePieces adapter emits for every piece (its own server's defaults merged with
        // the piece's `extra`) — `''` is the "suppress this param" idiom, `prompt` is overridden by
        // the explicit field below (`IOAuth2Config.prompt` wins over an `extra`-supplied default).
        extra: { access_type: 'offline', prompt: 'consent', token_access_type: 'offline', suppressed: '' },
        prompt: 'login',
      },
    },
    actions: [],
    triggers: [],
  },
];

describe('OAuth2 authorization-code flow (/oauth2/start + /oauth2/callback)', () => {
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
        return Promise.resolve({ ok: true, json: () => Promise.resolve(oauthPieceCatalog) });
      }
      if (url === 'https://vendor.test/token') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'tok-abc', refresh_token: 'refresh-1', expires_in: 3600 }),
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

  const saveOAuthCredential = (projectId: string, docId: string, token: string) =>
    request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [{ id: 'cred-1', vendor: 'activepieces-oauthpiece', name: 'My OAuth', fields: {} }],
        },
      });

  /**
   * A platform-owned OAuth2 client, ADR 0030 (private)
   * — replaces the per-credential `client_id`/`client_secret` fields this test used to save directly
   * onto the instance. `login(app)`'s default `admin`/`admin` seed user is an admin (see
   * `UsersService`'s seed), so the same token doubles as the admin token here.
   */
  const createPlatformCredential = (adminToken: string) =>
    request(app.getHttpServer())
      .put('/admin/oauth-credentials/activepieces-oauthpiece')
      .set(auth(adminToken))
      .send({ clientId: 'cid-1', clientSecret: 'csecret-1' })
      .expect(200);

  it('builds the authorize URL from the saved client_id and the piece catalog oauth2 config', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveOAuthCredential(projectId, integrationsDocId, token).expect(200);
    await createPlatformCredential(token);

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-1/oauth2/start`)
      .set(auth(token));

    expect(response.status).toBe(201);
    const authorizeUrl = new URL(response.body.authorizeUrl);
    expect(authorizeUrl.origin + authorizeUrl.pathname).toBe('https://vendor.test/authorize');
    expect(authorizeUrl.searchParams.get('client_id')).toBe('cid-1');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'http://backend.test/oauth2/callback/activepieces-oauthpiece',
    );
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('scope')).toBe('profile');
    expect(authorizeUrl.searchParams.get('state')).toBeTruthy();
    // `IOAuth2Config.extra` handling: appended verbatim, `''` suppresses, explicit `prompt` wins.
    expect(authorizeUrl.searchParams.get('access_type')).toBe('offline');
    expect(authorizeUrl.searchParams.get('token_access_type')).toBe('offline');
    expect(authorizeUrl.searchParams.has('suppressed')).toBe(false);
    expect(authorizeUrl.searchParams.get('prompt')).toBe('login');
  });

  it('400s when client_id/client_secret have not been saved yet', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: { instances: [{ id: 'cred-1', vendor: 'activepieces-oauthpiece', name: 'My OAuth', fields: {} }] },
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-1/oauth2/start`)
      .set(auth(token));

    expect(response.status).toBe(400);
  });

  it('404s for an unknown credentialId', async () => {
    const token = await login(app);
    const { projectId } = await setUpProject(token);

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/unknown-cred/oauth2/start`)
      .set(auth(token));

    expect(response.status).toBe(404);
  });

  it('exchanges the code for tokens on callback and masks the credential on the next read', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveOAuthCredential(projectId, integrationsDocId, token).expect(200);
    await createPlatformCredential(token);
    const startResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-1/oauth2/start`)
      .set(auth(token));
    const state = new URL(startResponse.body.authorizeUrl).searchParams.get('state');

    const callbackResponse = await request(app.getHttpServer()).get(
      `/oauth2/callback/activepieces-oauthpiece?code=fake-code&state=${state}`,
    );

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.text).toContain('Connected');
    expect(fetchMock).toHaveBeenCalledWith('https://vendor.test/token', expect.objectContaining({ method: 'POST' }));
    const tokenRequestBody = fetchMock.mock.calls.find((call) => call[0] === 'https://vendor.test/token')?.[1]
      ?.body as URLSearchParams;
    expect(tokenRequestBody.get('grant_type')).toBe('authorization_code');
    expect(tokenRequestBody.get('code')).toBe('fake-code');
    expect(tokenRequestBody.get('client_id')).toBe('cid-1');
    expect(tokenRequestBody.get('client_secret')).toBe('csecret-1');

    const documentsResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/documents`)
      .set(auth(token));
    const integrationsDoc = documentsResponse.body.find((doc: { id: string }) => doc.id === integrationsDocId);
    const instance = integrationsDoc.data.instances.find((candidate: { id: string }) => candidate.id === 'cred-1');
    expect(instance.fields.access_token).toEqual({ dev: '••••••••', prod: '' });
  });

  it('rejects a reused or unknown state', async () => {
    const response = await request(app.getHttpServer()).get(
      '/oauth2/callback/activepieces-oauthpiece?code=fake-code&state=not-a-real-state',
    );

    expect(response.status).toBe(200);
    expect(response.text).toContain('Connection failed');
  });
});
