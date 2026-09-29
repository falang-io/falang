import type { ISyncedColumn, ISyncedSchema, ISyncedTable, TSqlDialectName } from './schema-types.js';

/**
 * One flat, normalized introspection row — whatever shape a dialect's own introspection query/pragma
 * naturally returns, mapped into this before `rowsToSyncedSchema` groups it into `ISyncedTable`s. Pure
 * data in, pure data out; no driver/DB access happens in this file (see the module doc below).
 */
export interface IIntrospectedColumnRow {
  readonly schema: string | null;
  readonly table: string;
  readonly column: string;
  readonly sqlType: string;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly primaryKey: boolean;
  readonly isArray?: boolean;
  readonly enumValues?: readonly string[];
}

/**
 * `information_schema.columns` + `key_column_usage` (for `primaryKey`) — Postgres also needs
 * `pg_catalog` to tell a real array column (`c.data_type = 'ARRAY'`, element type in `e.udt_name`)
 * and a native enum (`t.typtype = 'e'`) apart from an ordinary scalar column; run as one query,
 * scoped to the connected database's own non-system schemas.
 *
 * This is executed by the backend "Sync structure" hook (a later step, ADR 0039 (private) §4) —
 * this module only owns the SQL text and the pure `rowsToSyncedSchema` mapper, never a live
 * connection, so it stays safe to import into the browser bundle.
 */
export const POSTGRES_INTROSPECTION_SQL = `
SELECT
  c.table_schema AS "schema",
  c.table_name AS "table",
  c.column_name AS "column",
  CASE WHEN c.data_type = 'ARRAY' THEN COALESCE(e.udt_name, 'text') ELSE COALESCE(c.udt_name, c.data_type) END AS "sql_type",
  (c.is_nullable = 'YES') AS "nullable",
  (c.column_default IS NOT NULL) AS "has_default",
  (pk.column_name IS NOT NULL) AS "primary_key",
  (c.data_type = 'ARRAY') AS "is_array",
  enum_vals.enum_values AS "enum_values"
FROM information_schema.columns c
LEFT JOIN information_schema.element_types e
  ON e.object_catalog = c.table_catalog
  AND e.object_schema = c.table_schema
  AND e.object_name = c.table_name
  AND e.object_type = 'TABLE'
  AND e.collection_type_identifier = c.dtd_identifier
LEFT JOIN (
  SELECT ku.table_schema, ku.table_name, ku.column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage ku
    ON ku.constraint_name = tc.constraint_name AND ku.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'PRIMARY KEY'
) pk
  ON pk.table_schema = c.table_schema AND pk.table_name = c.table_name AND pk.column_name = c.column_name
LEFT JOIN LATERAL (
  SELECT array_agg(en.enumlabel ORDER BY en.enumsortorder) AS "enum_values"
  FROM pg_type t
  JOIN pg_enum en ON en.enumtypid = t.oid
  WHERE t.typname = c.udt_name AND t.typtype = 'e'
) enum_vals ON true
WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
ORDER BY c.table_schema, c.table_name, c.ordinal_position;
`.trim();

/** MySQL's `information_schema` has no per-connection default database, so the query is parameterized by the schema (database) name — bind it as `?` (the one positional parameter). */
// `` `schema` `` is a reserved word in MySQL 8 (unlike Postgres, where it's non-reserved) — an
// unquoted `AS schema` alias is a parse error (`ER_PARSE_ERROR` 1064), only ever hit live because
// nothing in dev/unit tests runs this string through a real MySQL parser. Renamed to `table_schema`
// (matching `table_name`/`column_name`'s own already-qualified naming, and `mysqlRowToColumn` below)
// and every alias here is backtick-quoted as a blanket safety net against any of the others turning
// out to be reserved too, now or in a future MySQL version.
export const MYSQL_INTROSPECTION_SQL = `
SELECT
  c.table_schema AS \`table_schema\`,
  c.table_name AS \`table_name\`,
  c.column_name AS \`column_name\`,
  c.data_type AS \`sql_type\`,
  (c.is_nullable = 'YES') AS \`nullable\`,
  (c.column_default IS NOT NULL OR c.extra LIKE '%auto_increment%') AS \`has_default\`,
  (c.column_key = 'PRI') AS \`primary_key\`
FROM information_schema.columns c
WHERE c.table_schema = ?
ORDER BY c.table_name, c.ordinal_position;
`.trim();

/** Lists every user table — SQLite has no `information_schema`; `sqlite_%` are its own internal tables. */
export const SQLITE_LIST_TABLES_SQL = `
SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;
`.trim();

const SQLITE_TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** `PRAGMA table_info` takes no bind parameters in any SQLite driver — the table name (already validated against `sqlite_master`, but re-checked here defensively) is inlined, quoted. */
export const sqliteTableInfoSql = (table: string): string => {
  if (!SQLITE_TABLE_NAME_RE.test(table)) {
    throw new Error(`sql-common: invalid SQLite table name "${table}"`);
  }
  return `PRAGMA table_info("${table}");`;
};

/** One row of a Postgres run of `POSTGRES_INTROSPECTION_SQL` (snake_case as Postgres lower-cases unquoted identifiers). */
export interface IPostgresIntrospectionRow {
  readonly schema: string;
  readonly table: string;
  readonly column: string;
  readonly sql_type: string;
  readonly nullable: boolean;
  readonly has_default: boolean;
  readonly primary_key: boolean;
  readonly is_array: boolean;
  readonly enum_values: readonly string[] | null;
}

export const postgresRowToColumn = (row: IPostgresIntrospectionRow): IIntrospectedColumnRow => ({
  schema: row.schema,
  table: row.table,
  column: row.column,
  sqlType: row.sql_type,
  nullable: row.nullable,
  hasDefault: row.has_default,
  primaryKey: row.primary_key,
  isArray: row.is_array,
  // `enumValues` is optional on `IIntrospectedColumnRow` — spread it in only when Postgres actually
  // reported one, rather than assigning a literal `undefined` (a `null` enum_values means "not an enum").
  ...(row.enum_values ? { enumValues: row.enum_values } : {}),
});

export interface IMysqlIntrospectionRow {
  readonly table_schema: string;
  readonly table_name: string;
  readonly column_name: string;
  readonly sql_type: string;
  readonly nullable: number | boolean;
  readonly has_default: number | boolean;
  readonly primary_key: number | boolean;
}

export const mysqlRowToColumn = (row: IMysqlIntrospectionRow): IIntrospectedColumnRow => ({
  schema: row.table_schema,
  table: row.table_name,
  column: row.column_name,
  sqlType: row.sql_type,
  nullable: Boolean(row.nullable),
  hasDefault: Boolean(row.has_default),
  primaryKey: Boolean(row.primary_key),
});

/** One row of `PRAGMA table_info(<table>)`: `cid`, `name`, `type`, `notnull` (1 = `NOT NULL`), `dflt_value`, `pk` (0 = not part of the primary key, otherwise its 1-based position in it). */
export interface ISqlitePragmaTableInfoRow {
  readonly cid: number;
  readonly name: string;
  readonly type: string;
  readonly notnull: number;
  readonly dflt_value: unknown;
  readonly pk: number;
}

export const sqlitePragmaRowToColumn = (table: string, row: ISqlitePragmaTableInfoRow): IIntrospectedColumnRow => ({
  schema: null,
  table,
  column: row.name,
  // A column with no declared type (legal in SQLite) introspects as `''`, which
  // `sqlTypeToVariableInfo` doesn't recognize and correctly falls back to `any` for.
  sqlType: row.type,
  nullable: row.notnull === 0,
  // oxlint-disable-next-line no-undefined -- see `query-builder.ts`'s `compileColumnFilter` for the same `no-undefined`/`no-typeof-undefined` tension.
  hasDefault: row.dflt_value !== null && row.dflt_value !== undefined,
  primaryKey: row.pk > 0,
});

/** Groups flat introspected column rows into `ISyncedTable`s, preserving each table's own column order — pure, dialect-agnostic (ADR 0039 (private) §4). */
export const rowsToSyncedSchema = (
  rows: readonly IIntrospectedColumnRow[],
  dialect: TSqlDialectName,
): ISyncedSchema => {
  const tableOrder: string[] = [];
  const tablesByKey = new Map<string, { schema: string | null; name: string; columns: ISyncedColumn[] }>();

  for (const row of rows) {
    const key = `${row.schema ?? ''}\u0000${row.table}`;
    let table = tablesByKey.get(key);
    if (!table) {
      table = { schema: row.schema, name: row.table, columns: [] };
      tablesByKey.set(key, table);
      tableOrder.push(key);
    }
    table.columns.push({
      name: row.column,
      sqlType: row.sqlType,
      nullable: row.nullable,
      hasDefault: row.hasDefault,
      primaryKey: row.primaryKey,
      isArray: row.isArray,
      enumValues: row.enumValues,
    });
  }

  const tables: ISyncedTable[] = tableOrder.map((key) => {
    const table = tablesByKey.get(key);
    if (!table) throw new Error('sql-common: internal error building synced schema');
    return table;
  });

  return { syncedAt: new Date().toISOString(), dialect, tables };
};
