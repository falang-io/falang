// oxlint-disable no-await-in-loop, no-undefined, max-lines -- per-row writes run sequentially inside one transaction; optional values.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import {
  normalizeFieldValue,
  normalizeRecordData,
  normalizeTableDocumentData,
  recordDataByteLength,
  summarizeTable,
  TABLE_DOCUMENT_TYPE,
  TABLE_RECORDS_DEFAULT_LIMIT,
  TABLE_RECORDS_MAX_LIMIT,
  TABLE_INTERNAL_SELECT_DEFAULT_LIMIT,
  TABLE_INTERNAL_SELECT_MAX_LIMIT,
  type ITableChangeEntry,
  type ITableField,
  type ITableOrderBy,
  type ITableRecord,
  type ITableRecordsQuery,
  type ITableRecordsResponse,
  type ITableSummary,
  type TTableEnv,
  type TTableSource,
} from '@falang/workflow-dto';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import { UserLimitsService } from '../admin/user-limits/user-limits.service.js';
import type { IUserLimits } from '../admin/user-limits/user-limits.types.js';
import { Document } from '../projects/documents/document.entity.js';
import { ProjectsService } from '../projects/projects/projects.service.js';
import { tableRequestsTotal } from '../metrics/metrics.js';
import { TablesError } from './table-errors.js';
import { TableDefinitionsService, type ITableDefinition } from './table-definitions.service.js';
import { compileTableOrderBy, compileTableSearch, compileTableWhere } from './table-where.js';
import {
  changedKeys,
  countRecords,
  insertChanges,
  insertRecords,
  ISO_FORMAT,
  jsonEqual,
  mapRecord,
  query,
  RECORD_COLUMNS,
  type IChangeRow,
  type IRecordRow,
} from './table-sql.js';

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
/** Most records one `update`/`delete` with a `where` may touch. */
const MAX_WRITE_BATCH = 10_000;

export interface IWriteMeta {
  readonly source: TTableSource;
  readonly runId?: string | null;
  readonly workflowId?: string | null;
}

export interface ITableContext {
  readonly projectId: string;
  readonly tableId: string;
  readonly env: TTableEnv;
  readonly definition: ITableDefinition;
  readonly fields: readonly ITableField[];
  readonly limits: IUserLimits;
}

type TRecordData = Record<string, unknown>;

/**
 * All record reads/writes of project tables (ADR 0075 (private)). Every write and its `table_record_changes` rows are
 * one transaction; `version` goes +1 per real change and a write that changes nothing is skipped entirely (no version,
 * no change row). Postgres only (jsonb).
 */
@Injectable()
export class TablesService {
  private readonly ds: DataSource;
  private readonly definitions: TableDefinitionsService;
  private readonly userLimits: UserLimitsService;
  private readonly projects: ProjectsService;
  private readonly documents: Repository<Document>;

  constructor(
    @InjectDataSource() ds: DataSource,
    @Inject(TableDefinitionsService) definitions: TableDefinitionsService,
    @Inject(UserLimitsService) userLimits: UserLimitsService,
    @Inject(ProjectsService) projects: ProjectsService,
    @InjectRepository(Document) documents: Repository<Document>,
  ) {
    this.ds = ds;
    this.definitions = definitions;
    this.userLimits = userLimits;
    this.projects = projects;
    this.documents = documents;
  }

  get manager(): EntityManager {
    return this.ds.manager;
  }

  transaction<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.ds.transaction(work);
  }

  /** Counts the request in `falang_table_requests_total{op,result}`; `result` is `ok` or the error code. */
  async track<T>(op: string, work: () => Promise<T>): Promise<T> {
    try {
      const value = await work();
      tableRequestsTotal.inc({ op, result: 'ok' });
      return value;
    } catch (error) {
      tableRequestsTotal.inc({ op, result: error instanceof TablesError ? error.code : 'error' });
      throw error;
    }
  }

  async resolveContext(projectId: string, tableId: string, env: TTableEnv): Promise<ITableContext> {
    if (!UUID_RE.test(tableId)) throw new NotFoundException(`Table "${tableId}" not found`);
    const definition = await this.definitions.get(projectId, tableId);
    const ownerId = await this.projects.getOwnerId(projectId);
    const limits = await this.userLimits.getLimits(ownerId);
    return { projectId, tableId, env, definition, fields: definition.data.fields, limits };
  }

  invalidateDefinition(tableId: string): void {
    this.definitions.invalidate(tableId);
  }

  async listTables(projectId: string): Promise<ITableSummary[]> {
    const rows = await this.documents.find({ where: { projectId, type: TABLE_DOCUMENT_TYPE } });
    return rows
      .toSorted((a, b) => a.name.localeCompare(b.name))
      .map((row) => {
        const normalized = normalizeTableDocumentData(null, row.data);
        return summarizeTable(row.id, row.name, normalized.ok ? normalized.data : { fields: [], nextFieldNo: 1 });
      });
  }

  assertSize(ctx: ITableContext, data: TRecordData): void {
    if (recordDataByteLength(data) > ctx.limits.maxTableRecordBytes) {
      throw new TablesError(
        'table_record_too_large',
        `A record can be at most ${ctx.limits.maxTableRecordBytes} bytes of JSON`,
      );
    }
  }

  /** 409 when `adding` more records would pass the per-table per-env cap. */
  async assertRoom(em: EntityManager, ctx: ITableContext, adding: number, existing?: number): Promise<void> {
    const current = existing ?? (await countRecords(em, ctx.tableId, ctx.env));
    if (current + adding > ctx.limits.maxTableRecords) {
      throw new TablesError(
        'table_record_limit',
        `A table can hold at most ${ctx.limits.maxTableRecords} records per environment`,
      );
    }
  }

  private normalizeWrite(ctx: ITableContext, input: TRecordData, mode: 'insert' | 'patch') {
    const result = normalizeRecordData(ctx.fields, input, mode);
    if (!result.ok) throw new TablesError(result.code, result.message, result.field);
    return result;
  }

  // ── reads ──────────────────────────────────────────────────────────────────────────────────

  async list(projectId: string, tableId: string, q: ITableRecordsQuery): Promise<ITableRecordsResponse> {
    const env = q.env ?? 'dev';
    const ctx = await this.resolveContext(projectId, tableId, env);
    const limit = Math.min(Math.max(Math.trunc(q.limit ?? TABLE_RECORDS_DEFAULT_LIMIT), 1), TABLE_RECORDS_MAX_LIMIT);
    const offset = Math.max(Math.trunc(q.offset ?? 0), 0);
    const params: unknown[] = [tableId, env];
    const conditions = ['r.table_id = $1', 'r.env = $2'];
    if (q.search) conditions.push(compileTableSearch(q.search, ctx.fields, params));
    const order = compileTableOrderBy(q.sortField ? [{ field: q.sortField, dir: q.sortDir ?? 'asc' }] : [], ctx.fields);
    const where = conditions.join(' AND ');
    const total = await query<{ n: number | string }>(
      this.manager,
      `SELECT count(*)::int AS n FROM table_records r WHERE ${where}`,
      params,
    );
    const rows = await query<IRecordRow>(
      this.manager,
      `SELECT ${RECORD_COLUMNS} FROM table_records r WHERE ${where} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return { records: rows.map((row) => mapRecord(row)), total: Number(total[0]?.n ?? 0) };
  }

  async getRecord(projectId: string, tableId: string, env: TTableEnv, id: string): Promise<ITableRecord> {
    await this.resolveContext(projectId, tableId, env);
    const row = await this.findRecord(this.manager, tableId, env, id, false);
    if (!row) throw new TablesError('record_not_found', `Record "${id}" not found`);
    return mapRecord(row);
  }

  async select(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    options: { where?: TRecordData; orderBy?: ITableOrderBy[]; limit?: number; offset?: number },
  ): Promise<ITableRecord[]> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    const params: unknown[] = [tableId, env];
    const whereSql = compileTableWhere(options.where, ctx.fields, params);
    const order = compileTableOrderBy(options.orderBy, ctx.fields);
    const limit = Math.min(
      Math.max(Math.trunc(options.limit ?? TABLE_INTERNAL_SELECT_DEFAULT_LIMIT), 1),
      TABLE_INTERNAL_SELECT_MAX_LIMIT,
    );
    const offset = Math.max(Math.trunc(options.offset ?? 0), 0);
    const rows = await query<IRecordRow>(
      this.manager,
      `SELECT ${RECORD_COLUMNS} FROM table_records r WHERE r.table_id = $1 AND r.env = $2${whereSql ? ` AND (${whereSql})` : ''} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return rows.map((row) => mapRecord(row));
  }

  private async findRecord(
    em: EntityManager,
    tableId: string,
    env: TTableEnv,
    id: string,
    lock: boolean,
  ): Promise<IRecordRow | null> {
    if (!UUID_RE.test(id)) return null;
    const rows = await query<IRecordRow>(
      em,
      `SELECT ${RECORD_COLUMNS} FROM table_records r WHERE r.id = $1 AND r.table_id = $2 AND r.env = $3${lock ? ' FOR UPDATE' : ''}`,
      [id, tableId, env],
    );
    return rows[0] ?? null;
  }

  // ── writes ─────────────────────────────────────────────────────────────────────────────────

  private change(
    ctx: ITableContext,
    meta: IWriteMeta,
    recordId: string,
    op: IChangeRow['op'],
    before: TRecordData | null,
    after: TRecordData | null,
  ): IChangeRow {
    let changedFields: string[] | null = null;
    if (op === 'updated') changedFields = changedKeys(before ?? {}, after ?? {});
    else if (op === 'created') changedFields = Object.keys(after ?? {}).toSorted();
    else changedFields = Object.keys(before ?? {}).toSorted();
    return {
      projectId: ctx.projectId,
      tableId: ctx.tableId,
      env: ctx.env,
      recordId,
      op,
      before,
      after,
      changedFields,
      source: meta.source,
      runId: meta.runId ?? null,
      workflowId: meta.workflowId ?? null,
    };
  }

  /** Inserts a record; with an `idempotencyKey` a repeat returns the existing record and writes nothing. */
  async insert(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    data: TRecordData,
    meta: IWriteMeta,
    idempotencyKey?: string,
  ): Promise<{ record: ITableRecord; created: boolean }> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    const normalized = this.normalizeWrite(ctx, data, 'insert');
    this.assertSize(ctx, normalized.data);
    return this.transaction(async (em) => {
      if (idempotencyKey) {
        const existing = await this.findByKey(em, tableId, env, idempotencyKey);
        if (existing) return { record: mapRecord(existing), created: false };
      }
      await this.assertRoom(em, ctx, 1);
      const id = randomUUID();
      const now = new Date().toISOString();
      const inserted = await query<IRecordRow>(
        em,
        `INSERT INTO table_records AS r (id, project_id, table_id, env, data, version, idempotency_key, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, 1, $6, $7::timestamp, $7::timestamp) ${
          idempotencyKey
            ? 'ON CONFLICT (table_id, env, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING '
            : ''
        }RETURNING ${RECORD_COLUMNS}`,
        [id, projectId, tableId, env, JSON.stringify(normalized.data), idempotencyKey ?? null, now],
      );
      if (inserted.length === 0 && idempotencyKey) {
        // Lost a race with a concurrent retry of the same activity.
        const existing = await this.findByKey(em, tableId, env, idempotencyKey);
        if (existing) return { record: mapRecord(existing), created: false };
      }
      const record = mapRecord(inserted[0]);
      await insertChanges(em, [this.change(ctx, meta, id, 'created', null, record.data)], now);
      return { record, created: true };
    });
  }

  private async findByKey(em: EntityManager, tableId: string, env: TTableEnv, key: string): Promise<IRecordRow | null> {
    const rows = await query<IRecordRow>(
      em,
      `SELECT ${RECORD_COLUMNS} FROM table_records r WHERE r.table_id = $1 AND r.env = $2 AND r.idempotency_key = $3`,
      [tableId, env, key],
    );
    return rows[0] ?? null;
  }

  /** Replaces a locked row's data; returns the new record, or `null` (and writes nothing) when the data is unchanged. */
  private async writeData(
    em: EntityManager,
    ctx: ITableContext,
    row: IRecordRow,
    next: TRecordData,
    meta: IWriteMeta,
    now: string,
    changes: IChangeRow[],
  ): Promise<ITableRecord | null> {
    const current = mapRecord(row);
    if (jsonEqual(current.data, next)) return null;
    this.assertSize(ctx, next);
    const updated = await query<{ version: number | string; updated_at: string }>(
      em,
      `UPDATE table_records SET data = $1::jsonb, version = version + 1, updated_at = $2::timestamp WHERE id = $3 RETURNING version, to_char(updated_at, ${ISO_FORMAT}) AS updated_at`,
      [JSON.stringify(next), now, current.id],
    );
    changes.push(this.change(ctx, meta, current.id, 'updated', current.data, next));
    return { ...current, data: next, version: Number(updated[0].version), updatedAt: updated[0].updated_at };
  }

  private mergePatch(old: TRecordData, patch: { data: TRecordData; unset: string[] }): TRecordData {
    const unset = new Set(patch.unset);
    return Object.fromEntries(Object.entries({ ...old, ...patch.data }).filter(([key]) => !unset.has(key)));
  }

  async patchRecord(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    id: string,
    data: TRecordData,
    expectedVersion: number | undefined,
    meta: IWriteMeta,
  ): Promise<ITableRecord> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    const patch = this.normalizeWrite(ctx, data, 'patch');
    return this.transaction(async (em) => {
      const row = await this.findRecord(em, tableId, env, id, true);
      if (!row) throw new TablesError('record_not_found', `Record "${id}" not found`);
      if (expectedVersion !== undefined && Number(row.version) !== expectedVersion) {
        throw new TablesError(
          'version_conflict',
          `Record "${id}" was changed by someone else (version ${Number(row.version)}, expected ${expectedVersion})`,
        );
      }
      const changes: IChangeRow[] = [];
      const now = new Date().toISOString();
      const next = this.mergePatch(mapRecord(row).data, patch);
      const written = await this.writeData(em, ctx, row, next, meta, now, changes);
      await insertChanges(em, changes, now);
      return written ?? mapRecord(row);
    });
  }

  /** Internal `update`: patches every record matching `where` (required). Returns the number of MATCHED records. */
  async updateWhere(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    set: TRecordData,
    where: TRecordData | undefined,
    meta: IWriteMeta,
  ): Promise<number> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    if (!set || Object.keys(set).length === 0) throw new TablesError('validation', '"set" must not be empty');
    const patch = this.normalizeWrite(ctx, set, 'patch');
    const params: unknown[] = [tableId, env];
    const whereSql = compileTableWhere(where, ctx.fields, params);
    if (!whereSql) throw new TablesError('where_required', 'A non-empty "where" is required');
    return this.transaction(async (em) => {
      const rows = await query<IRecordRow>(
        em,
        `SELECT ${RECORD_COLUMNS} FROM table_records r WHERE r.table_id = $1 AND r.env = $2 AND (${whereSql}) ORDER BY r.created_at, r.id LIMIT ${MAX_WRITE_BATCH} FOR UPDATE`,
        params,
      );
      const changes: IChangeRow[] = [];
      const now = new Date().toISOString();
      for (const row of rows) {
        await this.writeData(em, ctx, row, this.mergePatch(mapRecord(row).data, patch), meta, now, changes);
      }
      await insertChanges(em, changes, now);
      return rows.length;
    });
  }

  async deleteRecord(projectId: string, tableId: string, env: TTableEnv, id: string, meta: IWriteMeta): Promise<void> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    await this.transaction(async (em) => {
      const row = await this.findRecord(em, tableId, env, id, true);
      if (!row) throw new TablesError('record_not_found', `Record "${id}" not found`);
      await em.query('DELETE FROM table_records WHERE id = $1', [id]);
      await insertChanges(
        em,
        [this.change(ctx, meta, id, 'deleted', mapRecord(row).data, null)],
        new Date().toISOString(),
      );
    });
  }

  /** Internal `delete`: removes every record matching `where` (required). Returns the number deleted. */
  async deleteWhere(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    where: TRecordData | undefined,
    meta: IWriteMeta,
  ): Promise<number> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    const params: unknown[] = [tableId, env];
    const whereSql = compileTableWhere(where, ctx.fields, params);
    if (!whereSql) throw new TablesError('where_required', 'A non-empty "where" is required');
    return this.transaction(async (em) => {
      const rows = await query<{ id: string; data: TRecordData | string }>(
        em,
        `DELETE FROM table_records AS r WHERE r.id IN (SELECT r.id FROM table_records r WHERE r.table_id = $1 AND r.env = $2 AND (${whereSql}) ORDER BY r.created_at, r.id LIMIT ${MAX_WRITE_BATCH}) RETURNING r.id, r.data`,
        params,
      );
      await insertChanges(
        em,
        rows.map((row) =>
          this.change(
            ctx,
            meta,
            row.id,
            'deleted',
            mapRecord({ ...row, version: 0, created_at: '', updated_at: '' }).data,
            null,
          ),
        ),
        new Date().toISOString(),
      );
      return rows.length;
    });
  }

  /** Deletes every record of the env inside `em`, writing one `deleted` change row each. Returns the count. */
  async deleteAllIn(em: EntityManager, ctx: ITableContext, meta: IWriteMeta, now: string): Promise<number> {
    const rows = await query<{ id: string; data: TRecordData | string }>(
      em,
      'DELETE FROM table_records WHERE table_id = $1 AND env = $2 RETURNING id, data',
      [ctx.tableId, ctx.env],
    );
    await insertChanges(
      em,
      rows.map((row) =>
        this.change(
          ctx,
          meta,
          row.id,
          'deleted',
          mapRecord({ ...row, version: 0, created_at: '', updated_at: '' }).data,
          null,
        ),
      ),
      now,
    );
    return rows.length;
  }

  async clear(projectId: string, tableId: string, env: TTableEnv): Promise<number> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    return this.transaction((em) => this.deleteAllIn(em, ctx, { source: 'clear' }, new Date().toISOString()));
  }

  /** Replaces prod's records with copies of dev's (new ids) in one transaction. */
  async copyToProd(projectId: string, tableId: string): Promise<number> {
    await this.resolveContext(projectId, tableId, 'dev');
    const prod = await this.resolveContext(projectId, tableId, 'prod');
    return this.transaction(async (em) => {
      const rows = await query<IRecordRow>(
        em,
        `SELECT ${RECORD_COLUMNS} FROM table_records r WHERE r.table_id = $1 AND r.env = 'dev' ORDER BY r.created_at, r.id`,
        [tableId],
      );
      await this.assertRoom(em, prod, rows.length, 0);
      const now = new Date().toISOString();
      await this.deleteAllIn(em, prod, { source: 'copy' }, now);
      const copies = rows.map((row) => ({ id: randomUUID(), data: mapRecord(row).data }));
      await insertRecords(em, { projectId, tableId, env: 'prod' }, copies, now);
      await insertChanges(
        em,
        copies.map((copy) => this.change(prod, { source: 'copy' }, copy.id, 'created', null, copy.data)),
        now,
      );
      return copies.length;
    });
  }

  // ── history ────────────────────────────────────────────────────────────────────────────────

  async history(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    recordId: string,
    limit: number,
  ): Promise<ITableChangeEntry[]> {
    await this.resolveContext(projectId, tableId, env);
    if (!UUID_RE.test(recordId)) return [];
    const rows = await query<{
      id: number | string;
      op: ITableChangeEntry['op'];
      before: TRecordData | null;
      after: TRecordData | null;
      changed_fields: string[] | null;
      source: TTableSource;
      run_id: string | null;
      created_at: string;
    }>(
      this.manager,
      `SELECT id, op, before, after, changed_fields, source, run_id, to_char(created_at, ${ISO_FORMAT}) AS created_at FROM table_record_changes WHERE table_id = $1 AND env = $2 AND record_id = $3 ORDER BY id DESC LIMIT ${Math.min(Math.max(Math.trunc(limit), 1), 100)}`,
      [tableId, env, recordId],
    );
    return rows.map((row) => ({
      id: Number(row.id),
      op: row.op,
      before: row.before,
      after: row.after,
      changedFields: row.changed_fields,
      source: row.source,
      runId: row.run_id,
      createdAt: row.created_at,
    }));
  }

  /** An ordinary update (or re-insert under the same id for a deleted record) to the data of one history entry. */
  async restore(
    projectId: string,
    tableId: string,
    env: TTableEnv,
    recordId: string,
    changeId: number,
  ): Promise<ITableRecord> {
    const ctx = await this.resolveContext(projectId, tableId, env);
    if (!UUID_RE.test(recordId)) throw new TablesError('record_not_found', `Record "${recordId}" not found`);
    const meta: IWriteMeta = { source: 'grid' };
    return this.transaction(async (em) => {
      const found = await query<{ op: string; before: TRecordData | null; after: TRecordData | null }>(
        em,
        'SELECT op, before, after FROM table_record_changes WHERE id = $1 AND table_id = $2 AND env = $3 AND record_id = $4',
        [changeId, tableId, env, recordId],
      );
      if (found.length === 0) throw new TablesError('record_not_found', `Change ${changeId} not found`);
      const snapshot = (found[0].op === 'deleted' ? found[0].before : found[0].after) ?? {};
      const data = this.fitToFields(ctx, snapshot);
      const now = new Date().toISOString();
      const row = await this.findRecord(em, tableId, env, recordId, true);
      if (row) {
        const changes: IChangeRow[] = [];
        const written = await this.writeData(em, ctx, row, data, meta, now, changes);
        await insertChanges(em, changes, now);
        return written ?? mapRecord(row);
      }
      this.assertSize(ctx, data);
      await this.assertRoom(em, ctx, 1);
      const inserted = await query<IRecordRow>(
        em,
        `INSERT INTO table_records AS r (id, project_id, table_id, env, data, version, created_at, updated_at) VALUES ($1, $2, $3, $4, $5::jsonb, 1, $6::timestamp, $6::timestamp) RETURNING ${RECORD_COLUMNS}`,
        [recordId, projectId, tableId, env, JSON.stringify(data), now],
      );
      await insertChanges(em, [this.change(ctx, meta, recordId, 'created', null, data)], now);
      return mapRecord(inserted[0]);
    });
  }

  /** Keeps only the keys of fields that still exist and values that still validate (a retyped field drops its old cells). */
  private fitToFields(ctx: ITableContext, snapshot: TRecordData): TRecordData {
    const out: TRecordData = {};
    for (const field of ctx.fields) {
      if (!(field.id in snapshot)) continue;
      const result = normalizeFieldValue(field, snapshot[field.id]);
      if (result.ok && result.value !== null) out[field.id] = result.value;
    }
    return out;
  }

  async countAll(): Promise<{ env: string; n: number }[]> {
    const rows = await query<{ env: string; n: number | string }>(
      this.manager,
      'SELECT env, count(*)::int AS n FROM table_records GROUP BY env',
      [],
    );
    return rows.map((row) => ({ env: row.env, n: Number(row.n) }));
  }
}
