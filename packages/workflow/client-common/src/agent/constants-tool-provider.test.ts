import { describe, expect, it, vi } from 'vitest';
import type { IWorkflowConstant } from '@falang/workflow-dto';
import type { WorkflowDocument } from '../workflow-types.js';
import { ConstantsToolProvider } from './constants-tool-provider.js';
import type { IWorkflowAgentStore } from './workflow-agent-store.js';

const API_URL: IWorkflowConstant = { id: 'c1', name: 'API_URL', type: 'string', dev: 'd', prod: 'p' };

const fakeStore = (withSave = true) => {
  const documents: WorkflowDocument[] = [
    {
      id: 'k',
      type: 'constants',
      name: 'Constants',
      folderId: null,
      pinned: true,
      customData: { constants: [API_URL] },
    },
  ];
  const saveConstants = vi.fn((constants: readonly IWorkflowConstant[]) => {
    documents[0].customData = { constants: [...constants] };
  });
  const store = { documents, ...(withSave ? { saveConstants } : {}) } as unknown as IWorkflowAgentStore;
  return { store, saveConstants };
};

const call = (provider: ConstantsToolProvider, name: string, input: unknown = {}) =>
  provider.execute({ id: '1', name, input }) as { ok: boolean; content?: string; error?: string };

describe('ConstantsToolProvider', () => {
  it('lists constants without ids', () => {
    const provider = new ConstantsToolProvider(fakeStore().store);
    expect(call(provider, 'list_constants')).toEqual({
      ok: true,
      content: JSON.stringify([{ name: 'API_URL', type: 'string', dev: 'd', prod: 'p' }]),
    });
  });

  it('creates and updates in one call and saves through the store', () => {
    const { store, saveConstants } = fakeStore();
    const provider = new ConstantsToolProvider(store);
    const result = call(provider, 'set_constants', {
      set: [
        { name: 'API_URL', prod: 'https://example.com' },
        { name: 'LIMIT', type: 'number', dev: 1, prod: 10 },
      ],
    });
    expect(result.ok).toBe(true);
    expect(saveConstants).toHaveBeenCalledTimes(1);
    const [saved] = saveConstants.mock.calls[0];
    expect(saved).toEqual([
      { ...API_URL, prod: 'https://example.com' },
      expect.objectContaining({ name: 'LIMIT', type: 'number', dev: 1, prod: 10 }),
    ]);
    expect(JSON.parse(call(provider, 'list_constants').content as string)).toHaveLength(2);
  });

  it('changes nothing on an invalid call', () => {
    const { store, saveConstants } = fakeStore();
    const provider = new ConstantsToolProvider(store);
    const result = call(provider, 'set_constants', { set: [{ name: 'api_url', type: 'string' }] });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('nothing changed');
    expect(result.error).toContain('"api_url" is not a valid constant name');
    expect(call(provider, 'set_constants', { set: 'x' }).error).toContain('"set" must be a list');
    expect(saveConstants).not.toHaveBeenCalled();
  });

  it('reports a store refusal (read-only project) and a host without saving', () => {
    const { store, saveConstants } = fakeStore();
    saveConstants.mockImplementation(() => {
      throw new Error('The project is open read-only');
    });
    const provider = new ConstantsToolProvider(store);
    expect(call(provider, 'set_constants', { delete: ['API_URL'] }).error).toContain('read-only');
    const readOnly = new ConstantsToolProvider(fakeStore(false).store);
    expect(call(readOnly, 'set_constants', { delete: ['API_URL'] }).error).toContain('cannot edit constants');
  });
});
