// oxlint-disable no-undefined, prefer-string-raw -- hostile inputs and literal backslash escapes are the point.
import type { ITableField } from '@falang/workflow-dto';
import { describe, expect, it } from 'vitest';
import { TablesError } from './table-errors.js';
import { compileTableOrderBy, compileTableSearch, compileTableWhere } from './table-where.js';

const FIELDS: ITableField[] = [
  { id: 'f1', name: 'Name', type: 'text' },
  { id: 'f2', name: 'Age', type: 'number' },
  { id: 'f3', name: 'Active', type: 'boolean' },
  { id: 'f4', name: 'Born', type: 'date' },
  { id: 'f5', name: 'Seen', type: 'datetime' },
  { id: 'f6', name: 'Kind', type: 'select', options: ['a', 'b'] },
  { id: 'f7', name: 'Meta', type: 'json' },
  { id: 'f8', name: 'Doc', type: 'file' },
];

const compile = (where?: Record<string, unknown>) => {
  const params: unknown[] = ['table', 'dev'];
  const sql = compileTableWhere(where, FIELDS, params);
  return { sql, params: params.slice(2) };
};

const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (error) {
    return error instanceof TablesError ? error.code : 'other';
  }
  return undefined;
};

describe('compileTableWhere', () => {
  it('compiles a bare equality on a text field to a bound jsonb text comparison', () => {
    expect(compile({ f1: 'Ann' })).toEqual({ sql: "(r.data->>'f1') = $3", params: ['Ann'] });
  });

  it('guards the numeric and boolean casts against retyped values', () => {
    const number = compile({ f2: { gte: 18, lt: 65 } });
    expect(number.sql).toContain("jsonb_typeof(r.data->'f2') = 'number'");
    expect(number.sql).toContain('>= $3');
    expect(number.params).toEqual([18, 65]);
    expect(compile({ f3: true }).sql).toContain("jsonb_typeof(r.data->'f3') = 'boolean'");
  });

  it('supports system keys, and/or nesting, in/notIn, isNull and text operators', () => {
    expect(compile({ id: 'abc', version: { gt: 1 } }).sql).toBe('r.id::text = $3 AND r.version > $4');
    const nested = compile({
      or: [{ f1: { startsWith: 'A_' } }, { and: [{ f2: { in: [1, 2] } }, { f6: { isNull: true } }] }],
    });
    expect(nested.sql).toContain("LIKE $3 ESCAPE '\\'");
    expect(nested.params).toEqual(['A\\_%', 1, 2]);
    expect(nested.sql).toContain('IS NULL');
    expect(compile({ f1: { contains: '100%' } }).params).toEqual(['%100\\%%']);
  });

  it('normalises datetime values and compares timestamps as ISO strings', () => {
    expect(compile({ f5: { gt: '2026-01-01T10:00:00+03:00' } }).params).toEqual(['2026-01-01T07:00:00.000Z']);
    expect(compile({ createdAt: { lt: '2026-01-01' } }).params).toEqual(['2026-01-01T00:00:00.000Z']);
  });

  it('stores json filters as json text and refuses range operators on them', () => {
    expect(compile({ f7: { eq: { a: 1 } } }).params).toEqual(['{"a":1}']);
    expect(codeOf(() => compile({ f7: { gt: 1 } }))).toBe('operator_not_supported');
    expect(codeOf(() => compile({ f3: { gt: true } }))).toBe('operator_not_supported');
    expect(codeOf(() => compile({ f2: { like: 'x' } }))).toBe('operator_not_supported');
  });

  it('rejects unknown keys and wrong value types before anything reaches SQL', () => {
    expect(codeOf(() => compile({ f99: 1 }))).toBe('unknown_field');
    expect(codeOf(() => compile({ name: 'x' }))).toBe('unknown_field');
    expect(codeOf(() => compile({ f2: 'ten' }))).toBe('invalid_type');
    expect(codeOf(() => compile({ f3: 'yes' }))).toBe('invalid_type');
    expect(codeOf(() => compile({ f4: { eq: '2026-02-30' } }))).toBe('invalid_type');
    expect(codeOf(() => compile({ f1: { in: 'a' } }))).toBe('invalid_type');
    expect(codeOf(() => compile({ f1: ['a'] }))).toBe('invalid_type');
    expect(codeOf(() => compile({ or: 'x' }))).toBe('validation');
  });

  it('never lets user text into the SQL — keys and values with injection attempts are rejected or bound', () => {
    expect(codeOf(() => compile({ "f1') OR 1=1 --": 'x' }))).toBe('unknown_field');
    expect(codeOf(() => compile({ 'f1; DROP TABLE table_records': 'x' }))).toBe('unknown_field');
    expect(codeOf(() => compile({ f1: { "eq' OR '1'='1": 'x' } }))).toBe('operator_not_supported');
    const hostile = compile({ f1: "x' OR '1'='1" });
    expect(hostile.sql).toBe("(r.data->>'f1') = $3");
    expect(hostile.params).toEqual(["x' OR '1'='1"]);
    expect(compile({ f2: { in: [1, 2] } }).sql).not.toMatch(/[^$\d]\d+\)/);
  });

  it('returns an empty expression for an empty filter', () => {
    expect(compile().sql).toBe('');
    expect(compile({}).sql).toBe('');
    expect(compile({ and: [] }).sql).toBe('');
  });
});

describe('compileTableOrderBy / compileTableSearch', () => {
  it('orders by validated keys with a stable tail', () => {
    expect(compileTableOrderBy([{ field: 'f1', dir: 'desc' }], FIELDS)).toBe(
      "(r.data->>'f1') DESC NULLS LAST, r.created_at ASC, r.id ASC",
    );
    expect(compileTableOrderBy(undefined, FIELDS)).toBe('r.created_at ASC, r.id ASC');
    expect(compileTableOrderBy([{ field: 'updatedAt', dir: 'asc' }], FIELDS)).toContain('r.updated_at ASC');
  });

  it('refuses unknown, injected or unsortable keys', () => {
    expect(codeOf(() => compileTableOrderBy([{ field: 'f1; --', dir: 'asc' }], FIELDS))).toBe('unknown_field');
    expect(codeOf(() => compileTableOrderBy([{ field: 'f7', dir: 'asc' }], FIELDS))).toBe('operator_not_supported');
    expect(codeOf(() => compileTableOrderBy([{ field: 'f1', dir: 'sideways' as 'asc' }], FIELDS))).toBe('validation');
  });

  it('searches text and select fields with an escaped ILIKE pattern', () => {
    const params: unknown[] = ['t', 'dev'];
    const sql = compileTableSearch('50%_off', FIELDS, params);
    expect(sql).toContain("(r.data->>'f1') ILIKE $3");
    expect(sql).toContain("(r.data->>'f6') ILIKE $3");
    expect(sql).not.toContain('f2');
    expect(params[2]).toBe('%50\\%\\_off%');
    expect(compileTableSearch('x', [{ id: 'f1', name: 'N', type: 'number' }], [])).toBe('1 = 0');
  });
});
