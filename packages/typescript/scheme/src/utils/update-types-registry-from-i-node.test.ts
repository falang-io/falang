import { describe, expect, it } from 'vitest';
import type { INode } from '@falang/dto';
import { TypesRegistryStore } from '../typescript-project-service/types-registry.store.js';
import { updateTypesRegistryFromINode } from './update-types-registry-from-i-node.js';

const structure = (threads?: INode[]): INode => ({
  id: 'root',
  name: 'objects-structure',
  children: [
    { id: 'header', name: 'objects-structure-header' },
    { id: 'body', name: 'objects-structure-body', ...(threads ? { children: threads } : {}) },
  ],
});

describe('updateTypesRegistryFromINode', () => {
  it('registers every interface with its properties', () => {
    const registry = new TypesRegistryStore();
    updateTypesRegistryFromINode(
      structure([
        {
          id: 't1',
          name: 'objects-structure-thread',
          data: 'GameState',
          children: [
            { id: 'p1', name: 'objects-structure-child', data: { name: 'score', variableType: { type: 'string' } } },
          ],
        },
      ]),
      registry,
    );
    expect(registry.types.get('t1')).toMatchObject({
      name: 'GameState',
      parentId: 'root',
      properties: { score: { type: 'string' } },
    });
  });

  it('accepts a serialized tree without children arrays (an interface whose last property was deleted)', () => {
    const registry = new TypesRegistryStore();
    registry.updateTypesByParent('root', [{ type: 'object', id: 't1', parentId: 'root', name: 'Old', properties: {} }]);
    updateTypesRegistryFromINode(
      structure([{ id: 't1', name: 'objects-structure-thread', data: 'GameState' }]),
      registry,
    );
    expect(registry.types.size).toBe(0);
    expect(() => updateTypesRegistryFromINode(structure(), registry)).not.toThrow();
  });
});
