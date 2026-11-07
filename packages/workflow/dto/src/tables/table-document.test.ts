import { describe, expect, it } from 'vitest';
import {
  emptyTableData,
  normalizeTableDocumentData,
  tableFieldNameToId,
  TABLE_MAX_FIELDS_HARD_CAP,
  TABLE_RESERVED_FIELD_NAMES,
  type ITableDocumentData,
} from './table-document.js';

/** The `undefined` value (the linter bans the identifier). */
const NOTHING: unknown = ({} as Record<string, unknown>).nothing;
const normalize = (raw: unknown, prev: ITableDocumentData | null = null) => normalizeTableDocumentData(prev, raw);
const okData = (raw: unknown, prev: ITableDocumentData | null = null): ITableDocumentData => {
  const result = normalize(raw, prev);
  if (!result.ok) throw new Error(result.error);
  return result.data;
};
const errorOf = (raw: unknown, prev: ITableDocumentData | null = null): string => {
  const result = normalize(raw, prev);
  if (result.ok) throw new Error('expected an error');
  return result.error;
};

const named = (name: unknown) => ({ fields: [{ id: 'f1', name, type: 'text' }] });

describe('normalizeTableDocumentData', () => {
  it('turns null/undefined into an empty definition', () => {
    expect(okData(null)).toEqual(emptyTableData());
    expect(okData(NOTHING)).toEqual({ fields: [], nextFieldNo: 1 });
  });

  it('rejects non-objects and non-array fields', () => {
    expect(errorOf('x')).toContain('object');
    expect(errorOf([])).toContain('object');
    expect(errorOf({ fields: 'x' })).toContain('array');
    expect(errorOf({ fields: [1] })).toContain('fields[0]');
  });

  it('accepts a valid definition and computes nextFieldNo', () => {
    const data = okData({
      fields: [
        { id: 'f1', name: ' Name ', type: 'text', required: true },
        { id: 'f3', name: 'age', type: 'number', description: 'years' },
      ],
    });
    expect(data.fields[0]).toEqual({ id: 'f1', name: 'Name', type: 'text', required: true });
    expect(data.fields[1]).toEqual({ id: 'f3', name: 'age', type: 'number', description: 'years' });
    expect(data.nextFieldNo).toBe(4);
  });

  it('never lowers nextFieldNo (raw, previous, max id)', () => {
    const prev: ITableDocumentData = { fields: [], nextFieldNo: 9 };
    expect(okData({ fields: [{ id: 'f2', name: 'a', type: 'text' }], nextFieldNo: 4 }, prev).nextFieldNo).toBe(9);
    expect(okData({ fields: [{ id: 'f2', name: 'a', type: 'text' }], nextFieldNo: 20 }, prev).nextFieldNo).toBe(20);
    expect(okData({ fields: [{ id: 'f30', name: 'a', type: 'text' }], nextFieldNo: 2 }, prev).nextFieldNo).toBe(31);
    expect(okData({ fields: [], nextFieldNo: 'x' }).nextFieldNo).toBe(1);
    expect(okData({ fields: [], nextFieldNo: 0 }).nextFieldNo).toBe(1);
  });

  it('tolerates a restored id numerically below the previous nextFieldNo', () => {
    const prev: ITableDocumentData = { fields: [], nextFieldNo: 5 };
    const data = okData({ fields: [{ id: 'f2', name: 'old', type: 'text' }], nextFieldNo: 3 }, prev);
    expect(data.nextFieldNo).toBe(5);
  });

  it('validates field ids', () => {
    for (const id of ['f0', 'g1', 'f01', 'f', '1', 'F1', 'f1a', 5, null]) {
      expect(errorOf({ fields: [{ id, name: 'a', type: 'text' }] })).toContain('id');
    }
    expect(
      errorOf({
        fields: [
          { id: 'f1', name: 'a', type: 'text' },
          { id: 'f1', name: 'b', type: 'text' },
        ],
      }),
    ).toContain('Duplicate field id');
  });

  it('validates names: charset, length, Unicode letters, uniqueness, reserved', () => {
    expect(okData(named('Телефон')).fields[0].name).toBe('Телефон');
    expect(okData(named('_x1')).fields[0].name).toBe('_x1');
    expect(okData(named('日本語')).fields[0].name).toBe('日本語');
    for (const bad of ['', '   ', '1abc', 'a b', 'a-b', 'a.b', 'x'.repeat(65), 5]) {
      expect(errorOf(named(bad))).toBeTruthy();
    }
    expect(okData(named('x'.repeat(64))).fields).toHaveLength(1);
    expect(
      errorOf({
        fields: [
          { id: 'f1', name: 'Phone', type: 'text' },
          { id: 'f2', name: 'phone', type: 'text' },
        ],
      }),
    ).toContain('Duplicate field name');
    expect(
      errorOf({
        fields: [
          { id: 'f1', name: 'ТЕЛЕФОН', type: 'text' },
          { id: 'f2', name: 'телефон', type: 'text' },
        ],
      }),
    ).toContain('Duplicate field name');
    for (const reserved of [
      'id',
      'ID',
      'version',
      'createdAt',
      'CREATEDAT',
      'updatedAt',
      'and',
      'or',
      '__proto__',
      'constructor',
      'prototype',
    ]) {
      expect(errorOf(named(reserved))).toContain('reserved');
    }
    expect(TABLE_RESERVED_FIELD_NAMES.has('createdAt')).toBe(true);
  });

  it('validates types and select options', () => {
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'color' }] })).toContain('type');
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'select' }] })).toContain('options');
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'select', options: [] }] })).toContain('options');
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'select', options: ['x', 'x'] }] })).toContain('duplicate');
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'select', options: ['x', ''] }] })).toContain('non-empty');
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'select', options: ['x', 1] }] })).toContain('non-empty');
    expect(
      errorOf({
        fields: [{ id: 'f1', name: 'a', type: 'select', options: Array.from({ length: 101 }, (_, i) => `o${i}`) }],
      }),
    ).toContain('100');
    expect(
      okData({ fields: [{ id: 'f1', name: 'a', type: 'select', options: ['x', 'y'] }] }).fields[0].options,
    ).toEqual(['x', 'y']);
  });

  it('drops options on non-select types and omits required:false', () => {
    const data = okData({ fields: [{ id: 'f1', name: 'a', type: 'text', options: ['x'], required: false }] });
    expect(data.fields[0]).toEqual({ id: 'f1', name: 'a', type: 'text' });
  });

  it('validates description length', () => {
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'text', description: 'x'.repeat(501) }] })).toContain('500');
    expect(errorOf({ fields: [{ id: 'f1', name: 'a', type: 'text', description: 5 }] })).toContain('description');
    expect(okData({ fields: [{ id: 'f1', name: 'a', type: 'text', description: '' }] }).fields[0]).toEqual({
      id: 'f1',
      name: 'a',
      type: 'text',
    });
  });

  it('caps the number of fields', () => {
    const fields = Array.from({ length: TABLE_MAX_FIELDS_HARD_CAP + 1 }, (_, i) => ({
      id: `f${i + 1}`,
      name: `n${i}`,
      type: 'text',
    }));
    expect(errorOf({ fields })).toContain(String(TABLE_MAX_FIELDS_HARD_CAP));
    expect(okData({ fields: fields.slice(0, TABLE_MAX_FIELDS_HARD_CAP) }).fields).toHaveLength(
      TABLE_MAX_FIELDS_HARD_CAP,
    );
  });
});

describe('tableFieldNameToId', () => {
  it('maps names to ids and tolerates missing data', () => {
    const data = okData({
      fields: [
        { id: 'f1', name: 'Name', type: 'text' },
        { id: 'f2', name: 'Телефон', type: 'text' },
      ],
    });
    expect(tableFieldNameToId(data)).toEqual({ Name: 'f1', Телефон: 'f2' });
    expect(tableFieldNameToId(null)).toEqual({});
    expect(tableFieldNameToId(NOTHING as null)).toEqual({});
  });
});
