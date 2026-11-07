import { tableEventStructId, tablesIntegration } from '@falang/workflow-integrations-tables';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import {
  buildFunctionNode,
  buildReturnNode,
  buildTriggerFunctionRootNode,
} from '../../test-utils/workflow-e2e-fixtures.js';
import {
  buildTableDeleteNode,
  buildTableInsertNode,
  buildTableSelectNode,
  buildTableUpdateNode,
  workflowE2eTablesInternal,
} from '../../test-utils/workflow-e2e-fixtures-tables.js';

/**
 * Workflow-tier spec for ADR 0075 (private) (project tables) — no browser, a plain HTTP client against the real e2e
 * stack (real Temporal, a real runner pod on `kind`). Run it with the workflow tier (`npm run test-e2e:workflow`,
 * `-t tables` to select it); it needs the stack's internal port (`BACKEND_INTERNAL_URL`, default
 * `http://${KIND_GATEWAY_IP:-172.18.0.1}:4011`) and the compose file's `PROJECT_TOKEN_SECRET`.
 *
 * One project: tables `Clients` (Name text, Qty number) and `Audit` (Note text), a function that drives
 * insert -> select -> update (optimistic `{ id, version }`) -> delete on dev, and a `table-record-created`
 * trigger-function on `Clients` that logs the new client's name into `Audit` — a workflow insert fires it, a grid
 * `POST` (source `grid`) never does.
 */
const CLIENTS = 'tbl-clients';
const AUDIT = 'tbl-audit';
const FUNCTION_NAME = 'tableRoundtrip';
const TRIGGER_NAME = 'onClientCreated';

interface IRecord {
  readonly id: string;
  readonly version: number;
  readonly data: Readonly<Record<string, unknown>>;
}

describe('integrations (workflow tier): project tables', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const findDocumentIdByName = async (projectId: string, name: string): Promise<string> => {
    const response = await workflowE2eApi().get(`/projects/${projectId}/documents`).set(workflowE2eAuth(token));
    const document = (response.body as readonly { id: string; name: string }[]).find((doc) => doc.name === name);
    if (!document) throw new Error(`No document named "${name}" in project ${projectId}`);
    return document.id;
  };

  const listRecords = async (projectId: string, tableId: string, env: 'dev' | 'prod'): Promise<readonly IRecord[]> => {
    const response = await workflowE2eApi()
      .get(`/projects/${projectId}/tables/${tableId}/records?env=${env}`)
      .set(workflowE2eAuth(token));
    expect(response.status).toBe(200);
    return (response.body as { records: readonly IRecord[] }).records;
  };

  const auditNotes = async (projectId: string, auditId: string): Promise<string[]> => {
    const records = await listRecords(projectId, auditId, 'dev');
    return records.map((row) => String(row.data.f1)).toSorted();
  };

  const auditHasAtLeast = async (projectId: string, auditId: string, count: number): Promise<boolean> => {
    const notes = await auditNotes(projectId, auditId);
    return notes.length >= count;
  };

  const buildFixture = (): IProjectExportPayload => ({
    formatVersion: 1,
    project: { id: '', name: `Workflow-tier Tables ${Date.now()}` },
    folders: [],
    documents: [
      {
        id: CLIENTS,
        type: 'table',
        name: 'Clients',
        folderId: null,
        pinned: false,
        root: null,
        data: {
          fields: [
            { id: 'f1', name: 'Name', type: 'text' },
            { id: 'f2', name: 'Qty', type: 'number' },
          ],
          nextFieldNo: 3,
        },
      },
      {
        id: AUDIT,
        type: 'table',
        name: 'Audit',
        folderId: null,
        pinned: false,
        root: null,
        data: { fields: [{ id: 'f1', name: 'Note', type: 'text' }], nextFieldNo: 2 },
      },
      {
        id: 'fn',
        type: 'function',
        name: FUNCTION_NAME,
        folderId: null,
        pinned: false,
        root: buildFunctionNode(
          'fn',
          [
            buildTableInsertNode('fn-insert', {
              table: CLIENTS,
              row: "{ Name: 'Ann', Qty: 1 }",
              resultVariable: 'inserted',
            }),
            buildTableSelectNode('fn-select', {
              table: CLIENTS,
              where: "{ Name: 'Ann' }",
              resultVariable: 'rows',
            }),
            buildTableUpdateNode('fn-update', {
              table: CLIENTS,
              set: '{ Qty: 2 }',
              where: '{ id: inserted.id, version: inserted.version }',
              resultVariable: 'updated',
            }),
            buildTableSelectNode('fn-reselect', {
              table: CLIENTS,
              where: '{ id: inserted.id }',
              resultVariable: 'after',
            }),
            buildTableDeleteNode('fn-delete', {
              table: CLIENTS,
              where: '{ id: inserted.id }',
              resultVariable: 'deleted',
            }),
            buildReturnNode('fn-return', '{ inserted, rows, updated, after, deleted }'),
          ],
          { type: 'any' },
        ),
        data: null,
      },
      {
        id: 'trigger',
        type: 'trigger-function',
        name: TRIGGER_NAME,
        folderId: null,
        pinned: false,
        root: buildTriggerFunctionRootNode(
          'trigger',
          {
            vendor: tablesIntegration.vendor,
            triggerName: 'table-record-created',
            credentialId: '',
            scopeVariableName: 'event',
            scopeType: { type: 'struct', id: tableEventStructId(CLIENTS) },
            triggerConfig: { table: CLIENTS },
          },
          [
            buildTableInsertNode('trigger-audit', {
              table: AUDIT,
              row: '{ Note: event.record.Name }',
              resultVariable: 'logged',
            }),
          ],
        ),
        data: null,
      },
    ],
  });

  it('insert -> select -> update with { id, version } -> delete on dev, prod untouched; idempotent insert; triggers fire for workflow writes only', async () => {
    const imported = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(buildFixture());
    expect(imported.status).toBe(201);
    const projectId = imported.body.id as string;
    try {
      // Document ids are re-minted on import (table references inside nodes follow).
      const clientsId = await findDocumentIdByName(projectId, 'Clients');
      const auditId = await findDocumentIdByName(projectId, 'Audit');

      const build = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(build.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 90_000);

      // 1. The roundtrip function. The trigger-function logs the inserted client into Audit on its own.
      const result = (await workflowE2eStartAndAwaitResult(FUNCTION_NAME, `workflow-dev-${projectId}`)) as {
        inserted: { id: string; version: number; Name: string; Qty: number };
        rows: readonly { id: string }[];
        updated: number;
        after: readonly { Qty: number; version: number }[];
        deleted: number;
      };
      expect(result.inserted).toMatchObject({ Name: 'Ann', Qty: 1, version: 1 });
      expect(result.rows.map((row) => row.id)).toContain(result.inserted.id);
      expect(result.updated).toBe(1);
      expect(result.after).toHaveLength(1);
      expect(result.after[0]).toMatchObject({ Qty: 2, version: 2 });
      expect(result.deleted).toBe(1);

      // The function deleted its row; dev has nothing left in Clients, prod never had anything.
      expect(await listRecords(projectId, clientsId, 'dev')).toHaveLength(0);
      expect(await listRecords(projectId, clientsId, 'prod')).toHaveLength(0);

      // 2. A `table-record-created` trigger fired for the workflow insert: Audit got one note (data is keyed by field id).
      await workflowE2eWaitFor(() => auditHasAtLeast(projectId, auditId, 1), 60_000);
      const audit = await listRecords(projectId, auditId, 'dev');
      expect(audit).toHaveLength(1);
      expect(audit[0].data).toEqual({ f1: 'Ann' });
      expect(await listRecords(projectId, auditId, 'prod')).toHaveLength(0);

      // 3. A forced retry: the same idempotencyKey returns the same record and writes nothing more.
      const body = { env: 'dev', idempotencyKey: `e2e-${Date.now()}`, data: { f1: 'Retry', f2: 5 } };
      const first = await workflowE2eTablesInternal(projectId, clientsId, 'insert', body);
      expect(first.status).toBe(200);
      expect(first.body.created).toBe(true);
      const again = await workflowE2eTablesInternal(projectId, clientsId, 'insert', body);
      expect(again.status).toBe(200);
      expect(again.body.created).toBe(false);
      expect(again.body.record.id).toBe(first.body.record.id);
      expect(await listRecords(projectId, clientsId, 'dev')).toHaveLength(1);

      // That internal insert has source `workflow`, so it fires the trigger too: Audit gains "Retry" (once).
      await workflowE2eWaitFor(() => auditHasAtLeast(projectId, auditId, 2), 60_000);
      expect(await auditNotes(projectId, auditId)).toEqual(['Ann', 'Retry']);

      // 4. A grid write (source `grid`) never fires a trigger: insert a client, wait well past the dispatcher's
      // 1 s tick (and a workflow start), Audit is unchanged.
      const grid = await workflowE2eApi()
        .post(`/projects/${projectId}/tables/${clientsId}/records`)
        .set(workflowE2eAuth(token))
        .send({ env: 'dev', data: { f1: 'FromGrid', f2: 1 } });
      expect(grid.status).toBe(201);
      await new Promise((resolve) => {
        setTimeout(resolve, 8000);
      });
      expect(await auditNotes(projectId, auditId)).toEqual(['Ann', 'Retry']);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  }, 240_000);
});
