import {
  isTableFieldId,
  normalizeFieldValue,
  TABLE_SYSTEM_KEYS,
  type ITableField,
  type ITableOrderBy,
} from '@falang/workflow-dto';
import { compileWhere, type ISqlDialect, type TWhere } from '@falang/workflow-integrations-sql-common';
import { TablesError } from './table-errors.js';

/**
 * `where` / `orderBy` / `search` compilers over the table's CURRENT field list (ADR 0075 (private)). Keys are validated
 * as field ids or system keys and only the validated key reaches SQL text; every value is a bind parameter. Casts are
 * guarded (`CASE WHEN jsonb_typeof(..)`) so a record whose cell predates a retype is NULL, never a cast error.
 * Postgres only. The records table is always aliased `r`.
 */

type TKind = 'text' | 'number' | 'boolean' | 'datetime' | 'file' | 'json' | 'id' | 'version' | 'timestamp';

interface IColumn {
  readonly kind: TKind;
  readonly sql: string;
  readonly field?: ITableField;
}

const SYSTEM_KEYS: ReadonlySet<string> = new Set(TABLE_SYSTEM_KEYS);

const jsonText = (id: string): string => `(r.data->>'${id}')`;

/** The typed SQL expression of a field id / system key. Throws `unknown_field` for anything else. */
export const resolveColumn = (key: string, fields: readonly ITableField[]): IColumn => {
  if (SYSTEM_KEYS.has(key)) {
    if (key === 'id') return { kind: 'id', sql: 'r.id::text' };
    if (key === 'version') return { kind: 'version', sql: 'r.version' };
    return { kind: 'timestamp', sql: key === 'createdAt' ? 'r.created_at' : 'r.updated_at' };
  }
  const field = isTableFieldId(key) ? fields.find((item) => item.id === key) : null;
  if (!field) throw new TablesError('unknown_field', `Unknown field "${key}"`, key);
  // `key` matched ^f[1-9]\d*$ and a field of the document: safe to put in SQL text.
  switch (field.type) {
    case 'number': {
      return {
        kind: 'number',
        field,
        sql: `(CASE WHEN jsonb_typeof(r.data->'${key}') = 'number' THEN (r.data->>'${key}')::numeric END)`,
      };
    }
    case 'boolean': {
      return {
        kind: 'boolean',
        field,
        sql: `(CASE WHEN jsonb_typeof(r.data->'${key}') = 'boolean' THEN (r.data->>'${key}')::boolean END)`,
      };
    }
    case 'file': {
      return { kind: 'file', field, sql: `(r.data->'${key}'->>'id')` };
    }
    case 'json': {
      return { kind: 'json', field, sql: `(r.data->'${key}')` };
    }
    case 'date':
    case 'datetime': {
      return { kind: 'datetime', field, sql: jsonText(key) };
    }
    default: {
      return { kind: 'text', field, sql: jsonText(key) };
    }
  }
};

const ORDERED = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'isNull'];
const OPERATORS: Record<TKind, readonly string[]> = {
  text: [...ORDERED, 'like', 'ilike', 'startsWith', 'contains'],
  number: ORDERED,
  version: ORDERED,
  datetime: ORDERED,
  timestamp: ORDERED,
  boolean: ['eq', 'ne', 'isNull'],
  file: ['eq', 'ne', 'in', 'notIn', 'isNull'],
  id: ['eq', 'ne', 'in', 'notIn', 'isNull'],
  json: ['eq', 'ne', 'isNull'],
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const coerceValue = (column: IColumn, key: string, operator: string, value: unknown): unknown => {
  const bad = (message: string): never => {
    throw new TablesError('invalid_type', `where.${key}.${operator}: ${message}`, key);
  };
  switch (column.kind) {
    case 'text':
    case 'file':
    case 'id': {
      return typeof value === 'string' ? value : bad('expects a string');
    }
    case 'number':
    case 'version': {
      return typeof value === 'number' && Number.isFinite(value) ? value : bad('expects a finite number');
    }
    case 'boolean': {
      return typeof value === 'boolean' ? value : bad('expects true or false');
    }
    case 'datetime': {
      const result = normalizeFieldValue(column.field as ITableField, value);
      if (!result.ok || result.value === null) return bad(result.ok ? 'expects a date' : result.message);
      return result.value;
    }
    case 'timestamp': {
      const time = typeof value === 'string' ? new Date(value).getTime() : Number.NaN;
      return Number.isNaN(time) ? bad('expects an ISO date-time string') : new Date(time).toISOString();
    }
    case 'json': {
      return JSON.stringify(value);
    }
    default: {
      return bad('unsupported');
    }
  }
};

const normalizeFilter = (column: IColumn, key: string, filter: unknown): unknown => {
  if (filter === null) return null;
  if (!isPlainObject(filter)) {
    if (Array.isArray(filter)) throw new TablesError('invalid_type', `where.${key}: use { in: [...] } for a list`, key);
    return coerceValue(column, key, 'eq', filter);
  }
  const out: Record<string, unknown> = {};
  for (const [operator, value] of Object.entries(filter)) {
    if (!OPERATORS[column.kind].includes(operator)) {
      throw new TablesError('operator_not_supported', `Operator "${operator}" is not supported on "${key}"`, key);
    }
    if (operator === 'isNull') {
      out[operator] = value === true;
    } else if (operator === 'in' || operator === 'notIn') {
      if (!Array.isArray(value))
        throw new TablesError('invalid_type', `where.${key}.${operator} expects an array`, key);
      out[operator] = value.map((item) => coerceValue(column, key, operator, item));
    } else if (value === null && (operator === 'eq' || operator === 'ne')) {
      out[operator] = null;
    } else {
      out[operator] = coerceValue(column, key, operator, value);
    }
  }
  if (Object.keys(out).length === 0) {
    throw new TablesError('validation', `where.${key}: empty filter object`, key);
  }
  return out;
};

const normalizeWhere = (where: Record<string, unknown>, fields: readonly ITableField[], depth: number): TWhere => {
  if (depth > 16) throw new TablesError('validation', 'where is nested too deeply');
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(where)) {
    if (key === 'and' || key === 'or') {
      if (!Array.isArray(value) || !value.every((item) => isPlainObject(item))) {
        throw new TablesError('validation', `where.${key} must be an array of filter objects`);
      }
      out[key] = value.map((item) => normalizeWhere(item as Record<string, unknown>, fields, depth + 1));
      continue;
    }
    out[key] = normalizeFilter(resolveColumn(key, fields), key, value);
  }
  return out as TWhere;
};

/** Compiles `where` into a boolean SQL expression ('' for an empty filter), pushing bind values onto `params`. */
export const compileTableWhere = (
  where: Record<string, unknown> | undefined | null,
  fields: readonly ITableField[],
  params: unknown[],
): string => {
  if (!where) return '';
  if (!isPlainObject(where)) throw new TablesError('validation', 'where must be an object');
  const normalized = normalizeWhere(where, fields, 0);
  const dialect: ISqlDialect = {
    name: 'postgres',
    supportsReturning: true,
    placeholder: (index) => `$${index}`,
    quoteIdent: (key) => resolveColumn(key, fields).sql,
  };
  return compileWhere(normalized, dialect, params);
};

/** `ORDER BY` body (no keyword): the requested keys, then a stable `created_at, id` tail. */
export const compileTableOrderBy = (
  orderBy: readonly ITableOrderBy[] | undefined | null,
  fields: readonly ITableField[],
): string => {
  const parts: string[] = [];
  for (const item of orderBy ?? []) {
    if (!isPlainObject(item) || typeof item.field !== 'string') {
      throw new TablesError('validation', 'orderBy entries must be { field, dir }');
    }
    if (item.dir !== 'asc' && item.dir !== 'desc') {
      throw new TablesError('validation', 'orderBy.dir must be "asc" or "desc"');
    }
    const column = resolveColumn(item.field, fields);
    if (column.kind === 'json' || column.kind === 'file') {
      throw new TablesError('operator_not_supported', `Cannot sort by "${item.field}"`, item.field);
    }
    parts.push(`${column.sql} ${item.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST`);
  }
  parts.push('r.created_at ASC', 'r.id ASC');
  return parts.join(', ');
};

const escapeLike = (value: string): string =>
  // oxlint-disable-next-line unicorn/prefer-string-raw
  value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');

/** Case-insensitive substring search over the `text`/`select` fields; '' when there is nothing to search in. */
export const compileTableSearch = (search: string, fields: readonly ITableField[], params: unknown[]): string => {
  const columns = fields.filter((field) => field.type === 'text' || field.type === 'select');
  if (columns.length === 0) return '1 = 0';
  params.push(`%${escapeLike(search)}%`);
  const placeholder = `$${params.length}`;
  return `(${columns.map((field) => `${resolveColumn(field.id, fields).sql} ILIKE ${placeholder} ESCAPE '\\'`).join(' OR ')})`;
};
