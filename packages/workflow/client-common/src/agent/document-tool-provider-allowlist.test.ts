import { describe, expect, it } from 'vitest';
import type { WorkflowStore } from '../workflow-store.js';
import { DocumentToolProvider } from './document-tool-provider.js';

describe('DocumentToolProvider allowlist (magic runs: list_types only)', () => {
  const store = {
    documents: [],
    typesRegistry: { types: new Map() },
    vendorData: { byInstance: new Map() },
  } as unknown as WorkflowStore;

  it('offers only the allowed tools and refuses the others', () => {
    const provider = new DocumentToolProvider(store, ['list_types']);
    expect(provider.tools.map((tool) => tool.name)).toEqual(['list_types']);
    const result = provider.execute({ id: 'c', input: { name: 'f', type: 'function' }, name: 'create_document' });
    expect(result.ok).toBe(false);
  });

  it('offers everything without an allowlist', () => {
    expect(new DocumentToolProvider(store).tools.map((tool) => tool.name)).toEqual([
      'create_document',
      'create_trigger_document',
      'list_types',
    ]);
  });
});
