import type {
  IBackendEgress,
  IIntegrationInstance,
  IIntegrationStructType,
} from '@falang/workflow-integrations-common';
import { isIpLiteral, parseSqlConnectionString } from './connection-string.js';
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

const requireEgress = (egress: IBackendEgress | undefined): IBackendEgress => {
  if (!egress)
    throw new Error('"Sync structure" needs the backend egress guard (IBackendEgress) for network databases');
  return egress;
};

const CONNECT_TIMEOUT_MS = 10_000;

const portOption = (port: number | null): { port?: number } => (port === null ? {} : { port });

/** TLS options for the connection to the *checked IP*: certificate verification still happens against the original host name. */
const tlsOptions = (sslMode: string, host: string, mode: 'pg' | 'mysql'): { ssl?: Record<string, unknown> } => {
  if (sslMode === 'disable') return {};
  const servername = isIpLiteral(host) ? {} : { servername: host };
  return { ssl: mode === 'pg' ? { rejectUnauthorized: sslMode === 'require', ...servername } : { ...servername } };
};

const syncPostgresSchema = async (
  credentialFields: Readonly<Record<string, string>>,
  egress: IBackendEgress | undefined,
): Promise<ISyncedSchema> => {
  const target = parseSqlConnectionString('postgres', credentialFields.connectionString ?? '');
  // Connect to the checked IP, not the name (DNS rebinding); TLS keeps verifying against the original name.
  const address = await requireEgress(egress).resolveHost(target.host);
  const { Client } = await import('pg');
  const sslMode = sslOrDefault(credentialFields);
  const client = new Client({
    host: address,
    ...portOption(target.port),
    user: target.user,
    password: target.password,
    database: target.database,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    statement_timeout: 50_000,
    ...tlsOptions(sslMode, target.host, 'pg'),
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

const syncMysqlSchema = async (
  credentialFields: Readonly<Record<string, string>>,
  egress: IBackendEgress | undefined,
): Promise<ISyncedSchema> => {
  const target = parseSqlConnectionString('mysql', credentialFields.connectionString ?? '');
  const address = await requireEgress(egress).resolveHost(target.host);
  const mysql = await import('mysql2/promise');
  const sslMode = sslOrDefault(credentialFields);
  const connection = await mysql.createConnection({
    host: address,
    ...portOption(target.port),
    user: target.user,
    password: target.password,
    database: target.database,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Never let a (malicious) server read files off the backend via LOAD DATA LOCAL INFILE.
    flags: ['-LOCAL_FILES'],
    infileStreamFactory: () => {
      throw new Error('LOAD DATA LOCAL INFILE is disabled');
    },
    // `servername` is a valid `tls.connect` option that mysql2's own `SslOptions` typing just doesn't list.
    ...(tlsOptions(sslMode, target.host, 'mysql') as { ssl?: never }),
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
    ctx?: { readonly egress?: IBackendEgress },
  ) => Promise<Record<string, Record<string, unknown>>>) =>
  async (credentialFields, _env, ctx) => {
    switch (dialectName) {
      case 'postgres': {
        return {
          schema: (await syncPostgresSchema(credentialFields, ctx?.egress)) as unknown as Record<string, unknown>,
        };
      }
      case 'mysql': {
        return { schema: (await syncMysqlSchema(credentialFields, ctx?.egress)) as unknown as Record<string, unknown> };
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
