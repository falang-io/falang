import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

describe('personal access tokens (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('creates a token, returns the raw secret once, and lists it without the hash afterward', async () => {
    const token = await login(app);

    const createResponse = await request(app.getHttpServer())
      .post('/auth/tokens')
      .set(auth(token))
      .send({ name: 'CI token' })
      .expect(201);

    expect(createResponse.body.rawToken).toMatch(/^flg_pat_/);
    expect(createResponse.body.token).toMatchObject({ name: 'CI token', projectId: null, lastUsedAt: null });
    expect(createResponse.body.token.tokenHash).toBeUndefined();
    expect(createResponse.body.token.rawToken).toBeUndefined();

    const listResponse = await request(app.getHttpServer()).get('/auth/tokens').set(auth(token)).expect(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].id).toBe(createResponse.body.token.id);
    expect(listResponse.body[0].tokenHash).toBeUndefined();
  });

  it('creates a project-scoped token with an expiry', async () => {
    const token = await login(app);
    const projectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set(auth(token))
      .send({ name: 'Scoped project' })
      .expect(201);
    const projectId: string = projectResponse.body.id;

    const createResponse = await request(app.getHttpServer())
      .post('/auth/tokens')
      .set(auth(token))
      .send({ name: 'Scoped token', projectId, expiresInDays: 7 })
      .expect(201);

    expect(createResponse.body.token.projectId).toBe(projectId);
    expect(new Date(createResponse.body.token.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('revokes a token, which then disappears from the list', async () => {
    const token = await login(app);
    const createResponse = await request(app.getHttpServer())
      .post('/auth/tokens')
      .set(auth(token))
      .send({ name: 'Throwaway' })
      .expect(201);
    const tokenId: string = createResponse.body.token.id;

    await request(app.getHttpServer()).delete(`/auth/tokens/${tokenId}`).set(auth(token)).expect(204);

    const listResponse = await request(app.getHttpServer()).get('/auth/tokens').set(auth(token)).expect(200);
    expect(listResponse.body).toHaveLength(0);
  });

  it('404s revoking a token that does not belong to the caller', async () => {
    const adminToken = await login(app);
    const createResponse = await request(app.getHttpServer())
      .post('/auth/tokens')
      .set(auth(adminToken))
      .send({ name: 'Admin token' })
      .expect(201);
    const tokenId: string = createResponse.body.token.id;

    await request(app.getHttpServer()).post('/auth/register').send({ username: 'other', password: 'password123' });
    const otherToken = await login(app, 'other', 'password123');

    await request(app.getHttpServer()).delete(`/auth/tokens/${tokenId}`).set(auth(otherToken)).expect(404);
  });

  it('rejects a request with no Authorization header', async () => {
    await request(app.getHttpServer()).get('/auth/tokens').expect(401);
  });
});
