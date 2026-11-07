// oxlint-disable no-await-expression-member, no-await-in-loop, no-undefined, max-lines, no-use-before-define -- request-heavy e2e suite.
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { resolveTestDb } from '../../test-utils/test-db-options.js';
import { UserLimitsService } from '../admin/user-limits/user-limits.service.js';
import { INTERNAL_PROJECT_TOKEN_HEADER } from '../internal-auth/project-token.guard.js';
import { ProjectTokenService } from '../internal-auth/project-token.service.js';
import { TableGcService } from './table-gc.service.js';

const FIELDS = [
  { id: 'f1', name: 'Name', type: 'text' },
  { id: 'f2', name: 'Age', type: 'number' },
  { id: 'f3', name: 'Active', type: 'boolean' },
  { id: 'f4', name: 'Kind', type: 'select', options: ['a', 'b'] },
  { id: 'f5', name: 'Doc', type: 'file' },
];
const TABLE_ID = '00000000-0000-4000-8000-0000000000a1';

/** Records need jsonb: these suites run on PGlite (`FALANG_TEST_DB=pglite-migrations`) and skip on the default sqlite. */
describe.skipIf(resolveTestDb() === 'sqlite')('project tables records API (e2e)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let token: string;
  // oxlint-disable-next-line init-declarations
  let projectId: string;
  // oxlint-disable-next-line init-declarations
  let ownerId: string;

  beforeEach(async () => {
    app = await createTestApp();
    token = await login(app);
    ownerId = (await request(app.getHttpServer()).get('/auth/me').set(auth(token))).body.id as string;
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'Tables' });
    projectId = created.body.id as string;
    await createTable(TABLE_ID, 'People', FIELDS);
  });

  afterEach(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer();
  const base = (tableId = TABLE_ID) => `/projects/${projectId}/tables/${tableId}`;

  const createTable = (id: string, name: string, fields: unknown[]) =>
    request(server())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({ id, type: 'table', name, data: { fields, nextFieldNo: fields.length + 1 } })
      .expect(201);

  const internal = (op: string, body: Record<string, unknown>, tableId = TABLE_ID) =>
    request(server())
      .post(`/internal/projects/${projectId}/tables/${tableId}/${op}`)
      .set(INTERNAL_PROJECT_TOKEN_HEADER, app.get(ProjectTokenService).getOrCreateToken(projectId))
      .send({ env: 'dev', ...body });

  const addRecord = async (data: Record<string, unknown>, env = 'dev') => {
    const response = await request(server()).post(`${base()}/records`).set(auth(token)).send({ env, data }).expect(201);
    return response.body as { id: string; version: number; data: Record<string, unknown> };
  };

  const changes = async (): Promise<
    {
      op: string;
      source: string;
      changed_fields: string[] | null;
      env: string;
      record_version: number | string | null;
    }[]
  > => {
    const raw: unknown = await app
      .get(DataSource)
      .query('SELECT op, source, changed_fields, env, record_version FROM table_record_changes ORDER BY id');
    return raw as Awaited<ReturnType<typeof changes>>;
  };

  describe('project routes', () => {
    it('lists the table summaries', async () => {
      const response = await request(server()).get(`/projects/${projectId}/tables`).set(auth(token)).expect(200);
      expect(response.body).toEqual([{ id: TABLE_ID, name: 'People', fields: FIELDS, nextFieldNo: 6 }]);
    });

    it('creates, reads, patches and deletes a record (grid source, version +1 per change)', async () => {
      const created = await addRecord({ f1: 'Ann', f2: 31 });
      expect(created).toMatchObject({ version: 1, data: { f1: 'Ann', f2: 31 } });
      const patched = await request(server())
        .patch(`${base()}/records/${created.id}`)
        .set(auth(token))
        .send({ env: 'dev', data: { f2: 32, f1: null } })
        .expect(200);
      expect(patched.body).toMatchObject({ version: 2, data: { f2: 32 } });
      expect(patched.body.data.f1).toBeUndefined();
      await request(server()).delete(`${base()}/records/${created.id}?env=dev`).set(auth(token)).expect(204);
      const list = await request(server()).get(`${base()}/records`).set(auth(token)).expect(200);
      expect(list.body).toEqual({ records: [], total: 0 });
      expect((await changes()).map((row) => [row.op, row.source])).toEqual([
        ['created', 'grid'],
        ['updated', 'grid'],
        ['deleted', 'grid'],
      ]);
      expect((await changes()).map((row) => Number(row.record_version))).toEqual([1, 2, 2]);
      expect((await changes())[1].changed_fields).toEqual(['f1', 'f2']);
    });

    it('pages, searches and sorts', async () => {
      for (const [name, age] of [
        ['Bob', 5],
        ['alice', 9],
        ['Carl_x', 1],
        ['Dina', 7],
      ] as const) {
        await addRecord({ f1: name, f2: age, f4: 'a' });
      }
      const page = await request(server())
        .get(`${base()}/records?sortField=f2&sortDir=desc&limit=2&offset=1`)
        .set(auth(token))
        .expect(200);
      expect(page.body.total).toBe(4);
      expect(page.body.records.map((r: { data: { f2: number } }) => r.data.f2)).toEqual([7, 5]);
      const search = await request(server()).get(`${base()}/records?search=ALI`).set(auth(token)).expect(200);
      expect(search.body.records).toHaveLength(1);
      const wildcard = await request(server()).get(`${base()}/records?search=_`).set(auth(token)).expect(200);
      expect(wildcard.body.total).toBe(1);
      const bad = await request(server()).get(`${base()}/records?sortField=f9`).set(auth(token)).expect(400);
      expect(bad.body).toMatchObject({ code: 'unknown_field', field: 'f9' });
    });

    it('validates values, unknown fields and the record size', async () => {
      const wrong = await request(server())
        .post(`${base()}/records`)
        .set(auth(token))
        .send({ data: { f2: 'old' } })
        .expect(400);
      expect(wrong.body).toMatchObject({ code: 'invalid_type', field: 'f2' });
      const unknown = await request(server())
        .post(`${base()}/records`)
        .set(auth(token))
        .send({ data: { f9: 1 } })
        .expect(400);
      expect(unknown.body).toMatchObject({ code: 'unknown_field', field: 'f9' });
      await request(server()).post(`${base()}/records`).set(auth(token)).send({ env: 'staging', data: {} }).expect(400);
      await request(server())
        .get(`${base('not-a-uuid')}/records`)
        .set(auth(token))
        .expect(404);
    });

    it('answers 409 version_conflict for a stale expectedVersion', async () => {
      const record = await addRecord({ f1: 'Ann' });
      await request(server())
        .patch(`${base()}/records/${record.id}`)
        .set(auth(token))
        .send({ data: { f2: 1 }, expectedVersion: 1 })
        .expect(200);
      const conflict = await request(server())
        .patch(`${base()}/records/${record.id}`)
        .set(auth(token))
        .send({ data: { f2: 2 }, expectedVersion: 1 })
        .expect(409);
      expect(conflict.body.code).toBe('version_conflict');
      await request(server())
        .patch(`${base()}/records/00000000-0000-4000-8000-00000000ffff`)
        .set(auth(token))
        .send({ data: { f2: 2 } })
        .expect(404);
    });

    it('keeps dev and prod apart, and copy-to-prod replaces prod with dev', async () => {
      await addRecord({ f1: 'dev-1' });
      await addRecord({ f1: 'dev-2' });
      await addRecord({ f1: 'prod-old' }, 'prod');
      const prod = await request(server()).get(`${base()}/records?env=prod`).set(auth(token)).expect(200);
      expect(prod.body.total).toBe(1);

      await request(server()).post(`${base()}/records/copy-to-prod`).set(auth(token)).send({}).expect(400);
      const copied = await request(server())
        .post(`${base()}/records/copy-to-prod`)
        .set(auth(token))
        .send({ confirm: true })
        .expect(200);
      expect(copied.body).toEqual({ copied: 2 });
      const after = await request(server()).get(`${base()}/records?env=prod`).set(auth(token)).expect(200);
      expect(after.body.records.map((r: { data: { f1: string } }) => r.data.f1).toSorted()).toEqual(['dev-1', 'dev-2']);
      const rows = await changes();
      expect(rows.filter((row) => row.source === 'copy').map((row) => `${row.env}:${row.op}`)).toEqual([
        'prod:deleted',
        'prod:created',
        'prod:created',
      ]);
    });

    it('clears one env and writes a clear change row per record', async () => {
      await addRecord({ f1: 'a' });
      await addRecord({ f1: 'b' });
      await addRecord({ f1: 'p' }, 'prod');
      const cleared = await request(server())
        .post(`${base()}/records/clear`)
        .set(auth(token))
        .send({ env: 'dev' })
        .expect(200);
      expect(cleared.body).toEqual({ deleted: 2 });
      expect((await changes()).filter((row) => row.source === 'clear')).toHaveLength(2);
      const prod = await request(server()).get(`${base()}/records?env=prod`).set(auth(token)).expect(200);
      expect(prod.body.total).toBe(1);
    });

    it('lists history and restores an old version, or a deleted record under the same id', async () => {
      const record = await addRecord({ f1: 'v1' });
      await request(server())
        .patch(`${base()}/records/${record.id}`)
        .set(auth(token))
        .send({ data: { f1: 'v2' } });
      let history = await request(server())
        .get(`${base()}/records/${record.id}/history?env=dev`)
        .set(auth(token))
        .expect(200);
      expect(history.body.changes.map((c: { op: string }) => c.op)).toEqual(['updated', 'created']);
      const created = history.body.changes[1];
      const restored = await request(server())
        .post(`${base()}/records/${record.id}/restore`)
        .set(auth(token))
        .send({ env: 'dev', changeId: created.id })
        .expect(200);
      expect(restored.body).toMatchObject({ id: record.id, version: 3, data: { f1: 'v1' } });

      await request(server()).delete(`${base()}/records/${record.id}?env=dev`).set(auth(token)).expect(204);
      history = await request(server()).get(`${base()}/records/${record.id}/history?env=dev`).set(auth(token));
      const deleted = history.body.changes[0];
      expect(deleted.op).toBe('deleted');
      const back = await request(server())
        .post(`${base()}/records/${record.id}/restore`)
        .set(auth(token))
        .send({ env: 'dev', changeId: deleted.id })
        .expect(200);
      expect(back.body).toMatchObject({ id: record.id, version: 1, data: { f1: 'v1' } });
    });

    it('round-trips CSV (BOM, quoting, per-type cells) and reports row errors', async () => {
      await addRecord({ f1: 'Ann, "A"', f2: 3, f3: true, f4: 'a' });
      await addRecord({ f1: 'multi\nline', f3: false });
      const exported = await request(server()).get(`${base()}/export.csv?env=dev`).set(auth(token)).expect(200);
      expect(exported.headers['content-type']).toContain('text/csv');
      expect(exported.headers['content-disposition']).toContain('People.csv');
      const csv = exported.text;
      expect(csv.startsWith('﻿Name,Age,Active,Kind,Doc\r\n')).toBe(true);

      const imported = await request(server())
        .post(`${base()}/import.csv?env=prod&mode=append&createMissingFields=false`)
        .set(auth(token))
        .set('content-type', 'text/csv')
        .send(csv)
        .expect(200);
      expect(imported.body).toMatchObject({ inserted: 2, skipped: 0, createdFields: [] });
      const prod = await request(server()).get(`${base()}/records?env=prod`).set(auth(token)).expect(200);
      expect(prod.body.records.map((r: { data: unknown }) => r.data)).toEqual([
        { f1: 'Ann, "A"', f2: 3, f3: true, f4: 'a' },
        { f1: 'multi\nline', f3: false },
      ]);
      expect((await changes()).filter((row) => row.source === 'import')).toHaveLength(2);

      const bad = await request(server())
        .post(`${base()}/import.csv?env=prod&mode=append`)
        .set(auth(token))
        .set('content-type', 'text/csv')
        .send('name,AGE,Kind\nOk,1,a\nBad,abc,a\nWorse,2,zzz\n')
        .expect(200);
      expect(bad.body.inserted).toBe(1);
      expect(bad.body.skipped).toBe(2);
      expect(bad.body.errors.map((e: { row: number }) => e.row)).toEqual([3, 4]);
    });

    it('imports with createMissingFields (adds text fields), dryRun and replace', async () => {
      await addRecord({ f1: 'keep' });
      const csv = 'Name,City\nAnn,Rome\nBob,Oslo\n';
      const dry = await request(server())
        .post(`${base()}/import.csv?env=dev&createMissingFields=true&dryRun=true`)
        .set(auth(token))
        .set('content-type', 'text/csv')
        .send(csv)
        .expect(200);
      expect(dry.body).toMatchObject({ inserted: 2, createdFields: [{ id: 'f6', name: 'City', type: 'text' }] });
      expect((await request(server()).get(`${base()}/records`).set(auth(token))).body.total).toBe(1);
      expect(
        (await request(server()).get(`/projects/${projectId}/tables`).set(auth(token))).body[0].fields,
      ).toHaveLength(5);

      await request(server())
        .post(`${base()}/import.csv?env=dev&mode=replace&createMissingFields=true`)
        .set(auth(token))
        .set('content-type', 'text/csv')
        .send(csv)
        .expect(200);
      const list = await request(server()).get(`${base()}/records`).set(auth(token));
      expect(list.body.records.map((r: { data: unknown }) => r.data)).toEqual([
        { f1: 'Ann', f6: 'Rome' },
        { f1: 'Bob', f6: 'Oslo' },
      ]);
      const summary = await request(server()).get(`/projects/${projectId}/tables`).set(auth(token));
      expect(summary.body[0].fields.at(-1)).toMatchObject({ id: 'f6', name: 'City' });
      expect(summary.body[0].nextFieldNo).toBe(7);
    });

    it('uploads a file for a file cell and downloads it without publishing', async () => {
      const uploaded = await request(server())
        .post(`${base()}/files?env=dev`)
        .set(auth(token))
        .set('content-type', 'text/plain')
        .set('x-file-name', encodeURIComponent('нота.txt'))
        .send('hello')
        .expect(201);
      expect(uploaded.body).toMatchObject({ name: 'нота.txt', size: 5, mime: 'text/plain' });
      const record = await addRecord({ f5: uploaded.body });
      expect(record.data.f5).toEqual(uploaded.body);
      const download = await request(server()).get(`${base()}/files/${uploaded.body.id}`).set(auth(token)).expect(200);
      expect(download.headers['content-disposition']).toContain('attachment');
      await request(server()).get(`${base()}/files/${uploaded.body.id}`).expect(401);
      await request(server()).get(`${base()}/files/00000000-0000-4000-8000-00000000eeee`).set(auth(token)).expect(404);
      const stored = await app
        .get(DataSource)
        .query('SELECT public_token FROM files WHERE id = $1', [uploaded.body.id]);
      expect((stored as { public_token: string | null }[])[0].public_token).toBeNull();
    });

    it('enforces record count and size limits (409 / 413), CSV import included', async () => {
      await app.get(UserLimitsService).setOverrides(ownerId, { maxTableRecords: 2, maxTableRecordBytes: 80 });
      await addRecord({ f1: 'a' });
      await addRecord({ f1: 'b' });
      const full = await request(server())
        .post(`${base()}/records`)
        .set(auth(token))
        .send({ data: { f1: 'c' } })
        .expect(409);
      expect(full.body.code).toBe('table_record_limit');
      await request(server())
        .post(`${base()}/import.csv?env=dev&mode=append`)
        .set(auth(token))
        .set('content-type', 'text/csv')
        .send('Name\nx\n')
        .expect(409);
      expect((await request(server()).get(`${base()}/records`).set(auth(token))).body.total).toBe(2);
      // prod has its own budget; an oversized record is 413.
      const big = await request(server())
        .post(`${base()}/records`)
        .set(auth(token))
        .send({ env: 'prod', data: { f1: 'x'.repeat(200) } })
        .expect(413);
      expect(big.body.code).toBe('table_record_too_large');
    });
  });

  describe('internal API', () => {
    it('inserts idempotently: the same key returns the same record and writes one change row', async () => {
      const key = 'run-1:act-1';
      const first = await internal('insert', {
        data: { f1: 'Ann' },
        idempotencyKey: key,
        context: { runId: 'run-1' },
      }).expect(200);
      expect(first.body.created).toBe(true);
      const again = await internal('insert', { data: { f1: 'Ann' }, idempotencyKey: key }).expect(200);
      expect(again.body).toMatchObject({ created: false, record: { id: first.body.record.id } });
      const other = await internal('insert', { data: { f1: 'Ann' }, idempotencyKey: 'run-1:act-2' }).expect(200);
      expect(other.body.record.id).not.toBe(first.body.record.id);
      const rows = await changes();
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ op: 'created', source: 'workflow' });
      // Same key in prod is a different record.
      const prod = await internal('insert', { env: 'prod', data: {}, idempotencyKey: key }).expect(200);
      expect(prod.body.created).toBe(true);
      await internal('insert', { data: {} }).expect(400);
    });

    it('selects with where / orderBy / limit over field ids and system keys', async () => {
      for (const [name, age] of [
        ['A', 10],
        ['B', 20],
        ['C', 30],
      ] as const)
        await addRecord({ f1: name, f2: age });
      const result = await internal('select', {
        where: { f2: { gte: 20 } },
        orderBy: [{ field: 'f2', dir: 'desc' }],
        limit: 5,
      }).expect(200);
      expect(result.body.records.map((r: { data: { f1: string } }) => r.data.f1)).toEqual(['C', 'B']);
      const byId = await internal('get', { id: result.body.records[0].id }).expect(200);
      expect(byId.body.data.f1).toBe('C');
      await internal('get', { id: '00000000-0000-4000-8000-00000000ffff' }).expect(404);
      const ors = await internal('select', { where: { or: [{ f1: 'A' }, { f2: { lt: 25, gt: 15 } }] } }).expect(200);
      expect(ors.body.records).toHaveLength(2);
      expect((await internal('select', { env: 'prod' }).expect(200)).body.records).toEqual([]);
    });

    it('answers unknown_field for a removed field in where, set, data and orderBy', async () => {
      const gone = await internal('select', { where: { f9: 1 } }).expect(400);
      expect(gone.body).toMatchObject({ code: 'unknown_field', field: 'f9' });
      await internal('insert', { data: { f9: 1 }, idempotencyKey: 'k' }).expect(400);
      await internal('update', { set: { f9: 1 }, where: { f1: 'x' } }).expect(400);
      await internal('select', { orderBy: [{ field: 'f9', dir: 'asc' }] }).expect(400);
      // A field deleted from the document after the record was written: old cells stay, new writes refuse the id.
      const record = await addRecord({ f1: 'Ann', f2: 3 });
      await request(server())
        .patch(`/projects/${projectId}/documents/${TABLE_ID}`)
        .set(auth(token))
        .send({ data: { fields: FIELDS.filter((f) => f.id !== 'f2'), nextFieldNo: 6 } })
        .expect(200);
      const after = await internal('update', { set: { f2: 4 }, where: { id: record.id } }).expect(400);
      expect(after.body).toMatchObject({ code: 'unknown_field', field: 'f2' });
      const row = await internal('get', { id: record.id }).expect(200);
      expect(row.body.data).toEqual({ f1: 'Ann', f2: 3 });
    });

    it('requires a non-empty where for update and delete', async () => {
      await addRecord({ f1: 'a' });
      for (const op of ['update', 'delete']) {
        for (const where of [undefined, {}, { and: [] }]) {
          const response = await internal(op, { set: { f1: 'z' }, where }).expect(400);
          expect(response.body.code).toBe('where_required');
        }
      }
      expect((await request(server()).get(`${base()}/records`).set(auth(token))).body.total).toBe(1);
    });

    it('updates with optimistic locking via { id, version } and skips no-op updates', async () => {
      const record = await addRecord({ f1: 'Ann', f2: 1 });
      const hit = await internal('update', { set: { f2: 2 }, where: { id: record.id, version: 1 } }).expect(200);
      expect(hit.body).toEqual({ affected: 1 });
      const stale = await internal('update', { set: { f2: 3 }, where: { id: record.id, version: 1 } }).expect(200);
      expect(stale.body).toEqual({ affected: 0 });
      const noop = await internal('update', { set: { f2: 2 }, where: { id: record.id } }).expect(200);
      expect(noop.body).toEqual({ affected: 1 });
      const current = await internal('get', { id: record.id }).expect(200);
      expect(current.body).toMatchObject({ version: 2, data: { f1: 'Ann', f2: 2 } });
      expect((await changes()).map((row) => row.op)).toEqual(['created', 'updated']);
      expect((await changes())[1]).toMatchObject({ source: 'workflow', changed_fields: ['f2'] });
      expect((await changes()).map((row) => Number(row.record_version))).toEqual([1, 2]);
    });

    it('updates and deletes many records and records workflow changes', async () => {
      for (const name of ['a', 'b', 'c']) await addRecord({ f1: name, f4: name === 'c' ? 'b' : 'a' });
      const updated = await internal('update', { set: { f3: true }, where: { f4: 'a' } }).expect(200);
      expect(updated.body.affected).toBe(2);
      const removed = await internal('delete', {
        where: { f3: true },
        context: { runId: 'r', workflowId: 'w' },
      }).expect(200);
      expect(removed.body.affected).toBe(2);
      const rows = await app
        .get(DataSource)
        .query("SELECT op, run_id, workflow_id FROM table_record_changes WHERE op = 'deleted'");
      expect(rows).toEqual([
        { op: 'deleted', run_id: 'r', workflow_id: 'w' },
        { op: 'deleted', run_id: 'r', workflow_id: 'w' },
      ]);
      expect((await request(server()).get(`${base()}/records`).set(auth(token))).body.total).toBe(1);
    });

    it('rejects a wrong or foreign project token', async () => {
      await request(server())
        .post(`/internal/projects/${projectId}/tables/${TABLE_ID}/select`)
        .set(INTERNAL_PROJECT_TOKEN_HEADER, 'nope')
        .send({ env: 'dev' })
        .expect(403);
    });
  });

  describe('access matrix', () => {
    const register = async (username: string) => {
      const response = await request(server()).post('/auth/register').send({ username, password: 'password123' });
      return response.body.accessToken as string;
    };

    it('lets owner/editor write, executor and admin read only, and hides everything from a stranger', async () => {
      const owner = await register('alice');
      const editor = await register('bob');
      const executor = await register('carol');
      const stranger = await register('dave');
      const created = await request(server()).post('/projects').set(auth(owner)).send({ name: 'Shared' });
      const pid = created.body.id as string;
      const tid = '00000000-0000-4000-8000-0000000000b2';
      await request(server())
        .post(`/projects/${pid}/documents`)
        .set(auth(owner))
        .send({ id: tid, type: 'table', name: 'T', data: { fields: [FIELDS[0]], nextFieldNo: 2 } })
        .expect(201);
      for (const [login_, role] of [
        ['bob', 'editor'],
        ['carol', 'executor'],
      ] as const) {
        await request(server())
          .post(`/projects/${pid}/members`)
          .set(auth(owner))
          .send({ login: login_, roles: [role] })
          .expect(201);
      }
      const url = `/projects/${pid}/tables/${tid}`;
      const written = await request(server())
        .post(`${url}/records`)
        .set(auth(editor))
        .send({ data: { f1: 'x' } })
        .expect(201);
      const recordId = written.body.id as string;
      const admin = token;

      for (const who of [owner, editor, executor, admin]) {
        await request(server()).get(`/projects/${pid}/tables`).set(auth(who)).expect(200);
        await request(server()).get(`${url}/records`).set(auth(who)).expect(200);
        await request(server()).get(`${url}/export.csv`).set(auth(who)).expect(200);
        await request(server()).get(`${url}/records/${recordId}/history`).set(auth(who)).expect(200);
      }
      for (const who of [executor, admin, stranger]) {
        await request(server())
          .post(`${url}/records`)
          .set(auth(who))
          .send({ data: { f1: 'y' } })
          .expect(404);
        await request(server())
          .patch(`${url}/records/${recordId}`)
          .set(auth(who))
          .send({ data: { f1: 'y' } })
          .expect(404);
        await request(server()).delete(`${url}/records/${recordId}`).set(auth(who)).expect(404);
        await request(server()).post(`${url}/records/clear`).set(auth(who)).send({}).expect(404);
        await request(server()).post(`${url}/records/copy-to-prod`).set(auth(who)).send({ confirm: true }).expect(404);
        await request(server())
          .post(`${url}/import.csv`)
          .set(auth(who))
          .set('content-type', 'text/csv')
          .send('Name\nz')
          .expect(404);
        await request(server()).post(`${url}/files`).set(auth(who)).set('x-file-name', 'a.txt').send('x').expect(404);
      }
      for (const path of ['', `/${tid}/records`, `/${tid}/export.csv`]) {
        await request(server()).get(`/projects/${pid}/tables${path}`).set(auth(stranger)).expect(404);
      }
    });
  });

  it('sweeps change rows past their retention', async () => {
    await addRecord({ f1: 'old' });
    await app.get(DataSource).query("UPDATE table_record_changes SET created_at = now() - interval '40 days'");
    await addRecord({ f1: 'new' });
    expect(await app.get(TableGcService).sweep()).toBe(1);
    expect(await changes()).toHaveLength(1);
  });
});
