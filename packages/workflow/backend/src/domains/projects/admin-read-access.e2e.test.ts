import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { Project } from './projects/project.entity.js';

/**
 * A platform admin may read (never write) any user's project — `TProjectAccess` `'read'` on GET routes only.
 */
describe('admin read-only access to other users’ projects', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const registerUser = async (username: string, password = 'password123'): Promise<string> => {
    await request(app.getHttpServer()).post('/auth/register').send({ username, password });
    return login(app, username, password);
  };

  const setup = async () => {
    const adminToken = await login(app);
    const aliceToken = await registerUser('alice');
    const created = await request(app.getHttpServer()).post('/projects').set(auth(aliceToken)).send({ name: 'Bot' });
    const project = created.body as { id: string };
    const listed = await request(app.getHttpServer()).get(`/projects/${project.id}/documents`).set(auth(aliceToken));
    const documents = listed.body as { id: string; type: string }[];
    const integrationsId = documents.find((document) => document.type === 'integrations')?.id ?? '';
    return { adminToken, aliceToken, projectId: project.id, integrationsId };
  };

  it('lets an admin list a user’s projects and read one, marked readOnly', async () => {
    const { adminToken, projectId } = await setup();
    const server = app.getHttpServer();
    const usersResponse = await request(server).get('/admin/users').set(auth(adminToken));
    const users = usersResponse.body as { id: string; username: string }[];
    const aliceId = users.find((user) => user.username === 'alice')?.id ?? '';

    const projects = await request(server).get(`/admin/users/${aliceId}/projects`).set(auth(adminToken)).expect(200);
    expect(projects.body).toEqual([expect.objectContaining({ id: projectId, name: 'Bot', prodEnabled: false })]);

    const info = await request(server).get(`/projects/${projectId}`).set(auth(adminToken)).expect(200);
    expect(info.body).toMatchObject({ id: projectId, name: 'Bot', readOnly: true, owner: { username: 'alice' } });

    for (const path of ['tree', 'documents', 'documents/locks', 'folders', 'export', 'commits', 'journal-settings']) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: parallel supertest calls reset connections.
      await request(server).get(`/projects/${projectId}/${path}`).set(auth(adminToken)).expect(200);
    }
  });

  it('refuses every write by an admin to someone else’s project', async () => {
    const { adminToken, projectId, integrationsId } = await setup();
    const server = app.getHttpServer();

    await request(server)
      .patch(`/projects/${projectId}/documents/${integrationsId}`)
      .set(auth(adminToken))
      .send({ name: 'x' })
      .expect(404);
    await request(server)
      .post(`/projects/${projectId}/documents`)
      .set(auth(adminToken))
      .send({ id: '11111111-1111-4111-8111-111111111111', type: 'function', name: 'f' })
      .expect(404);
    await request(server)
      .post(`/projects/${projectId}/commits`)
      .set(auth(adminToken))
      .send({
        kind: 'named',
        message: 'm',
      })
      .expect(404);
    await request(server)
      .put(`/projects/${projectId}/journal-settings`)
      .set(auth(adminToken))
      .send({ storeTexts: false })
      .expect(404);
    await request(server).post(`/projects/${projectId}/build`).set(auth(adminToken)).expect(404);
    await request(server).delete(`/projects/${projectId}`).set(auth(adminToken)).expect(404);
  });

  it('keeps the owner as readOnly: false and hides the project from other non-admin users', async () => {
    const { aliceToken, projectId } = await setup();
    const server = app.getHttpServer();
    const bobToken = await registerUser('bob');

    const own = await request(server).get(`/projects/${projectId}`).set(auth(aliceToken)).expect(200);
    expect(own.body.readOnly).toBe(false);

    await request(server).get(`/projects/${projectId}`).set(auth(bobToken)).expect(404);
    await request(server).get(`/projects/${projectId}/tree`).set(auth(bobToken)).expect(404);
    await request(server).get(`/projects/${projectId}/export`).set(auth(bobToken)).expect(404);
    const users = await request(server).get('/admin/users').set(auth(bobToken));
    expect(users.status).toBe(403);
  });

  it('lists a user’s projects as the owner sees them: most recently changed first', async () => {
    const adminToken = await login(app);
    const aliceToken = await registerUser('alice');
    const server = app.getHttpServer();
    const create = async (name: string): Promise<string> => {
      const response = await request(server).post('/projects').set(auth(aliceToken)).send({ name });
      return (response.body as { id: string }).id;
    };
    const oldEdited = await create('old, edited recently');
    const middle = await create('middle');
    const newest = await create('newest');
    const projects = app.get(getRepositoryToken(Project));
    await projects.update(oldEdited, { createdAt: new Date('2026-01-01'), lastEditedAt: new Date('2026-04-01') });
    await projects.update(middle, { createdAt: new Date('2026-02-01') });
    await projects.update(newest, { createdAt: new Date('2026-03-01') });
    const usersResponse = await request(server).get('/admin/users').set(auth(adminToken));
    const aliceId = (usersResponse.body as { id: string; username: string }[]).find(
      (user) => user.username === 'alice',
    )?.id;

    const listed = await request(server).get(`/admin/users/${aliceId}/projects`).set(auth(adminToken)).expect(200);

    expect((listed.body as { id: string }[]).map((project) => project.id)).toEqual([oldEdited, newest, middle]);
  });

  it('404s an unknown user’s project list', async () => {
    const adminToken = await login(app);
    await request(app.getHttpServer())
      .get('/admin/users/00000000-0000-0000-0000-000000000000/projects')
      .set(auth(adminToken))
      .expect(404);
  });
});
