import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

/**
 * Covers ADR 0031 (private)'s `/admin/settings/agent`
 * CRUD, `GET /agent/settings`, and the `POST /projects/:id/agent/chat` resolution change.
 */
describe('app settings / agent config (/admin/settings/agent, /agent/settings)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
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

  describe('AdminGuard on /admin/settings/agent', () => {
    it('403s a non-admin user', async () => {
      const userToken = await registerUser('alice');
      const response = await request(app.getHttpServer()).get('/admin/settings/agent').set(auth(userToken));
      expect(response.status).toBe(403);
    });
  });

  describe('GET/PUT/DELETE /admin/settings/agent', () => {
    it('reports not configured before anything is set', async () => {
      const adminToken = await login(app);

      const response = await request(app.getHttpServer()).get('/admin/settings/agent').set(auth(adminToken));

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        configured: false,
        baseUrl: null,
        model: null,
        hasApiKey: false,
        interface: 'json',
        updatedAt: null,
      });
    });

    it('configures the agent via PUT, then reflects it in GET without ever returning the key', async () => {
      const adminToken = await login(app);

      const putResponse = await request(app.getHttpServer())
        .put('/admin/settings/agent')
        .set(auth(adminToken))
        .send({ baseUrl: 'https://api.example.com', model: 'gpt-test', apiKey: 'sk-secret' });

      expect(putResponse.status).toBe(200);
      expect(putResponse.body).toMatchObject({
        configured: true,
        baseUrl: 'https://api.example.com',
        model: 'gpt-test',
        hasApiKey: true,
      });
      expect(putResponse.body.apiKey).toBeUndefined();
      expect(JSON.stringify(putResponse.body)).not.toContain('sk-secret');

      const getResponse = await request(app.getHttpServer()).get('/admin/settings/agent').set(auth(adminToken));
      expect(getResponse.status).toBe(200);
      expect(getResponse.body).toMatchObject({
        configured: true,
        baseUrl: 'https://api.example.com',
        model: 'gpt-test',
        hasApiKey: true,
      });
      expect(getResponse.body.updatedAt).not.toBeNull();
    });

    it('keeps the stored key when PUT omits apiKey on an update', async () => {
      const adminToken = await login(app);
      await request(app.getHttpServer())
        .put('/admin/settings/agent')
        .set(auth(adminToken))
        .send({ baseUrl: 'https://api.example.com', model: 'gpt-test', apiKey: 'sk-secret' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .put('/admin/settings/agent')
        .set(auth(adminToken))
        .send({ baseUrl: 'https://api.example.com/v2', model: 'gpt-test-2' });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        configured: true,
        baseUrl: 'https://api.example.com/v2',
        model: 'gpt-test-2',
        hasApiKey: true,
      });
    });

    it('stores the agent interface, keeps it when omitted, 400s an invalid value, resets on DELETE', async () => {
      const adminToken = await login(app);
      const put = (body: object) =>
        request(app.getHttpServer()).put('/admin/settings/agent').set(auth(adminToken)).send(body);
      const base = { baseUrl: 'https://api.example.com', model: 'm', apiKey: 'sk' };

      const first = await put({ ...base, interface: 'nodes' });
      expect(first.body.interface).toBe('nodes');
      const second = await put({ baseUrl: base.baseUrl, model: 'm2' });
      expect(second.body.interface).toBe('nodes');
      const invalid = await put({ ...base, interface: 'code' });
      expect(invalid.status).toBe(400);
      const userToken = await registerUser('alice');
      const status = await request(app.getHttpServer()).get('/agent/settings').set(auth(userToken));
      expect(status.body.interface).toBe('nodes');

      await request(app.getHttpServer()).delete('/admin/settings/agent').set(auth(adminToken)).expect(204);
      const after = await request(app.getHttpServer()).get('/admin/settings/agent').set(auth(adminToken));
      expect(after.body.interface).toBe('json');
    });

    it('400s a PUT with no apiKey and none stored yet', async () => {
      const adminToken = await login(app);

      const response = await request(app.getHttpServer())
        .put('/admin/settings/agent')
        .set(auth(adminToken))
        .send({ baseUrl: 'https://api.example.com', model: 'gpt-test' });

      expect(response.status).toBe(400);
    });

    it('deletes the config, reporting not configured again', async () => {
      const adminToken = await login(app);
      await request(app.getHttpServer())
        .put('/admin/settings/agent')
        .set(auth(adminToken))
        .send({ baseUrl: 'https://api.example.com', model: 'gpt-test', apiKey: 'sk-secret' })
        .expect(200);

      const deleteResponse = await request(app.getHttpServer()).delete('/admin/settings/agent').set(auth(adminToken));
      expect(deleteResponse.status).toBe(204);

      const getResponse = await request(app.getHttpServer()).get('/admin/settings/agent').set(auth(adminToken));
      expect(getResponse.body).toEqual({
        configured: false,
        baseUrl: null,
        model: null,
        hasApiKey: false,
        interface: 'json',
        updatedAt: null,
      });
    });
  });

  describe('GET /agent/settings', () => {
    it('reflects { configured, model } for a regular signed-in user', async () => {
      const adminToken = await login(app);
      const userToken = await registerUser('alice');

      const before = await request(app.getHttpServer()).get('/agent/settings').set(auth(userToken));
      expect(before.status).toBe(200);
      expect(before.body).toEqual({ configured: false, model: null, interface: 'json' });

      await request(app.getHttpServer())
        .put('/admin/settings/agent')
        .set(auth(adminToken))
        .send({ baseUrl: 'https://api.example.com', model: 'gpt-test', apiKey: 'sk-secret' })
        .expect(200);

      const after = await request(app.getHttpServer()).get('/agent/settings').set(auth(userToken));
      expect(after.status).toBe(200);
      expect(after.body).toEqual({ configured: true, model: 'gpt-test', interface: 'json' });
    });

    it('401s an unauthenticated request', async () => {
      const response = await request(app.getHttpServer()).get('/agent/settings');
      expect(response.status).toBe(401);
    });
  });

  describe('POST /projects/:id/agent/chat', () => {
    const setUpProject = async (token: string): Promise<string> => {
      const createResponse = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
      return createResponse.body.id;
    };

    it('412s when the agent is not configured', async () => {
      const userToken = await registerUser('alice');
      const projectId = await setUpProject(userToken);

      const response = await request(app.getHttpServer())
        .post(`/projects/${projectId}/agent/chat`)
        .set(auth(userToken))
        .send({ system: 'be nice', messages: [], tools: [] });

      expect(response.status).toBe(412);
    });

    it('calls fetch against the stored baseUrl with the stored key once configured', async () => {
      const adminToken = await login(app);
      const userToken = await registerUser('alice');
      const projectId = await setUpProject(userToken);

      await request(app.getHttpServer())
        .put('/admin/settings/agent')
        .set(auth(adminToken))
        .send({ baseUrl: 'https://api.example.com', model: 'gpt-test', apiKey: 'sk-secret' })
        .expect(200);

      const fetchMock = vi
        .fn()
        .mockResolvedValue(Response.json({ choices: [{ message: { content: 'hi', tool_calls: [] } }] }));
      vi.stubGlobal('fetch', fetchMock);

      const response = await request(app.getHttpServer())
        .post(`/projects/${projectId}/agent/chat`)
        .set(auth(userToken))
        .send({ system: 'be nice', messages: [{ role: 'user', content: 'hello' }], tools: [] });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ text: 'hi', toolCalls: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://api.example.com/chat/completions');
      expect(init.headers).toMatchObject({ Authorization: 'Bearer sk-secret' });
      const body = JSON.parse(init.body as string) as { model: string };
      expect(body.model).toBe('gpt-test');
    });
  });
});
