import { describe, expect, it, vi } from 'vitest';
import type { ITypeRegistryObjectItem } from '@falang/typescript-scheme';
import { syncTableTypes, tableTypesParentId } from './table-types-sync.js';

const fakeRegistry = () => {
  const byParent = new Map<string, readonly ITypeRegistryObjectItem[]>();
  const updateTypesByParent = vi.fn((parentId: string, items: readonly ITypeRegistryObjectItem[]) => {
    byParent.set(parentId, items);
  });
  return { registry: { updateTypesByParent }, byParent, updateTypesByParent };
};

const table = (id: string, name: string, fields: unknown) => ({
  id,
  name,
  type: 'table',
  customData: { fields, nextFieldNo: 3 },
});

describe('syncTableTypes', () => {
  it('registers Row/Insert/Patch/Where/Event types under table:<docId>', () => {
    const { registry, byParent } = fakeRegistry();
    const registered = new Set<string>();
    syncTableTypes(
      registry,
      [table('d1', 'clients', [{ id: 'f1', name: 'email', type: 'text' }]), { id: 'x', name: 'fn', type: 'function' }],
      registered,
    );
    const items = byParent.get(tableTypesParentId('d1')) ?? [];
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items.every((item) => item.parentId === 'table:d1')).toBe(true);
    expect([...registered]).toEqual(['d1']);
    expect(byParent.has('table:x')).toBe(false);
  });

  it('replaces a table wholesale on change and clears a removed table', () => {
    const { registry, byParent } = fakeRegistry();
    const registered = new Set<string>();
    syncTableTypes(registry, [table('d1', 'clients', [{ id: 'f1', name: 'email', type: 'text' }])], registered);
    syncTableTypes(registry, [table('d2', 'orders', [])], registered);
    expect(byParent.get('table:d1')).toEqual([]);
    expect((byParent.get('table:d2') ?? []).length).toBeGreaterThan(0);
    expect([...registered]).toEqual(['d2']);
  });

  it('treats malformed data as an empty field list instead of keeping stale types', () => {
    const { registry, byParent } = fakeRegistry();
    syncTableTypes(registry, [{ id: 'd1', name: 't', type: 'table', customData: 'garbage' }], new Set());
    expect(byParent.get('table:d1')).toEqual([]);
  });
});
