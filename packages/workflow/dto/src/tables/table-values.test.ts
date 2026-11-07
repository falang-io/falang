import { describe, expect, it } from 'vitest';
import type { ITableField, TTableFieldType } from './table-document.js';
import { normalizeFieldValue, normalizeRecordData, recordDataByteLength } from './table-values.js';

/** The `undefined` value (the linter bans the identifier). */
const NOTHING: unknown = ({} as Record<string, unknown>).nothing;
const field = (type: TTableFieldType, extra: Partial<ITableField> = {}): ITableField => ({
  id: 'f1',
  name: 'x',
  type,
  ...extra,
});
const value = (f: ITableField, raw: unknown): unknown => {
  const result = normalizeFieldValue(f, raw);
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.value;
};
const code = (f: ITableField, raw: unknown): string | null => {
  const result = normalizeFieldValue(f, raw);
  return result.ok ? null : result.code;
};

describe('normalizeFieldValue', () => {
  it('null and undefined clear the key for every type', () => {
    for (const type of ['text', 'number', 'boolean', 'date', 'datetime', 'json', 'file'] as const) {
      expect(value(field(type), null)).toBeNull();
      expect(value(field(type), NOTHING)).toBeNull();
    }
  });

  it('text', () => {
    expect(value(field('text'), '')).toBe('');
    expect(value(field('text'), 'привет')).toBe('привет');
    expect(code(field('text'), 5)).toBe('invalid_type');
  });

  it('number', () => {
    expect(value(field('number'), 0)).toBe(0);
    expect(value(field('number'), -1.5)).toBe(-1.5);
    expect(code(field('number'), '5')).toBe('invalid_type');
    expect(code(field('number'), Number.NaN)).toBe('invalid_type');
    expect(code(field('number'), Number.POSITIVE_INFINITY)).toBe('invalid_type');
  });

  it('boolean', () => {
    expect(value(field('boolean'), false)).toBe(false);
    expect(code(field('boolean'), 'true')).toBe('invalid_type');
    expect(code(field('boolean'), 1)).toBe('invalid_type');
  });

  it('date', () => {
    expect(value(field('date'), '2024-02-29')).toBe('2024-02-29');
    expect(code(field('date'), '2023-02-29')).toBe('invalid_date');
    expect(code(field('date'), '2024-13-01')).toBe('invalid_date');
    expect(code(field('date'), '2024-04-31')).toBe('invalid_date');
    expect(code(field('date'), '2024-00-10')).toBe('invalid_date');
    expect(code(field('date'), '2024-1-1')).toBe('invalid_date');
    expect(code(field('date'), '2024-01-01T00:00:00Z')).toBe('invalid_date');
    expect(code(field('date'), 20_240_101)).toBe('invalid_type');
  });

  it('datetime normalises to UTC ISO', () => {
    const f = field('datetime');
    expect(value(f, '2026-11-07T09:30:00Z')).toBe('2026-11-07T09:30:00.000Z');
    expect(value(f, '2026-11-07T12:30:00+03:00')).toBe('2026-11-07T09:30:00.000Z');
    expect(value(f, '2026-11-07T12:30:00+0300')).toBe('2026-11-07T09:30:00.000Z');
    expect(value(f, '2026-11-07T04:30:00-05')).toBe('2026-11-07T09:30:00.000Z');
    expect(value(f, '2026-11-07T09:30:00')).toBe('2026-11-07T09:30:00.000Z');
    expect(value(f, '2026-11-07T09:30')).toBe('2026-11-07T09:30:00.000Z');
    expect(value(f, '2026-11-07 09:30:15')).toBe('2026-11-07T09:30:15.000Z');
    expect(value(f, '2026-11-07T09:30:00.5z')).toBe('2026-11-07T09:30:00.500Z');
    expect(value(f, '2026-11-07')).toBe('2026-11-07T00:00:00.000Z');
    expect(value(f, '2026-11-07T23:30:00-02:00')).toBe('2026-11-08T01:30:00.000Z');
  });

  it('datetime rejects garbage and impossible values', () => {
    const f = field('datetime');
    for (const bad of [
      'yesterday',
      '2026-02-30T10:00:00Z',
      '2026-11-07T24:00:00Z',
      '2026-11-07T10:60:00Z',
      '2026-11-07T10:00:61Z',
      '',
    ]) {
      expect(code(f, bad)).toBe('invalid_date');
    }
    expect(code(f, 1_700_000_000_000)).toBe('invalid_type');
  });

  it('select', () => {
    const f = field('select', { options: ['red', 'green'] });
    expect(value(f, 'red')).toBe('red');
    expect(code(f, 'blue')).toBe('invalid_option');
    expect(code(f, 1)).toBe('invalid_type');
  });

  it('json accepts any JSON value and rejects non-serialisable ones', () => {
    const f = field('json');
    expect(value(f, { a: [1, { b: null }] })).toEqual({ a: [1, { b: null }] });
    expect(value(f, [1, 2])).toEqual([1, 2]);
    expect(value(f, 'str')).toBe('str');
    expect(value(f, false)).toBe(false);
    expect(code(f, { a: Number.NaN })).toBe('invalid_type');
    expect(code(f, { a: () => 1 })).toBe('invalid_type');
    expect(code(f, { a: NOTHING })).toBe('invalid_type');
    expect(code(f, new Date())).toBe('invalid_type');
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(code(f, cyclic)).toBe('invalid_type');
  });

  it('file keeps only { id, name, size, mime } (publicUrl stripped)', () => {
    const f = field('file');
    const ref = { id: '123e4567-e89b-42d3-a456-426614174000', name: 'a.pdf', size: 10, mime: 'application/pdf' };
    expect(value(f, { ...ref, publicUrl: 'https://x/y', extra: 1 })).toEqual(ref);
    expect(code(f, { ...ref, id: 'not-a-uuid' })).toBe('invalid_file');
    expect(code(f, { ...ref, size: -1 })).toBe('invalid_file');
    expect(code(f, { ...ref, size: '10' })).toBe('invalid_file');
    expect(code(f, { ...ref, name: 5 })).toBe('invalid_file');
    expect(code(f, { ...ref, mime: NOTHING })).toBe('invalid_file');
    expect(code(f, 'abc')).toBe('invalid_file');
    expect(code(f, [ref])).toBe('invalid_file');
  });
});

describe('normalizeRecordData', () => {
  const fields: ITableField[] = [
    { id: 'f1', name: 'name', type: 'text', required: true },
    { id: 'f2', name: 'age', type: 'number' },
    { id: 'f3', name: 'tag', type: 'select', options: ['a', 'b'] },
  ];

  it('insert: validates, omits nulls, requires required fields', () => {
    const ok = normalizeRecordData(fields, { f1: 'Ivan', f2: null, f3: 'a' }, 'insert');
    expect(ok).toEqual({ ok: true, data: { f1: 'Ivan', f3: 'a' }, unset: [] });
    expect(normalizeRecordData(fields, { f2: 1 }, 'insert')).toMatchObject({
      ok: false,
      code: 'required_field',
      field: 'f1',
    });
    expect(normalizeRecordData(fields, { f1: null }, 'insert')).toMatchObject({
      ok: false,
      code: 'required_field',
      field: 'f1',
    });
  });

  it('patch: required not demanded when absent, null clears optional, rejected on required', () => {
    expect(normalizeRecordData(fields, { f2: 5 }, 'patch')).toEqual({ ok: true, data: { f2: 5 }, unset: [] });
    expect(normalizeRecordData(fields, { f2: null, f3: null }, 'patch')).toEqual({
      ok: true,
      data: {},
      unset: ['f2', 'f3'],
    });
    expect(normalizeRecordData(fields, { f1: null }, 'patch')).toMatchObject({ ok: false, code: 'required_field' });
    expect(normalizeRecordData(fields, {}, 'patch')).toEqual({ ok: true, data: {}, unset: [] });
  });

  it('rejects unknown ids (including names and prototype keys) with the offending key', () => {
    expect(normalizeRecordData(fields, { f9: 1 }, 'patch')).toMatchObject({
      ok: false,
      code: 'unknown_field',
      field: 'f9',
    });
    expect(normalizeRecordData(fields, { name: 'x' }, 'insert')).toMatchObject({
      ok: false,
      code: 'unknown_field',
      field: 'name',
    });
    expect(normalizeRecordData(fields, { constructor: 1 }, 'patch')).toMatchObject({
      ok: false,
      code: 'unknown_field',
    });
  });

  it('reports value errors with the field id', () => {
    expect(normalizeRecordData(fields, { f1: 'x', f3: 'zzz' }, 'insert')).toMatchObject({
      ok: false,
      code: 'invalid_option',
      field: 'f3',
    });
    expect(normalizeRecordData(fields, { f1: 'x', f2: 'nope' }, 'insert')).toMatchObject({
      ok: false,
      code: 'invalid_type',
      field: 'f2',
    });
  });

  it('rejects non-object input', () => {
    expect(normalizeRecordData(fields, [] as unknown as Record<string, unknown>, 'insert')).toMatchObject({
      ok: false,
      code: 'validation',
    });
  });
});

describe('recordDataByteLength', () => {
  it('counts UTF-8 bytes', () => {
    expect(recordDataByteLength({})).toBe(2);
    expect(recordDataByteLength({ f1: 'a' })).toBe(JSON.stringify({ f1: 'a' }).length);
    expect(recordDataByteLength({ f1: 'я' })).toBe(JSON.stringify({ f1: 'я' }).length + 1);
  });
});
