import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UsersService } from '../../users/users/users.service.js';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

describe('project export/import (e2e)', () => {
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

  const setUpProject = async (token: string) => {
    const createResponse = await request(app.getHttpServer())
      .post('/projects')
      .set(auth(token))
      .send({ name: 'Source project' });
    const projectId: string = createResponse.body.id;

    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    const integrationsDocId: string = tree.body.documents[0].id;

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            { id: 'cred-1', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'raw-token', prod: '' } } },
          ],
        },
      })
      .expect(200);

    const folderId = '3ad0f6d5-d449-4945-b5f4-9f8d7041a3e9';
    const docId = '8b2e45d1-fa81-4ddb-a012-dde04d7ee4e4';
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/folders`)
      .set(auth(token))
      .send({ id: folderId, name: 'Functions', parentId: null })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: docId, type: 'function', name: 'run', folderId, root: { id: docId, name: 'function', children: [] } })
      .expect(201);

    return { projectId, integrationsDocId, folderId, docId };
  };

  it('exports a project with a blank project id and blanked-out integration secrets', async () => {
    const token = await login(app);
    const { projectId, folderId, docId } = await setUpProject(token);

    const response = await request(app.getHttpServer()).get(`/projects/${projectId}/export`).set(auth(token));
    expect(response.status).toBe(200);

    expect(response.body).toMatchObject({ formatVersion: 1, project: { id: '', name: 'Source project' } });
    expect(response.body.folders).toEqual([{ id: folderId, name: 'Functions', parentId: null }]);

    const integrationsDoc = response.body.documents.find((doc: { type: string }) => doc.type === 'integrations');
    expect(integrationsDoc.data.instances[0].fields.botToken).toEqual({ dev: '', prod: '' });
    expect(JSON.stringify(response.body)).not.toContain('raw-token');

    const functionDoc = response.body.documents.find((doc: { id: string }) => doc.id === docId);
    expect(functionDoc).toMatchObject({
      type: 'function',
      name: 'run',
      folderId,
      root: { id: docId, name: 'function' },
    });
  });

  it('404s exporting a project owned by someone else', async () => {
    const token = await login(app);
    const { projectId } = await setUpProject(token);

    const usersService = app.get(UsersService);
    await usersService.create({ username: 'someone-else', password: 'password' });
    const otherToken = await login(app, 'someone-else', 'password');

    const response = await request(app.getHttpServer()).get(`/projects/${projectId}/export`).set(auth(otherToken));
    expect(response.status).toBe(404);
  });

  it('imports an exported payload into a brand-new project, preserving structure but not the old ids', async () => {
    const token = await login(app);
    const { projectId: sourceProjectId, folderId: sourceFolderId } = await setUpProject(token);

    const exported = await request(app.getHttpServer()).get(`/projects/${sourceProjectId}/export`).set(auth(token));

    const imported = await request(app.getHttpServer()).post('/projects/import').set(auth(token)).send(exported.body);
    expect(imported.status).toBe(201);
    expect(imported.body.name).toBe('Source project');
    expect(imported.body.id).not.toBe(sourceProjectId);

    const newProjectId: string = imported.body.id;
    const tree = await request(app.getHttpServer()).get(`/projects/${newProjectId}/tree`).set(auth(token));
    expect(tree.body.folders).toHaveLength(1);
    expect(tree.body.folders[0]).toMatchObject({ name: 'Functions' });
    expect(tree.body.folders[0].id).not.toBe(sourceFolderId);
    expect(tree.body.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'integrations', pinned: true }),
        expect.objectContaining({ type: 'function', name: 'run', folderId: tree.body.folders[0].id }),
      ]),
    );
    expect(tree.body.documents).toHaveLength(2);

    const documents = await request(app.getHttpServer()).get(`/projects/${newProjectId}/documents`).set(auth(token));
    const integrationsDoc = documents.body.find((doc: { type: string }) => doc.type === 'integrations');
    expect(integrationsDoc.data.instances[0].fields.botToken).toEqual({ dev: '', prod: '' });

    // The original project is untouched.
    const originalDocuments = await request(app.getHttpServer())
      .get(`/projects/${sourceProjectId}/documents`)
      .set(auth(token));
    expect(originalDocuments.body).toHaveLength(2);
  });

  it('mints fresh credential ids on import and rewrites every reference to them', async () => {
    const token = await login(app);
    const docId = '5d1d9a64-2f4b-4e4b-9d54-0b5b6b4a7c11';
    const payload = {
      formatVersion: 1,
      project: { id: '', name: 'Refs' },
      folders: [],
      documents: [
        {
          id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
          type: 'integrations',
          name: 'Integrations',
          folderId: null,
          pinned: true,
          root: null,
          data: { instances: [{ id: 'cred-1', vendor: 'telegram', name: 'Bot', fields: {} }] },
        },
        {
          id: docId,
          type: 'function',
          name: 'run',
          folderId: null,
          pinned: false,
          root: {
            id: docId,
            name: 'function',
            children: [{ id: 'n1', name: 'x', data: { credentialId: 'cred-1', text: 'cred-1' } }],
          },
          data: null,
        },
      ],
    };
    const imported = await request(app.getHttpServer()).post('/projects/import').set(auth(token)).send(payload);
    expect(imported.status).toBe(201);
    const documents = await request(app.getHttpServer())
      .get(`/projects/${imported.body.id}/documents`)
      .set(auth(token));
    const integrations = documents.body.find((doc: { type: string }) => doc.type === 'integrations');
    const newId: string = integrations.data.instances[0].id;
    expect(newId).not.toBe('cred-1');
    const fn = documents.body.find((doc: { type: string }) => doc.type === 'function');
    expect(fn.root.children[0].data).toEqual({ credentialId: newId, text: 'cred-1' });
  });

  it('rejects (409) an integrations document that uses a credential id already taken by another project', async () => {
    const token = await login(app);
    const first = await setUpProject(token);
    expect(first.projectId).toBeTruthy();

    const second = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'Other' });
    const tree = await request(app.getHttpServer()).get(`/projects/${second.body.id}/tree`).set(auth(token));
    const integrationsDocId: string = tree.body.documents[0].id;

    const response = await request(app.getHttpServer())
      .patch(`/projects/${second.body.id}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({ data: { instances: [{ id: 'cred-1', vendor: 'telegram', name: 'Stolen', fields: {} }] } });
    expect(response.status).toBe(409);

    // The same project keeps being able to re-save its own id.
    await request(app.getHttpServer())
      .patch(`/projects/${first.projectId}/documents/${first.integrationsDocId}`)
      .set(auth(token))
      .send({ data: { instances: [{ id: 'cred-1', vendor: 'telegram', name: 'Renamed', fields: {} }] } })
      .expect(200);
  });

  it('rejects an import payload with a cyclic folder parentId', async () => {
    const token = await login(app);

    const response = await request(app.getHttpServer())
      .post('/projects/import')
      .set(auth(token))
      .send({
        formatVersion: 1,
        project: { id: '', name: 'Broken' },
        folders: [
          { id: '11111111-1111-1111-1111-111111111111', name: 'a', parentId: '22222222-2222-2222-2222-222222222222' },
          { id: '22222222-2222-2222-2222-222222222222', name: 'b', parentId: '11111111-1111-1111-1111-111111111111' },
        ],
        documents: [],
      });

    expect(response.status).toBe(400);
  });
});
