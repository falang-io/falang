import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth, createTestApp } from '../../test-utils/e2e-app.js';
import { login } from '../../test-utils/e2e-app.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { TableDefinitionsService } from './table-definitions.service.js';

const NAME_FIELD = { id: 'f1', name: 'Name', type: 'text' };
const tableData = (...extra: { id: string; name: string; type: string }[]) => ({
  fields: [NAME_FIELD, ...extra],
  nextFieldNo: extra.length + 2,
});

describe('table documents (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let token: string;
  // oxlint-disable-next-line init-declarations
  let projectId: string;
  let seq = 0;

  const start = async (): Promise<void> => {
    app = await createTestApp();
    token = await login(app);
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'Tables' });
    projectId = created.body.id as string;
  };

  beforeEach(() => {
    seq = 0;
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  const newId = (): string => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`;

  const createTable = (name: string, data: unknown = tableData(), extra: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: newId(), type: 'table', name, data, ...extra });

  it('creates a table document in the Tables section with no root and normalised data', async () => {
    await start();
    const response = await createTable('Клиенты', { fields: [{ id: 'f1', name: 'Имя', type: 'text' }] });
    expect(response.status).toBe(201);
    expect(response.body.root).toBeUndefined();
    expect(response.body.data).toEqual({ fields: [{ id: 'f1', name: 'Имя', type: 'text' }], nextFieldNo: 2 });

    const tree = await request(app.getHttpServer()).get(`/projects/${projectId}/tree`).set(auth(token));
    const tablesFolder = tree.body.folders.find(
      (folder: { fixedKind: string | null }) => folder.fixedKind === 'tables',
    );
    const doc = tree.body.documents.find((d: { id: string }) => d.id === response.body.id);
    expect(doc.folderId).toBe(tablesFolder.id);
  });

  it('ignores a root sent with a table document and accepts non-identifier document names', async () => {
    await start();
    const response = await createTable('my customers', tableData(), { root: { id: 'x', name: 'function' } });
    expect(response.status).toBe(201);
    expect(response.body.root).toBeUndefined();
  });

  it('rejects invalid table data with 400 on create and update', async () => {
    await start();
    const bad = await createTable('Bad', { fields: [{ id: 'x', name: 'Name', type: 'text' }] });
    expect(bad.status).toBe(400);
    const ok = await createTable('Good');
    const patch = await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${ok.body.id}`)
      .set(auth(token))
      .send({ data: { fields: [NAME_FIELD, NAME_FIELD], nextFieldNo: 3 } });
    expect(patch.status).toBe(400);
  });

  it('normalises nextFieldNo on update so a field id is never reusable', async () => {
    await start();
    const ok = await createTable('Orders', tableData({ id: 'f2', name: 'Total', type: 'number' }));
    const patch = await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${ok.body.id}`)
      .set(auth(token))
      .send({ data: { fields: [NAME_FIELD], nextFieldNo: 1 } });
    expect(patch.status).toBe(200);
    expect(patch.body.data.nextFieldNo).toBe(3);
  });

  it('enforces maxTablesPerProject with 409 table_limit', async () => {
    vi.stubEnv('MAX_TABLES_PER_PROJECT', '1');
    await start();
    expect((await createTable('First')).status).toBe(201);
    const second = await createTable('Second');
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('table_limit');
  });

  it('enforces maxTableFields with 409 table_field_limit on create and update', async () => {
    vi.stubEnv('MAX_TABLE_FIELDS', '1');
    await start();
    const tooMany = await createTable('Wide', tableData({ id: 'f2', name: 'Extra', type: 'text' }));
    expect(tooMany.status).toBe(409);
    expect(tooMany.body.code).toBe('table_field_limit');
    const ok = await createTable('Narrow');
    const patch = await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${ok.body.id}`)
      .set(auth(token))
      .send({ data: tableData({ id: 'f2', name: 'Extra', type: 'text' }) });
    expect(patch.status).toBe(409);
    expect(patch.body.code).toBe('table_field_limit');
  });

  it('TableDefinitionsService loads, caches and invalidates on a document write; 404 for other documents', async () => {
    await start();
    const created = await createTable('Items');
    const definitions = app.get(TableDefinitionsService);
    const first = await definitions.get(projectId, created.body.id as string);
    expect(first.data.fields).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/projects/${projectId}/documents/${created.body.id}`)
      .set(auth(token))
      .send({ data: tableData({ id: 'f2', name: 'Qty', type: 'number' }) })
      .expect(200);
    // Within the TTL, only the explicit invalidation by the write makes this fresh.
    expect((await definitions.get(projectId, created.body.id as string)).data.fields).toHaveLength(2);

    const fn = await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id: newId(), type: 'function', name: 'run' });
    await expect(definitions.get(projectId, fn.body.id as string)).rejects.toThrow('not found');
    await expect(definitions.get(newId(), created.body.id as string)).rejects.toThrow('not found');
  });

  it('applies the "tables" access level to owner, editor, executor, admin and strangers', async () => {
    await start();
    const server = app.getHttpServer();
    const register = async (username: string) => {
      const response = await request(server).post('/auth/register').send({ username, password: 'password123' });
      return { token: response.body.accessToken as string, id: response.body.user.id as string };
    };
    const owner = await register('alice');
    const editor = await register('bob');
    const executor = await register('carol');
    const stranger = await register('dave');
    const created = await request(server).post('/projects').set(auth(owner.token)).send({ name: 'Shared' });
    const id = created.body.id as string;
    for (const [login_, roles] of [
      ['bob', ['editor']],
      ['carol', ['executor']],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- sequential supertest calls.
      await request(server)
        .post(`/projects/${id}/members`)
        .set(auth(owner.token))
        .send({ login: login_, roles })
        .expect(201);
    }
    const projects = app.get(ProjectsService);
    const adminId = (await request(server).get('/auth/me').set(auth(token))).body.id as string;
    for (const user of [owner.id, editor.id, executor.id, adminId]) {
      // oxlint-disable-next-line no-await-in-loop
      await expect(projects.getOwnedProject(id, user, 'tables')).resolves.toMatchObject({ id });
    }
    await expect(projects.getOwnedProject(id, stranger.id, 'tables')).rejects.toThrow('not found');
    // The executor still cannot read contents or write.
    await expect(projects.getOwnedProject(id, executor.id, 'read')).rejects.toThrow('not found');
    await expect(projects.getOwnedProject(id, executor.id, 'edit')).rejects.toThrow('not found');
    // The admin may read tables but not write them.
    await expect(projects.getOwnedProject(id, adminId, 'edit')).rejects.toThrow('not found');
  });
});
