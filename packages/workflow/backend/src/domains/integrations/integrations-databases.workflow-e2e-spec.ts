import { mysqlIntegration } from '@falang/workflow-integrations-mysql';
import { postgresIntegration } from '@falang/workflow-integrations-postgres';
import { createConnection } from 'mysql2/promise';
import { Client as PgClient } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import type { IProjectExportPayload } from '../projects/export/project-export.service.js';
import {
  WORKFLOW_E2E_MYSQL_USER_DB_URL,
  WORKFLOW_E2E_POSTGRES_USER_DB_URL,
  WORKFLOW_E2E_RUNNER_DB_HOST,
  workflowE2eApi,
  workflowE2eAuth,
  workflowE2eGetIntegrationsDocumentId,
  workflowE2eLogin,
  workflowE2eStartAndAwaitResult,
  workflowE2eWaitFor,
} from '../../test-utils/workflow-e2e-client.js';
import { buildFunctionNode, buildReturnNode } from '../../test-utils/workflow-e2e-fixtures.js';
import {
  buildSqlDeleteNode,
  buildSqlInsertNode,
  buildSqlQueryNode,
  buildSqlSelectNode,
  buildSqlUpdateNode,
} from '../../test-utils/workflow-e2e-fixtures-db.js';

/**
 * Workflow-tier spec for ADR 0039 (private)'s "Consequences" e2e bullet —
 * see ADR 0018 (private) for the shape (no browser, real backend/Temporal/
 * k8s-runner-pod HTTP calls). Runs against a real Postgres and a real MySQL container
 * (`docker-compose.workflow-e2e.yml`'s `postgres-user-db`/`mysql-user-db`, `docker/e2e-seed/*.sql`'s
 * one `orders` table each), reached from a real runner pod through the same
 * `${KIND_GATEWAY_IP}`-via-docker-bridge-gateway host every other cross-network fixture in this
 * suite uses (see `workflow-e2e-client.ts`'s `WORKFLOW_E2E_RUNNER_DB_HOST`) — the same address also
 * works from this test process itself and from `backend`'s own "Sync structure" call, since it's one
 * value shared by every caller (see that constant's own doc comment).
 *
 * One case per dialect: import a project -> seed the credential -> "Sync structure" -> read back the
 * synced `table` options -> patch the function document with a real insert/select/update/query/delete
 * chain -> build -> run it for real -> assert on its result and, independently (a direct `pg`/`mysql2`
 * connection from this test process, not a pod), on the database's own post-delete state.
 *
 * `inserted`/`rows`/`counted`'s real compiled type is `unknown`/`unknown[]` — every structured
 * action's `activitySignature` (`build-sql-integration.ts`) is honest about this; the `Row`/`Insert`/
 * `Patch`/`Where` structs ADR 0039 (private) §5 describes are an editor/Monaco-only convenience
 * (`IActionDescriptor.resultType`'s scope contribution), not a real compiled type. Property access
 * below (`(inserted as any).id`) casts for that reason, same as any hand-written expression field
 * referencing one of these results would have to.
 */
describe('integrations (workflow tier): Databases (Postgres, MySQL)', () => {
  let token = '';

  beforeAll(async () => {
    token = await workflowE2eLogin();
  });

  const waitForDevRunnerStatus = (projectId: string, running: boolean, timeoutMs: number): Promise<void> =>
    workflowE2eWaitFor(async () => {
      const response = await workflowE2eApi().get(`/projects/${projectId}/build/status`).set(workflowE2eAuth(token));
      return (response.body as { running?: boolean }).running === running;
    }, timeoutMs);

  const importFixture = async (payload: IProjectExportPayload): Promise<string> => {
    const response = await workflowE2eApi().post('/projects/import').set(workflowE2eAuth(token)).send(payload);
    expect(response.status).toBe(201);
    return response.body.id as string;
  };

  /** Import remaps top-level document ids (see ADR 0018 (private)'s own note) — find the real one by name, mirrors `integrations-schedule.workflow-e2e-spec.ts`'s own helper. */
  const findDocumentIdByName = async (projectId: string, name: string): Promise<string> => {
    const response = await workflowE2eApi().get(`/projects/${projectId}/documents`).set(workflowE2eAuth(token));
    const document = (response.body as readonly { id: string; name: string }[]).find((doc) => doc.name === name);
    if (!document) throw new Error(`No document named "${name}" in project ${projectId}`);
    return document.id;
  };

  interface IDialectCase {
    readonly vendor: string;
    readonly connectionString: string;
    readonly countSql: string;
    /** Confirms the deleted row is really gone via a direct driver connection from this test process (not a pod). */
    readonly assertRowDeleted: (id: number) => Promise<void>;
  }

  interface IRoundtripResult {
    readonly inserted: { readonly id: number };
    readonly rows: readonly { readonly id: number }[];
    readonly updated: number;
    readonly counted: readonly { readonly c: string | number }[];
    readonly deleted: number;
  }

  const runDialectCase = async (dialectCase: IDialectCase): Promise<void> => {
    const credentialId = `cred-${dialectCase.vendor}-${Date.now()}`;
    const functionName = `sqlRoundtrip${dialectCase.vendor}`;
    const fixture: IProjectExportPayload = {
      formatVersion: 1,
      project: { id: '', name: `Workflow-tier DB ${dialectCase.vendor} ${Date.now()}` },
      folders: [],
      documents: [
        {
          id: 'fn',
          type: 'function',
          name: functionName,
          folderId: null,
          pinned: false,
          root: buildFunctionNode('fn', [buildReturnNode('fn-return', '0')], { type: 'any' }),
          data: null,
        },
      ],
    };

    const projectId = await importFixture(fixture);
    try {
      const integrationsDocId = await workflowE2eGetIntegrationsDocumentId(token, projectId);
      await workflowE2eApi()
        .patch(`/projects/${projectId}/documents/${integrationsDocId}`)
        .set(workflowE2eAuth(token))
        .send({
          data: {
            instances: [
              {
                id: credentialId,
                vendor: dialectCase.vendor,
                name: `My ${dialectCase.vendor}`,
                fields: { connectionString: { dev: dialectCase.connectionString, prod: '' }, ssl: 'disable' },
              },
            ],
          },
        })
        .expect(200);

      const syncResponse = await workflowE2eApi()
        .post(`/projects/${projectId}/integrations/${credentialId}/sync-schema`)
        .set(workflowE2eAuth(token));
      expect(syncResponse.status).toBe(201);

      const optionsResponse = await workflowE2eApi()
        .get(
          `/projects/${projectId}/integrations/${credentialId}/actions/${dialectCase.vendor}-select/fields/table/options`,
        )
        .set(workflowE2eAuth(token));
      expect(optionsResponse.status).toBe(200);
      const tableOption = (optionsResponse.body as { value: string; label: string }[]).find((option) =>
        option.value.endsWith('orders'),
      );
      if (!tableOption) throw new Error(`No "orders" table option found for vendor "${dialectCase.vendor}"`);
      const table = tableOption.value;

      const functionDocId = await findDocumentIdByName(projectId, functionName);
      const root = buildFunctionNode(
        'fn2',
        [
          buildSqlInsertNode('fn-insert', dialectCase.vendor, {
            credentialId,
            table,
            row: "{ status: 'new', total: 42.5, note: 'e2e' }",
            resultVariable: 'inserted',
          }),
          buildSqlSelectNode('fn-select', dialectCase.vendor, {
            credentialId,
            table,
            where: "{ status: { in: ['new'] }, total: { gt: 10 } }",
            orderBy: 'id desc',
            limit: '10',
            resultVariable: 'rows',
          }),
          buildSqlUpdateNode('fn-update', dialectCase.vendor, {
            credentialId,
            table,
            set: "{ status: 'paid' }",
            where: '{ id: (inserted as any).id }',
            resultVariable: 'updated',
          }),
          buildSqlQueryNode('fn-query', dialectCase.vendor, {
            credentialId,
            sql: dialectCase.countSql,
            params: "['paid']",
            resultVariable: 'counted',
          }),
          buildSqlDeleteNode('fn-delete', dialectCase.vendor, {
            credentialId,
            table,
            where: '{ id: (inserted as any).id }',
            resultVariable: 'deleted',
          }),
          buildReturnNode('fn-return', '{ inserted, rows, updated, counted, deleted }'),
        ],
        { type: 'any' },
      );

      await workflowE2eApi()
        .patch(`/projects/${projectId}/documents/${functionDocId}`)
        .set(workflowE2eAuth(token))
        .send({ root })
        .expect(200);

      const buildResponse = await workflowE2eApi().post(`/projects/${projectId}/build`).set(workflowE2eAuth(token));
      expect(buildResponse.status).toBe(202);
      await waitForDevRunnerStatus(projectId, true, 60_000);

      const result = (await workflowE2eStartAndAwaitResult(
        functionName,
        `workflow-dev-${projectId}`,
      )) as IRoundtripResult;

      expect(typeof result.inserted.id).toBe('number');
      expect(result.rows.some((row) => row.id === result.inserted.id)).toBe(true);
      expect(result.updated).toBe(1);
      expect(Number(result.counted[0].c)).toBeGreaterThanOrEqual(1);
      expect(result.deleted).toBe(1);

      await dialectCase.assertRowDeleted(result.inserted.id);

      await workflowE2eApi().post(`/projects/${projectId}/stop`).set(workflowE2eAuth(token)).expect(204);
      await waitForDevRunnerStatus(projectId, false, 20_000);
    } finally {
      await workflowE2eApi().delete(`/projects/${projectId}`).set(workflowE2eAuth(token));
    }
  };

  it(
    'postgres: insert -> select -> update -> query -> delete round-trips through a real runner pod',
    async () => {
      await runDialectCase({
        vendor: postgresIntegration.vendor,
        connectionString: `postgres://falang:falang@${WORKFLOW_E2E_RUNNER_DB_HOST}:5435/userdb`,
        countSql: 'SELECT count(*) AS c FROM orders WHERE status = $1',
        assertRowDeleted: async (id) => {
          const client = new PgClient({ connectionString: WORKFLOW_E2E_POSTGRES_USER_DB_URL });
          await client.connect();
          try {
            const rowsResult = await client.query('SELECT id FROM orders WHERE id = $1', [id]);
            expect(rowsResult.rows).toHaveLength(0);
          } finally {
            await client.end();
          }
        },
      });
    },
    150_000,
  );

  it(
    'mysql: insert -> select -> update -> query -> delete round-trips through a real runner pod',
    async () => {
      await runDialectCase({
        vendor: mysqlIntegration.vendor,
        connectionString: `mysql://falang:falang@${WORKFLOW_E2E_RUNNER_DB_HOST}:3308/userdb`,
        countSql: 'SELECT count(*) AS c FROM orders WHERE status = ?',
        assertRowDeleted: async (id) => {
          const connection = await createConnection(WORKFLOW_E2E_MYSQL_USER_DB_URL);
          try {
            const [rows] = await connection.query('SELECT id FROM orders WHERE id = ?', [id]);
            expect(rows as unknown[]).toHaveLength(0);
          } finally {
            await connection.end();
          }
        },
      });
    },
    150_000,
  );

  // A blank `where` on *-update/*-delete is rejected before it can "update everything" —
  // `build-sql-integration.ts`'s field-level `validate` (`requireNonBlankWhere`) at edit time, and
  // `query-builder.ts`'s `buildUpdate`/`buildDelete` throwing the same rule again as a hard runtime
  // backstop (ADR 0039 (private) §6). Asserting this here would need a whole separate
  // unbuilt-or-failed-run poll this file doesn't otherwise need — left as a todo.
  it.todo('*-update/*-delete with a blank where is rejected rather than "update everything"');
});
