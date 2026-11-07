import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { sqlFilterStructTypes } from '@falang/workflow-integrations-sql-common';
import { TABLES_SHARED_ACTIVITY_CODE, tablesActions } from './actions.js';
import { TABLES_VENDOR } from './constants.js';
import { registerTablesBackend } from './tables-backend.js';

/**
 * Built-in project tables (ADR 0075 (private)): a record store inside the product, edited as a grid and
 * read/written by workflows. Platform-owned and credential-free like `files`/`tasks`; actions live in
 * `actions.ts`; triggers are added by T6.
 */
export const tablesIntegration: IWorkflowIntegration = {
  vendor: TABLES_VENDOR,
  label: 'tables:label',
  notes:
    "Project tables: a built-in database of the project's own records (customers, orders, leads, a list of " +
    'tasks…). A table is a document with typed fields; workflows select, get, insert, update and delete its ' +
    'records, and can start on a record being created, changed or deleted. Use it whenever a workflow needs to ' +
    'remember data between runs without an external database.',
  locales: {
    en: () => import('./locales/en.json'),
    ru: () => import('./locales/ru.json'),
  },
  credentialFields: [],
  triggers: [],
  // The per-column filter structs are shared with the SQL vendors (same ids, registration is idempotent).
  types: sqlFilterStructTypes,
  actions: tablesActions,
  sharedActivityCode: TABLES_SHARED_ACTIVITY_CODE,
  registerBackend: registerTablesBackend,
};
