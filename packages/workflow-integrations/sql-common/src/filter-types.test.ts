import { describe, expect, it } from 'vitest';
import {
  ANY_FILTER_TYPE_ID,
  BOOLEAN_FILTER_TYPE_ID,
  NUMBER_FILTER_TYPE_ID,
  STRING_FILTER_TYPE_ID,
  buildTableStructTypes,
  filterTypeIdFor,
  sqlFilterStructTypes,
} from './filter-types.js';
import type { ISyncedTable } from './schema-types.js';

describe('filterTypeIdFor', () => {
  it('picks the filter struct matching the column type', () => {
    expect(filterTypeIdFor({ type: 'number', numberType: { type: 'any' } })).toBe(NUMBER_FILTER_TYPE_ID);
    expect(filterTypeIdFor({ type: 'string' })).toBe(STRING_FILTER_TYPE_ID);
    expect(filterTypeIdFor({ type: 'boolean' })).toBe(BOOLEAN_FILTER_TYPE_ID);
    expect(filterTypeIdFor({ type: 'any' })).toBe(ANY_FILTER_TYPE_ID);
    expect(filterTypeIdFor({ type: 'array', elementType: { type: 'string' }, dimensions: 1 })).toBe(ANY_FILTER_TYPE_ID);
  });
});

describe('sqlFilterStructTypes', () => {
  it('declares four static struct types with the expected ids', () => {
    expect(sqlFilterStructTypes.map((t) => t.id).toSorted()).toEqual(
      [NUMBER_FILTER_TYPE_ID, STRING_FILTER_TYPE_ID, BOOLEAN_FILTER_TYPE_ID, ANY_FILTER_TYPE_ID].toSorted(),
    );
  });

  it('AnyFilter only offers eq/isNull', () => {
    const anyFilter = sqlFilterStructTypes.find((t) => t.id === ANY_FILTER_TYPE_ID);
    expect(Object.keys(anyFilter?.properties ?? {}).toSorted()).toEqual(['eq', 'isNull'].toSorted());
  });

  it('StringFilter adds like/ilike/startsWith/contains on top of the comparison fields', () => {
    const stringFilter = sqlFilterStructTypes.find((t) => t.id === STRING_FILTER_TYPE_ID);
    expect(Object.keys(stringFilter?.properties ?? {}).toSorted()).toEqual(
      [
        'eq',
        'ne',
        'gt',
        'gte',
        'lt',
        'lte',
        'in',
        'notIn',
        'isNull',
        'like',
        'ilike',
        'startsWith',
        'contains',
      ].toSorted(),
    );
  });
});

describe('buildTableStructTypes', () => {
  const table: ISyncedTable = {
    schema: null,
    name: 'orders',
    columns: [
      { name: 'id', sqlType: 'integer', nullable: false, hasDefault: true, primaryKey: true },
      { name: 'status', sqlType: 'text', nullable: false, hasDefault: false, primaryKey: false },
      { name: 'total', sqlType: 'real', nullable: true, hasDefault: false, primaryKey: false },
    ],
  };

  it('builds four structs with the expected ids and names', () => {
    const structs = buildTableStructTypes('inst1', 'ShopDb', table, 'sqlite');
    expect(structs.map((s) => s.id)).toEqual([
      'db:inst1:orders',
      'db:inst1:orders#insert',
      'db:inst1:orders#patch',
      'db:inst1:orders#where',
    ]);
    expect(structs.map((s) => s.name)).toEqual([
      'ShopDb_Orders',
      'ShopDb_OrdersInsert',
      'ShopDb_OrdersPatch',
      'ShopDb_OrdersWhere',
    ]);
  });

  it('Row has every column typed, non-optional unless the column is nullable', () => {
    const [row] = buildTableStructTypes('inst1', 'ShopDb', table, 'sqlite');
    expect(row.properties.id).toEqual({ type: 'number', numberType: { type: 'integer', integerType: 'int64' } });
    expect(row.properties.status).toEqual({ type: 'string' });
    expect(row.properties.total).toEqual({
      type: 'number',
      numberType: { type: 'float', floatType: 'float64' },
      optional: true,
    });
  });

  it('Insert makes hasDefault-or-nullable columns optional', () => {
    const insert = buildTableStructTypes('inst1', 'ShopDb', table, 'sqlite')[1];
    // "id" has a default (auto-increment primary key).
    expect(insert.properties.id?.optional).toBe(true);
    // "status" has neither a default nor is it nullable.
    expect(insert.properties.status?.optional).toBeUndefined();
    // "total" is nullable.
    expect(insert.properties.total?.optional).toBe(true);
  });

  it('Patch makes every column optional', () => {
    const patch = buildTableStructTypes('inst1', 'ShopDb', table, 'sqlite')[2];
    for (const value of Object.values(patch.properties)) {
      expect(value.optional).toBe(true);
    }
  });

  it('Where types every column as a union of its own type and the matching filter struct, plus and/or', () => {
    const where = buildTableStructTypes('inst1', 'ShopDb', table, 'sqlite')[3];
    expect(where.properties.status).toEqual({
      type: 'union',
      unionTypes: [{ type: 'string' }, { type: 'struct', id: STRING_FILTER_TYPE_ID }],
      optional: true,
    });
    expect(where.properties.and).toEqual({
      type: 'array',
      elementType: { type: 'struct', id: 'db:inst1:orders#where' },
      dimensions: 1,
      optional: true,
    });
    expect(where.properties.or).toEqual({
      type: 'array',
      elementType: { type: 'struct', id: 'db:inst1:orders#where' },
      dimensions: 1,
      optional: true,
    });
  });
});
