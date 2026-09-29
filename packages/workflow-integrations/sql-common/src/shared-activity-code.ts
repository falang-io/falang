import type { TSqlDialectName } from './schema-types.js';

/** `"postgres"` -> `"Postgres"` — used to build a dialect-prefixed identifier (`IPostgresRunQueryResult`, …). */
const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/**
 * `resolveSqlCredentialField` is a *real* export of this package (`credential-resolution.ts`), imported
 * here with one line identical across every dialect — never redeclared as a bare per-dialect
 * `const resolveConnectionString = …`, which collided once two dialects' shared activity code was
 * concatenated into one `activities.ts` module (`compileActivities` only dedupes textually-identical
 * `import …` lines, not arbitrary declarations — see `compile-project-documents.test.ts`'s "every
 * REGISTERED_INTEGRATIONS at once" test and ADR 0039 (private) §7). Every other per-dialect
 * declaration below (`getPool`, `runQuery`, `mapSqlError`, the pool cache, the dialect const, …)
 * genuinely differs per driver and is instead disambiguated by prefixing every name with the dialect.
 */
const IMPORT_RESOLVE_CREDENTIAL_FIELD =
  "import { resolveSqlCredentialField } from '@falang/workflow-integrations-sql-common';";

/** One pooled driver connection per `credentialId` — a runner pod serves one project/env, so this is the right granularity (ADR 0039 (private) §7). Every declared name is prefixed by `dialectName` (see this module's own doc comment). */
const buildPoolCache = (dialectName: TSqlDialectName): string => {
  const pools = `${dialectName}Pools`;
  const getPool = `${dialectName}GetPool`;
  switch (dialectName) {
    case 'postgres': {
      return [
        `const ${pools} = new Map<string, import('pg').Pool>();`,
        `const ${getPool} = async (credentialId: string): Promise<import('pg').Pool> => {`,
        `  const existing = ${pools}.get(credentialId);`,
        '  if (existing) return existing;',
        "  const { Pool, types } = await import('pg');",
        "  const connectionString = await resolveSqlCredentialField(credentialId, 'postgres', 'connectionString');",
        "  const sslMode = await resolveSqlCredentialField(credentialId, 'postgres', 'ssl', 'prefer');",
        '  // Return temporal columns as raw ISO-ish strings, not JS `Date` objects, so what Monaco',
        '  // declared (`string`, see sql-type-mapping.ts) matches what the workflow actually gets.',
        '  const rawStringParser = (value: string): string => value;',
        '  types.setTypeParser(1082, rawStringParser); // date',
        '  types.setTypeParser(1114, rawStringParser); // timestamp without time zone',
        '  types.setTypeParser(1184, rawStringParser); // timestamptz',
        '  const pool = new Pool({',
        '    connectionString,',
        "    ssl: sslMode === 'disable' ? undefined : { rejectUnauthorized: sslMode === 'require' },",
        '    max: 5,',
        '    idleTimeoutMillis: 60_000,',
        '    statement_timeout: 50_000,',
        '  });',
        `  ${pools}.set(credentialId, pool);`,
        '  return pool;',
        '};',
      ].join('\n');
    }
    case 'mysql': {
      return [
        `const ${pools} = new Map<string, import('mysql2/promise').Pool>();`,
        `const ${getPool} = async (credentialId: string): Promise<import('mysql2/promise').Pool> => {`,
        `  const existing = ${pools}.get(credentialId);`,
        '  if (existing) return existing;',
        "  const mysql = await import('mysql2/promise');",
        "  const connectionString = await resolveSqlCredentialField(credentialId, 'mysql', 'connectionString');",
        "  const sslMode = await resolveSqlCredentialField(credentialId, 'mysql', 'ssl', 'prefer');",
        '  const pool = mysql.createPool({',
        '    uri: connectionString,',
        "    ssl: sslMode === 'disable' ? undefined : {},",
        '    waitForConnections: true,',
        '    connectionLimit: 5,',
        '    dateStrings: true,',
        '  });',
        "  pool.on('connection', (connection) => {",
        "    // Runtime hands back the raw callback-API connection here despite `mysql2/promise`'s `.d.ts` — `as any` sidesteps that without a bare `mysql2` import.",
        "    (connection as any).query('SET SESSION MAX_EXECUTION_TIME=50000', () => {",
        '      // Best-effort — older MySQL/MariaDB builds without this session variable still get a',
        '      // working connection, just without the server-side statement-timeout backstop.',
        '    });',
        '  });',
        `  ${pools}.set(credentialId, pool);`,
        '  return pool;',
        '};',
      ].join('\n');
    }
    case 'sqlite': {
      return [
        `const ${pools} = new Map<string, import('node:sqlite').DatabaseSync>();`,
        `const ${getPool} = async (credentialId: string): Promise<import('node:sqlite').DatabaseSync> => {`,
        `  const existing = ${pools}.get(credentialId);`,
        '  if (existing) return existing;',
        "  const { DatabaseSync } = await import('node:sqlite');",
        "  const connectionString = await resolveSqlCredentialField(credentialId, 'sqlite', 'connectionString');",
        '  const db = new DatabaseSync(connectionString);',
        `  ${pools}.set(credentialId, db);`,
        '  return db;',
        '};',
      ].join('\n');
    }
    default: {
      const exhaustive: never = dialectName;
      throw new Error(`sql-common: unknown SQL dialect "${String(exhaustive)}"`);
    }
  }
};

/** Driver-error -> `ApplicationFailure` mapping (ADR 0039 (private) §7): `type` is the SQL state/error code, `message` never includes parameter values, and a connection-severed-after-send error gets the distinct `SQL_UNCERTAIN` type. Every declared name is prefixed by `dialectName` (see this module's own doc comment) — only the `@temporalio/activity` import line itself stays unprefixed, since it's textually identical across dialects and dedupes fine on its own. */
const buildMapSqlError = (dialectName: TSqlDialectName): string => {
  const errorCodesConst = `${dialectName.toUpperCase()}_UNCERTAIN_ERROR_CODES`;
  const mapSqlError = `${dialectName}MapSqlError`;
  return [
    "import { ApplicationFailure } from '@temporalio/activity';",
    '',
    `const ${errorCodesConst} = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST']);`,
    '',
    `const ${mapSqlError} = (err: unknown): ApplicationFailure => {`,
    '  const driverError = err as { code?: string; errno?: number; message?: string };',
    `  const isUncertain = Boolean(driverError.code && ${errorCodesConst}.has(driverError.code));`,
    "  const type = isUncertain ? 'SQL_UNCERTAIN' : (driverError.code ?? 'SQL_ERROR');",
    '  return ApplicationFailure.create({ type, message: `SQL error (${type})` });',
    '};',
  ].join('\n');
};

const buildRunQueryBody = (dialectName: TSqlDialectName): readonly string[] => {
  const getPool = `${dialectName}GetPool`;
  const mapSqlError = `${dialectName}MapSqlError`;
  switch (dialectName) {
    case 'postgres': {
      return [
        `  const pool = await ${getPool}(credentialId);`,
        '  try {',
        '    const result = await pool.query(sql, params as unknown[]);',
        '    return { rows: result.rows, affected: result.rowCount ?? 0 };',
        '  } catch (err) {',
        `    throw ${mapSqlError}(err);`,
        '  }',
      ];
    }
    case 'mysql': {
      return [
        `  const pool = await ${getPool}(credentialId);`,
        '  try {',
        '    const [result] = await pool.query(sql, params as unknown[]);',
        '    if (Array.isArray(result)) return { rows: result as unknown[], affected: result.length };',
        '    const okResult = result as { affectedRows: number; insertId: number };',
        '    return { rows: [], affected: okResult.affectedRows, insertId: okResult.insertId };',
        '  } catch (err) {',
        `    throw ${mapSqlError}(err);`,
        '  }',
      ];
    }
    case 'sqlite': {
      return [
        `  const db = await ${getPool}(credentialId);`,
        '  try {',
        String.raw`    const returnsRows = /^\s*select/i.test(sql) || /returning/i.test(sql);`,
        '    const stmt = db.prepare(sql);',
        '    if (returnsRows) {',
        // `node:sqlite`'s `.all`/`.run` type their spread args as `SQLInputValue`, not `unknown` — a
        // real, previously-latent type error only surfaced once SQLite was actually wired into
        // `REGISTERED_INTEGRATIONS` for real (see `compile-project-documents.test.ts`'s "every
        // REGISTERED_INTEGRATIONS at once" regression test). `never[]` is assignable to any spread
        // parameter type, same "we don't know the real value shape yet" cast this file's own
        // `buildActionFunctions` already uses (`where: where as never`).
        '      const rows = stmt.all(...(params as never[])) as unknown[];',
        '      return { rows, affected: rows.length };',
        '    }',
        '    const result = stmt.run(...(params as never[]));',
        '    return {',
        '      rows: [],',
        '      affected: Number(result.changes),',
        '      insertId: result.lastInsertRowid === undefined ? undefined : Number(result.lastInsertRowid),',
        '    };',
        '  } catch (err) {',
        `    throw ${mapSqlError}(err);`,
        '  }',
      ];
    }
    default: {
      const exhaustive: never = dialectName;
      throw new Error(`sql-common: unknown SQL dialect "${String(exhaustive)}"`);
    }
  }
};

/** Dialect-agnostic call: runs one already-built `{ sql, params }`, returns `{ rows, affected, insertId? }`. `runQuery`'s own name and result-shape interface are prefixed by `dialectName` (see this module's own doc comment). */
const buildRunQuery = (dialectName: TSqlDialectName): string => {
  const Prefix = capitalize(dialectName);
  const runQuery = `${dialectName}RunQuery`;
  const resultInterface = `I${Prefix}RunQueryResult`;
  return [
    buildMapSqlError(dialectName),
    '',
    `interface ${resultInterface} {`,
    '  readonly rows: unknown[];',
    '  readonly affected: number;',
    '  readonly insertId?: number | string;',
    '}',
    '',
    `const ${runQuery} = async (credentialId: string, sql: string, params: readonly unknown[]): Promise<${resultInterface}> => {`,
    ...buildRunQueryBody(dialectName),
    '};',
  ].join('\n');
};

/** `${prefix}Select`/`SelectOne`/`Insert`/`Update`/`Delete`/`Query` — the exported functions `buildSqlActions`'s `activitySignature`s name. */
const buildActionFunctions = (prefix: string): string => {
  const runQuery = `${prefix}RunQuery`;
  const dialectConst = `${prefix}Dialect`;
  return [
    "import { buildDelete, buildInsert, buildSelect, buildUpdate, dialectByName } from '@falang/workflow-integrations-sql-common';",
    `const ${dialectConst} = dialectByName('${prefix}');`,
    '',
    `export const ${prefix}Select = async (`,
    '  credentialId: string,',
    '  table: string,',
    '  where: unknown,',
    '  orderBy: string,',
    '  limit: string,',
    '): Promise<unknown[]> => {',
    '  const parsedLimit = limit ? Number(limit) : undefined;',
    '  const { sql, params } = buildSelect(',
    '    { table, where: where as never, orderBy: orderBy || undefined, limit: parsedLimit },',
    `    ${dialectConst},`,
    '  );',
    `  const result = await ${runQuery}(credentialId, sql, params);`,
    '  return result.rows;',
    '};',
    '',
    `export const ${prefix}SelectOne = async (credentialId: string, table: string, where: unknown): Promise<unknown> => {`,
    `  const { sql, params } = buildSelect({ table, where: where as never, limit: 1 }, ${dialectConst});`,
    `  const result = await ${runQuery}(credentialId, sql, params);`,
    `  if (result.rows.length === 0) throw new Error(\`${prefix}SelectOne: no row found in "\${table}"\`);`,
    '  return result.rows[0];',
    '};',
    '',
    `export const ${prefix}Insert = async (credentialId: string, table: string, row: unknown): Promise<unknown> => {`,
    `  const { sql, params } = buildInsert({ table, row: row as never }, ${dialectConst});`,
    `  const result = await ${runQuery}(credentialId, sql, params);`,
    '  if (result.rows.length > 0) return result.rows[0];',
    '  if (result.insertId === undefined) return undefined;',
    '  // No `RETURNING` (MySQL) — re-select by the inserted id. Assumes a numeric, single-column',
    '  // primary key literally named "id"; a table with a differently-named or composite key is a',
    '  // documented v1 limitation (ADR 0039 (private) §8 leaves MySQL specifics deferred).',
    `  return ${prefix}SelectOne(credentialId, table, { id: result.insertId });`,
    '};',
    '',
    `export const ${prefix}Update = async (`,
    '  credentialId: string,',
    '  table: string,',
    '  set: unknown,',
    '  where: unknown,',
    '): Promise<number> => {',
    `  const { sql, params } = buildUpdate({ table, set: set as never, where: where as never }, ${dialectConst});`,
    `  const result = await ${runQuery}(credentialId, sql, params);`,
    '  return result.affected;',
    '};',
    '',
    `export const ${prefix}Delete = async (credentialId: string, table: string, where: unknown): Promise<number> => {`,
    `  const { sql, params } = buildDelete({ table, where: where as never }, ${dialectConst});`,
    `  const result = await ${runQuery}(credentialId, sql, params);`,
    '  return result.affected;',
    '};',
    '',
    `export const ${prefix}Query = async (`,
    '  credentialId: string,',
    '  sql: string,',
    '  params: unknown[],',
    '): Promise<unknown[]> => {',
    `  const result = await ${runQuery}(credentialId, sql, params ?? []);`,
    '  return result.rows;',
    '};',
  ].join('\n');
};

/**
 * Verbatim TS emitted once into `activities.ts` (see `IWorkflowIntegration.sharedActivityCode`) for a
 * SQL dialect vendor — credential resolution (a real `sql-common` import, see
 * `IMPORT_RESOLVE_CREDENTIAL_FIELD`'s own doc comment above), a pooled driver connection cache, a
 * dialect-agnostic `runQuery`, and the six action functions (`buildSqlActions`'s activity descriptors
 * all reference these, with empty `activityCode` of their own — see that module's own doc comment for
 * why, and ADR 0009 (private)'s existing precedent of activities with `activityCode: ''`).
 *
 * `pg`/`mysql2`/`node:sqlite` are imported only *inside* this generated string, at the driver-selection
 * branch matching `dialectName` — never at this module's own top level, since this package (like every
 * `workflow-integrations/*`) also ships in the browser bundle (the workflow client's editor).
 *
 * Not executed as real code by this package's own tests — `sql-e2e-sqlite.test.ts` drives
 * `query-builder.ts`/`introspection.ts` directly against a real `node:sqlite` database instead;
 * covering *this* string is limited to asserting its expected imports/function names (a snapshot).
 *
 * Every declared name a dialect's own generated block introduces (`getPool`, `runQuery`, `mapSqlError`,
 * the pool cache, the `dialect` const, the result interface, the error-codes set) is prefixed by
 * `dialectName`, so registering more than one SQL dialect vendor concatenates fine into one
 * `activities.ts` module (`compileActivities` only dedupes textually-identical `import …` lines).
 */
export const buildSqlSharedActivityCode = (dialectName: TSqlDialectName): string =>
  [
    IMPORT_RESOLVE_CREDENTIAL_FIELD,
    '',
    buildPoolCache(dialectName),
    '',
    buildRunQuery(dialectName),
    '',
    buildActionFunctions(dialectName),
  ].join('\n');
