import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../../test-utils/e2e-app.js';
import { createTasksTestApp } from './tasks-e2e-harness.js';

/** ADR 0070 (private): tasks of a project with members — assignment, visibility and resolution by executors. */
describe('tasks with project members (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let harness: Awaited<ReturnType<typeof createTasksTestApp>>;
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('SELF_SERVICE_SIGNUP', 'true');
    harness = await createTasksTestApp();
    ({ app } = harness);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  const registerAndLogin = (username: string) => harness.registerAndLogin(username);
  const createProject = (token: string) => harness.createProject(token);
  const internalToken = (projectId: string) => harness.internalToken(projectId);
  const internalCreate = (projectId: string, projectToken: string, overrides: Record<string, unknown> = {}) =>
    harness.internalCreate(projectId, projectToken, overrides);
  const addMember = (projectId: string, token: string, login: string, roles: string[]) =>
    request(app.getHttpServer()).post(`/projects/${projectId}/members`).set(auth(token)).send({ login, roles });

  it('assigns tasks to the owner without executors, then to the least loaded executor', async () => {
    const owner = await registerAndLogin('m-owner');
    const exec1 = await registerAndLogin('m-exec1');
    const exec2 = await registerAndLogin('m-exec2');
    const projectId = await createProject(owner.token);
    const projectToken = internalToken(projectId);

    const first = await internalCreate(projectId, projectToken, { nodeId: 'n0' });
    const ownerTask = await request(app.getHttpServer()).get(`/tasks/${first.body.taskId}`).set(auth(owner.token));
    expect(ownerTask.body.assigneeId).toBe(owner.userId);

    await addMember(projectId, owner.token, 'M-EXEC1', ['executor']).expect(201);
    await addMember(projectId, owner.token, 'm-exec2', ['executor', 'editor']).expect(201);

    const assignees: string[] = [];
    for (const nodeId of ['n1', 'n2', 'n3']) {
      // oxlint-disable-next-line no-await-in-loop -- each assignment must see the previous one.
      const created = await internalCreate(projectId, projectToken, { nodeId });
      // oxlint-disable-next-line no-await-in-loop
      const task = await request(app.getHttpServer()).get(`/tasks/${created.body.taskId}`).set(auth(exec1.token));
      expect(task.status).toBe(200);
      assignees.push(task.body.assigneeId as string);
    }
    // Round robin while loads are equal (ties by membership time, then id — sqlite stores whole seconds here).
    expect(new Set(assignees.slice(0, 2))).toEqual(new Set([exec1.userId, exec2.userId]));
    expect(assignees[2]).toBe(assignees[0]);

    const mine = await request(app.getHttpServer()).get('/tasks?assignee=me').set(auth(exec2.token));
    expect(mine.body).toHaveLength(assignees.filter((id) => id === exec2.userId).length);
    const all = await request(app.getHttpServer()).get('/tasks').set(auth(exec2.token));
    expect(all.body).toHaveLength(4);

    // Removing exec1's executor role hands their two open tasks to exec2.
    const members = await request(app.getHttpServer())
      .put(`/projects/${projectId}/members/${exec1.userId}`)
      .set(auth(owner.token))
      .send({ roles: [] })
      .expect(200);
    expect(members.body.members).toEqual([expect.objectContaining({ id: exec2.userId, openTasks: 3 })]);
    await request(app.getHttpServer()).get('/tasks').set(auth(exec1.token)).expect(200, []);
  });

  it('lets an executor resolve a task but not read the project', async () => {
    const owner = await registerAndLogin('r-owner');
    const exec = await registerAndLogin('r-exec');
    const projectId = await createProject(owner.token);
    await addMember(projectId, owner.token, 'r-exec', ['executor']).expect(201);
    const created = await internalCreate(projectId, internalToken(projectId));

    await request(app.getHttpServer())
      .post(`/tasks/${created.body.taskId}/resolve`)
      .set(auth(exec.token))
      .send({ answer: 'Approve' })
      .expect(200);

    const info = await request(app.getHttpServer()).get(`/projects/${projectId}`).set(auth(exec.token)).expect(200);
    expect(info.body).toMatchObject({ myRoles: ['executor'], readOnly: true, canRead: false });
    await request(app.getHttpServer()).get(`/projects/${projectId}/members`).set(auth(exec.token)).expect(404);
    const list = await request(app.getHttpServer()).get('/projects').set(auth(exec.token)).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: projectId, myRoles: ['executor'] })]);
  });

  it('refuses unknown logins and the owner', async () => {
    const owner = await registerAndLogin('u-owner');
    const projectId = await createProject(owner.token);
    await addMember(projectId, owner.token, 'nobody', ['editor']).expect(404);
    await addMember(projectId, owner.token, 'u-owner', ['editor']).expect(400);
    await addMember(projectId, owner.token, 'u-owner', ['boss']).expect(400);
  });
});
