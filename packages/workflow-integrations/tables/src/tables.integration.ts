import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { sqlFilterStructTypes } from '@falang/workflow-integrations-sql-common';
import { TABLES_VENDOR } from './constants.js';

/**
 * Built-in project tables (ADR 0075 (private)): a record store inside the product, edited as a grid and
 * read/written by workflows. Platform-owned and credential-free like `files`/`tasks`; actions and triggers
 * are added by the next implementation steps (T3/T6) — this is the contract skeleton.
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
  actions: [],
};
