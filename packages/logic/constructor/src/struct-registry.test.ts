import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { buildStructRegistry, collectStructDependencyIds } from './struct-registry.js';

/** Minimal `objects-structure` document tree — same root/header/body/thread/child shape `mindTreeCfg` produces (see `@falang/typescript-dto`'s `objects-structure-nodes.ts`), hand-built here since only the shape this registry reads matters for this test. */
const objectsStructureDocument = (
  documentId: string,
  threads: { id: string; name: string; properties: Record<string, INode['data']> }[],
): IProjectDocument => {
  const root: INode = {
    id: 'root',
    name: OBJECTS_STRUCTURE_NAME,
    children: [
      { id: 'header', name: `${OBJECTS_STRUCTURE_NAME}-header`, data: '' },
      {
        id: 'body',
        name: `${OBJECTS_STRUCTURE_NAME}-body`,
        data: null,
        children: threads.map((thread) => ({
          id: thread.id,
          name: `${OBJECTS_STRUCTURE_NAME}-thread`,
          data: thread.name,
          children: Object.entries(thread.properties).map(([name, variableType], index) => ({
            id: `${thread.id}-child-${index}`,
            name: `${OBJECTS_STRUCTURE_NAME}-child`,
            data: { name, variableType },
          })),
        })),
      },
    ],
  };
  return { id: documentId, type: OBJECTS_STRUCTURE_NAME, name: documentId, root };
};

describe('buildStructRegistry', () => {
  it('maps each thread id to its struct name and property definitions', () => {
    const document = objectsStructureDocument('doc-1', [
      {
        id: 'obj-a',
        name: 'ObjA',
        properties: { x: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } } },
      },
    ]);

    const { structNames, structDefinitions } = buildStructRegistry([document]);

    expect(structNames.get('obj-a')).toBe('ObjA');
    expect(structDefinitions.get('obj-a')).toEqual({
      name: 'ObjA',
      properties: { x: { type: 'number', numberType: { type: 'integer', integerType: 'int32' } } },
    });
  });

  it('aggregates structs across multiple objects-structure documents and ignores other document types', () => {
    const docA = objectsStructureDocument('doc-a', [{ id: 'obj-a', name: 'ObjA', properties: {} }]);
    const docB = objectsStructureDocument('doc-b', [{ id: 'obj-b', name: 'ObjB', properties: {} }]);
    const functionDoc: IProjectDocument = { id: 'doc-fn', type: 'function', name: 'fn' };

    const { structNames } = buildStructRegistry([docA, docB, functionDoc]);

    expect([...structNames.entries()]).toEqual(
      expect.arrayContaining([
        ['obj-a', 'ObjA'],
        ['obj-b', 'ObjB'],
      ]),
    );
  });
});

describe('collectStructDependencyIds', () => {
  it('returns the struct id directly for a struct type', () => {
    expect(collectStructDependencyIds({ type: 'struct', id: 'obj-a' })).toEqual(['obj-a']);
  });

  it('returns no dependency for a scalar type', () => {
    expect(collectStructDependencyIds({ type: 'string' })).toEqual([]);
  });

  it('unwraps through array element types', () => {
    expect(
      collectStructDependencyIds({ type: 'array', elementType: { type: 'struct', id: 'obj-a' }, dimensions: 1 }),
    ).toEqual(['obj-a']);
  });
});
