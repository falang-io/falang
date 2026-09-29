import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { sqliteDialect } from './dialects.js';
import { buildTableStructTypes } from './filter-types.js';
import {
  SQLITE_LIST_TABLES_SQL,
  rowsToSyncedSchema,
  sqlitePragmaRowToColumn,
  sqliteTableInfoSql,
  type ISqlitePragmaTableInfoRow,
} from './introspection.js';
import { buildDelete, buildInsert, buildSelect, buildUpdate } from './query-builder.js';

/**
 * Real end-to-end coverage against a real SQL engine, with no Docker/network — the whole reason
 * SQLite is a third dialect from v1 (ADR 0039 (private) §1/§8). `node:sqlite` is unflagged on
 * Node >= 24 (this repo's floor) but still prints an `ExperimentalWarning` to stderr; that's expected,
 * not a test failure.
 */
describe('sql-common against a real node:sqlite database', () => {
  const openSeededDb = (): DatabaseSync => {
    const db = new DatabaseSync(':memory:');
    db.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        total REAL,
        created_at TEXT,
        note TEXT NULL
      );
    `);
    return db;
  };

  it("introspects the real schema through introspection.ts's own SQL, and maps it to the expected struct types", () => {
    const db = openSeededDb();
    const tableNames = (db.prepare(SQLITE_LIST_TABLES_SQL).all() as { name: string }[]).map((row) => row.name);
    expect(tableNames).toEqual(['orders']);

    const pragmaRows = db.prepare(sqliteTableInfoSql('orders')).all() as unknown as ISqlitePragmaTableInfoRow[];
    const columnRows = pragmaRows.map((row) => sqlitePragmaRowToColumn('orders', row));
    const schema = rowsToSyncedSchema(columnRows, 'sqlite');

    expect(schema.dialect).toBe('sqlite');
    expect(schema.tables).toHaveLength(1);
    const [table] = schema.tables;
    expect(table.name).toBe('orders');
    expect(table.columns.map((c) => c.name)).toEqual(['id', 'status', 'total', 'created_at', 'note']);
    expect(table.columns.find((c) => c.name === 'id')?.primaryKey).toBe(true);
    expect(table.columns.find((c) => c.name === 'note')?.nullable).toBe(true);
    expect(table.columns.find((c) => c.name === 'status')?.nullable).toBe(false);

    const structs = buildTableStructTypes('inst1', 'ShopDb', table, 'sqlite');
    const [row] = structs;
    expect(row.id).toBe('db:inst1:orders');
    // A real SQLite quirk: `PRAGMA table_info`'s `notnull` is 0 for an `INTEGER PRIMARY KEY` rowid
    // alias unless `NOT NULL` was *also* declared explicitly — even though SQLite itself never
    // actually stores a NULL there. `sqlitePragmaRowToColumn` reports what the pragma says, honestly.
    expect(row.properties.id).toEqual({
      type: 'number',
      numberType: { type: 'integer', integerType: 'int64' },
      optional: true,
    });
    expect(row.properties.total).toEqual({
      type: 'number',
      numberType: { type: 'float', floatType: 'float64' },
      optional: true,
    });
    expect(row.properties.note).toEqual({ type: 'string', optional: true });

    db.close();
  });

  it('runs buildInsert/buildSelect/buildUpdate/buildDelete + the operator DSL against a real database', () => {
    const db = openSeededDb();
    const run = (built: { sql: string; params: readonly unknown[] }): void => {
      db.prepare(built.sql).run(...(built.params as never[]));
    };
    const all = (built: { sql: string; params: readonly unknown[] }): unknown[] =>
      db.prepare(built.sql).all(...(built.params as never[]));

    run(buildInsert({ table: 'orders', row: { id: 1, status: 'new', total: 12.5, note: null } }, sqliteDialect));
    run(buildInsert({ table: 'orders', row: { id: 2, status: 'paid', total: 200, note: 'rush' } }, sqliteDialect));
    run(
      buildInsert(
        { table: 'orders', row: { id: 3, status: 'paid', total: 150, note: 'has xylophone' } },
        sqliteDialect,
      ),
    );

    // The exact DSL from the task: status in [...], total > 100, or(note is null, note contains 'x').
    const rows = all(
      buildSelect(
        {
          table: 'orders',
          where: {
            status: { in: ['new', 'paid'] },
            total: { gt: 100 },
            or: [{ note: null }, { note: { contains: 'x' } }],
          },
        },
        sqliteDialect,
      ),
    ) as { id: number }[];
    expect(rows.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([3]);

    const updateResult = buildUpdate({ table: 'orders', set: { status: 'shipped' }, where: { id: 2 } }, sqliteDialect);
    db.prepare(updateResult.sql).run(...(updateResult.params as never[]));
    const afterUpdate = all(buildSelect({ table: 'orders', where: { id: 2 } }, sqliteDialect)) as { status: string }[];
    expect(afterUpdate[0]?.status).toBe('shipped');

    const deleteResult = buildDelete({ table: 'orders', where: { status: 'new' } }, sqliteDialect);
    const info = db.prepare(deleteResult.sql).run(...(deleteResult.params as never[]));
    expect(Number(info.changes)).toBe(1);

    const remaining = all(buildSelect({ table: 'orders' }, sqliteDialect)) as { id: number }[];
    expect(remaining.map((r) => r.id).toSorted((a, b) => a - b)).toEqual([2, 3]);

    db.close();
  });

  it('RETURNING * works (sqlite supports it since 3.35)', () => {
    const db = openSeededDb();
    const insert = buildInsert({ table: 'orders', row: { id: 1, status: 'new', total: 1 } }, sqliteDialect);
    expect(insert.sql).toContain('RETURNING *');
    const returned = db.prepare(insert.sql).all(...(insert.params as never[])) as { id: number; status: string }[];
    expect(returned).toEqual([{ id: 1, status: 'new', total: 1, created_at: null, note: null }]);
    db.close();
  });
});
