import { describe, expect, it } from 'vitest';
import {
  MYSQL_INTROSPECTION_SQL,
  POSTGRES_INTROSPECTION_SQL,
  mysqlRowToColumn,
  postgresRowToColumn,
  sqliteTableInfoSql,
  type IMysqlIntrospectionRow,
  type IPostgresIntrospectionRow,
} from './introspection.js';

/**
 * MySQL 8.0 reserved words that show up (or could plausibly show up) as an unquoted `AS <alias>` in
 * these introspection queries — `schema`/`table`/`key` are all reserved; `column`/`order`/`index` are
 * too but aren't used as aliases here today. An unquoted reserved-word alias is a parse error
 * (`ER_PARSE_ERROR` 1064) only a real MySQL server catches — see ADR 0039 (private)'s own note on
 * this. This list intentionally includes a few not currently used, so a future alias addition gets
 * checked automatically instead of relying on someone remembering to re-audit by hand.
 */
const MYSQL_RESERVED_ALIAS_CANDIDATES = ['schema', 'table', 'key', 'column', 'order', 'index', 'group'];

/** Every `AS <alias>` in a SQL string, in order — case-insensitive, tolerant of backtick/double quotes around the alias. */
const extractAliases = (sql: string): { readonly raw: string; readonly quoted: boolean }[] =>
  [...sql.matchAll(/\bAS\s+(`([^`]+)`|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/gi)].map((match) => ({
    raw: (match[2] ?? match[3] ?? match[4]).toLowerCase(),
    quoted: Boolean(match[2] || match[3]),
  }));

describe('MYSQL_INTROSPECTION_SQL', () => {
  it('backtick-quotes every alias', () => {
    const aliases = extractAliases(MYSQL_INTROSPECTION_SQL);
    expect(aliases.length).toBeGreaterThan(0);
    for (const alias of aliases) {
      expect(alias.quoted, `alias "${alias.raw}" must be backtick-quoted`).toBe(true);
    }
  });

  it('never aliases a column to an unquoted MySQL-8-reserved word', () => {
    // Every alias is quoted (asserted above), so this is a belt-and-suspenders check that none of the
    // reserved-word candidates sneak in unquoted if that invariant ever regresses.
    const unquotedAliases = [...MYSQL_INTROSPECTION_SQL.matchAll(/\bAS\s+([A-Za-z_][A-Za-z0-9_]*)\b/gi)].map((m) =>
      m[1].toLowerCase(),
    );
    for (const reserved of MYSQL_RESERVED_ALIAS_CANDIDATES) {
      expect(unquotedAliases).not.toContain(reserved);
    }
  });

  it("renamed the schema alias to table_schema (MySQL's `schema` is reserved)", () => {
    expect(MYSQL_INTROSPECTION_SQL).toContain('AS `table_schema`');
    expect(MYSQL_INTROSPECTION_SQL).not.toMatch(/AS\s+`?schema`?\b/i);
  });
});

describe('POSTGRES_INTROSPECTION_SQL', () => {
  it('double-quotes every alias', () => {
    const aliases = extractAliases(POSTGRES_INTROSPECTION_SQL);
    expect(aliases.length).toBeGreaterThan(0);
    for (const alias of aliases) {
      expect(alias.quoted, `alias "${alias.raw}" must be double-quoted`).toBe(true);
    }
  });
});

describe('mysqlRowToColumn', () => {
  it('reads the renamed table_schema alias, not the old (reserved, now-gone) schema field', () => {
    const row: IMysqlIntrospectionRow = {
      table_schema: 'shop',
      table_name: 'orders',
      column_name: 'id',
      sql_type: 'int',
      nullable: 0,
      has_default: 1,
      primary_key: 1,
    };
    expect(mysqlRowToColumn(row)).toEqual({
      schema: 'shop',
      table: 'orders',
      column: 'id',
      sqlType: 'int',
      nullable: false,
      hasDefault: true,
      primaryKey: true,
    });
  });
});

describe('postgresRowToColumn', () => {
  it('still maps the (unrenamed, non-reserved-in-Postgres) schema alias', () => {
    const row: IPostgresIntrospectionRow = {
      schema: 'public',
      table: 'orders',
      column: 'id',
      sql_type: 'int4',
      nullable: false,
      has_default: true,
      primary_key: true,
      is_array: false,
      enum_values: null,
    };
    expect(postgresRowToColumn(row)).toEqual({
      schema: 'public',
      table: 'orders',
      column: 'id',
      sqlType: 'int4',
      nullable: false,
      hasDefault: true,
      primaryKey: true,
      isArray: false,
    });
  });
});

describe('sqliteTableInfoSql', () => {
  it('quotes a valid table name', () => {
    expect(sqliteTableInfoSql('orders')).toBe('PRAGMA table_info("orders");');
  });

  it('rejects a table name that is not a plain identifier', () => {
    expect(() => sqliteTableInfoSql('orders"; DROP TABLE orders; --')).toThrow(/invalid SQLite table name/);
  });
});
