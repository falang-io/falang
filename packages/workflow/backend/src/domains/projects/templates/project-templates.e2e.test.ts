import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

describe('project templates (e2e)', () => {
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

  const http = () => request(app.getHttpServer());

  const registerUser = async (username: string): Promise<string> => {
    await http().post('/auth/register').send({ username, password: 'password123' });
    return login(app, username, 'password123');
  };

  /** A project with one function document and an `integrations` document holding a real secret. */
  const setUpSourceProject = async (token: string): Promise<string> => {
    const created = await http().post('/projects').set(auth(token)).send({ name: 'Source' });
    const projectId: string = created.body.id;
    const tree = await http().get(`/projects/${projectId}/tree`).set(auth(token));
    const integrationsDocId: string = tree.body.documents[0].id;
    await http()
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            {
              id: 'cred-1',
              vendor: 'telegram',
              name: 'Bot',
              fields: { botToken: { dev: 'raw-token', prod: 'prod-tok' } },
            },
          ],
        },
      })
      .expect(200);
    const docId = '8b2e45d1-fa81-4ddb-a012-dde04d7ee4e4';
    await http()
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({
        id: docId,
        type: 'function',
        name: 'run',
        folderId: null,
        root: { id: docId, name: 'function', children: [] },
      })
      .expect(201);
    return projectId;
  };

  it('seeds exactly one blank template on an empty table', async () => {
    const token = await login(app);
    const list = await http().get('/project-templates').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: 'Blank project' });
    expect(Object.keys(list.body[0]).toSorted()).toEqual(['description', 'id', 'name']);
  });

  it('creates a project from the blank template with the pinned integrations document', async () => {
    const token = await registerUser('alice');
    const templates = await http().get('/project-templates').set(auth(token));
    const [blank] = templates.body;

    const response = await http().post(`/projects/from-template/${blank.id}`).set(auth(token)).send({ name: 'Mine' });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe('Mine');

    const tree = await http().get(`/projects/${response.body.id}/tree`).set(auth(token));
    expect(tree.body.documents.map((d: { type: string }) => d.type)).toEqual(['integrations']);
    const projects = await http().get('/projects').set(auth(token));
    expect(projects.body.map((p: { name: string }) => p.name)).toContain('Mine');
  });

  it('404s an unknown or disabled template', async () => {
    const token = await login(app);
    await http()
      .post('/projects/from-template/3ad0f6d5-d449-4945-b5f4-9f8d7041a3e9')
      .set(auth(token))
      .send({ name: 'x' })
      .expect(404);
  });

  it('admin CRUD, from-template without secrets', async () => {
    const adminToken = await login(app);
    const sourceId = await setUpSourceProject(adminToken);

    const created = await http()
      .post('/admin/project-templates')
      .set(auth(adminToken))
      .send({ name: 'Bot starter', description: 'desc', sourceProjectId: sourceId });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Bot starter', enabled: true, sourceProjectId: sourceId });
    const templateId: string = created.body.id;

    const adminList = await http().get('/admin/project-templates').set(auth(adminToken));
    expect(adminList.body).toHaveLength(2);

    const exported = await http().get(`/admin/project-templates/${templateId}/export`).set(auth(adminToken));
    expect(exported.status).toBe(200);
    expect(exported.body.formatVersion).toBe(1);
    expect(JSON.stringify(exported.body)).not.toContain('raw-token');
    expect(JSON.stringify(exported.body)).not.toContain('prod-tok');

    const aliceToken = await registerUser('alice');
    const fromTemplate = await http()
      .post(`/projects/from-template/${templateId}`)
      .set(auth(aliceToken))
      .send({ name: 'From template' });
    expect(fromTemplate.status).toBe(201);
    const newProjectId: string = fromTemplate.body.id;

    const tree = await http().get(`/projects/${newProjectId}/tree`).set(auth(aliceToken));
    const types = tree.body.documents.map((d: { type: string }) => d.type).toSorted();
    expect(types).toEqual(['function', 'integrations']);
    const withData = await http().get(`/projects/${newProjectId}/export`).set(auth(aliceToken));
    const raw = JSON.stringify(withData.body);
    // Import issues fresh instance ids (security P0), so the original id must not survive.
    expect(raw).not.toContain('cred-1');
    const integrationsDoc = (
      withData.body.documents as { type: string; data?: { instances?: Record<string, unknown>[] } }[]
    ).find((d) => d.type === 'integrations');
    const instance = integrationsDoc?.data?.instances?.find((i) => i.vendor === 'telegram' && i.name === 'Bot');
    expect(instance).toBeDefined();
    expect(raw).not.toContain('raw-token');
    expect(raw).not.toContain('prod-tok');

    // Patch: disable, reorder; a user no longer sees it.
    const patched = await http()
      .patch(`/admin/project-templates/${templateId}`)
      .set(auth(adminToken))
      .send({ enabled: false, sortOrder: 5, name: 'Renamed' });
    expect(patched.body).toMatchObject({ enabled: false, sortOrder: 5, name: 'Renamed' });
    const visible = await http().get('/project-templates').set(auth(aliceToken));
    expect(visible.body.map((t: { name: string }) => t.name)).toEqual(['Blank project']);
    await http().post(`/projects/from-template/${templateId}`).set(auth(aliceToken)).send({ name: 'x' }).expect(404);

    // Refresh + payload upload + delete.
    await http()
      .post(`/admin/project-templates/${templateId}/refresh`)
      .set(auth(adminToken))
      .send({ sourceProjectId: sourceId })
      .expect(200);
    const upload = await http()
      .put(`/admin/project-templates/${templateId}/payload`)
      .set(auth(adminToken))
      .send({ formatVersion: 1, project: { id: '', name: 'Uploaded' }, folders: [], documents: [] });
    expect(upload.status).toBe(200);
    expect(upload.body.sourceProjectId).toBeNull();
    await http()
      .put(`/admin/project-templates/${templateId}/payload`)
      .set(auth(adminToken))
      .send({ nope: true })
      .expect(400);
    await http().delete(`/admin/project-templates/${templateId}`).set(auth(adminToken)).expect(204);
    await http().delete(`/admin/project-templates/${templateId}`).set(auth(adminToken)).expect(404);
  });

  it("refuses to snapshot another user's project", async () => {
    const adminToken = await login(app);
    const aliceToken = await registerUser('alice');
    const aliceProject = await http().post('/projects').set(auth(aliceToken)).send({ name: 'Alice' });
    const response = await http()
      .post('/admin/project-templates')
      .set(auth(adminToken))
      .send({ name: 'Stolen', sourceProjectId: aliceProject.body.id });
    expect([403, 404]).toContain(response.status);
  });

  it('403s a normal user on /admin/project-templates', async () => {
    const aliceToken = await registerUser('alice');
    await http().get('/admin/project-templates').set(auth(aliceToken)).expect(403);
    await http()
      .post('/admin/project-templates')
      .set(auth(aliceToken))
      .send({ name: 'x', sourceProjectId: '3ad0f6d5-d449-4945-b5f4-9f8d7041a3e9' })
      .expect(403);
  });
});
