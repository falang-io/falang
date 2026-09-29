/**
 * The dialect-neutral shape of a synced schema — see ADR 0039 (private) §4.
 * Produced by a backend "Sync structure" hook (a later step) from a live introspection query
 * (`introspection.ts`), stored as `IntegrationVendorDataService`'s `'schema'` key, and consumed by
 * `build-sql-integration.ts`'s per-table struct types (`buildTableStructTypes`, see `filter-types.ts`).
 */
export type TSqlDialectName = 'postgres' | 'mysql' | 'sqlite';

/**
 * One column of one synced table. `sqlType` is the dialect's own raw type name (e.g. Postgres'
 * `character varying`, MySQL's `tinyint`, SQLite's declared column type) — `sql-type-mapping.ts`
 * normalizes it, this shape doesn't. `isArray`/`enumValues` are Postgres-only concepts (array
 * columns, native `enum` types); absent for MySQL/SQLite.
 */
export interface ISyncedColumn {
  readonly name: string;
  readonly sqlType: string;
  readonly nullable: boolean;
  readonly hasDefault: boolean;
  readonly primaryKey: boolean;
  readonly isArray?: boolean;
  readonly enumValues?: readonly string[];
}

/** `schema` is `null` for dialects with no schema concept (SQLite) or when introspection didn't resolve one. */
export interface ISyncedTable {
  readonly schema: string | null;
  readonly name: string;
  readonly columns: readonly ISyncedColumn[];
}

export interface ISyncedSchema {
  readonly syncedAt: string;
  readonly dialect: TSqlDialectName;
  readonly tables: readonly ISyncedTable[];
}
