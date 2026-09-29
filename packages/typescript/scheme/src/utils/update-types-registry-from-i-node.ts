import type { INode } from '@falang/dto';
import type {
  ITypeRegistryObjectItem,
  TypesRegistryStore,
} from '../typescript-project-service/types-registry.store.js';
import { objectStructureNodes } from '../objects-structure/objects-structure-scheme-factory.js';
import type { TVariableInfo } from '@falang/typescript-dto';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';

export const updateTypesRegistryFromINode = (node: INode, registry: TypesRegistryStore) => {
  if (!objectStructureNodes.is(node, OBJECTS_STRUCTURE_NAME)) return;
  const items: ITypeRegistryObjectItem[] = [];
  const body = node.children[1];
  body.children.forEach((thread) => {
    const objetStructure: Record<string, TVariableInfo> = {};
    let added = false;
    thread.children.forEach((ch) => {
      objetStructure[ch.data.name] = ch.data.variableType;
      added = true;
    });
    if (added) {
      items.push({
        id: thread.id,
        parentId: node.id,
        name: typeof thread.data === 'string' ? thread.data : thread.id,
        properties: objetStructure,
        type: 'object',
      });
    }
  });
  registry.updateTypesByParent(node.id, items);
};
