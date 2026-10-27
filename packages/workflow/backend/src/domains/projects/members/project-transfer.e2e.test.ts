import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { Repository } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { Task } from '../../tasks/task.entity.js';

/** ADR 0070 (private): a platform admin hands a project to another user. */
describe('project transfer (admin)', () => {
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

  const createProject = async (token: string): Promise<string> => {
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'Bot' });
    return created.body.id as string;
  };

  const addTask = (projectId: string, nodeId: string, assigneeId: string) =>
    app.get<Repository<Task>>(getRepositoryToken(Task)).save({
      projectId,
      env: 'dev',
      workflowId: 'wf',
      runId: 'run',
      taskQueue: 'q',
      nodeId,
      title: 'Approve',
      description: '',
      payload: null,
      attachments: null,
      options: [],
      status: 'open',
      assigneeId,
    } as Partial<Task>);

  it('moves ownership, keeps the previous owner with the chosen roles and drops the new owner’s member rows', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const projectId = await createProject(alice.token);
    const server = app.getHttpServer();
    await request(server)
      .post(`/projects/${projectId}/members`)
      .set(auth(alice.token))
      .send({ login: 'bob', roles: ['executor'] })
      .expect(201);
    const adminToken = await login(app);

    const transferred = await request(server)
      .post(`/admin/projects/${projectId}/transfer`)
      .set(auth(adminToken))
      .send({ login: 'BOB', previousOwnerRoles: ['editor'] })
      .expect(201);
    expect(transferred.body).toEqual({ projectId, previousOwnerId: alice.id, ownerId: bob.id });

    const members = await request(server).get(`/projects/${projectId}/members`).set(auth(bob.token)).expect(200);
    expect(members.body).toMatchObject({
      owner: { username: 'bob' },
      members: [{ username: 'alice', roles: ['editor'] }],
    });
    const bobInfo = await request(server).get(`/projects/${projectId}`).set(auth(bob.token)).expect(200);
    expect(bobInfo.body).toMatchObject({ myRoles: ['owner'], readOnly: false });
    const aliceProjects = await request(server).get('/projects').set(auth(alice.token)).expect(200);
    expect(aliceProjects.body).toEqual([expect.objectContaining({ id: projectId, myRoles: ['editor'] })]);
    const bobProjects = await request(server).get(`/admin/users/${bob.id}/projects`).set(auth(adminToken)).expect(200);
    expect(bobProjects.body).toEqual([expect.objectContaining({ id: projectId })]);
  });

  it('reassigns the previous owner’s open tasks when they lose access', async () => {
    const alice = await register('alice');
    const bob = await register('bob');
    const projectId = await createProject(alice.token);
    await addTask(projectId, 'n1', alice.id);
    await addTask(projectId, 'n2', alice.id);
    const adminToken = await login(app);
    const server = app.getHttpServer();

    await request(server)
      .post(`/admin/projects/${projectId}/transfer`)
      .set(auth(adminToken))
      .send({ login: 'bob' })
      .expect(201);

    await request(server).get(`/projects/${projectId}`).set(auth(alice.token)).expect(404);
    const tasks = await app.get<Repository<Task>>(getRepositoryToken(Task)).find({ where: { projectId } });
    expect(tasks.map((task) => task.assigneeId)).toEqual([bob.id, bob.id]);
  });

  it('refuses non-admins, unknown logins and the current owner', async () => {
    const alice = await register('alice');
    const projectId = await createProject(alice.token);
    const server = app.getHttpServer();
    await request(server)
      .post(`/admin/projects/${projectId}/transfer`)
      .set(auth(alice.token))
      .send({ login: 'admin' })
      .expect(403);
    const adminToken = await login(app);
    await request(server)
      .post(`/admin/projects/${projectId}/transfer`)
      .set(auth(adminToken))
      .send({ login: 'nobody' })
      .expect(404);
    await request(server)
      .post(`/admin/projects/${projectId}/transfer`)
      .set(auth(adminToken))
      .send({ login: 'alice' })
      .expect(400);
    await request(server)
      .post(`/admin/projects/${projectId}/transfer`)
      .set(auth(adminToken))
      .send({ login: 'alice', previousOwnerRoles: ['owner'] })
      .expect(400);
    await request(server)
      .post('/admin/projects/00000000-0000-4000-8000-000000000000/transfer')
      .set(auth(adminToken))
      .send({ login: 'alice' })
      .expect(404);
  });
});
