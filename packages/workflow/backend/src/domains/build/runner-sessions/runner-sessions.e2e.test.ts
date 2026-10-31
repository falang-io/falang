// oxlint-disable max-lines, no-await-in-loop, no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/catch-error-name, oxc/no-map-spread -- test fakes: resolving/rejecting with nothing, small local helpers and one-off spreads read better than the lint-preferred shapes.
import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Project } from '../../projects/projects/project.entity.js';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import type { IRunnerSessionSink } from './runner-session-hooks.js';
import { RunnerSession } from './runner-session.entity.js';
import { MAX_SESSIONS_LIMIT, RunnerSessionsService } from './runner-sessions.service.js';

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

  const withSink = () => {
    const sink = { onOpened: vi.fn(), onHeartbeat: vi.fn(), onClosed: vi.fn() };
    const service = new RunnerSessionsService(
      app.get<Repository<RunnerSession>>(getRepositoryToken(RunnerSession)),
      app.get<Repository<Project>>(getRepositoryToken(Project)),
      sink as IRunnerSessionSink,
    );
    return { service, sink };
  };

  const registerUser = async (username: string): Promise<string> => {
    await request(app.getHttpServer()).post('/auth/register').send({ username, password: 'password123' });
    return login(app, username, 'password123');
  };

  const createProject = async (token: string, name = 'Bot'): Promise<string> => {
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name });
    return (created.body as { id: string }).id;
  };

  // Real UUIDs: `runner_sessions.project_id` is a `uuid` column — only sqlite accepted `P1` here.
  const P1 = '11111111-1111-4111-8111-111111111111';
  const P2 = '22222222-2222-4222-8222-222222222222';
  const GHOST = '99999999-9999-4999-8999-999999999999';

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
    await sessions.open(dev(P1), T0);
    await sessions.open(dev(P1), minutes(T0, 5));
    const open = await sessions.listOpen();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      env: 'dev',
      buildId: null,
      startedAt: T0,
      lastSeenAt: minutes(T0, 5),
      endedAt: null,
    });
  });

  it('closes with the given reason and end time; closing nothing is a no-op', async () => {
    await sessions.open(prod(P1, 'v1'), T0);
    await sessions.close(`workflow-${P1}-v1`, 'idle', minutes(T0, 30));
    await sessions.close(`workflow-${P1}-v1`, 'stopped', minutes(T0, 40));
    const [closed] = await sessions.listForProject(P1);
    expect(closed).toMatchObject({ buildId: 'v1', endedAt: minutes(T0, 30), endReason: 'idle' });
    expect(await sessions.listOpen()).toEqual([]);
  });

  it('a new session opens after the previous one of the same deployment was closed', async () => {
    await sessions.open(dev(P1), T0);
    await sessions.close(`workflow-dev-${P1}`, 'stopped', minutes(T0, 10));
    await sessions.open(dev(P1), minutes(T0, 20));
    expect(await sessions.listForProject(P1)).toHaveLength(2);
    expect(await sessions.listOpen()).toHaveLength(1);
  });

  describe('reconcile (the 60 s sweep tick, after a restart)', () => {
    it('adopts a running deployment nobody recorded, starting at its creation time', async () => {
      const projectId = await createProject(await registerUser('adopter'));
      const createdAt = minutes(T0, -90);
      await sessions.reconcile([{ ...dev(projectId), createdAt }], T0);
      const [session] = await sessions.listOpen();
      expect(session).toMatchObject({ projectId, startedAt: createdAt, lastSeenAt: T0 });
    });

    it('adopts at "now" when the cluster reports no creation time', async () => {
      const projectId = await createProject(await registerUser('adopter2'));
      await sessions.reconcile([prod(projectId, 'v2')], T0);
      expect((await sessions.listOpen())[0]?.startedAt).toEqual(T0);
    });

    it('does not adopt a deployment whose project does not exist', async () => {
      const real = await createProject(await registerUser('adopter3'));
      await sessions.reconcile([dev(GHOST), dev(real)], T0);
      const open = await sessions.listOpen();
      expect(open.map((session) => session.projectId)).toEqual([real]);
    });

    it('heartbeats a session whose deployment is still there', async () => {
      await sessions.open(dev(P1), T0);
      await sessions.reconcile([dev(P1)], minutes(T0, 1), minutes(T0, 1));
      const [session] = await sessions.listOpen();
      expect(session?.lastSeenAt).toEqual(minutes(T0, 1));
      expect(session?.startedAt).toEqual(T0);
    });

    it('closes a vanished deployment as lost at its last heartbeat', async () => {
      await sessions.open(dev(P1), T0);
      await sessions.reconcile([dev(P1)], minutes(T0, 3), minutes(T0, 3));
      await sessions.reconcile([], minutes(T0, 4), minutes(T0, 4));
      const [session] = await sessions.listForProject(P1);
      expect(session).toMatchObject({ endReason: 'lost', endedAt: minutes(T0, 3) });
    });

    it('leaves alone a session that started after the snapshot was taken', async () => {
      await sessions.reconcile([], minutes(T0, 5), minutes(T0, 5));
      await sessions.open(dev(P1), minutes(T0, 6));
      await sessions.reconcile([], minutes(T0, 7), minutes(T0, 5));
      expect(await sessions.listOpen()).toHaveLength(1);
    });

    it('does not re-open a deployment that was stopped after the snapshot was taken', async () => {
      await sessions.open(dev(P1), T0);
      await sessions.close(`workflow-dev-${P1}`, 'stopped', minutes(T0, 6));
      await sessions.reconcile([dev(P1)], minutes(T0, 7), minutes(T0, 5));
      expect(await sessions.listOpen()).toEqual([]);
    });
  });

  describe('closeAllOpen', () => {
    it('closes every open session of every deployment with one end time, skipping closed ones', async () => {
      await sessions.open(dev(P1), T0);
      await sessions.open(prod(P1, 'v1'), T0);
      await sessions.open(dev(P2), minutes(T0, 1));
      await sessions.close(`workflow-dev-${P2}`, 'idle', minutes(T0, 5));

      await sessions.closeAllOpen('shutdown', minutes(T0, 20));

      expect(await sessions.listOpen()).toEqual([]);
      const p1 = await sessions.listForProject(P1);
      expect(p1.map((row) => [row.endReason, row.endedAt])).toEqual([
        ['shutdown', minutes(T0, 20)],
        ['shutdown', minutes(T0, 20)],
      ]);
      const [p2] = await sessions.listForProject(P2);
      expect(p2).toMatchObject({ endReason: 'idle', endedAt: minutes(T0, 5) });
    });

    it('calls sink.onClosed for each session it closes, but not for already-closed ones', async () => {
      const { service, sink } = withSink();
      await service.open(dev(P1), T0);
      await service.open(prod(P1, 'v1'), T0);
      await service.open(dev(P2), T0);
      await service.close(`workflow-dev-${P2}`, 'idle', minutes(T0, 5));
      sink.onClosed.mockClear();

      await service.closeAllOpen('shutdown', minutes(T0, 20));

      expect(sink.onClosed).toHaveBeenCalledTimes(2);
      for (const [session] of sink.onClosed.mock.calls as [{ endedAt: Date; endReason: string }][]) {
        expect(session).toMatchObject({ endedAt: minutes(T0, 20), endReason: 'shutdown' });
      }
    });
  });

  describe('sink failures', () => {
    it('records the session even if onOpened throws, and the chain keeps working', async () => {
      const { service, sink } = withSink();
      sink.onOpened.mockRejectedValueOnce(new Error('meter down'));

      await service.open(dev(P1), T0);
      await service.open(dev(P2), T0);

      expect((await service.listOpen()).map((row) => row.projectId)).toEqual([P1, P2]);
      expect(sink.onOpened).toHaveBeenCalledTimes(2);
    });

    it('closes the row even if onClosed throws, and later operations still run', async () => {
      const { service, sink } = withSink();
      sink.onClosed.mockRejectedValue(new Error('meter down'));
      await service.open(dev(P1), T0);

      await service.close(`workflow-dev-${P1}`, 'idle', minutes(T0, 3));
      await service.open(dev(P1), minutes(T0, 4));

      const rows = await service.listForProject(P1);
      expect(rows).toHaveLength(2);
      expect(rows[1]).toMatchObject({ endReason: 'idle', endedAt: minutes(T0, 3) });
      expect(rows[0]?.endedAt).toBeNull();
    });

    it('still heartbeats the row when onHeartbeat throws', async () => {
      const { service, sink } = withSink();
      sink.onHeartbeat.mockRejectedValue(new Error('meter down'));
      await service.open(dev(P1), T0);

      await service.reconcile([dev(P1)], minutes(T0, 2), minutes(T0, 2));
      await service.reconcile([dev(P1)], minutes(T0, 3), minutes(T0, 3));

      expect(sink.onHeartbeat).toHaveBeenCalledTimes(2);
      expect((await service.listOpen())[0]?.lastSeenAt).toEqual(minutes(T0, 3));
    });

    it('a rejected task does not wedge the chain: the next call still runs', async () => {
      await sessions.open(dev(P1), T0);
      const repo = app.get<Repository<RunnerSession>>(getRepositoryToken(RunnerSession));
      const find = vi.spyOn(repo, 'find').mockRejectedValueOnce(new Error('db blip'));

      await expect(sessions.close(`workflow-dev-${P1}`, 'idle', minutes(T0, 1))).rejects.toThrow('db blip');
      find.mockRestore();
      await sessions.close(`workflow-dev-${P1}`, 'idle', minutes(T0, 2));

      expect(await sessions.listOpen()).toEqual([]);
    });
  });

  describe('listings', () => {
    it('listOpen is oldest first; listOpenForProject filters by project and open state', async () => {
      await sessions.open(dev(P2), minutes(T0, 2));
      await sessions.open(dev(P1), T0);
      await sessions.open(prod(P1, 'v1'), minutes(T0, 1));
      await sessions.close(`workflow-${P1}-v1`, 'idle', minutes(T0, 9));

      expect((await sessions.listOpen()).map((row) => row.projectId)).toEqual([P1, P2]);
      const forP1 = await sessions.listOpenForProject(P1);
      expect(forP1.map((row) => row.deploymentName)).toEqual([`workflow-dev-${P1}`]);
      expect(await sessions.listOpenForProject(GHOST)).toEqual([]);
    });

    it('listForProject honours before/limit, clamps the limit and ignores other projects', async () => {
      for (let i = 0; i < 4; i += 1) {
        await sessions.open(dev(P1), minutes(T0, i * 10));
        await sessions.close(`workflow-dev-${P1}`, 'idle', minutes(T0, i * 10 + 5));
      }
      await sessions.open(dev(P2), T0);

      const all = await sessions.listForProject(P1);
      expect(all.map((row) => row.startedAt)).toEqual([30, 20, 10, 0].map((m) => minutes(T0, m)));
      expect(await sessions.listForProject(P1, { limit: 2 })).toHaveLength(2);
      expect(await sessions.listForProject(P1, { limit: 0 })).toHaveLength(1);
      expect(await sessions.listForProject(P1, { limit: -7 })).toHaveLength(1);
      expect(await sessions.listForProject(P1, { limit: 99_999 })).toHaveLength(4);
      expect(MAX_SESSIONS_LIMIT).toBe(500);
      const older = await sessions.listForProject(P1, { before: minutes(T0, 20) });
      expect(older.map((row) => row.startedAt)).toEqual([minutes(T0, 10), T0]);
    });

    it('listForUser returns only the owner projects with names; empty without projects', async () => {
      const alice = await registerUser('alice');
      const bob = await registerUser('bob');
      const aliceProject = await createProject(alice, 'Alice bot');
      const bobProject = await createProject(bob, 'Bob bot');
      await sessions.open(dev(aliceProject), T0);
      await sessions.open(dev(bobProject), minutes(T0, 1));
      await sessions.open(prod(aliceProject, 'v1'), minutes(T0, 2));
      const projects = app.get<Repository<Project>>(getRepositoryToken(Project));
      const aliceId = (await projects.findOneByOrFail({ id: aliceProject })).ownerId;

      const rows = await sessions.listForUser(aliceId);
      expect(rows.map((row) => [row.projectName, row.env])).toEqual([
        ['Alice bot', 'prod'],
        ['Alice bot', 'dev'],
      ]);
      expect(await sessions.listForUser(aliceId, { limit: 1 })).toHaveLength(1);
      expect(await sessions.listForUser(aliceId, { before: minutes(T0, 2) })).toHaveLength(1);
      expect(await sessions.listForUser('00000000-0000-4000-8000-000000000000')).toEqual([]);
    });
  });

  describe('HTTP', () => {
    it('lists the project sessions for the owner, newest first, with limit and before', async () => {
      const token = await registerUser('alice');
      const projectId = await createProject(token);
      await sessions.open(dev(projectId), T0);
      await sessions.close(`workflow-dev-${projectId}`, 'idle', minutes(T0, 30));
      await sessions.open(prod(projectId, 'v1'), minutes(T0, 60));

      const all = await request(app.getHttpServer())
        .get(`/projects/${projectId}/runner-sessions`)
        .set(auth(token))
        .expect(200);
      const body = all.body as {
        sessions: { env: string; startedAt: string; endedAt: string | null; endReason: string | null }[];
      };
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

      await request(app.getHttpServer())
        .get(`/projects/${projectId}/runner-sessions?limit=abc`)
        .set(auth(token))
        .expect(400);
    });

    it('is readable by an admin, 404 for another user', async () => {
      const adminToken = await login(app);
      const aliceToken = await registerUser('alice');
      const bobToken = await registerUser('bob');
      const projectId = await createProject(aliceToken);
      await sessions.open(dev(projectId), T0);

      await request(app.getHttpServer())
        .get(`/projects/${projectId}/runner-sessions`)
        .set(auth(adminToken))
        .expect(200);
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

      await request(app.getHttpServer())
        .get(`/admin/users/${aliceId}/runner-sessions`)
        .set(auth(aliceToken))
        .expect(403);
      await request(app.getHttpServer())
        .get('/admin/users/00000000-0000-4000-8000-000000000000/runner-sessions')
        .set(auth(adminToken))
        .expect(404);
    });
  });
});
