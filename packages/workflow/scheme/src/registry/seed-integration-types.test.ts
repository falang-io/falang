import type { IWorkflowIntegration } from '@falang/workflow-integrations-common';
import type { ITypeRegistryObjectItem, TypesRegistryStore } from '@falang/typescript-scheme';
import { describe, expect, it } from 'vitest';
import { INTEGRATION_TYPES_PARENT_ID, seedIntegrationTypes } from './seed-integration-types.js';

/**
 * A minimal double of `TypesRegistryStore`'s `updateTypesByParent`/`types` — `@falang/typescript-scheme`'s
 * package root eagerly pulls in monaco-editor (via its block-config exports), which touches `window`
 * at import time, so this test avoids importing the real class in this node-environment test run.
 */
const createFakeTypesRegistry = (): TypesRegistryStore => {
  const types = new Map<string, ITypeRegistryObjectItem>();
  return {
    types,
    updateTypesByParent(parentId: string, items: readonly ITypeRegistryObjectItem[]) {
      [...types.entries()].forEach(([id, item]) => {
        if (item.parentId === parentId) types.delete(id);
      });
      items.forEach((item) => types.set(item.id, item));
    },
    dispose() {
      types.clear();
    },
  } as unknown as TypesRegistryStore;
};

const telegramIntegration: IWorkflowIntegration = {
  vendor: 'telegram',
  label: 'Telegram',
  notes: 'Test vendor.',
  credentialFields: [],
  triggers: [],
  actions: [],
  types: [
    { id: 'telegram/Chat', name: 'TelegramChat', properties: { id: { type: 'string' } } },
    {
      id: 'telegram/Message',
      name: 'TelegramMessage',
      properties: { chat: { type: 'struct', id: 'telegram/Chat' } },
    },
  ],
};

describe('seedIntegrationTypes', () => {
  it("registers every integration's struct types under one shared parent id", () => {
    const typesRegistry = createFakeTypesRegistry();
    seedIntegrationTypes([telegramIntegration], typesRegistry);

    expect(typesRegistry.types.get('telegram/Message')).toEqual({
      type: 'object',
      id: 'telegram/Message',
      parentId: INTEGRATION_TYPES_PARENT_ID,
      name: 'TelegramMessage',
      properties: { chat: { type: 'struct', id: 'telegram/Chat' } },
    });
    expect(typesRegistry.types.get('telegram/Chat')?.name).toBe('TelegramChat');
  });

  it('is a no-op for an integration with no declared types', () => {
    const typesRegistry = createFakeTypesRegistry();
    const bareIntegration: IWorkflowIntegration = {
      vendor: 'slack',
      label: 'Slack',
      notes: 'Test vendor.',
      credentialFields: [],
      triggers: [],
      actions: [],
    };
    seedIntegrationTypes([bareIntegration], typesRegistry);
    expect(typesRegistry.types.size).toBe(0);
  });
});
