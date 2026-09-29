import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import {
  buildSqlActions,
  buildSqlInstanceTypes,
  buildSqlSharedActivityCode,
  buildSqlSyncVendorData,
  sqlFilterStructTypes,
  SQL_SSL_CREDENTIAL_FIELD,
} from '@falang/workflow-integrations-sql-common';
import { SQLITE_VENDOR } from './constants.js';

export * from './constants.js';

/**
 * SQLite over Node's built-in `node:sqlite` — ADR 0039 (private) §1: the third dialect, deliberately
 * local/dev-only as a *product* vendor (a runner pod's filesystem is read-only except an ephemeral
 * `/tmp`, so a SQLite database inside one doesn't survive scale-to-zero — see ADR 0016 (private)).
 * Its real payoff is that `@falang/workflow-integrations-sql-common`'s query builder/introspection/type
 * mapping get unit-tested against a real engine with no Docker and no network (see that package's
 * `sql-e2e-sqlite.test.ts`), and that the dialect seam has three real implementers from day one, not
 * two-plus-a-mock.
 *
 * `activityPrefix: SQLITE_VENDOR` here must match `buildSqlSharedActivityCode('sqlite')`'s own
 * generated function names (`sqliteSelect`, `sqliteInsert`, …) — see that function's own doc comment.
 */
export const sqliteIntegration: IWorkflowIntegration = {
  vendor: SQLITE_VENDOR,
  label: 'sqlite:label',
  notes:
    'SQLite database (local file, or an in-memory database): read/write structured tables via ' +
    'select/insert/update/delete, or run raw SQL. Local/dev-only as a product vendor — a production ' +
    "runner pod's filesystem is ephemeral, so a SQLite file there does not survive a scale-to-zero " +
    'restart. Honest use cases: the dev/e2e stack, a self-hosted single-node deployment with a mounted ' +
    'volume, and tests. For a database that must survive in production, use Postgres or MySQL instead.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [
    {
      name: 'connectionString',
      label: 'sqlite:field.connectionString',
      kind: 'secret',
      secretProdOptional: true,
    },
    // Present for a `credentialFields` shape uniform with the postgres/mysql packages, but
    // functionally ignored here — SQLite is a local file, not a network connection (ADR 0039 (private) §2).
    SQL_SSL_CREDENTIAL_FIELD,
  ],
  triggers: [],
  types: [...sqlFilterStructTypes],
  actions: buildSqlActions(SQLITE_VENDOR, { vendor: SQLITE_VENDOR, activityPrefix: SQLITE_VENDOR }),
  sharedActivityCode: buildSqlSharedActivityCode(SQLITE_VENDOR),
  syncVendorData: buildSqlSyncVendorData(SQLITE_VENDOR),
  instanceTypes: buildSqlInstanceTypes(SQLITE_VENDOR),
};
