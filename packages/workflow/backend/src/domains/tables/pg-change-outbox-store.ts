import { TABLE_DISPATCHABLE_SOURCES, type TTableDispatchStatus } from '@falang/workflow-dto';
import type { DataSource } from 'typeorm';
import { CLAIM_LEASE_MS, CLAIMED_STATUS, type IChangeOutboxStore, type IChangeRow } from './table-change-dispatch.js';

const toDate = (value: unknown): Date => (value instanceof Date ? value : new Date(`${String(value)}Z`));
const toJson = <T>(value: unknown): T | null => {
  if (value === null) return null;
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
};

interface IRawChange {
  id: number;
  project_id: string;
  table_id: string;
  env: string;
  record_id: string;
  op: string;
  before: unknown;
  after: unknown;
  changed_fields: unknown;
  source: string;
  created_at: unknown;
  record_version: number | null;
  record_created_at: unknown;
}

const mapRow = (row: IRawChange): IChangeRow => ({
  id: Number(row.id),
  projectId: row.project_id,
  tableId: row.table_id,
  env: row.env as IChangeRow['env'],
  recordId: row.record_id,
  op: row.op as IChangeRow['op'],
  before: toJson<Record<string, unknown>>(row.before),
  after: toJson<Record<string, unknown>>(row.after),
  changedFields: toJson<string[]>(row.changed_fields),
  source: row.source,
  createdAt: toDate(row.created_at),
  recordVersion: row.record_version === null ? null : Number(row.record_version),
  recordCreatedAt: (row.record_created_at ?? null) === null ? null : toDate(row.record_created_at),
});

const COLUMNS = `"id","project_id","table_id","env","record_id","op","before","after","changed_fields","source","created_at","record_version","record_created_at"`;

/** Postgres implementation of the outbox (the dispatcher only runs against Postgres/PGlite). */
export class PgChangeOutboxStore implements IChangeOutboxStore {
  private readonly dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  claim(limit: number, now: Date, reclaimStale: boolean): Promise<IChangeRow[]> {
    const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
    return this.dataSource.transaction(async (manager) => {
      // The partial index covers the plain "dispatched_at IS NULL" form; the stale-claim form is a separate, rarer query.
      const pending = reclaimStale
        ? `("dispatched_at" IS NULL OR ("dispatch_status" = '${CLAIMED_STATUS}' AND "dispatched_at" < $3))`
        : `"dispatched_at" IS NULL`;
      const params: unknown[] = [[...TABLE_DISPATCHABLE_SOURCES], limit];
      if (reclaimStale) params.push(staleBefore);
      const rows = (await manager.query(
        `SELECT ${COLUMNS} FROM "table_record_changes"
         WHERE ${pending} AND "source" = ANY($1)
         ORDER BY "id" LIMIT $2 FOR UPDATE SKIP LOCKED`,
        params,
      )) as IRawChange[];
      if (rows.length > 0) {
        await manager.query(
          `UPDATE "table_record_changes" SET "dispatched_at" = $1, "dispatch_status" = '${CLAIMED_STATUS}' WHERE "id" = ANY($2)`,
          [now, rows.map((row) => Number(row.id))],
        );
      }
      return rows.map((row) => mapRow(row));
    });
  }

  async countDelivered(tableId: string, env: 'dev' | 'prod', since: Date): Promise<number> {
    const rows = (await this.dataSource.query(
      `SELECT count(*) AS "count" FROM "table_record_changes"
       WHERE "table_id" = $1 AND "env" = $2 AND "dispatch_status" = 'delivered' AND "dispatched_at" > $3`,
      [tableId, env, since],
    )) as { count: string | number }[];
    return Number(rows[0]?.count ?? 0);
  }

  async recordCreatedAt(recordIds: readonly string[]): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (recordIds.length === 0) return result;
    const rows = (await this.dataSource.query(`SELECT "id","created_at" FROM "table_records" WHERE "id" = ANY($1)`, [
      [...recordIds],
    ])) as { id: string; created_at: unknown }[];
    for (const row of rows) result.set(row.id, toDate(row.created_at));
    return result;
  }

  async mark(changeId: number, status: TTableDispatchStatus, at: Date): Promise<void> {
    await this.dataSource.query(
      `UPDATE "table_record_changes" SET "dispatched_at" = $1, "dispatch_status" = $2 WHERE "id" = $3`,
      [at, status, changeId],
    );
  }

  async release(changeId: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE "table_record_changes" SET "dispatched_at" = NULL, "dispatch_status" = NULL WHERE "id" = $1 AND "dispatch_status" = '${CLAIMED_STATUS}'`,
      [changeId],
    );
  }
}
