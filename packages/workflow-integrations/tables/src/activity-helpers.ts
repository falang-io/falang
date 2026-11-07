// oxlint-disable no-undefined -- optional values are modelled with `undefined` throughout (absent filter/field).
import type {
  ITableInternalAffectedResponse,
  ITableInternalInsertResponse,
  ITableInternalSelectResponse,
  ITableRecord,
  TTableInternalOp,
} from '@falang/workflow-dto';
import {
  TablesRequestError,
  dataToIds,
  nameOfFieldId,
  orderByToIds,
  recordToRow,
  whereToIds,
  type TTableFieldMap,
} from './translate.js';

/**
 * Real, exported functions (not a `sharedActivityCode` string) called by the tables actions' generated activities
 * (`actions.ts`) — same shape as `@falang/workflow-integrations-files`'s `activity-helpers.ts`. The module is part
 * of the browser bundle: no `node:*` import, no `process.env` at module scope (every read is inside a function body).
 *
 * Every function takes the BAKED name -> id map (`__falangTableFields[tableId]`), talks to
 * `POST /internal/projects/:projectId/tables/:tableId/<op>` in field ids and hands names back to the workflow.
 */

export interface ITablesActivityContext {
  readonly runId?: string;
  readonly workflowId?: string;
  readonly activityId?: string;
}

const NON_RETRYABLE_STATUSES: ReadonlySet<number> = new Set([400, 404, 409, 413]);

/** `true` for a failure that must not be retried (a bad request, a removed field, a missing record, a limit). */
export const isTablesNonRetryable = (error: unknown): boolean =>
  error instanceof TablesRequestError && error.nonRetryable;

const errorBody = async (response: Response): Promise<{ code?: string; message?: string; field?: string }> => {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed === 'object' && parsed !== null) return parsed as { code?: string; message?: string };
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return { message: text };
};

const internalTablesRequest = async (
  tableId: string,
  op: TTableInternalOp,
  body: unknown,
  fields: TTableFieldMap,
): Promise<Response> => {
  const backendUrl = process.env.BACKEND_INTERNAL_URL;
  const internalProjectToken = process.env.INTERNAL_PROJECT_TOKEN;
  const projectId = process.env.PROJECT_ID;
  if (!backendUrl || !internalProjectToken || !projectId) {
    throw new Error(
      'BACKEND_INTERNAL_URL/INTERNAL_PROJECT_TOKEN/PROJECT_ID are not configured for this runner process',
    );
  }
  const response = await fetch(
    `${backendUrl}/internal/projects/${encodeURIComponent(projectId)}/tables/${encodeURIComponent(tableId)}/${op}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-project-token': internalProjectToken },
      body: JSON.stringify(body),
    },
  );
  if (response.ok) return response;
  const parsed = await errorBody(response);
  if (parsed.code === 'unknown_field' || parsed.code === 'field_removed') {
    const name = parsed.field ? nameOfFieldId(parsed.field, fields) : 'unknown';
    throw new TablesRequestError(`field "${name}" no longer exists`, { code: parsed.code });
  }
  const message = `table ${op}: ${parsed.message ?? `HTTP ${response.status}`}`;
  throw new TablesRequestError(message, {
    nonRetryable: NON_RETRYABLE_STATUSES.has(response.status),
    code: parsed.code,
  });
};

const workflowEnv = (): 'dev' | 'prod' => (process.env.WORKFLOW_ENV === 'prod' ? 'prod' : 'dev');

const parseOptionalInt = (value: string | number | undefined, label: string): number | undefined => {
  if (value === undefined || value === '') return;
  const parsed = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new TablesRequestError(`${label} must be a non-negative integer`);
  }
  return parsed;
};

export interface ITablesSelectParams {
  readonly where?: unknown;
  /** `"name asc, createdAt desc"`. */
  readonly orderBy?: string;
  readonly limit?: string | number;
  readonly offset?: string | number;
}

export const tablesSelectRecords = async (
  tableId: string,
  fields: TTableFieldMap,
  params: ITablesSelectParams = {},
): Promise<Record<string, unknown>[]> => {
  const where = whereToIds(params.where, fields);
  const orderBy = orderByToIds(params.orderBy, fields);
  const limit = parseOptionalInt(params.limit, 'limit');
  const offset = parseOptionalInt(params.offset, 'offset');
  const response = await internalTablesRequest(
    tableId,
    'select',
    { env: workflowEnv(), where, orderBy, limit, offset },
    fields,
  );
  const result = (await response.json()) as ITableInternalSelectResponse;
  return result.records.map((record) => recordToRow(record, fields));
};

export const tablesGetRecord = async (
  tableId: string,
  fields: TTableFieldMap,
  id: string,
): Promise<Record<string, unknown>> => {
  const response = await internalTablesRequest(tableId, 'get', { env: workflowEnv(), id }, fields);
  return recordToRow((await response.json()) as ITableRecord, fields);
};

export const tablesInsertRecord = async (
  tableId: string,
  fields: TTableFieldMap,
  row: unknown,
  context: ITablesActivityContext,
): Promise<Record<string, unknown>> => {
  const data = dataToIds(row, fields);
  if (!context.runId || !context.activityId) {
    throw new TablesRequestError('table insert must be called from within a workflow activity', {
      nonRetryable: true,
    });
  }
  const response = await internalTablesRequest(
    tableId,
    'insert',
    { env: workflowEnv(), data, idempotencyKey: `${context.runId}:${context.activityId}`, context },
    fields,
  );
  const result = (await response.json()) as ITableInternalInsertResponse;
  return recordToRow(result.record, fields);
};

export const tablesUpdateRecords = async (
  tableId: string,
  fields: TTableFieldMap,
  set: unknown,
  where: unknown,
  context: ITablesActivityContext,
): Promise<number> => {
  const ids = whereToIds(where, fields);
  if (!ids || Object.keys(ids).length === 0) {
    throw new TablesRequestError('table update needs a non-empty where', { code: 'where_required' });
  }
  const response = await internalTablesRequest(
    tableId,
    'update',
    { env: workflowEnv(), set: dataToIds(set, fields), where: ids, context },
    fields,
  );
  return ((await response.json()) as ITableInternalAffectedResponse).affected;
};

export const tablesDeleteRecords = async (
  tableId: string,
  fields: TTableFieldMap,
  where: unknown,
  context: ITablesActivityContext,
): Promise<number> => {
  const ids = whereToIds(where, fields);
  if (!ids || Object.keys(ids).length === 0) {
    throw new TablesRequestError('table delete needs a non-empty where', { code: 'where_required' });
  }
  const response = await internalTablesRequest(tableId, 'delete', { env: workflowEnv(), where: ids, context }, fields);
  return ((await response.json()) as ITableInternalAffectedResponse).affected;
};
