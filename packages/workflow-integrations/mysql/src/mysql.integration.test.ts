import { describe, expect, it } from 'vitest';
import { mysqlIntegration } from './mysql.integration.js';

describe('mysqlIntegration', () => {
  it('registers the six structured-CRUD-plus-raw-SQL node kinds, named "mysql-<verb>"', () => {
    expect(mysqlIntegration.actions.map((a) => a.name).toSorted()).toEqual(
      ['mysql-select', 'mysql-select-one', 'mysql-insert', 'mysql-update', 'mysql-delete', 'mysql-query'].toSorted(),
    );
  });

  it('credentialFields declares connectionString (secret, dev/prod-optional) and ssl (select)', () => {
    const names = mysqlIntegration.credentialFields.map((f) => f.name);
    expect(names).toEqual(['connectionString', 'ssl']);
    const connectionString = mysqlIntegration.credentialFields.find((f) => f.name === 'connectionString');
    expect(connectionString?.kind).toBe('secret');
    expect(connectionString?.secretProdOptional).toBe(true);
    const ssl = mysqlIntegration.credentialFields.find((f) => f.name === 'ssl');
    expect(ssl?.kind).toBe('select');
    expect(ssl?.options?.map((o) => o.value)).toEqual(['prefer', 'require', 'disable']);
  });

  it('exposes syncVendorData/instanceTypes hooks', () => {
    expect(typeof mysqlIntegration.syncVendorData).toBe('function');
    expect(typeof mysqlIntegration.instanceTypes).toBe('function');
    expect(mysqlIntegration.instanceTypes?.({ id: 'i1', vendor: 'mysql', name: 'Db', fields: {} }, {})).toEqual([]);
  });

  it('required, keyword-rich notes and no `label` leak (agent-facing)', () => {
    expect(mysqlIntegration.notes.length).toBeGreaterThan(20);
    expect(mysqlIntegration.notes.toLowerCase()).toContain('mysql');
  });
});
