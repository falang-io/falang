/**
 * Wire shapes shared by the backend, the client and the `tables` vendor (ADR 0075 (private)).
 * Record `data` is always keyed by FIELD ID (`f1`, …), never by name.
 */
import type { ITableDocumentData, ITableField } from './table-document.js';

export type TTableEnv = 'dev' | 'prod';

export type TTableSource = 'workflow' | 'grid' | 'import' | 'agent' | 'mcp' | 'copy' | 'clear';

/** Only changes with these sources fire table triggers; grid edits, CSV imports, copies and clears never do. */
export const TABLE_DISPATCHABLE_SOURCES: readonly TTableSource[] = ['workflow', 'agent', 'mcp'];

export type TTableChangeOp = 'created' | 'updated' | 'deleted';

export type TTableDispatchStatus = 'delivered' | 'throttled' | 'no_target' | 'expired' | 'error';

export interface ITableRecord {
  id: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  /** Keyed by field id. */
  data: Record<string, unknown>;
}

export interface ITableSummary {
  id: string;
  name: string;
  fields: ITableField[];
  nextFieldNo: number;
}

export const summarizeTable = (id: string, name: string, data: ITableDocumentData): ITableSummary => ({
  id,
  name,
  fields: data.fields,
  nextFieldNo: data.nextFieldNo,
});

export const TABLE_ERROR_CODES = [
  'table_record_limit',
  'table_field_limit',
  'table_limit',
  'table_record_too_large',
  'validation',
  'record_not_found',
  'where_required',
  'unknown_field',
  'required_field',
  'field_removed',
  'version_conflict',
  'operator_not_supported',
  'file_not_found',
  'invalid_type',
  'invalid_option',
  'invalid_date',
  'invalid_file',
] as const;
export type TTableErrorCode = (typeof TABLE_ERROR_CODES)[number];

/** Body of every error answer of the tables routes. */
export interface ITableErrorBody {
  statusCode: number;
  code: TTableErrorCode;
  message: string;
  field?: string;
}

// ── Trigger payload (amendment A1: id-keyed on the wire) ────────────────────────────────────────

/**
 * What the change dispatcher signals to a bound trigger-function: records keyed by FIELD ID. The
 * compiled trigger preamble turns it into the name-keyed `{ table, record, previous?, changedFields?, source }`
 * using the name -> id map baked into the workflows module (fields missing from that map are dropped).
 */
export interface ITableTriggerWirePayload {
  table: string;
  record: ITableRecord;
  previous?: ITableRecord;
  changedFieldIds?: string[];
  source: TTableSource;
}

// ── Project routes (owner scoped), under /projects/:projectId/tables ────────────────────────────

export type TTableSortDir = 'asc' | 'desc';

export interface ITableRecordsQuery {
  env?: TTableEnv;
  limit?: number;
  offset?: number;
  search?: string;
  /** A field id, or `createdAt` / `updatedAt`. */
  sortField?: string;
  sortDir?: TTableSortDir;
}

export const TABLE_RECORDS_DEFAULT_LIMIT = 50;
export const TABLE_RECORDS_MAX_LIMIT = 200;

export interface ITableRecordsResponse {
  records: ITableRecord[];
  total: number;
}

export interface ITableCreateRecordBody {
  env?: TTableEnv;
  data: Record<string, unknown>;
}

export interface ITableUpdateRecordBody {
  env?: TTableEnv;
  data: Record<string, unknown>;
  /** The grid passes it; a different current version answers 409 `version_conflict`. */
  expectedVersion?: number;
}

export interface ITableEnvBody {
  env?: TTableEnv;
}

export interface ITableClearResponse {
  deleted: number;
}

export interface ITableCopyToProdBody {
  confirm: true;
}

export interface ITableCopyToProdResponse {
  copied: number;
}

export interface ITableImportCsvQuery {
  env?: TTableEnv;
  mode?: 'append' | 'replace';
  createMissingFields?: boolean;
  dryRun?: boolean;
}

export interface ITableImportCsvResponse {
  inserted: number;
  skipped: number;
  errors: { row: number; field?: string; message: string }[];
  createdFields: ITableField[];
}

export interface ITableChangeEntry {
  id: number;
  op: TTableChangeOp;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  changedFields: string[] | null;
  source: TTableSource;
  runId: string | null;
  createdAt: string;
}

export interface ITableHistoryResponse {
  changes: ITableChangeEntry[];
}

export interface ITableRestoreBody {
  env?: TTableEnv;
  changeId: number;
}

// ── Internal API (pod -> backend), POST /internal/projects/:projectId/tables/:tableId/<op> ──────
// `where` / `set` / `data` / `orderBy.field` are keyed by FIELD IDS plus (where/orderBy only) the
// system keys `id`, `version`, `createdAt`, `updatedAt`.

export type TTableInternalOp = 'select' | 'get' | 'insert' | 'update' | 'delete';

export interface ITableInternalContext {
  runId?: string;
  workflowId?: string;
  activityId?: string;
}

export interface ITableOrderBy {
  field: string;
  dir: TTableSortDir;
}

export const TABLE_INTERNAL_SELECT_DEFAULT_LIMIT = 100;
export const TABLE_INTERNAL_SELECT_MAX_LIMIT = 1000;

export interface ITableInternalSelectRequest {
  env: TTableEnv;
  where?: Record<string, unknown>;
  orderBy?: ITableOrderBy[];
  limit?: number;
  offset?: number;
}
export interface ITableInternalSelectResponse {
  records: ITableRecord[];
}

export interface ITableInternalGetRequest {
  env: TTableEnv;
  id: string;
}
/** The answer to `get` is a bare `ITableRecord` (404 `record_not_found` when absent). */
export type TTableInternalGetResponse = ITableRecord;

export interface ITableInternalInsertRequest {
  env: TTableEnv;
  data: Record<string, unknown>;
  /** `${runId}:${activityId}` — makes a Temporal retry of the same activity a no-op. */
  idempotencyKey: string;
  context?: ITableInternalContext;
}
export interface ITableInternalInsertResponse {
  record: ITableRecord;
  /** `false` = the key already existed (a retry); nothing was written. */
  created: boolean;
}

export interface ITableInternalUpdateRequest {
  env: TTableEnv;
  set: Record<string, unknown>;
  /** Must be a non-empty object, else 400 `where_required`. */
  where: Record<string, unknown>;
  context?: ITableInternalContext;
}

export interface ITableInternalDeleteRequest {
  env: TTableEnv;
  /** Must be a non-empty object, else 400 `where_required`. */
  where: Record<string, unknown>;
  context?: ITableInternalContext;
}

export interface ITableInternalAffectedResponse {
  affected: number;
}
