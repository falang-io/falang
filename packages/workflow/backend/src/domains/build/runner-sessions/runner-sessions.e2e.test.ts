// oxlint-disable no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/catch-error-name, oxc/no-map-spread -- test fakes: resolving/rejecting with nothing, small local helpers and one-off spreads read better than the lint-preferred shapes.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { RunnerSessionsService } from './runner-sessions.service.js';

const T0 = new Date('2026-10-01T10:00:00Z');
const minutes = (base: Date, count: number): Date => new Date(base.getTime() + count * 60_000);

describe('runner sessions (ADR 0067)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let sessions: RunnerSessionsService;

  beforeEach(async () => {
    app = await createTestApp();
    sessions = app.get(RunnerSessionsService);
  });

  afterEach(async () => {
    await app.close();
  });

  const registerUser = async (username: string): Promise<string> => {
    await request(app.getHttpServer()).post('/auth/register').send({ username, password: 'password123' });
    return login(app, username, 'password123');
  };

  const createProject = async (token: string, name = 'Bot'): Promise<string> => {
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name });
    return (created.body as { id: string }).id;
  };

  const dev = (projectId: string) => ({
    deploymentName: `workflow-dev-${projectId}`,
    taskQueue: `workflow-dev-${projectId}`,
    projectId,
    env: 'dev' as const,
  });
  const prod = (projectId: string, buildId: string) => ({
    deploymentName: `workflow-${projectId}-${buildId}`,
    taskQueue: `workflow-${projectId}`,
    projectId,
    env: 'prod' as const,
    buildId,
  });

  it('opens once per deployment; a repeated open only heartbeats', async () => {
    await sessions.open(dev('p1'), T0);
    await sessions.open(dev('p1'), minutes(T0, 5));
    const open = await sessions.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ env: 'dev', buildId: null, startedAt: T0, lastSeenAt: minutes(T0, 5), endedAt: null });
  });

  it('closes with the given reason and end time; closing nothing is a no-op', async () => {
    await sessions.open(prod('p1', 'v1'), T0);
    await sessions.close('workflow-p1-v1', 'idle', minutes(T0, 30));
    await sessions.close('workflow-p1-v1', 'stopped', minutes(T0, 40));
    const [closed] = await sessions.listForProject('p1');
    expect(closed).toMatchObject({ buildId: 'v1', endedAt: minutes(T0, 30), endReason: 'idle' });
    expect(await sessions.listOpen()).toEqual([]);
  });

  it('a new session opens after the previous one of the same deployment was closed', async () => {
    await sessions.open(dev('p1'), T0);
    await sessions.close('workflow-dev-p1', 'stopped', minutes(T0, 10));
    await sessions.open(dev('p1'), minutes(T0, 20));
    expect(await sessions.listForProject('p1')).toHaveLength(2);
    expect(await sessions.listOpen()).toHaveLength(1);
  });

  describe('reconcile (the 60 s sweep tick, after a restart)', () => {
    it('adopts a running deployment nobody recorded, starting at its creation time', async () => {
      const createdAt = minutes(T0, -90);
      await sessions.reconcile([{ ...dev('p1'), createdAt }], T0);
      const [session] = await sessions.listOpen();
      expect(session).toMatchObject({ projectId: 'p1', startedAt: createdAt, lastSeenAt: T0 });
    });

    it('adopts at "now" when the cluster reports no creation time', async () => {
      await sessions.reconcile([prod('p1', 'v2')], T0);
      expect((await sessions.listOpen())[0]?.startedAt).toEqual(T0);
    });

    it('heartbeats a session whose deployment is still there', async () => {
      await sessions.open(dev('p1'), T0);
      await sessions.reconcile([dev('p1')], minutes(T0, 1), minutes(T0, 1));
      const [session] = await sessions.listOpen();
      expect(session?.lastSeenAt).toEqual(minutes(T0, 1));
      expect(session?.startedAt).toEqual(T0);
    });

    it('closes a vanished deployment as lost at its last heartbeat', async () => {
      await sessions.open(dev('p1'), T0);
      await sessions.reconcile([dev('p1')], minutes(T0, 3), minutes(T0, 3));
      await sessions.reconcile([], minutes(T0, 4), minutes(T0, 4));
      const [session] = await sessions.listForProject('p1');
      expect(session).toMatchObject({ endReason: 'lost', endedAt: minutes(T0, 3) });
    });

    it('leaves alone a session that started after the snapshot was taken', async () => {
      await sessions.reconcile([], minutes(T0, 5), minutes(T0, 5));
      await sessions.open(dev('p1'), minutes(T0, 6));
      await sessions.reconcile([], minutes(T0, 7), minutes(T0, 5));
      expect(await sessions.listOpen()).toHaveLength(1);
    });

    it('does not re-open a deployment that was stopped after the snapshot was taken', async () => {
      await sessions.open(dev('p1'), T0);
      await sessions.close('workflow-dev-p1', 'stopped', minutes(T0, 6));
      await sessions.reconcile([dev('p1')], minutes(T0, 7), minutes(T0, 5));
      expect(await sessions.listOpen()).toEqual([]);
    });
  });

  describe('HTTP', () => {
    it('lists the project sessions for the owner, newest first, with limit and before', async () => {
      const token = await registerUser('alice');
      const projectId = await createProject(token);
      await sessions.open(dev(projectId), T0);
      await sessions.close(`workflow-dev-${projectId}`, 'idle', minutes(T0, 30));
      await sessions.open(prod(projectId, 'v1'), minutes(T0, 60));

      const all = await request(app.getHttpServer()).get(`/projects/${projectId}/runner-sessions`).set(auth(token)).expect(200);
      const body = all.body as { sessions: { env: string; startedAt: string; endedAt: string | null; endReason: string | null }[] };
      expect(body.sessions.map((s) => s.env)).toEqual(['prod', 'dev']);
      expect(body.sessions[1]).toMatchObject({ endedAt: minutes(T0, 30).toISOString(), endReason: 'idle' });
      expect(body.sessions[0]?.endedAt).toBeNull();

      const limited = await request(app.getHttpServer())
        .get(`/projects/${projectId}/runner-sessions?limit=1`)
        .set(auth(token))
        .expect(200);
      expect((limited.body as { sessions: unknown[] }).sessions).toHaveLength(1);

      const older = await request(app.getHttpServer())
        .get(`/projects/${projectId}/runner-sessions?before=${encodeURIComponent(minutes(T0, 60).toISOString())}`)
        .set(auth(token))
        .expect(200);
      expect((older.body as { sessions: { env: string }[] }).sessions.map((s) => s.env)).toEqual(['dev']);

      await request(app.getHttpServer()).get(`/projects/${projectId}/runner-sessions?limit=abc`).set(auth(token)).expect(400);
    });

    it('is readable by an admin, 404 for another user', async () => {
      const adminToken = await login(app);
      const aliceToken = await registerUser('alice');
      const bobToken = await registerUser('bob');
      const projectId = await createProject(aliceToken);
      await sessions.open(dev(projectId), T0);

      await request(app.getHttpServer()).get(`/projects/${projectId}/runner-sessions`).set(auth(adminToken)).expect(200);
      await request(app.getHttpServer()).get(`/projects/${projectId}/runner-sessions`).set(auth(bobToken)).expect(404);
    });

    it('admin lists every project of a user with its name; a plain user is refused', async () => {
      const adminToken = await login(app);
      const aliceToken = await registerUser('alice');
      const p1 = await createProject(aliceToken, 'One');
      const p2 = await createProject(aliceToken, 'Two');
      await sessions.open(dev(p1), T0);
      await sessions.open(prod(p2, 'v1'), minutes(T0, 10));
      const users = await request(app.getHttpServer()).get('/admin/users').set(auth(adminToken));
      const aliceId = (users.body as { id: string; username: string }[]).find((u) => u.username === 'alice')?.id ?? '';

      const response = await request(app.getHttpServer())
        .get(`/admin/users/${aliceId}/runner-sessions`)
        .set(auth(adminToken))
        .expect(200);
      const rows = (response.body as { sessions: { projectName: string; env: string }[] }).sessions;
      expect(rows.map((row) => [row.projectName, row.env])).toEqual([
        ['Two', 'prod'],
        ['One', 'dev'],
      ]);

      await request(app.getHttpServer()).get(`/admin/users/${aliceId}/runner-sessions`).set(auth(aliceToken)).expect(403);
      await request(app.getHttpServer())
        .get('/admin/users/00000000-0000-4000-8000-000000000000/runner-sessions')
        .set(auth(adminToken))
        .expect(404);
    });
  });
});
