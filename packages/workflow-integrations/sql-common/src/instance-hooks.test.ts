import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSqlInstanceTypes, buildSqlSyncVendorData } from './instance-hooks.js';
import type { ISyncedSchema } from './schema-types.js';

/**
 * `node:sqlite`'s `:memory:` database is a *new*, empty database on every connection (unlike a real
 * file), so `buildSqlSyncVendorData('sqlite')` — which opens its own `DatabaseSync` internally — needs
 * a real on-disk file to see the table this test seeds through a separate connection first.
 */
describe('buildSqlSyncVendorData / buildSqlInstanceTypes (sqlite)', () => {
  // oxlint-disable-next-line init-declarations
  let dir: string;
  // oxlint-disable-next-line init-declarations
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'falang-sql-common-'));
    dbPath = join(dir, 'test.sqlite');
    const seed = new DatabaseSync(dbPath);
    seed.exec(`
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        total REAL
      );
    `);
    seed.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('syncVendorData introspects the real file and returns { schema }', async () => {
    const syncVendorData = buildSqlSyncVendorData('sqlite');
    const result = await syncVendorData({ connectionString: dbPath }, 'dev');

    expect(Object.keys(result)).toEqual(['schema']);
    const schema = result.schema as unknown as ISyncedSchema;
    expect(schema.dialect).toBe('sqlite');
    expect(schema.tables).toHaveLength(1);
    expect(schema.tables[0].name).toBe('orders');
    expect(schema.tables[0].columns.map((c) => c.name)).toEqual(['id', 'status', 'total']);
  });

  it('instanceTypes returns [] before anything is synced, and 4 structs per table after', async () => {
    const instanceTypes = buildSqlInstanceTypes('sqlite');
    const instance = { id: 'inst1', vendor: 'sqlite', name: 'ShopDb', fields: {} };

    expect(instanceTypes(instance, {})).toEqual([]);

    const syncVendorData = buildSqlSyncVendorData('sqlite');
    const vendorData = await syncVendorData({ connectionString: dbPath }, 'dev');

    const types = instanceTypes(instance, vendorData);
    expect(types.map((t) => t.id).toSorted()).toEqual(
      ['db:inst1:orders', 'db:inst1:orders#insert', 'db:inst1:orders#patch', 'db:inst1:orders#where'].toSorted(),
    );
  });
});
