import { describe, expect, it } from 'vitest';
import type { ITableDocumentData } from '@falang/workflow-dto';
import {
  ANY_FILTER_TYPE_ID,
  BOOLEAN_FILTER_TYPE_ID,
  NUMBER_FILTER_TYPE_ID,
  STRING_FILTER_TYPE_ID,
} from '@falang/workflow-integrations-sql-common';
import { tableFilterTypeId, tableStructName, tableStructTypes } from './table-types.js';

const data: ITableDocumentData = {
  nextFieldNo: 9,
  fields: [
    { id: 'f1', name: 'name', type: 'text', required: true },
    { id: 'f2', name: 'age', type: 'number', required: true, defaultValue: 0 },
    { id: 'f3', name: 'vip', type: 'boolean' },
    { id: 'f4', name: 'tag', type: 'select', options: ['a'] },
    { id: 'f5', name: 'born', type: 'date' },
    { id: 'f6', name: 'seen', type: 'datetime' },
    { id: 'f7', name: 'meta', type: 'json' },
    { id: 'f8', name: 'scan', type: 'file' },
  ],
};
const types = () => tableStructTypes({ id: 'doc1', name: 'My clients', data });
const byId = (id: string) => {
  const found = types().find((type) => type.id === id);
  if (!found) throw new Error(`no struct ${id}`);
  return found;
};

describe('tableStructName', () => {
  it('pascal-cases, keeps Unicode letters and always yields an identifier', () => {
    expect(tableStructName('Clients')).toBe('Clients');
    expect(tableStructName('my clients')).toBe('MyClients');
    expect(tableStructName('клиенты 2024')).toBe('Клиенты2024');
    expect(tableStructName('2024 orders')).toBe('_2024Orders');
    expect(tableStructName('!!!')).toBe('_');
    expect(tableStructName('')).toBe('_');
  });
});

describe('tableStructTypes', () => {
  it('returns the five structs with ids and names derived from the document', () => {
    expect(types().map((type) => [type.id, type.name])).toEqual([
      ['table:doc1', 'MyClients'],
      ['table:doc1#insert', 'MyClientsInsert'],
      ['table:doc1#patch', 'MyClientsPatch'],
      ['table:doc1#where', 'MyClientsWhere'],
      ['table:doc1#event', 'MyClientsEvent'],
    ]);
  });

  it('Row: system keys plus every field by name, optional unless required', () => {
    const row = byId('table:doc1').properties;
    expect(Object.keys(row)).toEqual(['id', 'version', 'createdAt', 'updatedAt', ...data.fields.map((f) => f.name)]);
    expect(row.id).toEqual({ type: 'string' });
    expect(row.name).toEqual({ type: 'string' });
    expect(row.age).toEqual({ type: 'number', numberType: { type: 'any' } });
    expect(row.vip).toEqual({ type: 'boolean', optional: true });
    expect(row.tag).toEqual({ type: 'string', optional: true });
    expect(row.born).toEqual({ type: 'string', optional: true });
    expect(row.seen).toEqual({ type: 'string', optional: true });
    expect(row.meta).toEqual({ type: 'any', optional: true });
    expect(row.scan).toEqual({ type: 'struct', id: 'files/File', optional: true });
  });

  it('Insert requires only required fields without a default; Patch makes all optional', () => {
    const insert = byId('table:doc1#insert').properties;
    expect(Object.keys(insert)).toEqual(data.fields.map((f) => f.name));
    expect(insert.name.optional).toBeUndefined();
    expect(insert.age.optional).toBe(true);
    const patch = byId('table:doc1#patch').properties;
    expect(Object.keys(patch)).toEqual(data.fields.map((f) => f.name));
    expect(Object.values(patch).every((info) => info.optional === true)).toBe(true);
  });

  it('Where: T | Filter<T> per field, system keys, and/or nesting', () => {
    const where = byId('table:doc1#where').properties;
    expect(where.age).toEqual({
      type: 'union',
      unionTypes: [
        { type: 'number', numberType: { type: 'any' } },
        { type: 'struct', id: NUMBER_FILTER_TYPE_ID },
      ],
      optional: true,
    });
    expect(where.name).toMatchObject({
      unionTypes: [{ type: 'string' }, { type: 'struct', id: STRING_FILTER_TYPE_ID }],
    });
    expect(where.vip).toMatchObject({
      unionTypes: [{ type: 'boolean' }, { type: 'struct', id: BOOLEAN_FILTER_TYPE_ID }],
    });
    expect(where.meta).toMatchObject({ unionTypes: [{ type: 'any' }, { type: 'struct', id: ANY_FILTER_TYPE_ID }] });
    expect(where.scan).toMatchObject({ unionTypes: [expect.anything(), { type: 'struct', id: ANY_FILTER_TYPE_ID }] });
    for (const key of ['id', 'version', 'createdAt', 'updatedAt']) expect(where).toHaveProperty(key);
    expect(where.and).toEqual({
      type: 'array',
      elementType: { type: 'struct', id: 'table:doc1#where' },
      dimensions: 1,
      optional: true,
    });
    expect(where.or).toMatchObject({ type: 'array' });
  });

  it('Event: the trigger scope', () => {
    const event = byId('table:doc1#event').properties;
    expect(Object.keys(event)).toEqual(['table', 'record', 'previous', 'changedFields', 'source']);
    expect(event.record).toEqual({ type: 'struct', id: 'table:doc1' });
    expect(event.previous).toEqual({ type: 'struct', id: 'table:doc1', optional: true });
    expect(event.changedFields).toMatchObject({ type: 'array', optional: true });
  });

  it('handles an empty table and Unicode field names', () => {
    const empty = tableStructTypes({ id: 'e', name: 'Empty', data: { fields: [], nextFieldNo: 1 } });
    expect(Object.keys(empty[1].properties)).toEqual([]);
    const ru = tableStructTypes({
      id: 'r',
      name: 'Клиенты',
      data: { fields: [{ id: 'f1', name: 'Телефон', type: 'text' }], nextFieldNo: 2 },
    });
    expect(ru[0].properties).toHaveProperty('Телефон');
  });

  it('maps field types to filter structs', () => {
    expect(tableFilterTypeId({ id: 'f1', name: 'a', type: 'date' })).toBe(STRING_FILTER_TYPE_ID);
    expect(tableFilterTypeId({ id: 'f1', name: 'a', type: 'select' })).toBe(STRING_FILTER_TYPE_ID);
  });
});
