import { getIntegrationNodeConfigs } from '@falang/workflow-integrations-common';
import { describe, expect, it } from 'vitest';
import { SQLITE_VENDOR } from './constants.js';
import { sqliteIntegration } from './sqlite.integration.js';

describe('sqliteIntegration', () => {
  it('produces valid node configs for every action through the generic integration node builder', () => {
    const configs = getIntegrationNodeConfigs([sqliteIntegration]);
    expect(configs.map((config) => config.name).toSorted()).toEqual(
      [
        'sqlite-select',
        'sqlite-select-one',
        'sqlite-insert',
        'sqlite-update',
        'sqlite-delete',
        'sqlite-query',
      ].toSorted(),
    );
  });

  it('has one connectionString secret credential field (dev/prod paired but prod optional), plus a shared ssl field (ignored for sqlite but present for a uniform shape)', () => {
    const names = sqliteIntegration.credentialFields.map((f) => f.name);
    expect(names).toEqual(['connectionString', 'ssl']);
    const connectionString = sqliteIntegration.credentialFields.find((f) => f.name === 'connectionString');
    expect(connectionString).toEqual({
      name: 'connectionString',
      label: 'sqlite:field.connectionString',
      kind: 'secret',
      secretProdOptional: true,
    });
  });

  it('exposes syncVendorData/instanceTypes hooks', () => {
    expect(typeof sqliteIntegration.syncVendorData).toBe('function');
    expect(typeof sqliteIntegration.instanceTypes).toBe('function');
    expect(sqliteIntegration.instanceTypes?.({ id: 'i1', vendor: SQLITE_VENDOR, name: 'Db', fields: {} }, {})).toEqual(
      [],
    );
  });

  it('declares no triggers (a database is polled/queried by actions only, never a workflow trigger)', () => {
    expect(sqliteIntegration.triggers).toEqual([]);
  });

  it('registers the four static filter struct types', () => {
    expect(sqliteIntegration.types?.map((t) => t.id).toSorted()).toEqual(
      ['sql/NumberFilter', 'sql/StringFilter', 'sql/BooleanFilter', 'sql/AnyFilter'].toSorted(),
    );
  });

  it("every action's credential-ref field is restricted to this vendor", () => {
    for (const action of sqliteIntegration.actions) {
      const credentialField = action.fields.find((f) => f.kind === 'credential-ref');
      expect(credentialField?.vendor).toBe(SQLITE_VENDOR);
    }
  });

  it('sharedActivityCode contains the sqlite* action functions', () => {
    expect(sqliteIntegration.sharedActivityCode).toContain('export const sqliteSelect =');
    expect(sqliteIntegration.sharedActivityCode).toContain("await import('node:sqlite')");
  });

  it('has en/ru locales registering both the "sqlite" and shared "sql" namespaces', async () => {
    const en = await sqliteIntegration.locales?.en?.();
    expect(en?.default.sqlite?.label).toBe('SQLite');
    expect(en?.default.sql).toBeTruthy();
    const ru = await sqliteIntegration.locales?.ru?.();
    expect(ru?.default.sqlite?.label).toBe('SQLite');
  });
});
