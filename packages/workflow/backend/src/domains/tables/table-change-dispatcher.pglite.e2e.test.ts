import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveTestDb } from '../../test-utils/test-db-options.js';
import { auth, createTestApp, login } from '../../test-utils/e2e-app.js';
import { RunJournalService } from '../run-journal/run-journal.service.js';
import { DocumentTableTriggerFinder } from './document-table-trigger-finder.js';
import { PgChangeOutboxStore } from './pg-change-outbox-store.js';
import { TableChangeDispatcherService, type ITableTriggerSignaller } from './table-change-dispatcher.service.js';
import { TableRecordChange } from './table-record-change.entity.js';

// Raw `FOR UPDATE SKIP LOCKED` + jsonb: Postgres/PGlite only (FALANG_TEST_DB=pglite-migrations).
describe.skipIf(resolveTestDb() === 'sqlite')('table change dispatcher (PGlite)', () => {
  // oxlint-disable-next-line init-declarations
  let app: INestApplication;
  // oxlint-disable-next-line init-declarations
  let projectId: string;
  // oxlint-disable-next-line init-declarations
  let dataSource: DataSource;
  const tableId = '00000000-0000-4000-8000-0000000000a1';
  const triggerId = '00000000-0000-4000-8000-0000000000a2';
  const signals: { projectId: string; env: string; workflowId: string; workflowType: string; signalName: string }[] =
    [];
  let outcome: 'delivered' | 'inactive' = 'delivered';

  const signaller: ITableTriggerSignaller = {
    signal: (project, env, signal) => {
      signals.push({ projectId: project, env, ...signal });
      return Promise.resolve(outcome);
    },
  };

  const build = (): TableChangeDispatcherService =>
    new TableChangeDispatcherService(
      new PgChangeOutboxStore(dataSource),
      app.get(DocumentTableTriggerFinder),
      signaller,
      app.get(RunJournalService),
      { maxPerMinute: 600, maxAgeMs: 600_000 },
    );

  const addChange = async (overrides: Partial<TableRecordChange> = {}): Promise<number> => {
    const repo = dataSource.getRepository(TableRecordChange);
    const saved = await repo.save(
      repo.create({
        projectId,
        tableId,
        env: 'dev',
        recordId: '00000000-0000-4000-8000-0000000000b1',
        op: 'created',
        before: null,
        after: { f1: 'Anna', version: 1 },
        changedFields: null,
        source: 'workflow',
        runId: null,
        workflowId: null,
        dispatchedAt: null,
        dispatchStatus: null,
        ...overrides,
      }),
    );
    return saved.id;
  };

  const statusOf = async (id: number): Promise<string | null> => {
    const row = await dataSource.getRepository(TableRecordChange).findOneByOrFail({ id });
    return row.dispatchStatus;
  };

  const dispatchedAtOf = async (id: number): Promise<Date | null> => {
    const row = await dataSource.getRepository(TableRecordChange).findOneByOrFail({ id });
    return row.dispatchedAt;
  };

  beforeEach(async () => {
    signals.length = 0;
    outcome = 'delivered';
    app = await createTestApp();
    dataSource = app.get(DataSource);
    const token = await login(app);
    const created = await request(app.getHttpServer()).post('/projects').set(auth(token)).send({ name: 'T' });
    projectId = created.body.id as string;
    const http = request(app.getHttpServer());
    await http
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({
        id: tableId,
        type: 'table',
        name: 'Clients',
        data: { fields: [{ id: 'f1', name: 'Name', type: 'text' }], nextFieldNo: 2 },
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/projects/${projectId}/documents`)
      .set(auth(token))
      .send({
        id: triggerId,
        type: 'trigger-function',
        name: 'onClientCreated',
        root: {
          id: 'tf',
          name: 'trigger-function',
          children: [
            { id: 'h', name: 'function-header', data: '' },
            {
              id: 'b',
              name: 'trigger-function-body',
              data: {
                vendor: 'tables',
                triggerName: 'table-record-created',
                credentialId: '',
                triggerConfig: { table: tableId },
              },
              children: [],
            },
            { id: 'f', name: 'function-footer', data: '' },
          ],
        },
      })
      .expect(201);
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  it('delivers a workflow change once and marks it', async () => {
    const id = await addChange();
    const dispatcher = build();
    await expect(dispatcher.tick()).resolves.toBe(1);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      projectId,
      env: 'dev',
      workflowId: `table-${triggerId}-${id}`,
      workflowType: 'onClientCreated',
      signalName: 'tableRecordCreated',
    });
    expect(await statusOf(id)).toBe('delivered');
    await expect(dispatcher.tick()).resolves.toBe(0);
    expect(signals).toHaveLength(1);
  });

  it('never picks up grid edits and marks no_target for an unbound operation', async () => {
    const grid = await addChange({ source: 'grid' });
    const deleted = await addChange({ op: 'deleted', before: { f1: 'A' }, after: null });
    await build().tick();
    expect(await dispatchedAtOf(grid)).toBeNull();
    expect(await statusOf(deleted)).toBe('no_target');
    expect(signals).toHaveLength(0);
  });

  it('leaves a change pending while the stand is inactive and expires it when old', async () => {
    outcome = 'inactive';
    const fresh = await addChange();
    const old = await addChange({ createdAt: new Date(Date.now() - 700_000) });
    await build().tick();
    expect(await statusOf(fresh)).toBeNull();
    expect(await statusOf(old)).toBe('expired');
  });

  it('throttles beyond the cap and journals the problem', async () => {
    const dispatcher = new TableChangeDispatcherService(
      new PgChangeOutboxStore(dataSource),
      app.get(DocumentTableTriggerFinder),
      signaller,
      app.get(RunJournalService),
      { maxPerMinute: 2, maxAgeMs: 600_000 },
    );
    const ids = [await addChange(), await addChange(), await addChange()];
    await dispatcher.tick();
    expect(await Promise.all(ids.map((id) => statusOf(id)))).toEqual(['delivered', 'delivered', 'throttled']);
  });
});
