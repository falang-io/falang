import type { INestApplication } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp, login } from '../../../test-utils/e2e-app.js';

// The `sqlite` vendor is off unless ENABLE_SQLITE_INTEGRATION=true (security audit P0-11); `vi.hoisted` runs before the imports below.
vi.hoisted(() => {
  process.env.ENABLE_SQLITE_INTEGRATION = 'true';
});

/**
 * Covers ADR 0039 (private) §4's
 * `POST /projects/:id/integrations/:credentialId/sync-schema` route, using the real (in-process)
 * `sqlite` vendor against a real temp-file `node:sqlite` database — no Docker/network needed, same
 * reasoning as `sql-common`'s own `sql-e2e-sqlite.test.ts`.
 */
describe('sync-schema endpoint (POST .../integrations/:credentialId/sync-schema)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let dir: string;
  // oxlint-disable-next-line init-declarations
  let dbPath: string;

  beforeEach(async () => {
    vi.stubEnv('CREDENTIALS_ENCRYPTION_KEY', 'test-encryption-key');
    app = await createTestApp();
    dir = mkdtempSync(join(tmpdir(), 'falang-sync-schema-e2e-'));
    dbPath = join(dir, 'test.sqlite');
    const seed = new DatabaseSync(dbPath);
    seed.exec('CREATE TABLE orders (id INTEGER PRIMARY KEY, status TEXT NOT NULL);');
    seed.close();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  const setUpProject = async (token: string): Promise<{ projectId: string; integrationsDocId: string }> => {
    const createResponse = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'p' });
    const projectId: string = createResponse.body.id;
    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    return { projectId, integrationsDocId: tree.body.documents[0].id };
  };

  it('syncs a real sqlite schema, stores it, and makes it readable via GET .../vendor-data', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            {
              id: 'cred-1',
              vendor: 'sqlite',
              name: 'My SQLite',
              fields: { connectionString: { dev: dbPath, prod: '' } },
            },
          ],
        },
      })
      .expect(200);

    const syncResponse = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-1/sync-schema`)
      .set(auth(token));

    expect(syncResponse.status).toBe(201);
    expect(syncResponse.body.schema.dialect).toBe('sqlite');
    expect(syncResponse.body.schema.tables).toHaveLength(1);
    expect(syncResponse.body.schema.tables[0].name).toBe('orders');

    const getResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/integrations/cred-1/vendor-data`)
      .set(auth(token));
    expect(getResponse.body.schema.tables[0].name).toBe('orders');

    // `table`'s `loadOptions` (ADR 0039 (private) §6) reads back the just-synced schema.
    const optionsResponse = await request(app.getHttpServer())
      .get(`/projects/${projectId}/integrations/cred-1/actions/sqlite-select/fields/table/options`)
      .set(auth(token));
    expect(optionsResponse.status).toBe(200);
    expect(optionsResponse.body).toEqual([{ value: 'orders', label: 'orders' }]);
  });

  it('400s a vendor with no syncVendorData hook (e.g. telegram)', async () => {
    const token = await login(app);
    const { projectId, integrationsDocId } = await setUpProject(token);
    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
      .set(auth(token))
      .send({
        data: {
          instances: [
            { id: 'cred-2', vendor: 'telegram', name: 'My Bot', fields: { botToken: { dev: 'tok', prod: '' } } },
          ],
        },
      })
      .expect(200);

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/cred-2/sync-schema`)
      .set(auth(token));

    expect(response.status).toBe(400);
  });

  it('404s for an unknown credentialId', async () => {
    const token = await login(app);
    const { projectId } = await setUpProject(token);

    const response = await request(app.getHttpServer())
      .post(`/projects/${projectId}/integrations/unknown-cred/sync-schema`)
      .set(auth(token));

    expect(response.status).toBe(404);
  });
});
