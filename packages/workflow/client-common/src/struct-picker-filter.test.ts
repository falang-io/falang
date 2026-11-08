import { describe, expect, it } from 'vitest';
import { TypesRegistryStore } from '@falang/typescript-scheme/src/typescript-project-service/types-registry.store.js';
import type { IIntegrationInstance, IWorkflowIntegration } from '@falang/workflow-integrations-common';
import { INTEGRATION_TYPES_PARENT_ID } from '@falang/workflow-scheme/src/registry/seed-integration-types.js';
import { createStructPickerFilter } from './struct-picker-filter.js';

const vendor = (name: string, typeIds: string[], credentialFields: unknown[] = [{ name: 'token' }]) =>
  ({
    vendor: name,
    credentialFields,
    types: typeIds.map((id) => ({ id, name: id.split('/')[1], properties: {} })),
  }) as unknown as IWorkflowIntegration;

const telegram = vendor('telegram', ['telegram/Message', 'telegram/User']);
const moysklad = vendor('moysklad', ['moysklad/Product']);
const files = vendor('files', ['files/File'], []);
const integrations = [telegram, moysklad, files];

const seed = (registry: TypesRegistryStore) => {
  registry.updateTypesByParent(
    INTEGRATION_TYPES_PARENT_ID,
    integrations.flatMap((i) =>
      (i.types ?? []).map((t) => ({
        type: 'object' as const,
        id: t.id,
        parentId: INTEGRATION_TYPES_PARENT_ID,
        name: t.name,
        properties: {},
      })),
    ),
  );
  registry.updateTypesByParent('doc-1', [
    { type: 'object', id: 'thread-1', parentId: 'doc-1', name: 'Game', properties: {} },
  ]);
  registry.updateTypesByParent('db:inst-9', [
    { type: 'object', id: 'db:inst-9:orders', parentId: 'db:inst-9', name: 'Orders', properties: {} },
  ]);
};

describe('createStructPickerFilter', () => {
  it('offers vendor types only for connected or credential-less vendors, project types always', () => {
    let instances: IIntegrationInstance[] = [{ id: 'i1', vendor: 'telegram' } as IIntegrationInstance];
    const registry = new TypesRegistryStore();
    seed(registry);
    registry.setPickerFilter(
      createStructPickerFilter({
        integrations,
        getEnabledIntegrations: () => integrations,
        getInstances: () => instances,
      }),
    );
    expect(registry.pickerTypes.map((t) => t.id).toSorted()).toEqual(
      ['db:inst-9:orders', 'files/File', 'telegram/Message', 'telegram/User', 'thread-1'].toSorted(),
    );
    // Every type stays registered for scope resolution.
    expect(registry.types.has('moysklad/Product')).toBe(true);

    instances = [{ id: 'i2', vendor: 'moysklad' } as IIntegrationInstance];
    registry.setPickerFilter(
      createStructPickerFilter({
        integrations,
        getEnabledIntegrations: () => integrations,
        getInstances: () => instances,
      }),
    );
    expect(registry.pickerTypes.map((t) => t.id)).toContain('moysklad/Product');
    expect(registry.pickerTypes.map((t) => t.id)).not.toContain('telegram/Message');
  });

  it('without a filter the registry offers everything', () => {
    const registry = new TypesRegistryStore();
    seed(registry);
    expect(registry.pickerTypes).toHaveLength(registry.types.size);
  });
});
