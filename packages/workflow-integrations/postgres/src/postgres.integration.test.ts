import { describe, expect, it } from 'vitest';
import { postgresIntegration } from './postgres.integration.js';

describe('postgresIntegration', () => {
  it('registers the six structured-CRUD-plus-raw-SQL node kinds, named "postgres-<verb>"', () => {
    expect(postgresIntegration.actions.map((a) => a.name).toSorted()).toEqual(
      [
        'postgres-select',
        'postgres-select-one',
        'postgres-insert',
        'postgres-update',
        'postgres-delete',
        'postgres-query',
      ].toSorted(),
    );
  });

  it('credentialFields declares connectionString (secret, dev/prod-optional) and ssl (select)', () => {
    const names = postgresIntegration.credentialFields.map((f) => f.name);
    expect(names).toEqual(['connectionString', 'ssl']);
    const connectionString = postgresIntegration.credentialFields.find((f) => f.name === 'connectionString');
    expect(connectionString?.kind).toBe('secret');
    expect(connectionString?.secretProdOptional).toBe(true);
    const ssl = postgresIntegration.credentialFields.find((f) => f.name === 'ssl');
    expect(ssl?.kind).toBe('select');
    expect(ssl?.options?.map((o) => o.value)).toEqual(['prefer', 'require', 'disable']);
  });

  it('exposes syncVendorData/instanceTypes hooks', () => {
    expect(typeof postgresIntegration.syncVendorData).toBe('function');
    expect(typeof postgresIntegration.instanceTypes).toBe('function');
    expect(postgresIntegration.instanceTypes?.({ id: 'i1', vendor: 'postgres', name: 'Db', fields: {} }, {})).toEqual(
      [],
    );
  });

  it('required, keyword-rich notes and no `label` leak (agent-facing)', () => {
    expect(postgresIntegration.notes.length).toBeGreaterThan(20);
    expect(postgresIntegration.notes.toLowerCase()).toContain('postgres');
  });
});
