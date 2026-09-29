import type { IFieldConfig } from '@falang/workflow-integrations-common';

/**
 * Shared `ssl` credential field for every SQL dialect package — ADR 0039 (private) §2/§7. Every
 * dialect package spreads this alongside its own `connectionString` field (whose label differs per
 * vendor, e.g. SQLite's "database file path" vs a real connection string) rather than redeclaring the
 * same three options three times. Present (for a uniform `credentialFields` shape) but functionally
 * ignored by the SQLite package, which is a local file, not a network connection.
 */
export const SQL_SSL_CREDENTIAL_FIELD: IFieldConfig = {
  name: 'ssl',
  label: 'sql:field.ssl',
  kind: 'select',
  options: [
    { value: 'prefer', label: 'sql:field.sslOption.prefer' },
    { value: 'require', label: 'sql:field.sslOption.require' },
    { value: 'disable', label: 'sql:field.sslOption.disable' },
  ],
};
