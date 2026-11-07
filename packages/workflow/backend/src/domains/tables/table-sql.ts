// oxlint-disable no-await-in-loop -- batches run sequentially inside one transaction.
import type { ITableRecord, TTableChangeOp, TTableEnv, TTableSource } from '@falang/workflow-dto';
import type { EntityManager } from 'typeorm';

/** Low-level SQL helpers shared by the tables services (Postgres only; the records table is aliased `r`). */

export const ISO_FORMAT = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

/** Select list producing exactly what `mapRecord` reads. Timestamps are stored as UTC wall time (`$n::timestamp` from an ISO string). */
export const RECORD_COLUMNS = `r.id, r.version, r.data, to_char(r.created_at, ${ISO_FORMAT}) AS created_at, to_char(r.updated_at, ${ISO_FORMAT}) AS updated_at`;

export interface IRecordRow {
  id: string;
  version: number | string;
  data: Record<string, unknown> | string;
  created_at: string;
  updated_at: string;
}

const parseData = (data: IRecordRow['data']): Record<string, unknown> =>
  typeof data === 'string' ? (JSON.parse(data) as Record<string, unknown>) : data;

export const mapRecord = (row: IRecordRow): ITableRecord => ({
  id: row.id,
  version: Number(row.version),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  data: parseData(row.data),
});

/** TypeORM answers `UPDATE`/`DELETE ... RETURNING` with `[rows, count]` and everything else with the rows. */
export const rowsOf = <T>(raw: unknown): T[] => {
  if (Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[0]) && typeof raw[1] === 'number') {
    return raw[0] as T[];
  }
  return raw as T[];
};

export const query = async <T>(em: EntityManager, sql: string, params: readonly unknown[]): Promise<T[]> =>
  rowsOf<T>(await em.query(sql, [...params]));

export const countRecords = async (em: EntityManager, tableId: string, env: TTableEnv): Promise<number> => {
  const rows = await query<{ n: number | string }>(
    em,
    'SELECT count(*)::int AS n FROM table_records WHERE table_id = $1 AND env = $2',
    [tableId, env],
  );
  return Number(rows[0]?.n ?? 0);
};

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map((item) => stable(item)).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

export const jsonEqual = (a: unknown, b: unknown): boolean => stable(a) === stable(b);

/** Field ids whose value differs between two records' data (missing = different from present). */
export const changedKeys = (before: Record<string, unknown>, after: Record<string, unknown>): string[] => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !jsonEqual(before[key], after[key])).toSorted();
};

export interface IChangeRow {
  readonly projectId: string;
  readonly tableId: string;
  readonly env: TTableEnv;
  readonly recordId: string;
  readonly op: TTableChangeOp;
  readonly before: Record<string, unknown> | null;
  readonly after: Record<string, unknown> | null;
  readonly changedFields: string[] | null;
  readonly source: TTableSource;
  readonly runId: string | null;
  readonly workflowId: string | null;
  /** The record's version after the change (for `deleted`: the deleted record's version). */
  readonly recordVersion?: number | null;
  /** The record's creation time (UTC ISO). */
  readonly recordCreatedAt?: string | null;
}

const CHANGE_CHUNK = 400;

/** Appends change rows (in the caller's transaction). `createdAt` is the same UTC ISO string used for the record writes. */
export const insertChanges = async (
  em: EntityManager,
  rows: readonly IChangeRow[],
  createdAt: string,
): Promise<void> => {
  for (let start = 0; start < rows.length; start += CHANGE_CHUNK) {
    const chunk = rows.slice(start, start + CHANGE_CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((row) => {
      const base = params.length;
      params.push(
        row.projectId,
        row.tableId,
        row.env,
        row.recordId,
        row.op,
        row.before === null ? null : JSON.stringify(row.before),
        row.after === null ? null : JSON.stringify(row.after),
        row.changedFields === null ? null : JSON.stringify(row.changedFields),
        row.source,
        row.runId,
        row.workflowId,
        createdAt,
        row.recordVersion ?? null,
        row.recordCreatedAt ?? null,
      );
      const ph = (offset: number): string => `$${base + offset}`;
      return `(${ph(1)}, ${ph(2)}, ${ph(3)}, ${ph(4)}, ${ph(5)}, ${ph(6)}::jsonb, ${ph(7)}::jsonb, ${ph(8)}::jsonb, ${ph(9)}, ${ph(10)}, ${ph(11)}, ${ph(12)}::timestamp, ${ph(13)}, ${ph(14)}::timestamp)`;
    });
    await em.query(
      `INSERT INTO table_record_changes (project_id, table_id, env, record_id, op, before, after, changed_fields, source, run_id, workflow_id, created_at, record_version, record_created_at) VALUES ${tuples.join(', ')}`,
      params,
    );
  }
};

export interface IInsertRecord {
  readonly id: string;
  readonly data: Record<string, unknown>;
  readonly idempotencyKey?: string | null;
}

const RECORD_CHUNK = 500;

/** Plain multi-row insert of new records (no conflict handling) — used by import and copy. */
export const insertRecords = async (
  em: EntityManager,
  ctx: { projectId: string; tableId: string; env: TTableEnv },
  records: readonly IInsertRecord[],
  now: string,
): Promise<void> => {
  for (let start = 0; start < records.length; start += RECORD_CHUNK) {
    const chunk = records.slice(start, start + RECORD_CHUNK);
    const params: unknown[] = [ctx.projectId, ctx.tableId, ctx.env, now];
    const tuples = chunk.map((record, index) => {
      params.push(record.id, JSON.stringify(record.data), start + index);
      const at = `$4::timestamp + ($${params.length}::int * interval '1 microsecond')`;
      return `($1, $2, $3, $${params.length - 2}, $${params.length - 1}::jsonb, 1, ${at}, ${at})`;
    });
    // The per-row microsecond offset keeps the insertion order under `ORDER BY created_at, id`.
    await em.query(
      `INSERT INTO table_records (project_id, table_id, env, id, data, version, created_at, updated_at) VALUES ${tuples.join(', ')}`,
      params,
    );
  }
};
