import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../users/users/users.service.js';
import type * as EgressGuardModule from '../../net/egress-guard.js';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { IntegrationVendorDataService } from './vendor-data/integration-vendor-data.service.js';

// The real egress guard talks to the network; these tests stub the global `fetch`, so route the guard's `fetch` to it
// (the guard itself is covered by `net/egress-guard.test.ts`).
vi.mock('../../net/egress-guard.js', async (importOriginal) => ({
  ...(await importOriginal<typeof EgressGuardModule>()),
  getBackendEgress: () => ({
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
    resolveHost: (host: string) => Promise.resolve(host),
  }),
}));

const optionsUrl = (projectId: string, credentialId: string, actionName = 'call-ai-text'): string =>
  `/projects/${projectId}/integrations/${credentialId}/actions/${actionName}/fields/model/options`;

describe('integration field options endpoint (call-ai-text/model)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const setUpProject = async (token: string): Promise<{ projectId: string; integrationsDocId: string }> => {
    const createResponse = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = createResponse.body.id;
    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    return { projectId, integrationsDocId: tree.body.documents[0].id };
  };

  const saveOpenAiCredential = (projectId: string, docId: string, token: string) =>
    request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            {
              id: 'cred-1',
              vendor: 'openai',
              name: 'My OpenAI',
              fields: { baseUrl: 'https://api.openai.com/v1', apiKey: { dev: 'sk-dev-key', prod: '' } },
            },
          ],
        },
      });

  it("loads a select field's options by resolving the stored credential and calling its loadOptions hook", async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveOpenAiCredential(projectId, integrationsDocId, token).expect(200);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app.getHttpServer()).get(optionsUrl(projectId, 'cred-1')).set(auth(token));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
        { value: 'gpt-4o', label: 'gpt-4o' },
      ]);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.objectContaining({ headers: { Authorization: 'Bearer sk-dev-key' } }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("loads a choice node's field options too (e.g. call-ai-choice's model, same loadOptions hook as call-ai-text)", async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveOpenAiCredential(projectId, integrationsDocId, token).expect(200);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app.getHttpServer())
        .get(optionsUrl(projectId, 'cred-1', 'call-ai-choice'))
        .set(auth(token));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { value: 'gpt-4o-mini', label: 'gpt-4o-mini' },
        { value: 'gpt-4o', label: 'gpt-4o' },
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('404s for an unknown credentialId', async () => {
    const token = await login(app);
    const { projectId } = await setUpProject(token);

    const response = await request(app.getHttpServer()).get(optionsUrl(projectId, 'unknown-cred')).set(auth(token));

    expect(response.status).toBe(404);
  });

  it("404s a different user's project (ownership check)", async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveOpenAiCredential(projectId, integrationsDocId, token).expect(200);

    const usersService = app.get(UsersService);
    await usersService.create({ username: 'someone-else-2', password: 'password' });
    const otherToken = await login(app, 'someone-else-2', 'password');

    const response = await request(app.getHttpServer()).get(optionsUrl(projectId, 'cred-1')).set(auth(otherToken));

    expect(response.status).toBe(404);
  });
});

/**
 * Covers ADR 0039 (private) §4's
 * `GET /projects/:id/integrations/:credentialId/vendor-data` route and `DocumentsService.update`'s
 * `removeForInstance` cleanup when an instance is dropped from the `integrations` document.
 */
const vendorDataUrl = (projectId: string, credentialId: string): string =>
  `/projects/${projectId}/integrations/${credentialId}/vendor-data`;

describe('integration vendor-data endpoint (GET .../integrations/:credentialId/vendor-data)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const setUpProject = async (token: string): Promise<{ projectId: string; integrationsDocId: string }> => {
    const createResponse = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = createResponse.body.id;
    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    return { projectId, integrationsDocId: tree.body.documents[0].id };
  };

  const saveOpenAiCredential = (projectId: string, docId: string, token: string) =>
    request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            {
              id: 'cred-1',
              vendor: 'openai',
              name: 'My OpenAI',
              fields: { baseUrl: 'https://api.openai.com/v1', apiKey: { dev: 'sk-dev-key', prod: '' } },
            },
          ],
        },
      });

  it('reads {} before anything is synced, the synced data after, then {} again once the instance is removed', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveOpenAiCredential(projectId, integrationsDocId, token).expect(200);

    const before = await request(app.getHttpServer()).get(vendorDataUrl(projectId, 'cred-1')).set(auth(token));
    expect(before.status).toBe(200);
    expect(before.body).toEqual({});

    const vendorDataService = app.get(IntegrationVendorDataService);
    await vendorDataService.set(projectId, 'cred-1', 'openai', 'schema', { syncedAt: '2026-09-28', tables: [] });

    const after = await request(app.getHttpServer()).get(vendorDataUrl(projectId, 'cred-1')).set(auth(token));
    expect(after.status).toBe(200);
    expect(after.body).toEqual({ schema: { syncedAt: '2026-09-28', tables: [] } });

    // Drop `cred-1` from the `integrations` document entirely — `DocumentsService.update` should
    // clean up its now-orphaned vendor data rows.
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({ data: { instances: [] } })
      .expect(200);

    const afterRemoval = await request(app.getHttpServer()).get(vendorDataUrl(projectId, 'cred-1')).set(auth(token));
    expect(afterRemoval.status).toBe(200);
    expect(afterRemoval.body).toEqual({});
  });

  it("404s a different user's project (ownership check)", async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveOpenAiCredential(projectId, integrationsDocId, token).expect(200);
    const vendorDataService = app.get(IntegrationVendorDataService);
    await vendorDataService.set(projectId, 'cred-1', 'openai', 'schema', { tables: [] });

    const usersService = app.get(UsersService);
    await usersService.create({ username: 'someone-else-3', password: 'password' });
    const otherToken = await login(app, 'someone-else-3', 'password');

    const response = await request(app.getHttpServer()).get(vendorDataUrl(projectId, 'cred-1')).set(auth(otherToken));

    expect(response.status).toBe(404);
  });
});
