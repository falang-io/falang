// oxlint-disable max-lines -- over the default cap because of the new "GET/PUT /admin/users/:id/limits" describe block (ADR 0038 (private) §2); the pre-existing OAuth2 piece catalog fixture and the AdminGuard/oauth-credentials suites above account for most of the file, not accumulated complexity.
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
      ],
      oauth2: {
        authUrl: 'https://vendor.test/authorize',
        tokenUrl: 'https://vendor.test/token',
        scope: ['profile'],
      },
    },
    actions: [],
    triggers: [],
  },
  {
    pieceName: 'nonoauthpiece',
    displayName: 'Non-OAuth Piece',
    auth: {
      type: 'SECRET_TEXT',
      displayName: 'API key',
      required: true,
      fields: [{ name: 'secret_text', kind: 'secret', displayName: 'API key' }],
    },
    actions: [],
    triggers: [],
  },
];

/**
 * Covers ADR 0030 (private)'s `AdminGuard`,
 * `/admin/users`, `/admin/oauth-credentials` CRUD, and the catalog-gating effect on
 * `GET /activepieces/pieces`.
 */
describe('admin domain (/admin/*)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('ACTIVEPIECES_SERVICE_URL', 'http://activepieces.test');
    vi.stubEnv('ACTIVEPIECES_SERVICE_SECRET', 'test-activepieces-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url === 'http://activepieces.test/pieces') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(oauthPieceCatalog) });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const registerUser = async (username: string, password = 'password123'): Promise<string> => {
    await request(app.getHttpServer()).post('/auth/register').send({ username, password });
    return login(app, username, password);
  };

  describe('AdminGuard', () => {
    it('403s a non-admin user on every /admin/* route', async () => {
      const userToken = await registerUser('alice');

      const usersResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(userToken));
      const oauthResponse = await request(app.getHttpServer()).get('/admin/oauth-credentials').set(auth(userToken));

      expect(usersResponse.status).toBe(403);
      expect(oauthResponse.status).toBe(403);
    });

    it('401s an unauthenticated request', async () => {
      const response = await request(app.getHttpServer()).get('/admin/users');
      expect(response.status).toBe(401);
    });

    it('allows the seeded admin/admin user through', async () => {
      const adminToken = await login(app);
      const response = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      expect(response.status).toBe(200);
    });
  });

  describe('GET /admin/users + PATCH /admin/users/:id/role', () => {
    it('lists every user with their role and projects count', async () => {
      const adminToken = await login(app);
      const aliceToken = await registerUser('alice');
      await request(app.getHttpServer()).post('/projects').set(auth(aliceToken)).send({ name: 'p1' });
      await request(app.getHttpServer()).post('/projects').set(auth(aliceToken)).send({ name: 'p2' });

      const response = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));

      expect(response.status).toBe(200);
      const alice = response.body.find((user: { username: string }) => user.username === 'alice');
      expect(alice).toMatchObject({ username: 'alice', role: 'user', projectsCount: 2 });
      const admin = response.body.find((user: { username: string }) => user.username === 'admin');
      expect(admin).toMatchObject({ username: 'admin', role: 'admin' });
    });

    it('promotes a user to admin', async () => {
      const adminToken = await login(app);
      await registerUser('alice');
      const listResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const aliceId: string = listResponse.body.find((user: { username: string }) => user.username === 'alice').id;

      const response = await request(app.getHttpServer())
        .patch(`/admin/users/${aliceId}/role`)
        .set(auth(adminToken))
        .send({ role: 'admin' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('admin');

      const aliceToken = await login(app, 'alice', 'password123');
      const aliceAdminAccess = await request(app.getHttpServer()).get('/admin/users').set(auth(aliceToken));
      expect(aliceAdminAccess.status).toBe(200);
    });

    it('400s when an admin tries to change their own role', async () => {
      const adminToken = await login(app);
      const listResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const adminId: string = listResponse.body.find((user: { username: string }) => user.username === 'admin').id;

      const response = await request(app.getHttpServer())
        .patch(`/admin/users/${adminId}/role`)
        .set(auth(adminToken))
        .send({ role: 'user' });

      expect(response.status).toBe(400);
    });

    it('400s an invalid role value', async () => {
      const adminToken = await login(app);
      const listResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const adminId: string = listResponse.body[0].id;

      const response = await request(app.getHttpServer())
        .patch(`/admin/users/${adminId}/role`)
        .set(auth(adminToken))
        .send({ role: 'superadmin' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET/PUT/DELETE /admin/oauth-credentials', () => {
    it('lists one entry per ActivePieces OAuth2 piece, disabled with no clientId until configured', async () => {
      const adminToken = await login(app);

      const response = await request(app.getHttpServer()).get('/admin/oauth-credentials').set(auth(adminToken));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          vendor: 'activepieces-oauthpiece',
          pieceName: 'oauthpiece',
          displayName: 'OAuth Piece',
          enabled: false,
          clientId: null,
          updatedAt: null,
        },
      ]);
    });

    it('upserts a platform credential and never returns the secret', async () => {
      const adminToken = await login(app);

      const response = await request(app.getHttpServer())
        .put('/admin/oauth-credentials/activepieces-oauthpiece')
        .set(auth(adminToken))
        .send({ clientId: 'cid-1', clientSecret: 'secret-1' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ vendor: 'activepieces-oauthpiece', enabled: true, clientId: 'cid-1' });
      expect(response.body.clientSecret).toBeUndefined();
      expect(JSON.stringify(response.body)).not.toContain('secret-1');
    });

    it('404s upserting a vendor that is not an ActivePieces OAuth2 piece', async () => {
      const adminToken = await login(app);

      const response = await request(app.getHttpServer())
        .put('/admin/oauth-credentials/activepieces-nonoauthpiece')
        .set(auth(adminToken))
        .send({ clientId: 'cid-1', clientSecret: 'secret-1' });

      expect(response.status).toBe(404);
    });

    it('400s an upsert with a missing clientSecret', async () => {
      const adminToken = await login(app);

      const response = await request(app.getHttpServer())
        .put('/admin/oauth-credentials/activepieces-oauthpiece')
        .set(auth(adminToken))
        .send({ clientId: 'cid-1', clientSecret: '' });

      expect(response.status).toBe(400);
    });

    it('deletes a platform credential, disabling the vendor again', async () => {
      const adminToken = await login(app);
      await request(app.getHttpServer())
        .put('/admin/oauth-credentials/activepieces-oauthpiece')
        .set(auth(adminToken))
        .send({ clientId: 'cid-1', clientSecret: 'secret-1' })
        .expect(200);

      const deleteResponse = await request(app.getHttpServer())
        .delete('/admin/oauth-credentials/activepieces-oauthpiece')
        .set(auth(adminToken));
      expect(deleteResponse.status).toBe(204);

      const listResponse = await request(app.getHttpServer()).get('/admin/oauth-credentials').set(auth(adminToken));
      expect(listResponse.body[0]).toMatchObject({ enabled: false, clientId: null });
    });
  });

  describe('GET/PUT /admin/users/:id/limits', () => {
    it('403s a non-admin user', async () => {
      const userToken = await registerUser('alice');

      const response = await request(app.getHttpServer())
        .get('/admin/users/00000000-0000-0000-0000-000000000000/limits')
        .set(auth(userToken));

      expect(response.status).toBe(403);
    });

    it('404s an unknown user id', async () => {
      const adminToken = await login(app);

      const response = await request(app.getHttpServer())
        .get('/admin/users/00000000-0000-0000-0000-000000000000/limits')
        .set(auth(adminToken));

      expect(response.status).toBe(404);
    });

    it('reports env defaults with no overrides before anything is set', async () => {
      const adminToken = await login(app);
      await registerUser('alice');
      const listResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const aliceId: string = listResponse.body.find((user: { username: string }) => user.username === 'alice').id;

      const response = await request(app.getHttpServer()).get(`/admin/users/${aliceId}/limits`).set(auth(adminToken));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        effective: {
          maxProjectFilesBytes: 1_073_741_824,
          maxFileBytes: 104_857_600,
          devFileTtlHours: 24,
          ingressFileTtlHours: 168,
          maxConcurrentProdVersions: 3,
        },
        overrides: {},
      });
    });

    it('overrides a limit via PUT, reflects it in the effective response, then clears it with null', async () => {
      const adminToken = await login(app);
      await registerUser('alice');
      const listResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const aliceId: string = listResponse.body.find((user: { username: string }) => user.username === 'alice').id;

      const putResponse = await request(app.getHttpServer())
        .put(`/admin/users/${aliceId}/limits`)
        .set(auth(adminToken))
        .send({ maxFileBytes: 200_000_000 });

      expect(putResponse.status).toBe(200);
      expect(putResponse.body.overrides).toEqual({ maxFileBytes: 200_000_000 });
      expect(putResponse.body.effective.maxFileBytes).toBe(200_000_000);
      expect(putResponse.body.effective.maxProjectFilesBytes).toBe(1_073_741_824);

      const getResponse = await request(app.getHttpServer())
        .get(`/admin/users/${aliceId}/limits`)
        .set(auth(adminToken));
      expect(getResponse.body.effective.maxFileBytes).toBe(200_000_000);

      const resetResponse = await request(app.getHttpServer())
        .put(`/admin/users/${aliceId}/limits`)
        .set(auth(adminToken))
        .send({ maxFileBytes: null });

      expect(resetResponse.status).toBe(200);
      expect(resetResponse.body.overrides).toEqual({});
      expect(resetResponse.body.effective.maxFileBytes).toBe(104_857_600);
    });

    it('overrides maxConcurrentProdVersions and rejects 0', async () => {
      const adminToken = await login(app);
      await registerUser('alice');
      const listResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const aliceId: string = listResponse.body.find((user: { username: string }) => user.username === 'alice').id;

      const bad = await request(app.getHttpServer())
        .put(`/admin/users/${aliceId}/limits`)
        .set(auth(adminToken))
        .send({ maxConcurrentProdVersions: 0 });
      expect(bad.status).toBe(400);

      const ok = await request(app.getHttpServer())
        .put(`/admin/users/${aliceId}/limits`)
        .set(auth(adminToken))
        .send({ maxConcurrentProdVersions: 1 });
      expect(ok.status).toBe(200);
      expect(ok.body.overrides).toEqual({ maxConcurrentProdVersions: 1 });
      expect(ok.body.effective.maxConcurrentProdVersions).toBe(1);
    });

    it('400s a non-integer override value', async () => {
      const adminToken = await login(app);
      await registerUser('alice');
      const listResponse = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const aliceId: string = listResponse.body.find((user: { username: string }) => user.username === 'alice').id;

      const response = await request(app.getHttpServer())
        .put(`/admin/users/${aliceId}/limits`)
        .set(auth(adminToken))
        .send({ maxFileBytes: 0.5 });

      expect(response.status).toBe(400);
    });
  });

  describe('catalog gating (GET /activepieces/pieces)', () => {
    it('hides an OAuth2 piece until a platform row exists, and always shows a non-OAuth2 piece', async () => {
      const adminToken = await login(app);

      const beforeResponse = await request(app.getHttpServer()).get('/activepieces/pieces').set(auth(adminToken));
      const beforePieceNames = beforeResponse.body.map((piece: { pieceName: string }) => piece.pieceName);
      expect(beforePieceNames).not.toContain('oauthpiece');
      expect(beforePieceNames).toContain('nonoauthpiece');

      await request(app.getHttpServer())
        .put('/admin/oauth-credentials/activepieces-oauthpiece')
        .set(auth(adminToken))
        .send({ clientId: 'cid-1', clientSecret: 'secret-1' })
        .expect(200);

      const afterResponse = await request(app.getHttpServer()).get('/activepieces/pieces').set(auth(adminToken));
      const oauthPiece = afterResponse.body.find((piece: { pieceName: string }) => piece.pieceName === 'oauthpiece');
      expect(oauthPiece).toBeTruthy();
      const fieldNames = oauthPiece.auth.fields.map((field: { name: string }) => field.name);
      expect(fieldNames).not.toContain('client_id');
      expect(fieldNames).not.toContain('client_secret');
      expect(fieldNames).toContain('access_token');
    });
  });
});
