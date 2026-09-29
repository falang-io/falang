import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  buildSqlActions,
  buildSqlInstanceTypes,
  buildSqlSharedActivityCode,
  buildSqlSyncVendorData,
  sqlFilterStructTypes,
  SQL_SSL_CREDENTIAL_FIELD,
} from '@falang/workflow-integrations-sql-common';
import { POSTGRES_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * Postgres over `pg` — ADR 0039 (private) §1: real production-grade dialect (unlike SQLite, which is
 * local/dev-only as a product vendor). `activityPrefix: POSTGRES_VENDOR` here must match
 * `buildSqlSharedActivityCode('postgres')`'s own generated function names (`postgresSelect`,
 * `postgresInsert`, …) — see that function's own doc comment.
 */
export const postgresIntegration: IWorkflowIntegration = {
  vendor: POSTGRES_VENDOR,
  label: 'postgres:label',
  notes:
    'PostgreSQL database: read/write structured tables via select/insert/update/delete (with a small ' +
    'operator DSL for where — eq/ne/gt/gte/lt/lte/in/notIn/isNull/like/ilike/startsWith/contains, ' +
    'and/or nesting), or run raw parameterized SQL. Press "Sync structure" on the credential to make ' +
    'the editor know its tables/columns (typed Row/Insert/Patch/Where structs per table, Monaco ' +
    'completion). Needed whenever a workflow reads or writes a Postgres/Postgres-compatible database.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [
    {
      name: 'connectionString',
      label: 'postgres:field.connectionString',
      kind: 'secret',
      secretProdOptional: true,
    },
    SQL_SSL_CREDENTIAL_FIELD,
  ],
  triggers: [],
  types: [...sqlFilterStructTypes],
  actions: buildSqlActions(POSTGRES_VENDOR, { vendor: POSTGRES_VENDOR, activityPrefix: POSTGRES_VENDOR }),
  sharedActivityCode: buildSqlSharedActivityCode(POSTGRES_VENDOR),
  syncVendorData: buildSqlSyncVendorData(POSTGRES_VENDOR),
  instanceTypes: buildSqlInstanceTypes(POSTGRES_VENDOR),
};
