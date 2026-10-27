import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

/** Security audit P1-3: `maxProjects` applies to creation, import, templates and admin transfers. */
describe('maxProjects limit', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('SELF_SERVICE_SIGNUP', 'true');
    vi.stubEnv('MAX_PROJECTS', '2');
    app = await createTestApp();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  const register = async (username: string): Promise<{ token: string; id: string }> => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'password123' });
    return { token: response.body.accessToken as string, id: response.body.user.id as string };
  };

  const create = (token: string) => request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'P' });

  it('refuses the project over the cap with 403 project_limit, for plain creation and for import', async () => {
    const alice = await register('alice');
    await create(alice.token).expect(201);
    const second = await create(alice.token).expect(201);
    const refused = await create(alice.token);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('project_limit');

    const exported = await request(app.getHttpServer())
      .get(`/projects/${second.body.id}/export`)
      .set(auth(alice.token))
      .expect(200);
    const imported = await request(app.getHttpServer())
      .post('/projects/import')
      .set(auth(alice.token))
      .send(exported.body);
    expect(imported.status).toBe(403);
    expect(imported.body.code).toBe('project_limit');
  });

  it('honours a per-user override from the admin limits route', async () => {
    const alice = await register('alice');
    const adminToken = await login(app);
    await request(app.getHttpServer())
      .put(`/admin/users/${alice.id}/limits`)
      .set(auth(adminToken))
      .send({ maxProjects: 3 })
      .expect(200);
    await create(alice.token).expect(201);
    await create(alice.token).expect(201);
    await create(alice.token).expect(201);
    await create(alice.token).expect(403);
  });

  it('refuses an admin transfer that would push the new owner over the cap', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const aliceProject = await create(alice.token).expect(201);
    await create(bob.token).expect(201);
    await create(bob.token).expect(201);
    const adminToken = await login(app);

    const refused = await request(app.getHttpServer())
      .post(`/admin/projects/${aliceProject.body.id as string}/transfer`)
      .set(auth(adminToken))
      .send({ login: 'bob' });
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('project_limit');
  });
});
