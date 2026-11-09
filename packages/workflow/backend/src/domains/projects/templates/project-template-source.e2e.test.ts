import { Global, Module, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';
import type { IProjectExportPayload } from '../export/project-export.service.js';
import { PROJECT_TEMPLATE_SOURCE, type IProjectTemplateSource } from './project-template-source.js';

const SHARED_KEY = '3f1d6a52-7c0e-4b8f-9a1e-5d2b7c4e9f10';
const FN_ID = '9a4c1e2b-6d3f-4a8e-b5c7-1f2e3d4c5b6a';

const sharedPayload: IProjectExportPayload = {
  formatVersion: 1,
  project: { id: '', name: 'Shared' },
  folders: [],
  documents: [
    {
      id: FN_ID,
      type: 'function',
      name: 'run',
      folderId: null,
      pinned: false,
      root: { id: FN_ID, name: 'function', children: [] },
      data: null,
    },
  ],
};

/** What the hosted edition's predefined projects plug in: one known key, payload loads counted. */
const fakeSource = {
  find: vi.fn<IProjectTemplateSource['find']>(),
  loads: 0,
};

@Global()
@Module({
  exports: [PROJECT_TEMPLATE_SOURCE],
  providers: [{ provide: PROJECT_TEMPLATE_SOURCE, useValue: fakeSource }],
})
class FakeTemplateSourceModule {}

describe('project templates from PROJECT_TEMPLATE_SOURCE (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    fakeSource.loads = 0;
    fakeSource.find.mockReset();
    fakeSource.find.mockImplementation((key) =>
      Promise.resolve(
        key === SHARED_KEY
          ? {
              loadPayload: () => {
                fakeSource.loads += 1;
                return Promise.resolve(structuredClone(sharedPayload));
              },
              summary: { description: '', id: SHARED_KEY, name: 'Shared', slug: null },
            }
          : null,
      ),
    );
    // oxlint-disable-next-line no-undefined -- no beforeInit hook, only extra modules
    app = await createTestApp(undefined, [FakeTemplateSourceModule]);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('serves a source template and its payload without a token, loading the payload only when asked', async () => {
    const summary = await http().get(`/project-templates/${SHARED_KEY}`).expect(200);
    expect(summary.body).toEqual({ description: '', id: SHARED_KEY, name: 'Shared', slug: null });
    expect(fakeSource.loads).toBe(0);

    const payload = await http().get(`/project-templates/${SHARED_KEY}/payload`).expect(200);
    expect(payload.body.documents.map((doc: { name: string }) => doc.name)).toEqual(['run']);
    expect(fakeSource.loads).toBe(1);
  });

  it('creates a project from a source template', async () => {
    const token = await login(app);
    const created = await http()
      .post(`/projects/from-template/${SHARED_KEY}`)
      .set(auth(token))
      .send({ name: 'My copy' })
      .expect(201);
    expect(created.body.name).toBe('My copy');
    const tree = await http().get(`/projects/${created.body.id}/tree`).set(auth(token)).expect(200);
    expect(tree.body.documents.map((doc: { name: string }) => doc.name)).toContain('run');
  });

  it('404s a key the source does not know; a stored template never reaches the source', async () => {
    await http().get('/project-templates/0b6f2d1e-8c4a-4e9b-a7d3-2c1f5e6b8a90').expect(404);
    await http().get('/project-templates/0b6f2d1e-8c4a-4e9b-a7d3-2c1f5e6b8a90/payload').expect(404);

    const token = await login(app);
    const list = await http().get('/project-templates').set(auth(token)).expect(200);
    expect(list.body.map((row: { id: string }) => row.id)).not.toContain(SHARED_KEY);
    fakeSource.find.mockClear();
    await http().get(`/project-templates/${list.body[0].id}`).expect(200);
    expect(fakeSource.find).not.toHaveBeenCalled();
  });
});
