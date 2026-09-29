import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  buildSqlActions,
  buildSqlInstanceTypes,
  buildSqlSharedActivityCode,
  buildSqlSyncVendorData,
  sqlFilterStructTypes,
  SQL_SSL_CREDENTIAL_FIELD,
} from '@falang/workflow-integrations-sql-common';
import { MYSQL_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * MySQL over `mysql2` — ADR 0039 (private) §1: real production-grade dialect (unlike SQLite, which
 * is local/dev-only as a product vendor). `activityPrefix: MYSQL_VENDOR` here must match
 * `buildSqlSharedActivityCode('mysql')`'s own generated function names (`mysqlSelect`, `mysqlInsert`,
 * …) — see that function's own doc comment. MySQL-specific v1 limitations (no `RETURNING`, so `*-insert`
 * re-selects by a numeric `id` primary key; `Insert` typing for `AUTO_INCREMENT` uses `hasDefault`;
 * JSON columns map to `any`) are documented in ADR 0039 (private) §8.
 */
export const mysqlIntegration: IWorkflowIntegration = {
  vendor: MYSQL_VENDOR,
  label: 'mysql:label',
  notes:
    'MySQL/MariaDB database: read/write structured tables via select/insert/update/delete (with a ' +
    'small operator DSL for where — eq/ne/gt/gte/lt/lte/in/notIn/isNull/like/startsWith/contains, ' +
    'and/or nesting), or run raw parameterized SQL. Press "Sync structure" on the credential to make ' +
    'the editor know its tables/columns (typed Row/Insert/Patch/Where structs per table, Monaco ' +
    'completion). Needed whenever a workflow reads or writes a MySQL/MariaDB database.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [
    {
      name: 'connectionString',
      label: 'mysql:field.connectionString',
      kind: 'secret',
      secretProdOptional: true,
    },
    SQL_SSL_CREDENTIAL_FIELD,
  ],
  triggers: [],
  types: [...sqlFilterStructTypes],
  actions: buildSqlActions(MYSQL_VENDOR, { vendor: MYSQL_VENDOR, activityPrefix: MYSQL_VENDOR }),
  sharedActivityCode: buildSqlSharedActivityCode(MYSQL_VENDOR),
  syncVendorData: buildSqlSyncVendorData(MYSQL_VENDOR),
  instanceTypes: buildSqlInstanceTypes(MYSQL_VENDOR),
};
