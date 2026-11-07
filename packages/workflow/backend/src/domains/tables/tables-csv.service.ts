// oxlint-disable no-await-in-loop, no-undefined -- batches run sequentially inside one transaction.
import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  normalizeRecordData,
  normalizeTableDocumentData,
  recordDataByteLength,
  type ITableField,
  type ITableImportCsvResponse,
  type TTableEnv,
} from '@falang/workflow-dto';
import { Document } from '../projects/documents/document.entity.js';
import { CSV_BOM, csvCellToValue, formatCsvRow, parseCsv, valueToCsvCell } from './table-csv.js';
import { TablesError } from './table-errors.js';
import { insertChanges, insertRecords, mapRecord, query, RECORD_COLUMNS, type IRecordRow } from './table-sql.js';
import { TablesService, type ITableContext } from './tables.service.js';

const MAX_REPORTED_ERRORS = 100;

type TAddError = (row: number, message: string, field?: string) => void;
const EXPORT_BATCH = 1000;

export interface IImportCsvOptions {
  readonly env: TTableEnv;
  readonly mode: 'append' | 'replace';
  readonly createMissingFields: boolean;
  readonly dryRun: boolean;
}

/** CSV import/export of project tables (ADR 0075 (private)); the CSV is the data path — records are never part of project exports. */
@Injectable()
export class TablesCsvService {
  private readonly tables: TablesService;

  constructor(@Inject(TablesService) tables: TablesService) {
    this.tables = tables;
  }

  /** The whole CSV in batches: BOM + header first, then `EXPORT_BATCH` rows per chunk. */
  async *exportCsv(projectId: string, tableId: string, env: TTableEnv): AsyncGenerator<string> {
    const ctx = await this.tables.resolveContext(projectId, tableId, env);
    yield `${CSV_BOM}${formatCsvRow(ctx.fields.map((field) => field.name))}\r\n`;
    for (let offset = 0; ; offset += EXPORT_BATCH) {
      const rows = await query<IRecordRow>(
        this.tables.manager,
        `SELECT ${RECORD_COLUMNS} FROM table_records r WHERE r.table_id = $1 AND r.env = $2 ORDER BY r.created_at, r.id LIMIT ${EXPORT_BATCH} OFFSET ${offset}`,
        [tableId, env],
      );
      if (rows.length === 0) return;
      yield rows
        .map((row) => {
          const record = mapRecord(row);
          return `${formatCsvRow(ctx.fields.map((field) => valueToCsvCell(field, record.data[field.id])))}\r\n`;
        })
        .join('');
      if (rows.length < EXPORT_BATCH) return;
    }
  }

  async tableName(projectId: string, tableId: string): Promise<string> {
    const ctx = await this.tables.resolveContext(projectId, tableId, 'dev');
    return ctx.definition.name;
  }

  /** Maps header cells to fields by name (case-insensitively); unknown columns become text fields when asked to. */
  private mapColumns(
    header: readonly string[],
    ctx: ITableContext,
    createMissingFields: boolean,
    addError: TAddError,
  ): { fields: ITableField[]; createdFields: ITableField[]; nextFieldNo: number; columns: (ITableField | null)[] } {
    const fields: ITableField[] = [...ctx.fields];
    const createdFields: ITableField[] = [];
    let nextFieldNo = ctx.definition.data.nextFieldNo;
    const columns: (ITableField | null)[] = [];
    for (const rawName of header) {
      const name = rawName.trim();
      const existing = fields.find((field) => field.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        columns.push(columns.includes(existing) ? null : existing);
        continue;
      }
      if (!createMissingFields || name === '') {
        addError(1, `Column "${name}" does not match any field and was ignored`, name);
        columns.push(null);
        continue;
      }
      const candidate: ITableField = { id: `f${nextFieldNo}`, name, type: 'text' };
      const check = normalizeTableDocumentData(null, { fields: [...fields, candidate], nextFieldNo: nextFieldNo + 1 });
      if (!check.ok) {
        addError(1, check.error, name);
        columns.push(null);
        continue;
      }
      nextFieldNo += 1;
      fields.push(candidate);
      createdFields.push(candidate);
      columns.push(candidate);
    }
    return { fields, createdFields, nextFieldNo, columns };
  }

  /** One data row as validated record data, or the reason it is skipped. */
  private parseRow(
    cells: readonly string[],
    columns: readonly (ITableField | null)[],
    fields: readonly ITableField[],
    ctx: ITableContext,
  ): { data: Record<string, unknown> } | { message: string; field?: string } {
    const input: Record<string, unknown> = {};
    for (const [column, field] of columns.entries()) {
      if (!field) continue;
      const parsed = csvCellToValue(field, cells[column] ?? '');
      if (!parsed.ok) return { message: parsed.message, field: field.name };
      if (parsed.value !== null) input[field.id] = parsed.value;
    }
    const normalized = normalizeRecordData(fields, input, 'insert');
    if (!normalized.ok) {
      return { message: normalized.message, field: fields.find((field) => field.id === normalized.field)?.name };
    }
    if (recordDataByteLength(normalized.data) > ctx.limits.maxTableRecordBytes) {
      return { message: `The record is larger than ${ctx.limits.maxTableRecordBytes} bytes` };
    }
    return { data: normalized.data };
  }

  async importCsv(
    projectId: string,
    tableId: string,
    csv: string,
    options: IImportCsvOptions,
  ): Promise<ITableImportCsvResponse> {
    const ctx = await this.tables.resolveContext(projectId, tableId, options.env);
    const rows = parseCsv(csv);
    if (rows.length === 0) throw new TablesError('validation', 'The CSV is empty (a header row is required)');
    const errors: ITableImportCsvResponse['errors'] = [];
    const addError: TAddError = (row, message, field) => {
      if (errors.length < MAX_REPORTED_ERRORS)
        errors.push({ row, message, ...((field ?? null) === null ? {} : { field }) });
    };

    const { fields, createdFields, nextFieldNo, columns } = this.mapColumns(
      rows[0],
      ctx,
      options.createMissingFields,
      addError,
    );
    if (fields.length > ctx.limits.maxTableFields) {
      throw new TablesError('table_field_limit', `A table can have at most ${ctx.limits.maxTableFields} fields`);
    }

    const valid: Record<string, unknown>[] = [];
    let skipped = 0;
    for (const [index, cells] of rows.slice(1).entries()) {
      const result = this.parseRow(cells, columns, fields, ctx);
      if ('data' in result) valid.push(result.data);
      else {
        skipped += 1;
        addError(index + 2, result.message, result.field);
      }
    }

    const response: ITableImportCsvResponse = { inserted: valid.length, skipped, errors, createdFields };
    if (options.dryRun) {
      await this.tables.transaction((em) =>
        this.tables.assertRoom(em, ctx, valid.length, options.mode === 'replace' ? 0 : undefined),
      );
      return response;
    }

    await this.tables.transaction(async (em) => {
      await this.tables.assertRoom(em, ctx, valid.length, options.mode === 'replace' ? 0 : undefined);
      const now = new Date().toISOString();
      if (createdFields.length > 0) {
        const merged = normalizeTableDocumentData(ctx.definition.data, { fields, nextFieldNo });
        if (!merged.ok) throw new TablesError('validation', merged.error);
        await em.update(Document, { id: tableId, projectId }, { data: merged.data });
      }
      if (options.mode === 'replace') await this.tables.deleteAllIn(em, ctx, { source: 'import' }, now);
      const records = valid.map((data) => ({ id: randomUUID(), data }));
      await insertRecords(em, { projectId, tableId, env: options.env }, records, now);
      await insertChanges(
        em,
        records.map((record) => ({
          projectId,
          tableId,
          env: options.env,
          recordId: record.id,
          op: 'created' as const,
          before: null,
          after: record.data,
          changedFields: Object.keys(record.data).toSorted(),
          source: 'import' as const,
          runId: null,
          workflowId: null,
          recordVersion: 1,
          recordCreatedAt: now,
        })),
        now,
      );
    });
    if (createdFields.length > 0) this.tables.invalidateDefinition(tableId);
    return response;
  }
}
