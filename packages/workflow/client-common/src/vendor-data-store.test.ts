import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ITypeRegistryObjectItem, TypesRegistryStore } from '@falang/typescript-scheme';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';

// Same `vi.mock`/`vi.hoisted`/dynamic-import pattern as `files-store.test.ts`/`schedule-status-store.test.ts`
// — `./api-client.js` reads `localStorage` at module scope, which doesn't exist in this package's
// plain-node Vitest environment (no jsdom).
const { getIntegrationVendorData, syncIntegrationSchema } = vi.hoisted(() => ({
  getIntegrationVendorData: vi.fn(),
  syncIntegrationSchema: vi.fn(),
}));
vi.mock('./api-client.js', () => ({
  workflowApi: {
    getIntegrationVendorData: (...args: unknown[]) => getIntegrationVendorData(...args),
    syncIntegrationSchema: (...args: unknown[]) => syncIntegrationSchema(...args),
  },
}));

const { VendorDataStore, vendorDataTypesParentId } = await import('./vendor-data-store.js');

/** Same minimal double as `seed-integration-types.test.ts`/`document-tool-provider.test.ts` — the real
 *  `TypesRegistryStore`'s package index pulls in monaco-editor (needs `window`). Only `updateTypesByParent`
 *  is exercised here, wrapped in a spy so assertions can check exactly what was (re)registered. */
const fakeRegistry = (): { registry: TypesRegistryStore; updateTypesByParent: ReturnType<typeof vi.fn> } => {
  const types = new Map<string, ITypeRegistryObjectItem>();
  const updateTypesByParent = vi.fn((parentId: string, items: readonly ITypeRegistryObjectItem[]) => {
    [...types.entries()].forEach(([id, item]) => {
      if (item.parentId === parentId) types.delete(id);
    });
    items.forEach((item) => types.set(item.id, item));
  });
  return { registry: { types, updateTypesByParent } as unknown as TypesRegistryStore, updateTypesByParent };
};

const dbInstance = (id: string, name = 'My DB'): IIntegrationInstance => ({ fields: {}, id, name, vendor: 'postgres' });

const dbIntegration = (overrides: Partial<IWorkflowIntegration> = {}): IWorkflowIntegration =>
  ({
    actions: [],
    credentialFields: [],
    label: 'Postgres',
    notes: 'A relational database.',
    triggers: [],
    vendor: 'postgres',
    ...overrides,
  }) as IWorkflowIntegration;

const otherIntegration = (): IWorkflowIntegration =>
  ({
    actions: [],
    credentialFields: [],
    label: 'Telegram',
    notes: 'A messenger.',
    triggers: [],
    vendor: 'telegram',
  }) as IWorkflowIntegration;

describe('VendorDataStore', () => {
  beforeEach(() => {
    getIntegrationVendorData.mockReset();
    syncIntegrationSchema.mockReset();
  });

  describe('loadAll', () => {
    it('fetches vendor data only for instances of vendors with syncVendorData/instanceTypes', async () => {
      getIntegrationVendorData.mockResolvedValue({ schema: { dialect: 'postgres', syncedAt: 't', tables: [] } });
      const store = new VendorDataStore();
      const instances = [dbInstance('db-1'), { fields: {}, id: 'tg-1', name: 'Bot', vendor: 'telegram' }];

      await store.loadAll('project-1', [dbIntegration({ syncVendorData: vi.fn() }), otherIntegration()], instances);

      expect(getIntegrationVendorData).toHaveBeenCalledTimes(1);
      expect(getIntegrationVendorData).toHaveBeenCalledWith('project-1', 'db-1');
      expect(store.byInstance.get('db-1')).toEqual({ schema: { dialect: 'postgres', syncedAt: 't', tables: [] } });
      expect(store.byInstance.has('tg-1')).toBe(false);
    });

    it('logs and otherwise ignores a failed fetch for one instance, without aborting the rest', async () => {
      // oxlint-disable-next-line no-empty-function -- silences the deliberate console.error under test.
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      getIntegrationVendorData
        .mockRejectedValueOnce(new Error('network down'))
        .mockResolvedValueOnce({ schema: { dialect: 'postgres', syncedAt: 't', tables: [] } });
      const store = new VendorDataStore();
      const instances = [dbInstance('db-1'), dbInstance('db-2')];

      await store.loadAll('project-1', [dbIntegration({ syncVendorData: vi.fn() })], instances);

      expect(store.byInstance.has('db-1')).toBe(false);
      expect(store.byInstance.get('db-2')).toBeTruthy();
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe('sync', () => {
    it('marks the instance as syncing, then updates byInstance with the response', async () => {
      const { promise, resolve } = Promise.withResolvers<Record<string, Record<string, unknown>>>();
      syncIntegrationSchema.mockReturnValue(promise);
      const store = new VendorDataStore();

      const pending = store.sync('project-1', 'db-1');
      expect(store.syncing.has('db-1')).toBe(true);
      resolve({ schema: { dialect: 'postgres', syncedAt: 'now', tables: [{ columns: [], name: 't' }] } });
      await pending;

      expect(syncIntegrationSchema).toHaveBeenCalledWith('project-1', 'db-1');
      expect(store.syncing.has('db-1')).toBe(false);
      expect(store.byInstance.get('db-1')).toEqual({
        schema: { dialect: 'postgres', syncedAt: 'now', tables: [{ columns: [], name: 't' }] },
      });
    });

    it('clears syncing and rethrows on failure', async () => {
      syncIntegrationSchema.mockRejectedValue(new Error('connection refused'));
      const store = new VendorDataStore();

      await expect(store.sync('project-1', 'db-1')).rejects.toThrow('connection refused');
      expect(store.syncing.has('db-1')).toBe(false);
      expect(store.byInstance.has('db-1')).toBe(false);
    });
  });

  describe('registerInstanceTypes', () => {
    it("registers each instance's derived types under its own db:<id> parent", () => {
      const store = new VendorDataStore();
      const instanceTypes = vi.fn().mockReturnValue([
        { id: 'db-1/users', name: 'Users', properties: { id: { type: 'string' } } },
        { id: 'db-1/orders', name: 'Orders', properties: {} },
      ]);
      const { registry, updateTypesByParent } = fakeRegistry();

      store.registerInstanceTypes(registry, [dbIntegration({ instanceTypes })], [dbInstance('db-1')]);

      expect(instanceTypes).toHaveBeenCalledWith(dbInstance('db-1'), {});
      expect(updateTypesByParent).toHaveBeenCalledWith('db:db-1', [
        {
          type: 'object',
          id: 'db-1/users',
          parentId: 'db:db-1',
          name: 'Users',
          properties: { id: { type: 'string' } },
        },
        { type: 'object', id: 'db-1/orders', parentId: 'db:db-1', name: 'Orders', properties: {} },
      ]);
      expect([...registry.types.values()].map((t) => t.id)).toEqual(['db-1/users', 'db-1/orders']);
    });

    it('passes through whatever vendor data loadAll/sync populated', () => {
      const store = new VendorDataStore();
      const instanceTypes = vi.fn().mockReturnValue([]);
      const { registry } = fakeRegistry();
      const instance = dbInstance('db-1');

      // Simulate `sync`'s own effect without going through the network mock.
      store.byInstance.set('db-1', { schema: { dialect: 'postgres', syncedAt: 't', tables: [] } });
      store.registerInstanceTypes(registry, [dbIntegration({ instanceTypes })], [instance]);

      expect(instanceTypes).toHaveBeenCalledWith(instance, {
        schema: { dialect: 'postgres', syncedAt: 't', tables: [] },
      });
    });

    it('skips vendors with no instanceTypes hook entirely', () => {
      const store = new VendorDataStore();
      const { registry, updateTypesByParent } = fakeRegistry();

      store.registerInstanceTypes(registry, [dbIntegration()], [dbInstance('db-1')]);

      expect(updateTypesByParent).not.toHaveBeenCalled();
    });

    it('clears a previously-registered instance that has since disappeared', () => {
      const store = new VendorDataStore();
      const instanceTypes = vi.fn().mockReturnValue([{ id: 'db-1/users', name: 'Users', properties: {} }]);
      const { registry, updateTypesByParent } = fakeRegistry();
      const integrations = [dbIntegration({ instanceTypes })];

      store.registerInstanceTypes(registry, integrations, [dbInstance('db-1')]);
      updateTypesByParent.mockClear();
      store.registerInstanceTypes(registry, integrations, []);

      expect(updateTypesByParent).toHaveBeenCalledWith(vendorDataTypesParentId('db-1'), []);
      expect(registry.types.size).toBe(0);
    });

    it('re-derives types from the (possibly renamed) instance on every call, not just once', () => {
      const store = new VendorDataStore();
      const instanceTypes = vi.fn().mockReturnValue([]);
      const { registry } = fakeRegistry();
      const integrations = [dbIntegration({ instanceTypes })];

      store.registerInstanceTypes(registry, integrations, [dbInstance('db-1', 'Old name')]);
      store.registerInstanceTypes(registry, integrations, [dbInstance('db-1', 'New name')]);

      expect(instanceTypes).toHaveBeenLastCalledWith(dbInstance('db-1', 'New name'), {});
    });
  });

  it('dispose clears byInstance/syncing', async () => {
    getIntegrationVendorData.mockResolvedValue({ schema: {} });
    const store = new VendorDataStore();
    await store.loadAll('project-1', [dbIntegration({ syncVendorData: vi.fn() })], [dbInstance('db-1')]);

    store.dispose();

    expect(store.byInstance.size).toBe(0);
    expect(store.syncing.size).toBe(0);
  });
});
