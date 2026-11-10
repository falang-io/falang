import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as EgressGuardModule from '../../net/egress-guard.js';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { AiProviderSettingsService } from '../admin/app-settings/ai-provider-settings.service.js';
import { DbAiProviderUsageSink } from './db-ai-provider-usage-sink.js';

// The real egress guard talks to the network; route its `fetch` to the (stubbed) global one.
vi.mock('../../net/egress-guard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof EgressGuardModule>()),
  getBackendEgress: () => ({
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
    resolveHost: (host: string) => Promise.resolve(host),
  }),
}));

const MODELS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
  { id: 'dall-e-3', kind: 'image' },
];

/** ADR 0081 (private) phase 0: admin settings, `GET /ai-provider`, `platformProvider` on instances, the usage record. */
describe('built-in AI provider', () => {
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

  const http = () => request(app.getHttpServer());
  const put = (token: string, body: Record<string, unknown>) =>
    http().put('/admin/settings/ai-provider').set(auth(token)).send(body);

  const registerUser = async (): Promise<string> => {
    await http().post('/auth/register').send({ username: 'alice', password: 'password123' });
    return login(app, 'alice', 'password123');
  };

  it('403s a non-admin user on every admin route but serves GET /ai-provider to them', async () => {
    const userToken = await registerUser();
    for (const response of [
      await http().get('/admin/settings/ai-provider').set(auth(userToken)),
      await put(userToken, { baseUrl: 'https://p', apiKey: 'k', models: MODELS }),
      await http().delete('/admin/settings/ai-provider').set(auth(userToken)),
      await http().post('/admin/settings/ai-provider/fetch-models').set(auth(userToken)).send({}),
    ]) {
      expect(response.status).toBe(403);
    }
    const status = await http().get('/ai-provider').set(auth(userToken));
    expect(status.status).toBe(200);
    expect(status.body).toEqual({ configured: false, models: [] });
    const anonymous = await http().get('/ai-provider');
    expect(anonymous.status).toBe(401);
  });

  it('round-trips PUT/GET/DELETE, keeps an omitted key and never returns it', async () => {
    const adminToken = await login(app);
    const withoutKey = await put(adminToken, { baseUrl: 'https://p.example/v1', models: MODELS });
    expect(withoutKey.status).toBe(400);

    const saved = await put(adminToken, { baseUrl: 'https://p.example/v1/', apiKey: 'sk-secret', models: MODELS });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      baseUrl: 'https://p.example/v1',
      configured: true,
      hasApiKey: true,
      models: [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
        { id: 'dall-e-3', kind: 'image' },
      ],
    });
    expect(JSON.stringify(saved.body)).not.toContain('sk-secret');

    const again = await put(adminToken, { baseUrl: 'https://p.example/v1', models: MODELS });
    expect(again.status).toBe(200);
    expect(await app.get(AiProviderSettingsService).resolve()).toMatchObject({ apiKey: 'sk-secret' });

    const userToken = await registerUser();
    const status = await http().get('/ai-provider').set(auth(userToken));
    expect(status.body).toEqual({
      configured: true,
      models: [
        { id: 'gpt-4o-mini', label: 'GPT-4o mini', kind: 'chat' },
        { id: 'dall-e-3', label: 'dall-e-3', kind: 'image' },
      ],
    });
    expect(JSON.stringify(status.body)).not.toContain('p.example');

    const deleted = await http().delete('/admin/settings/ai-provider').set(auth(adminToken));
    expect(deleted.status).toBe(204);
    const cleared = await http().get('/admin/settings/ai-provider').set(auth(adminToken));
    expect(cleared.body).toEqual({ baseUrl: null, configured: false, hasApiKey: false, models: [], updatedAt: null });
  });

  it('rejects invalid models and base URLs with 400', async () => {
    const adminToken = await login(app);
    const badModels = await put(adminToken, {
      baseUrl: 'https://p',
      apiKey: 'k',
      models: [
        { id: 'm', kind: 'chat' },
        { id: 'm', kind: 'chat' },
      ],
    });
    expect(badModels.status).toBe(400);
    expect(badModels.body.errors).toEqual(['models[1].id: "m" is listed twice for kind "chat"']);
    const badUrl = await put(adminToken, { baseUrl: 'ftp://p', apiKey: 'k', models: [] });
    expect(badUrl.status).toBe(400);
  });

  it('fetch-models lists the upstream /models with the stored key or an override', async () => {
    const adminToken = await login(app);
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(Response.json({ data: [{ id: 'gpt-4o' }] })));
    vi.stubGlobal('fetch', fetchMock);

    const nothingStored = await http().post('/admin/settings/ai-provider/fetch-models').set(auth(adminToken)).send({});
    expect(nothingStored.status).toBe(400);

    const tried = await http()
      .post('/admin/settings/ai-provider/fetch-models')
      .set(auth(adminToken))
      .send({ baseUrl: 'https://try.example/v1', apiKey: 'sk-try' });
    expect(tried.status).toBe(200);
    expect(tried.body).toEqual({ models: [{ id: 'gpt-4o' }] });
    expect(fetchMock).toHaveBeenLastCalledWith('https://try.example/v1/models', {
      headers: { Authorization: 'Bearer sk-try' },
    });

    await put(adminToken, { baseUrl: 'https://p.example/v1', apiKey: 'sk-stored', models: MODELS });
    const stored = await http().post('/admin/settings/ai-provider/fetch-models').set(auth(adminToken)).send({});
    expect(stored.status).toBe(200);
    expect(fetchMock).toHaveBeenLastCalledWith('https://p.example/v1/models', {
      headers: { Authorization: 'Bearer sk-stored' },
    });

    fetchMock.mockImplementation(() => Promise.resolve(new Response('unauthorized', { status: 401 })));
    const failed = await http().post('/admin/settings/ai-provider/fetch-models').set(auth(adminToken)).send({});
    expect(failed.status).toBe(502);
  });

  describe('platformProvider on an integration instance', () => {
    const setUpProject = async (token: string): Promise<{ projectId: string; docId: string }> => {
      const created = await http().post('/projects').set(auth(token)).send({ name: 'p' });
      const projectId: string = created.body.id;
      const tree = await http().get(`/projects/${projectId}/tree`).set(auth(token));
      const integrations = (tree.body.documents as { id: string; type: string }[]).find(
        (document) => document.type === 'integrations',
      );
      if (!integrations) throw new Error('expected the integrations document');
      return { docId: integrations.id, projectId };
    };

    const saveInstance = (token: string, projectId: string, docId: string, instance: Record<string, unknown>) =>
      http()
        .patch(`/projects/${projectId}/documents/${docId}`)
        .set(auth(token))
        .send({ data: { instances: [instance] } });

    it('accepts an openai instance with the flag and empty baseUrl/apiKey, and exports it', async () => {
      const token = await login(app);
      const { projectId, docId } = await setUpProject(token);
      const saved = await saveInstance(token, projectId, docId, {
        id: 'ai-1',
        vendor: 'openai',
        name: 'Built-in AI',
        fields: { baseUrl: '', apiKey: { dev: '', prod: '' } },
        platformProvider: true,
      });
      expect(saved.status).toBe(200);
      expect(saved.body.data.instances[0]).toMatchObject({ id: 'ai-1', platformProvider: true });

      const exported = await http().get(`/projects/${projectId}/export`).set(auth(token));
      const exportedIntegrations = (exported.body.documents as { type: string; data: unknown }[]).find(
        (document) => document.type === 'integrations',
      );
      expect(exportedIntegrations?.data).toMatchObject({ instances: [{ id: 'ai-1', platformProvider: true }] });
    });

    it('rejects the flag on a vendor that does not support the built-in provider', async () => {
      const token = await login(app);
      const { projectId, docId } = await setUpProject(token);
      const saved = await saveInstance(token, projectId, docId, {
        id: 'tg-1',
        vendor: 'telegram',
        name: 'Bot',
        fields: { botToken: { dev: '', prod: '' } },
        platformProvider: true,
      });
      expect(saved.status).toBe(400);
      expect(saved.body.message).toMatch(/cannot use the built-in AI provider/);
    });
  });

  it('DbAiProviderUsageSink records usage and sums a project over 30 days', async () => {
    const sink = app.get(DbAiProviderUsageSink);
    const projectId = randomUUID();
    const base = { env: 'dev' as const, kind: 'chat' as const, model: 'gpt-4o-mini', ownerId: randomUUID(), projectId };
    await sink.afterCall({ ...base, usage: { completionTokens: 5, promptTokens: 10, totalTokens: 15 } });
    await sink.afterCall({ ...base, env: 'prod', usage: null });
    expect(await sink.getProjectTotals(projectId)).toEqual({
      calls: 2,
      completionTokens: 5,
      promptTokens: 10,
      totalTokens: 15,
    });
  });
});
