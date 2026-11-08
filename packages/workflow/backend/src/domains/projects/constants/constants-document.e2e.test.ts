import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import { makeFolderTestHelpers, type ITreeDocument } from '../../../test-utils/fixed-folders-helpers.js';

const API_URL = { id: 'c1', name: 'API_URL', type: 'string', dev: 'https://dev.example', prod: 'https://example.com' };
const LIMIT = { id: 'c2', name: 'LIMIT', type: 'number', dev: 1, prod: 10 };

describe('constants document (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let token: string;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
    token = await login(app);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const { http, createProject, getTree } = makeFolderTestHelpers(
    () => app,
    () => token,
  );

  const constantsDoc = async (projectId: string): Promise<ITreeDocument> => {
    const tree = await getTree(projectId);
    return tree.documents.find((doc) => doc.type === 'constants') as ITreeDocument;
  };

  const readData = async (projectId: string, documentId: string): Promise<unknown> => {
    const response = await http().get(`/projects/${projectId}/documents`).set(auth(token)).expect(200);
    return (response.body as { id: string; data?: unknown }[]).find((doc) => doc.id === documentId)?.data;
  };

  it('seeds one pinned, empty Constants document at the root', async () => {
    const projectId = await createProject();
    const doc = await constantsDoc(projectId);
    expect(doc).toMatchObject({ name: 'Constants', folderId: null, pinned: true });
    expect(await readData(projectId, doc.id)).toEqual({ constants: [] });
  });

  it('stores valid constants and rejects invalid ones with every problem listed', async () => {
    const projectId = await createProject();
    const doc = await constantsDoc(projectId);
    const url = `/projects/${projectId}/documents/${doc.id}`;
    await http()
      .patch(url)
      .set(auth(token))
      .send({ data: { constants: [API_URL, LIMIT] } })
      .expect(200);
    expect(await readData(projectId, doc.id)).toEqual({ constants: [API_URL, LIMIT] });

    const bad = await http()
      .patch(url)
      .set(auth(token))
      .send({
        data: {
          constants: [
            { ...API_URL, name: 'apiUrl' },
            { ...LIMIT, dev: 'one' },
          ],
        },
      })
      .expect(400);
    expect(bad.body.errors).toEqual([
      expect.stringContaining('"apiUrl" is not a valid constant name'),
      'constants[1] (LIMIT): the dev value must be a finite number',
    ]);
    expect(await readData(projectId, doc.id)).toEqual({ constants: [API_URL, LIMIT] });
  });

  it('cannot be created, deleted, renamed or moved', async () => {
    const projectId = await createProject();
    const doc = await constantsDoc(projectId);
    await http()
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: randomUUID(), type: 'constants', name: 'More', data: { constants: [] } })
      .expect(409);
    await http().delete(`/projects/${projectId}/documents/${doc.id}`).set(auth(token)).expect(403);
    await http()
      .patch(`/projects/${projectId}/documents/${doc.id}`)
      .set(auth(token))
      .send({ name: 'Renamed' })
      .expect(403);
  });

  it('survives export/import and restore of an earlier version', async () => {
    const projectId = await createProject();
    const doc = await constantsDoc(projectId);
    const url = `/projects/${projectId}/documents/${doc.id}`;
    await http()
      .patch(url)
      .set(auth(token))
      .send({ data: { constants: [API_URL] } })
      .expect(200);

    const exported = await http().get(`/projects/${projectId}/export`).set(auth(token)).expect(200);
    const imported = await http().post('/projects/import').set(auth(token)).send(exported.body).expect(201);
    const importedDoc = await constantsDoc(imported.body.id);
    const importedTree = await getTree(imported.body.id);
    expect(importedTree.documents.filter((d) => d.type === 'constants')).toHaveLength(1);
    expect(await readData(imported.body.id, importedDoc.id)).toEqual({ constants: [API_URL] });

    const commit = await http()
      .post(`/projects/${projectId}/commits`)
      .set(auth(token))
      .send({ kind: 'named', message: 'with API_URL' })
      .expect(200);
    await http()
      .patch(url)
      .set(auth(token))
      .send({ data: { constants: [LIMIT] } })
      .expect(200);
    await http().post(`/projects/${projectId}/commits/${commit.body.id}/restore`).set(auth(token)).expect(200);
    expect(await readData(projectId, doc.id)).toEqual({ constants: [API_URL] });
  });
});
