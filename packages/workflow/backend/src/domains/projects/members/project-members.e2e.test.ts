import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { ProjectsService } from '../projects/projects.service.js';

/** ADR 0070 (private): what an editor, an executor and an admin may do in someone else's project. */
describe('project members — access levels', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('SELF_SERVICE_SIGNUP', 'true');
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

  const setup = async () => {
    const owner = await register('alice');
    const editor = await register('bob');
    const executor = await register('carol');
    const created = await request(app.getHttpServer()).post('/projects').set(auth(owner.token)).send({ name: 'Bot' });
    const projectId = created.body.id as string;
    return { owner, editor, executor, projectId };
  };

  it('gives an editor full write access except deleting the project', async () => {
    const { owner, editor, projectId } = await setup();
    const server = app.getHttpServer();
    await request(server).get(`/projects/${projectId}/documents`).set(auth(editor.token)).expect(404);

    const added = await request(server)
      .post(`/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ login: 'bob', roles: ['editor'] })
      .expect(201);
    expect(added.body).toMatchObject({
      owner: { username: 'alice' },
      members: [{ username: 'bob', roles: ['editor'], openTasks: 0 }],
    });

    const info = await request(server).get(`/projects/${projectId}`).set(auth(editor.token)).expect(200);
    expect(info.body).toMatchObject({ myRoles: ['editor'], readOnly: false, canRead: true });
    await request(server)
      .post(`/projects/${projectId}/documents`)
      .set(auth(editor.token))
      .send({ id: '11111111-1111-4111-8111-111111111111', type: 'function', name: 'greet' })
      .expect(201);
    // An editor manages members too.
    await request(server)
      .post(`/projects/${projectId}/members`)
      .set(auth(editor.token))
      .send({ login: 'carol', roles: ['executor'] })
      .expect(201);
    await expect(app.get(ProjectsService).delete(projectId, editor.id)).rejects.toThrow('not found');

    const projects = await request(server).get('/projects').set(auth(editor.token)).expect(200);
    expect(projects.body).toEqual([expect.objectContaining({ id: projectId, myRoles: ['editor'] })]);
  });

  it('keeps an executor out of the project contents', async () => {
    const { owner, executor, projectId } = await setup();
    const server = app.getHttpServer();
    await request(server)
      .post(`/projects/${projectId}/members`)
      .set(auth(owner.token))
      .send({ login: 'carol', roles: ['executor'] })
      .expect(201);
    for (const path of ['documents', 'tree', 'export', 'commits', 'members']) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: parallel supertest calls reset connections.
      await request(server).get(`/projects/${projectId}/${path}`).set(auth(executor.token)).expect(404);
    }
  });

  it('lets an admin manage members of any project', async () => {
    const { projectId, editor } = await setup();
    const adminToken = await login(app);
    const server = app.getHttpServer();
    await request(server)
      .post(`/projects/${projectId}/members`)
      .set(auth(adminToken))
      .send({ login: 'bob', roles: ['editor', 'executor'] })
      .expect(201);
    const updated = await request(server)
      .put(`/projects/${projectId}/members/${editor.id}`)
      .set(auth(adminToken))
      .send({ roles: ['executor'] })
      .expect(200);
    expect(updated.body.members).toEqual([expect.objectContaining({ username: 'bob', roles: ['executor'] })]);
    await request(server).delete(`/projects/${projectId}/members/${editor.id}`).set(auth(adminToken)).expect(200);
    // Still read-only for the admin's own edits of the project's contents.
    await request(server)
      .post(`/projects/${projectId}/documents`)
      .set(auth(adminToken))
      .send({ id: '22222222-2222-4222-8222-222222222222', type: 'function', name: 'x' })
      .expect(404);
  });
});
