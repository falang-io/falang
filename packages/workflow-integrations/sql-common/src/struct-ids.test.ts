import { describe, expect, it } from 'vitest';
import {
  parseTableStructId,
  structName,
  tableInsertStructId,
  tablePatchStructId,
  tableStructId,
  tableWhereStructId,
} from './struct-ids.js';

describe('struct-ids', () => {
  it('builds db:<instanceId>:<schema>.<table>, omitting the schema when null', () => {
    expect(tableStructId('inst1', 'public', 'orders')).toBe('db:inst1:public.orders');
    expect(tableStructId('inst1', null, 'orders')).toBe('db:inst1:orders');
  });

  it('builds the #insert/#patch/#where variants', () => {
    expect(tableInsertStructId('inst1', null, 'orders')).toBe('db:inst1:orders#insert');
    expect(tablePatchStructId('inst1', null, 'orders')).toBe('db:inst1:orders#patch');
    expect(tableWhereStructId('inst1', null, 'orders')).toBe('db:inst1:orders#where');
  });

  it('parses every variant back, including schema-qualified ids', () => {
    expect(parseTableStructId('db:inst1:public.orders')).toEqual({
      instanceId: 'inst1',
      schema: 'public',
      table: 'orders',
    });
    expect(parseTableStructId('db:inst1:orders#where')).toEqual({
      instanceId: 'inst1',
      schema: null,
      table: 'orders',
      variant: 'where',
    });
  });

  it('returns undefined for a non-matching id', () => {
    expect(parseTableStructId('not-a-struct-id')).toBeUndefined();
  });

  it('builds a valid PascalCase TS identifier for the struct name', () => {
    expect(structName('ShopDb', 'orders')).toBe('ShopDb_Orders');
    expect(structName('Shop Db', 'order_items')).toBe('ShopDb_OrderItems');
  });

  it('sanitizes a name that would otherwise start with a digit', () => {
    const name = structName('2024', '1_table');
    expect(name).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/);
  });
});
