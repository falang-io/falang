import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

const DOC_ID = '33333333-3333-4333-8333-333333333333';
const FOLDER_ID = '44444444-4444-4444-8444-444444444444';

describe('client-supplied ids cannot overwrite another project rows (IDOR)', () => {
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
  const createProject = async (token: string): Promise<string> => {
    const response = await http().post('/projects').set(auth(token)).send({ name: 'p' }).expect(201);
    return response.body.id as string;
  };
  const registerUser = async (username: string): Promise<string> => {
    await http().post('/auth/register').send({ username, password: 'password123' });
    return login(app, username, 'password123');
  };

  it('create document with an existing foreign id is 409 and leaves the row untouched', async () => {
    const tokenA = await login(app);
    const tokenB = await registerUser('mallory');
    const projectA = await createProject(tokenA);
    const projectB = await createProject(tokenB);
    await http()
      .post(`/projects/${projectA}/documents`)
      .set(auth(tokenA))
      .send({ id: DOC_ID, type: 'function', name: 'orig', root: { id: DOC_ID, name: 'function', children: [] } })
      .expect(201);

    await http()
      .post(`/projects/${projectB}/documents`)
      .set(auth(tokenB))
      .send({ id: DOC_ID, type: 'function', name: 'pwned', root: { id: DOC_ID, name: 'function', children: [] } })
      .expect(409);

    const tree = await http().get(`/projects/${projectA}/documents/tree`).set(auth(tokenA));
    const full = await http().get(`/projects/${projectA}/documents`).set(auth(tokenA)).expect(200);
    expect(tree.status).toBeLessThan(500);
    const doc = (full.body as { id: string; name: string }[]).find((d) => d.id === DOC_ID);
    expect(doc?.name).toBe('orig');
    const full2 = await http().get(`/projects/${projectB}/documents`).set(auth(tokenB)).expect(200);
    expect((full2.body as { id: string }[]).some((d) => d.id === DOC_ID)).toBe(false);
  });

  it('create folder with an existing foreign id is 409 and leaves the row untouched', async () => {
    const tokenA = await login(app);
    const tokenB = await registerUser('mallory');
    const projectA = await createProject(tokenA);
    const projectB = await createProject(tokenB);
    await http()
      .post(`/projects/${projectA}/folders`)
      .set(auth(tokenA))
      .send({ id: FOLDER_ID, name: 'orig' })
      .expect(201);
    await http()
      .post(`/projects/${projectB}/folders`)
      .set(auth(tokenB))
      .send({ id: FOLDER_ID, name: 'pwned' })
      .expect(409);
    const folders = await http().get(`/projects/${projectA}/folders`).set(auth(tokenA));
    if (folders.status === 200) {
      expect((folders.body as { id: string; name: string }[]).find((f) => f.id === FOLDER_ID)?.name).toBe('orig');
    }
  });

  it('rejects a folderId / parentId from another project on create and move', async () => {
    const tokenA = await login(app);
    const tokenB = await registerUser('mallory');
    const projectA = await createProject(tokenA);
    const projectB = await createProject(tokenB);
    await http().post(`/projects/${projectA}/folders`).set(auth(tokenA)).send({ id: FOLDER_ID, name: 'f' }).expect(201);

    const docId = '55555555-5555-4555-8555-555555555555';
    const body = { id: docId, type: 'function', name: 'x', root: { id: docId, name: 'function', children: [] } };
    await http()
      .post(`/projects/${projectB}/documents`)
      .set(auth(tokenB))
      .send({ ...body, folderId: FOLDER_ID })
      .expect(400);
    await http().post(`/projects/${projectB}/documents`).set(auth(tokenB)).send(body).expect(201);
    await http()
      .patch(`/projects/${projectB}/documents/${docId}`)
      .set(auth(tokenB))
      .send({ folderId: FOLDER_ID })
      .expect(400);
    await http()
      .post(`/projects/${projectB}/folders`)
      .set(auth(tokenB))
      .send({ id: '66666666-6666-4666-8666-666666666666', name: 'c', parentId: FOLDER_ID })
      .expect(400);
  });
});
