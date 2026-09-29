import type { IIntegrationInstance, IIntegrationStructType } from '@falang/workflow-integrations-common';
import { buildTableStructTypes } from './filter-types.js';
import {
  MYSQL_INTROSPECTION_SQL,
  POSTGRES_INTROSPECTION_SQL,
  SQLITE_LIST_TABLES_SQL,
  mysqlRowToColumn,
  postgresRowToColumn,
  rowsToSyncedSchema,
  sqlitePragmaRowToColumn,
  sqliteTableInfoSql,
  type IMysqlIntrospectionRow,
  type IPostgresIntrospectionRow,
  type ISqlitePragmaTableInfoRow,
} from './introspection.js';
import type { ISyncedSchema, TSqlDialectName } from './schema-types.js';

/** `ssl` resolves to `''` when the user never touched the field — same "not configured, use a safe default" fallback `credential-resolution.ts`'s `resolveSqlCredentialField` applies at runtime. */
const sslOrDefault = (credentialFields: Readonly<Record<string, string>>): string => credentialFields.ssl || 'prefer';

const syncPostgresSchema = async (credentialFields: Readonly<Record<string, string>>): Promise<ISyncedSchema> => {
  const { Client } = await import('pg');
  const sslMode = sslOrDefault(credentialFields);
  const client = new Client({
    connectionString: credentialFields.connectionString,
    // oxlint-disable-next-line no-undefined -- `pg`'s own `ssl` option type distinguishes "off" (undefined) from a config object; there's no other way to say "no TLS" here.
    ssl: sslMode === 'disable' ? undefined : { rejectUnauthorized: sslMode === 'require' },
  });
  await client.connect();
  try {
    const result = await client.query(POSTGRES_INTROSPECTION_SQL);
    const rows = (result.rows as IPostgresIntrospectionRow[]).map((row) => postgresRowToColumn(row));
    return rowsToSyncedSchema(rows, 'postgres');
  } finally {
    await client.end();
  }
};

const syncMysqlSchema = async (credentialFields: Readonly<Record<string, string>>): Promise<ISyncedSchema> => {
  const mysql = await import('mysql2/promise');
  const sslMode = sslOrDefault(credentialFields);
  const connection = await mysql.createConnection({
    uri: credentialFields.connectionString,
    // oxlint-disable-next-line no-undefined -- same tension as syncPostgresSchema's own ssl option above.
    ssl: sslMode === 'disable' ? undefined : {},
  });
  try {
    const [databaseRows] = await connection.query('SELECT DATABASE() AS db');
    const schemaName = (databaseRows as unknown as { db: string }[])[0]?.db ?? '';
    const [rows] = await connection.query(MYSQL_INTROSPECTION_SQL, [schemaName]);
    const columns = (rows as unknown as IMysqlIntrospectionRow[]).map((row) => mysqlRowToColumn(row));
    return rowsToSyncedSchema(columns, 'mysql');
  } finally {
    await connection.end();
  }
};

const syncSqliteSchema = async (credentialFields: Readonly<Record<string, string>>): Promise<ISyncedSchema> => {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(credentialFields.connectionString);
  try {
    const tableNames = (db.prepare(SQLITE_LIST_TABLES_SQL).all() as { name: string }[]).map((row) => row.name);
    const columns = tableNames.flatMap((table) => {
      const pragmaRows = db.prepare(sqliteTableInfoSql(table)).all() as unknown as ISqlitePragmaTableInfoRow[];
      return pragmaRows.map((row) => sqlitePragmaRowToColumn(table, row));
    });
    return rowsToSyncedSchema(columns, 'sqlite');
  } finally {
    db.close();
  }
};

/**
 * `IWorkflowIntegration.syncVendorData` for a SQL dialect — ADR 0039 (private) §4. Connects with the
 * given (always dev, in practice — see that field's own doc comment) resolved credential fields, runs
 * the dialect's own introspection query/pragma, and returns `{ schema: ISyncedSchema }` ready for
 * `IntegrationVendorDataService.set`. The `pg`/`mysql2`/`node:sqlite` drivers are imported lazily
 * inside each branch, never at this module's own top level — this package also ships in the browser
 * bundle (the workflow editor), which must never try to resolve a Node-only driver.
 */
export const buildSqlSyncVendorData =
  (
    dialectName: TSqlDialectName,
  ): ((
    credentialFields: Readonly<Record<string, string>>,
    env: 'dev' | 'prod',
  ) => Promise<Record<string, Record<string, unknown>>>) =>
  async (credentialFields) => {
    switch (dialectName) {
      case 'postgres': {
        return { schema: (await syncPostgresSchema(credentialFields)) as unknown as Record<string, unknown> };
      }
      case 'mysql': {
        return { schema: (await syncMysqlSchema(credentialFields)) as unknown as Record<string, unknown> };
      }
      case 'sqlite': {
        return { schema: (await syncSqliteSchema(credentialFields)) as unknown as Record<string, unknown> };
      }
      default: {
        const exhaustive: never = dialectName;
        throw new Error(`sql-common: unknown SQL dialect "${String(exhaustive)}"`);
      }
    }
  };

/**
 * `IWorkflowIntegration.instanceTypes` for a SQL dialect — ADR 0039 (private) §5: one `Row`/`Insert`/
 * `Patch`/`Where` struct set per synced table, `[]` when nothing has been synced yet.
 */
export const buildSqlInstanceTypes =
  (
    dialectName: TSqlDialectName,
  ): ((
    instance: IIntegrationInstance,
    vendorData: Readonly<Record<string, Record<string, unknown>>>,
  ) => readonly IIntegrationStructType[]) =>
  (instance, vendorData) => {
    const schema = vendorData.schema as unknown as ISyncedSchema | undefined;
    if (!schema) return [];
    return schema.tables.flatMap((table) => buildTableStructTypes(instance.id, instance.name, table, dialectName));
  };
