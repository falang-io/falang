import { describe, expect, it } from 'vitest';
import type { ISyncedColumn } from './schema-types.js';
import { sqlTypeToVariableInfo } from './sql-type-mapping.js';

const column = (sqlType: string, overrides: Partial<ISyncedColumn> = {}): ISyncedColumn => ({
  name: 'col',
  sqlType,
  nullable: false,
  hasDefault: false,
  primaryKey: false,
  ...overrides,
});

describe('sqlTypeToVariableInfo', () => {
  it('maps integer kinds to int32, bigint to int64 (postgres)', () => {
    expect(sqlTypeToVariableInfo(column('smallint'), 'postgres')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int32' },
    });
    expect(sqlTypeToVariableInfo(column('integer'), 'postgres')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int32' },
    });
    expect(sqlTypeToVariableInfo(column('bigint'), 'postgres')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int64' },
    });
  });

  it('maps mysql int kinds and tinyint(1) -> boolean', () => {
    expect(sqlTypeToVariableInfo(column('int'), 'mysql')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int32' },
    });
    expect(sqlTypeToVariableInfo(column('bigint'), 'mysql')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int64' },
    });
    expect(sqlTypeToVariableInfo(column('tinyint(1)'), 'mysql')).toEqual({ type: 'boolean' });
    expect(sqlTypeToVariableInfo(column('tinyint(4)'), 'mysql')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int32' },
    });
  });

  it('sqlite INTEGER affinity maps to int64 (dynamic typing, up to 8 bytes)', () => {
    expect(sqlTypeToVariableInfo(column('INTEGER'), 'sqlite')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int64' },
    });
    expect(sqlTypeToVariableInfo(column('integer'), 'sqlite')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int64' },
    });
  });

  it('maps numeric/decimal/real/double/float uniformly to float64, unless precision is given', () => {
    for (const sqlType of ['real', 'double precision', 'float', 'double', 'numeric', 'decimal']) {
      expect(sqlTypeToVariableInfo(column(sqlType), 'postgres')).toEqual({
        type: 'number',
        numberType: { type: 'float', floatType: 'float64' },
      });
    }
    expect(sqlTypeToVariableInfo(column('numeric(10,2)'), 'postgres')).toEqual({
      type: 'number',
      numberType: { type: 'decimal', digits: 10, decimals: 2 },
    });
    expect(sqlTypeToVariableInfo(column('decimal(5, 0)'), 'mysql')).toEqual({
      type: 'number',
      numberType: { type: 'decimal', digits: 5, decimals: 0 },
    });
  });

  it('sqlite NUMERIC affinity falls back to float64', () => {
    expect(sqlTypeToVariableInfo(column('NUMERIC'), 'sqlite')).toEqual({
      type: 'number',
      numberType: { type: 'float', floatType: 'float64' },
    });
  });

  it('maps text/varchar/char/uuid/date/time/timestamp*/interval/inet to string', () => {
    for (const sqlType of [
      'text',
      'varchar(255)',
      'character varying(64)',
      'char(1)',
      'uuid',
      'date',
      'time',
      'timestamp without time zone',
      'timestamp with time zone',
      'interval',
      'inet',
    ]) {
      expect(sqlTypeToVariableInfo(column(sqlType), 'postgres')).toEqual({ type: 'string' });
    }
    expect(sqlTypeToVariableInfo(column('datetime'), 'sqlite')).toEqual({ type: 'string' });
    expect(sqlTypeToVariableInfo(column('VARCHAR(255)'), 'sqlite')).toEqual({ type: 'string' });
  });

  it('maps boolean / bit(1) to boolean, case-insensitively', () => {
    expect(sqlTypeToVariableInfo(column('boolean'), 'postgres')).toEqual({ type: 'boolean' });
    expect(sqlTypeToVariableInfo(column('BOOLEAN'), 'sqlite')).toEqual({ type: 'boolean' });
    expect(sqlTypeToVariableInfo(column('bit(1)'), 'mysql')).toEqual({ type: 'boolean' });
  });

  it('maps json/jsonb to any', () => {
    expect(sqlTypeToVariableInfo(column('json'), 'postgres')).toEqual({ type: 'any' });
    expect(sqlTypeToVariableInfo(column('jsonb'), 'postgres')).toEqual({ type: 'any' });
  });

  it('maps a postgres array column to { type: array, elementType, dimensions: 1 }', () => {
    expect(sqlTypeToVariableInfo(column('integer', { isArray: true }), 'postgres')).toEqual({
      type: 'array',
      elementType: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } },
      dimensions: 1,
    });
  });

  it('maps an enum column to string regardless of dialect', () => {
    expect(sqlTypeToVariableInfo(column('mood', { enumValues: ['sad', 'ok', 'happy'] }), 'postgres')).toEqual({
      type: 'string',
    });
  });

  it('falls back to any for an unrecognized type', () => {
    expect(sqlTypeToVariableInfo(column('bytea'), 'postgres')).toEqual({ type: 'any' });
    expect(sqlTypeToVariableInfo(column('some_made_up_type'), 'mysql')).toEqual({ type: 'any' });
  });

  it('sets optional: true for a nullable column', () => {
    expect(sqlTypeToVariableInfo(column('text', { nullable: true }), 'postgres')).toEqual({
      type: 'string',
      optional: true,
    });
  });

  it('is case-insensitive on the raw sqlType text', () => {
    expect(sqlTypeToVariableInfo(column('INTEGER'), 'postgres')).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int32' },
    });
    expect(sqlTypeToVariableInfo(column('Text'), 'postgres')).toEqual({ type: 'string' });
  });
});
