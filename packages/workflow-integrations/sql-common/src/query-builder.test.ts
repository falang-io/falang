import { describe, expect, it } from 'vitest';
import { postgresDialect, mysqlDialect } from './dialects.js';
import {
  buildDelete,
  buildInsert,
  buildSelect,
  buildUpdate,
  compileWhere,
  validateIdentifier,
} from './query-builder.js';

describe('validateIdentifier', () => {
  it('accepts a plain identifier', () => {
    expect(validateIdentifier('orders')).toBe('orders');
    expect(validateIdentifier('_col1')).toBe('_col1');
  });

  it('rejects an identifier used to attempt SQL injection via an object key', () => {
    expect(() => validateIdentifier('id"; DROP TABLE orders; --')).toThrow(/invalid SQL identifier/);
    expect(() => validateIdentifier('1id')).toThrow();
    expect(() => validateIdentifier('a-b')).toThrow();
  });
});

describe('buildSelect', () => {
  it('builds a bare select with no where', () => {
    const { sql, params } = buildSelect({ table: 'orders' }, postgresDialect);
    expect(sql).toBe('SELECT * FROM "orders"');
    expect(params).toEqual([]);
  });

  it('compiles a bare value as eq, and null as IS NULL', () => {
    const { sql, params } = buildSelect({ table: 'orders', where: { status: 'paid', note: null } }, postgresDialect);
    expect(sql).toBe('SELECT * FROM "orders" WHERE "status" = $1 AND "note" IS NULL');
    expect(params).toEqual(['paid']);
  });

  it('compiles nested and/or', () => {
    const { sql, params } = buildSelect(
      {
        table: 'orders',
        where: {
          status: { in: ['new', 'paid'] },
          or: [{ note: null }, { note: { contains: 'x' } }],
        },
      },
      postgresDialect,
    );
    expect(sql).toBe(
      `SELECT * FROM "orders" WHERE "status" IN ($1, $2) AND ("note" IS NULL OR "note" LIKE $3 ESCAPE '\\')`,
    );
    expect(params).toEqual(['new', 'paid', '%x%']);
  });

  it('compiles an empty "in" to a match-nothing literal, and an empty "notIn" to a match-everything literal', () => {
    expect(buildSelect({ table: 'orders', where: { status: { in: [] } } }, postgresDialect).sql).toBe(
      'SELECT * FROM "orders" WHERE 1=0',
    );
    expect(buildSelect({ table: 'orders', where: { status: { notIn: [] } } }, postgresDialect).sql).toBe(
      'SELECT * FROM "orders" WHERE 1=1',
    );
  });

  it('rejects an unknown operator disguised as a filter key', () => {
    expect(() => compileWhere({ status: { $where: '1=1' } } as never, postgresDialect, [])).toThrow(
      /unknown filter operator/,
    );
  });

  it('rejects a where key that is not a valid identifier (defends against injection via object keys)', () => {
    expect(() => compileWhere({ 'id"; DROP TABLE orders; --': 1 }, postgresDialect, [])).toThrow(
      /invalid SQL identifier/,
    );
  });

  it('applies orderBy and limit', () => {
    const { sql } = buildSelect({ table: 'orders', orderBy: 'created_at desc, id', limit: 10 }, postgresDialect);
    expect(sql).toBe('SELECT * FROM "orders" ORDER BY "created_at" DESC, "id" LIMIT 10');
  });

  it('rejects an invalid orderBy clause', () => {
    expect(() => buildSelect({ table: 'orders', orderBy: 'id; DROP TABLE orders' }, postgresDialect)).toThrow(
      /invalid orderBy clause/,
    );
  });

  it('quotes identifiers per dialect (mysql backticks, $n placeholders vs ?)', () => {
    const pg = buildSelect({ table: 'orders', where: { id: 1 } }, postgresDialect);
    expect(pg.sql).toBe('SELECT * FROM "orders" WHERE "id" = $1');
    const mysql = buildSelect({ table: 'orders', where: { id: 1 } }, mysqlDialect);
    expect(mysql.sql).toBe('SELECT * FROM `orders` WHERE `id` = ?');
  });

  it('uses ILIKE on postgres and LOWER()/LIKE elsewhere for ilike', () => {
    expect(buildSelect({ table: 'orders', where: { name: { ilike: 'a%' } } }, postgresDialect).sql).toBe(
      `SELECT * FROM "orders" WHERE "name" ILIKE $1 ESCAPE '\\'`,
    );
    expect(buildSelect({ table: 'orders', where: { name: { ilike: 'a%' } } }, mysqlDialect).sql).toBe(
      "SELECT * FROM `orders` WHERE LOWER(`name`) LIKE LOWER(?) ESCAPE '\\'",
    );
  });
});

describe('buildSelect — schema-qualified table', () => {
  it('quotes a "schema.table"-shaped table value as two separately-quoted identifiers', () => {
    // This is the shape `build-sql-integration.ts`'s `table` field's `loadOptions` actually hands
    // back for a schema-qualified table (`"public.orders"`, one combined string) — not a separate
    // `schema` option, which nothing today populates.
    const { sql } = buildSelect({ table: 'public.orders' }, postgresDialect);
    expect(sql).toBe('SELECT * FROM "public"."orders"');
  });

  it('quotes a schema-qualified table for MySQL with backticks', () => {
    const { sql } = buildSelect({ table: 'shop.orders' }, mysqlDialect);
    expect(sql).toBe('SELECT * FROM `shop`.`orders`');
  });

  it('rejects an injection attempt smuggled into the schema part', () => {
    expect(() => buildSelect({ table: 'public"; DROP TABLE orders; --.orders' }, postgresDialect)).toThrow(
      /invalid SQL identifier/,
    );
  });

  it('rejects a three-part (or more) qualified table name', () => {
    expect(() => buildSelect({ table: 'catalog.public.orders' }, postgresDialect)).toThrow(/invalid SQL identifier/);
  });

  it('rejects an empty schema or table part', () => {
    expect(() => buildSelect({ table: '.orders' }, postgresDialect)).toThrow(/invalid SQL identifier/);
    expect(() => buildSelect({ table: 'public.' }, postgresDialect)).toThrow(/invalid SQL identifier/);
  });
});

describe('buildInsert', () => {
  it('builds an insert with RETURNING * when the dialect supports it', () => {
    const { sql, params } = buildInsert({ table: 'orders', row: { status: 'new', total: 10 } }, postgresDialect);
    expect(sql).toBe('INSERT INTO "orders" ("status", "total") VALUES ($1, $2) RETURNING *');
    expect(params).toEqual(['new', 10]);
  });

  it('omits RETURNING when the dialect does not support it', () => {
    const { sql } = buildInsert({ table: 'orders', row: { status: 'new' } }, mysqlDialect);
    expect(sql).toBe('INSERT INTO `orders` (`status`) VALUES (?)');
  });

  it('throws on an empty row', () => {
    expect(() => buildInsert({ table: 'orders', row: {} }, postgresDialect)).toThrow(/at least one column/);
  });
});

describe('buildUpdate', () => {
  it('builds an update', () => {
    const { sql, params } = buildUpdate(
      { table: 'orders', set: { status: 'paid' }, where: { id: 1 } },
      postgresDialect,
    );
    expect(sql).toBe('UPDATE "orders" SET "status" = $1 WHERE "id" = $2');
    expect(params).toEqual(['paid', 1]);
  });

  it('throws on an empty where (no "update everything")', () => {
    expect(() => buildUpdate({ table: 'orders', set: { status: 'paid' }, where: {} }, postgresDialect)).toThrow(
      /non-empty "where"/,
    );
  });

  it('throws on an empty set', () => {
    expect(() => buildUpdate({ table: 'orders', set: {}, where: { id: 1 } }, postgresDialect)).toThrow(
      /at least one column/,
    );
  });
});

describe('buildDelete', () => {
  it('builds a delete', () => {
    const { sql, params } = buildDelete({ table: 'orders', where: { id: 1 } }, postgresDialect);
    expect(sql).toBe('DELETE FROM "orders" WHERE "id" = $1');
    expect(params).toEqual([1]);
  });

  it('throws on an empty where', () => {
    expect(() => buildDelete({ table: 'orders', where: {} }, postgresDialect)).toThrow(/non-empty "where"/);
  });
});
