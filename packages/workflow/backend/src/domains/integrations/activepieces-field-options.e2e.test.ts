import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { UsersService } from '../users/users/users.service.js';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';

const optionsUrl = (
  projectId: string,
  credentialId: string,
  pieceName = 'jira',
  actionName = 'create_issue',
  fieldName = 'projectId',
): string =>
  `/projects/${projectId}/activepieces/credentials/${credentialId}/pieces/${pieceName}/actions/${actionName}/fields/${fieldName}/options`;

describe('activepieces field options endpoint', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    vi.stubEnv('ACTIVEPIECES_SERVICE_URL', 'http://activepieces.test');
    vi.stubEnv('ACTIVEPIECES_SERVICE_SECRET', 'test-activepieces-secret');
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

  const saveJiraCredential = (projectId: string, docId: string, token: string) =>
    request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${docId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [{ id: 'cred-1', vendor: 'activepieces-jira', name: 'My Jira', fields: {} }],
        },
      });

  it("proxies to the activepieces service and maps the response's options into IFieldSelectOption[]", async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveJiraCredential(projectId, integrationsDocId, token).expect(200);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          options: [
            { label: 'Project A', value: 10_001 },
            { label: 'Project B', value: 'PB' },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app.getHttpServer()).get(optionsUrl(projectId, 'cred-1')).set(auth(token));

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { value: '10001', label: 'Project A' },
        { value: '"PB"', label: 'Project B' },
      ]);
      const internalProjectToken = app.get(ProjectTokenService).getOrCreateToken(projectId);
      expect(fetchMock).toHaveBeenCalledWith(
        `http://activepieces.test/credentials/cred-1/pieces/jira/actions/create_issue/fields/projectId/options?propsValue=%7B%7D&projectId=${projectId}&internalProjectToken=${internalProjectToken}`,
        { headers: { 'x-internal-api-key': 'test-activepieces-secret' } },
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('forwards a propsValue query param unchanged', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveJiraCredential(projectId, integrationsDocId, token).expect(200);

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ options: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await request(app.getHttpServer())
        .get(`${optionsUrl(projectId, 'cred-1')}?propsValue=${encodeURIComponent('{"issueTypeId":"1"}')}`)
        .set(auth(token));

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining(`propsValue=${encodeURIComponent('{"issueTypeId":"1"}')}`),
        expect.anything(),
      );
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

  it("404s when the credential's vendor doesn't match the requested piece", async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveJiraCredential(projectId, integrationsDocId, token).expect(200);

    const response = await request(app.getHttpServer())
      .get(optionsUrl(projectId, 'cred-1', 'wordpress'))
      .set(auth(token));

    expect(response.status).toBe(404);
  });

  it("404s a different user's project (ownership check)", async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveJiraCredential(projectId, integrationsDocId, token).expect(200);

    const usersService = app.get(UsersService);
    await usersService.create({ username: 'someone-else-3', password: 'password' });
    const otherToken = await login(app, 'someone-else-3', 'password');

    const response = await request(app.getHttpServer()).get(optionsUrl(projectId, 'cred-1')).set(auth(otherToken));

    expect(response.status).toBe(404);
  });

  it('returns an empty list when the activepieces service env vars are unset', async () => {
    vi.stubEnv('ACTIVEPIECES_SERVICE_URL', '');
    vi.stubEnv('ACTIVEPIECES_SERVICE_SECRET', '');
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await saveJiraCredential(projectId, integrationsDocId, token).expect(200);

    const response = await request(app.getHttpServer()).get(optionsUrl(projectId, 'cred-1')).set(auth(token));

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});
