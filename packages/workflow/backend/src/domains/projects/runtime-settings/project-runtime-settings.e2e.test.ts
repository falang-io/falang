// oxlint-disable no-undefined, unicorn/no-useless-undefined, unicorn/consistent-function-scoping, unicorn/no-await-expression-member, unicorn/catch-error-name, oxc/no-map-spread -- test fakes: resolving/rejecting with nothing, small local helpers and one-off spreads read better than the lint-preferred shapes.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { RunnerSessionsService } from '../../build/runner-sessions/runner-sessions.service.js';
import { ProjectRuntimeSettingsService } from './project-runtime-settings.service.js';

const DEFAULTS = { idleMinutes: null, alwaysOn: false };

describe('project runtime settings (ADR 0067)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const registerUser = async (username: string): Promise<{ token: string; id: string }> => {
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username, password: 'password123' });
    const token = await login(app, username, 'password123');
    return { token, id: (registered.body as { user: { id: string } }).user.id };
  };

  const createProject = async (token: string): Promise<string> => {
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'Bot' });
    return (created.body as { id: string }).id;
  };

  const put = (token: string, projectId: string, body: unknown) =>
    request(app.getHttpServer())
      .put(`/projects/${projectId}/runtime-settings`)
      .set(auth(token))
      .send(body as object);

  const setLimits = async (userId: string, body: object): Promise<void> => {
    const adminToken = await login(app);
    await request(app.getHttpServer())
      .put(`/admin/users/${userId}/limits`)
      .set(auth(adminToken))
      .send(body)
      .expect(200);
  };

  it('returns the defaults, the owner limits and an empty state for a fresh project', async () => {
    const { token } = await registerUser('alice');
    const projectId = await createProject(token);
    const response = await request(app.getHttpServer())
      .get(`/projects/${projectId}/runtime-settings`)
      .set(auth(token))
      .expect(200);
    expect(response.body).toEqual({
      dev: DEFAULTS,
      prod: DEFAULTS,
      defaults: { idleMinutes: 30 },
      limits: { maxIdleMinutes: 1440, alwaysOnAllowed: true },
      state: { dev: { running: false, since: null }, prod: { running: false, instances: 0, since: null } },
      suspendedReason: null,
    });
  });

  it('saves and returns the settings', async () => {
    const { token } = await registerUser('alice');
    const projectId = await createProject(token);
    const saved = await put(token, projectId, {
      dev: { idleMinutes: 5, alwaysOn: false },
      prod: { idleMinutes: null, alwaysOn: true },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      dev: { idleMinutes: 5, alwaysOn: false },
      prod: { idleMinutes: null, alwaysOn: true },
    });
    const read = await request(app.getHttpServer()).get(`/projects/${projectId}/runtime-settings`).set(auth(token));
    expect(read.body).toMatchObject({ dev: { idleMinutes: 5 }, prod: { alwaysOn: true } });
  });

  it('rejects idleMinutes that are not whole or out of [1, maxIdleMinutes] with 400', async () => {
    const { token, id } = await registerUser('alice');
    const projectId = await createProject(token);
    await setLimits(id, { maxIdleMinutes: 60 });
    for (const idleMinutes of [0, -3, 61, 1.5, '10']) {
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose: parallel supertest calls reset connections.
      const response = await put(token, projectId, { dev: { idleMinutes, alwaysOn: false }, prod: DEFAULTS });
      expect(response.status, String(idleMinutes)).toBe(400);
    }
    await put(token, projectId, { dev: { idleMinutes: 60, alwaysOn: false }, prod: DEFAULTS }).then((r) =>
      expect(r.status).toBe(200),
    );
  });

  it('answers 403 always_on_not_allowed when the owner may not use always-on, but turning it off is always fine', async () => {
    const { token, id } = await registerUser('alice');
    const projectId = await createProject(token);
    await put(token, projectId, { dev: DEFAULTS, prod: { idleMinutes: null, alwaysOn: true } }).then((r) =>
      expect(r.status).toBe(200),
    );
    await setLimits(id, { alwaysOnAllowed: false });

    const refused = await put(token, projectId, {
      dev: { idleMinutes: null, alwaysOn: true },
      prod: { idleMinutes: null, alwaysOn: true },
    });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'always_on_not_allowed' });

    // The already-on prod switch may stay while another field is saved; turning it off works.
    await put(token, projectId, {
      dev: { idleMinutes: 3, alwaysOn: false },
      prod: { idleMinutes: null, alwaysOn: true },
    }).then((r) => expect(r.status).toBe(200));
    const off = await put(token, projectId, { dev: DEFAULTS, prod: DEFAULTS });
    expect(off.status).toBe(200);
    expect(off.body).toMatchObject({ limits: { alwaysOnAllowed: false } });
  });

  it('is writable only by the owner; an admin may read, another user gets 404', async () => {
    const adminToken = await login(app);
    const { token } = await registerUser('alice');
    const { token: bobToken } = await registerUser('bob');
    const projectId = await createProject(token);
    const body = { dev: DEFAULTS, prod: DEFAULTS };

    await request(app.getHttpServer()).get(`/projects/${projectId}/runtime-settings`).set(auth(adminToken)).expect(200);
    await put(adminToken, projectId, body).then((r) => expect(r.status).toBe(404));
    await request(app.getHttpServer()).get(`/projects/${projectId}/runtime-settings`).set(auth(bobToken)).expect(404);
    await put(bobToken, projectId, body).then((r) => expect(r.status).toBe(404));
  });

  it('reports the running state from the open sessions', async () => {
    const { token } = await registerUser('alice');
    const projectId = await createProject(token);
    const sessions = app.get(RunnerSessionsService);
    const devStart = new Date('2026-10-01T10:00:00Z');
    const prodStart = new Date('2026-10-01T09:00:00Z');
    await sessions.open(
      { deploymentName: `workflow-dev-${projectId}`, taskQueue: `workflow-dev-${projectId}`, projectId, env: 'dev' },
      devStart,
    );
    await sessions.open(
      { deploymentName: `a-v1`, taskQueue: `workflow-${projectId}`, projectId, env: 'prod', buildId: 'v1' },
      prodStart,
    );
    await sessions.open(
      { deploymentName: `a-v2`, taskQueue: `workflow-${projectId}`, projectId, env: 'prod', buildId: 'v2' },
      devStart,
    );

    const response = await request(app.getHttpServer()).get(`/projects/${projectId}/runtime-settings`).set(auth(token));
    expect((response.body as { state: unknown }).state).toEqual({
      dev: { running: true, since: devStart.toISOString() },
      prod: { running: true, instances: 2, since: prodStart.toISOString() },
    });
  });

  describe('resolveIdlePolicies (what the sweep applies)', () => {
    it('falls back to the default, converts minutes, honours always-on and clamps to the owner limit', async () => {
      const { token, id } = await registerUser('alice');
      const [a, b, c] = [await createProject(token), await createProject(token), await createProject(token)];
      await put(token, b, { dev: { idleMinutes: 5, alwaysOn: false }, prod: { idleMinutes: null, alwaysOn: true } });
      await put(token, c, { dev: { idleMinutes: 600, alwaysOn: false }, prod: { idleMinutes: 600, alwaysOn: true } });
      const service = app.get(ProjectRuntimeSettingsService);

      let policies = await service.resolveIdlePolicies([a, b, c]);
      expect(policies.get(a)).toEqual({ dev: 30 * 60_000, prod: 30 * 60_000 });
      expect(policies.get(b)).toEqual({ dev: 5 * 60_000, prod: null });
      expect(policies.get(c)).toEqual({ dev: 600 * 60_000, prod: null });

      // The limit is lowered after the settings were saved: min(setting, limit), and always-on is ignored.
      await setLimits(id, { maxIdleMinutes: 10, alwaysOnAllowed: false });
      policies = await service.resolveIdlePolicies([a, b, c]);
      expect(policies.get(b)).toEqual({ dev: 5 * 60_000, prod: 30 * 60_000 });
      expect(policies.get(c)).toEqual({ dev: 10 * 60_000, prod: 10 * 60_000 });
    });

    it('answers nothing for an empty list', async () => {
      expect((await app.get(ProjectRuntimeSettingsService).resolveIdlePolicies([])).size).toBe(0);
    });
  });
});
