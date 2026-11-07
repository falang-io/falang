import { createHmac } from 'node:crypto';
import type { INode } from '@falang/dto';
import request from 'supertest';

/**
 * `tables` vendor node builders (`@falang/workflow-integrations-tables`'s `actions.ts` is the source of the field
 * names) and a direct client of `backend`'s internal tables API — ADR 0075 (private). `row`/`set`/`where` are
 * `expression` fields (TypeScript object literals keyed by FIELD NAMES — the compiler bakes the name -> id map into the
 * activities); the `table` field is a plain document id (a `document-ref`, remapped on import).
 */
interface ITableInsertFields {
  readonly table: string;
  /** Raw expression code — e.g. `"{ Name: 'Ann', Qty: 1 }"`. */
  readonly row: string;
  readonly resultVariable: string;
}

export const buildTableInsertNode = (id: string, fields: ITableInsertFields): INode => ({
  id,
  name: 'table-insert',
  data: { table: fields.table, row: fields.row, resultVariable: fields.resultVariable },
});

interface ITableSelectFields {
  readonly table: string;
  readonly where?: string;
  readonly orderBy?: string;
  readonly limit?: string;
  readonly resultVariable: string;
}

export const buildTableSelectNode = (id: string, fields: ITableSelectFields): INode => ({
  id,
  name: 'table-select',
  data: {
    table: fields.table,
    where: fields.where ?? '',
    orderBy: fields.orderBy ?? '',
    limit: fields.limit ?? '100',
    offset: '0',
    resultVariable: fields.resultVariable,
  },
});

interface ITableUpdateFields {
  readonly table: string;
  readonly set: string;
  readonly where: string;
  readonly resultVariable: string;
}

export const buildTableUpdateNode = (id: string, fields: ITableUpdateFields): INode => ({
  id,
  name: 'table-update',
  data: { table: fields.table, set: fields.set, where: fields.where, resultVariable: fields.resultVariable },
});

interface ITableDeleteFields {
  readonly table: string;
  readonly where: string;
  readonly resultVariable: string;
}

export const buildTableDeleteNode = (id: string, fields: ITableDeleteFields): INode => ({
  id,
  name: 'table-delete',
  data: { table: fields.table, where: fields.where, resultVariable: fields.resultVariable },
});

/**
 * The internal API (`INTERNAL_PORT`) as the e2e compose stack publishes it on the docker-bridge gateway, and the
 * project token derived exactly like `ProjectTokenService` does (`PROJECT_TOKEN_SECRET` is the compose file's value).
 */
export const WORKFLOW_E2E_INTERNAL_URL =
  process.env.BACKEND_INTERNAL_URL ?? `http://${process.env.KIND_GATEWAY_IP ?? '172.18.0.1'}:4011`;

const PROJECT_TOKEN_SECRET = process.env.PROJECT_TOKEN_SECRET ?? 'e2e-project-token-secret-at-least-32-chars';

export const workflowE2eProjectToken = (projectId: string): string =>
  createHmac('sha256', PROJECT_TOKEN_SECRET).update(projectId).digest('hex');

/** POSTs to `/internal/projects/:projectId/tables/:tableId/:op` with the project token. */
export const workflowE2eTablesInternal = (
  projectId: string,
  tableId: string,
  op: string,
  body: Record<string, unknown>,
): request.Test =>
  request(WORKFLOW_E2E_INTERNAL_URL)
    .post(`/internal/projects/${projectId}/tables/${tableId}/${op}`)
    .set('x-internal-project-token', workflowE2eProjectToken(projectId))
    .send(body);
