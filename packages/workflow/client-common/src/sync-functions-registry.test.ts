import type { INode } from '@falang/dto';
import { FunctionsRegistryStore } from '@falang/typescript-scheme';
import { describe, expect, it } from 'vitest';
import { syncWorkflowFunctionsRegistry } from './sync-functions-registry.js';

const functionRoot = (parameters: unknown[]): INode => ({
  id: 'root',
  name: 'function',
  children: [{ id: 'body', name: 'function-body', data: { parameters, returnValue: { type: 'boolean' } } }],
});

describe('syncWorkflowFunctionsRegistry', () => {
  it('lists every function document, including one never edited', () => {
    const registry = new FunctionsRegistryStore();
    syncWorkflowFunctionsRegistry(registry, [
      { id: 'f1', name: 'getOrCreateUser', type: 'function' },
      { id: 't1', name: 'onStart', type: 'trigger-function' },
      { id: 'i1', name: 'Integrations', type: 'integrations' },
    ]);
    expect(Array.from(registry.functions.values())).toEqual([
      { schemeId: 'f1', name: 'getOrCreateUser', parameters: [] },
    ]);
  });

  it('reads parameters from the stored tree and drops removed documents', () => {
    const registry = new FunctionsRegistryStore();
    syncWorkflowFunctionsRegistry(registry, [
      { id: 'f1', name: 'a', type: 'function' },
      { id: 'f2', name: 'b', type: 'function' },
    ]);
    const parameters = [{ name: 'userId', type: { type: 'string' } }];
    syncWorkflowFunctionsRegistry(registry, [
      { id: 'f2', name: 'b2', type: 'function', data: functionRoot(parameters) },
    ]);
    expect(Array.from(registry.functions.values())).toEqual([
      { schemeId: 'f2', name: 'b2', parameters, returnValue: { type: 'boolean' } },
    ]);
  });
});
