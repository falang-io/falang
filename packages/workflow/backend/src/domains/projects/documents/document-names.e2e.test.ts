import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

const A = '33333333-3333-4333-8333-333333333331';
const B = '33333333-3333-4333-8333-333333333332';
const C = '33333333-3333-4333-8333-333333333333';

describe('document names are unique per project (e2e)', () => {
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

  const createProject = async (token: string, name: string): Promise<string> => {
    const response = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name }).expect(201);
    return response.body.id as string;
  };

  const createDoc = (token: string, projectId: string, id: string, type: string, name: string) =>
    request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id, type, name, folderId: null, root: null });

  it('rejects a duplicate on create, case-insensitively and across types', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'p');
    await createDoc(token, projectId, A, 'objects-structure', 'Order').expect(201);
    const sameCase = await createDoc(token, projectId, B, 'objects-structure', 'ORDER').expect(409);
    expect(sameCase.body.message).toContain('already exists');
    await createDoc(token, projectId, B, 'function', 'order').expect(409);
  });

  it('allows the same name in another project', async () => {
    const token = await login(app);
    const first = await createProject(token, 'p1');
    const second = await createProject(token, 'p2');
    await createDoc(token, first, A, 'function', 'run').expect(201);
    await createDoc(token, second, B, 'function', 'run').expect(201);
  });

  it('rejects renaming onto an existing name but allows a case-only rename of itself', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'p');
    await createDoc(token, projectId, A, 'objects-structure', 'First').expect(201);
    await createDoc(token, projectId, B, 'objects-structure', 'Second').expect(201);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${B}`)
      .set(auth(token))
      .send({ name: 'FIRST' })
      .expect(409);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${B}`)
      .set(auth(token))
      .send({ name: 'SECOND' })
      .expect(200);
  });

  it('refuses a name equal to the seeded Integrations document', async () => {
    const token = await login(app);
    const projectId = await createProject(token, 'p');
    await createDoc(token, projectId, C, 'objects-structure', 'integrations').expect(409);
  });
});
