import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SECRET_MASK } from './domains/integrations/credentials-codec.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from './domains/internal-auth/project-token.guard.js';
import { ProjectTokenService } from './domains/internal-auth/project-token.service.js';
import { UsersService } from './domains/users/users/users.service.js';
import { auth, createTestApp, login } from './test-utils/e2e-app.js';

describe('workflow-backend (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;

  beforeEach(async () => {
    // Read by ConfigService during app.init() below — must be set before createTestApp() runs.
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('rejects unauthenticated requests', async () => {
    const response = await request(app.getHttpServer()).get('/projects');
    expect(response.status).toBe(401);
  });

  it('exempts the webhook ingress route from the global JwtAuthGuard', async () => {
    // No `Authorization` header — if `@falang/workflow-gateway`'s public-route metadata didn't match
    // `JwtAuthGuard`'s expected key, this would 401 before ever reaching the controller.
    // No integration registered — GatewayModule.forRoot([], ...) in this test app — so it 404s past the guard.
    const response = await request(app.getHttpServer()).post('/webhooks/telegram/project-1/cred-1/prod').send({});
    expect(response.status).toBe(404);
  });

  it('rejects a webhook request with an invalid env segment', async () => {
    const response = await request(app.getHttpServer()).post('/webhooks/telegram/project-1/cred-1/staging').send({});
    expect(response.status).toBe(400);
  });

  it('seeds a default admin/admin user that can log in', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin' });
    expect(response.status).toBe(200);
    expect(response.body.user.username).toBe('admin');
    expect(typeof response.body.accessToken).toBe('string');
  });

  it('rejects a wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(response.status).toBe(401);
  });

  it('registers a new account and logs the new user straight in', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'newbie', password: 'password123' });
    expect(response.status).toBe(201);
    expect(response.body.user.username).toBe('newbie');
    expect(typeof response.body.accessToken).toBe('string');

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'newbie', password: 'password123' });
    expect(loginResponse.status).toBe(200);
  });

  it('rejects registering a username that is already taken', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'admin', password: 'password123' });
    expect(response.status).toBe(409);
  });

  it('skips seeding the default admin when SEED_DEFAULT_ADMIN=false', async () => {
    vi.stubEnv('SEED_DEFAULT_ADMIN', 'false');
    const unseededApp = await createTestApp();
    try {
      const response = await request(unseededApp.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'admin' });
      expect(response.status).toBe(401);
    } finally {
      await unseededApp.close();
    }
  });

  it('GET /auth/me returns the current user for a valid token', async () => {
    const token = await login(app);
    const response = await request(app.getHttpServer()).get('/auth/me').set(auth(token));
    expect(response.status).toBe(200);
    expect(response.body.username).toBe('admin');
  });

  it('creates and lists projects scoped to the current user', async () => {
    const token = await login(app);

    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'My project' });
    expect(created.status).toBe(201);
    expect(created.body.name).toBe('My project');

    const listed = await request(app.getHttpServer()).get('/projects').set(auth(token));
    expect(listed.body).toHaveLength(1);
    expect(listed.body[0].id).toBe(created.body.id);
  });

  it('loads the tree structure and then all documents, folders cascading to their documents on delete', async () => {
    const token = await login(app);
    const createProjectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set(auth(token))
      .send({ name: 'p' });
    const project = createProjectResponse.body;

    // Every project is seeded with one pinned `integrations` document at creation — see ADR 0006.
    const initialTree = await request(app.getHttpServer()).get(`/projects/${project.id}/tree`).set(auth(token));
    expect(initialTree.body.documents).toHaveLength(1);
    const integrationsDoc = initialTree.body.documents[0];
    expect(integrationsDoc).toMatchObject({ type: 'integrations', name: 'Integrations', folderId: null, pinned: true });

    const folderId = '3ad0f6d5-d449-4945-b5f4-9f8d7041a3e9';
    const docId = '8b2e45d1-fa81-4ddb-a012-dde04d7ee4e4';

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/folders`)
      .set(auth(token))
      .send({ id: folderId, name: 'Functions', parentId: null })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/projects/${project.id}/documents`)
      .set(auth(token))
      .send({ id: docId, type: 'function', name: 'run', folderId, root: { id: docId, name: 'function', children: [] } })
      .expect(201);

    const tree = await request(app.getHttpServer()).get(`/projects/${project.id}/tree`).set(auth(token));
    expect(tree.body.folders).toEqual([{ id: folderId, name: 'Functions', parentId: null }]);
    expect(tree.body.documents).toEqual(
      expect.arrayContaining([integrationsDoc, { id: docId, type: 'function', name: 'run', folderId, pinned: false }]),
    );
    expect(tree.body.documents).toHaveLength(2);

    const documents = await request(app.getHttpServer()).get(`/projects/${project.id}/documents`).set(auth(token));
    expect(documents.body).toEqual(
      expect.arrayContaining([
        { id: integrationsDoc.id, type: 'integrations', name: 'Integrations', data: { instances: [] } },
        { id: docId, type: 'function', name: 'run', root: { id: docId, name: 'function', children: [] } },
      ]),
    );
    expect(documents.body).toHaveLength(2);

    await request(app.getHttpServer())
      .delete(`/projects/${project.id}/folders/${folderId}`)
      .set(auth(token))
      .expect(204);

    const documentsAfterFolderDelete = await request(app.getHttpServer())
      .get(`/projects/${project.id}/documents`)
      .set(auth(token));
    expect(documentsAfterFolderDelete.body).toEqual([
      { id: integrationsDoc.id, type: 'integrations', name: 'Integrations', data: { instances: [] } },
    ]);
  });

  it('rejects deleting or moving the pinned integrations document', async () => {
    const token = await login(app);
    const createProjectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set(auth(token))
      .send({ name: 'p' });
    const project = createProjectResponse.body;

    const tree = await request(app.getHttpServer()).get(`/projects/${project.id}/tree`).set(auth(token));
    const integrationsDocId = tree.body.documents[0].id;

    await request(app.getHttpServer())
      .delete(`/projects/${project.id}/documents/${integrationsDocId}`)
      .set(auth(token))
      .expect(403);

    await request(app.getHttpServer())
      .patch(`/projects/${project.id}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({ folderId: null })
      .expect(403);
  });

  it('404s when accessing another user’s project', async () => {
    const adminToken = await login(app);
    const createProjectResponse = await request(app.getHttpServer())
      .post('/projects')
      .set(auth(adminToken))
      .send({ name: 'p' });
    const project = createProjectResponse.body;

    // No signup flow exists yet — insert a second user directly through the same running app's
    // UsersService rather than through HTTP.
    const usersService = app.get(UsersService);
    await usersService.create({ username: 'someone-else', password: 'password' });
    const otherToken = await login(app, 'someone-else', 'password');

    const response = await request(app.getHttpServer()).get(`/projects/${project.id}/tree`).set(auth(otherToken));
    expect(response.status).toBe(404);
  });

  describe('integration credentials (ADR 0006)', () => {
    const setUpProject = async (token: string): Promise<{ projectId: string; integrationsDocId: string }> => {
      const createResponse = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
      const projectId: string = createResponse.body.id;
      const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
      return { projectId, integrationsDocId: tree.body.documents[0].id };
    };

    const saveBotToken = (projectId: string, docId: string, token: string, dev: string) =>
      request(app.getHttpServer())
        .patch(`/projects/${projectId}/documents/${docId}`)
        .set(auth(token))
        .send({
          data: {
            instances: [{ id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev, prod: '' } } }],
          },
        });

    const resolveCredential = (projectId: string, projectToken?: string) =>
      request(app.getHttpServer())
        .post('/internal/credentials/resolve')
        .set(projectToken ? { [INTERNAL_PROJECT_TOKEN_HEADER]: projectToken } : {})
        .send({ credentialId: 'cred-1', vendor: 'telegram', field: 'botToken', env: 'dev', projectId });

    it('masks a saved secret field on every read but keeps it decryptable via the internal resolver', async () => {
      const token = await login(app);
      const { projectId, integrationsDocId } = await setUpProject(token);
      await saveBotToken(projectId, integrationsDocId, token, 'raw-bot-token').expect(200);

      const afterCreate = await request(app.getHttpServer()).get(`/projects/${projectId}/documents`).set(auth(token));
      const instance = afterCreate.body.find((doc: { id: string }) => doc.id === integrationsDocId).data.instances[0];
      expect(instance.fields.botToken).toEqual({ dev: SECRET_MASK, prod: '' });

      // Re-saving with the mask echoed back unchanged (as the editor's form would) must not
      // overwrite the real secret with the literal mask string.
      await saveBotToken(projectId, integrationsDocId, token, SECRET_MASK).expect(200);

      const internalToken = app.get(ProjectTokenService).getOrCreateToken(projectId);
      const resolved = await resolveCredential(projectId, internalToken);
      expect(resolved.status).toBe(201);
      expect(resolved.body).toEqual({ value: 'raw-bot-token' });
    });

    it('rejects the internal resolver without a valid project token, with no Authorization header needed', async () => {
      const token = await login(app);
      const { projectId, integrationsDocId } = await setUpProject(token);
      await saveBotToken(projectId, integrationsDocId, token, 'x');

      const noHeader = await resolveCredential(projectId);
      const wrongToken = await resolveCredential(projectId, 'not-the-token');
      expect(noHeader.status).toBe(403);
      expect(wrongToken.status).toBe(403);
    });

    it("rejects a project's valid token used against another project's credentials", async () => {
      const token = await login(app);
      const { projectId: projectA, integrationsDocId } = await setUpProject(token);
      await saveBotToken(projectA, integrationsDocId, token, 'x');
      const { projectId: projectB } = await setUpProject(token);
      const tokenForB = app.get(ProjectTokenService).getOrCreateToken(projectB);

      const response = await resolveCredential(projectA, tokenForB);
      expect(response.status).toBe(403);
    });

    it('404s from the internal resolver for an unknown credentialId', async () => {
      const token = await login(app);
      const { projectId } = await setUpProject(token);
      const internalToken = app.get(ProjectTokenService).getOrCreateToken(projectId);
      const response = await resolveCredential(projectId, internalToken);
      expect(response.status).toBe(404);
    });
  });
});
