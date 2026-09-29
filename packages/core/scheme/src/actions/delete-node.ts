import { getDto } from '../utils/get-dto.js';
import type { Scheme } from '../scheme/scheme.js';
import { syncIcon } from '../utils/sync-icon.js';
import { EVENT_NODE_DELETED } from '../scheme/scheme-events.js';
import { setOutNode } from './set-out-node.js';

export interface IDeleteNodeCommandParams {
  id: string;
}

export const deleteNode = ({ id }: IDeleteNodeCommandParams, scheme: Scheme): boolean => {
  const node = scheme.nodes.getNodeSafe(id);
  if (!node) throw new Error(`Node not found: ${id}`);
  const parent = node.parent;
  if (!parent) {
    throw new Error('Deleteing node should have parent');
  }

  if (parent.out === node) {
    return setOutNode({ id: parent.id, outNode: null }, scheme);
  }

  const deletingNodeIndex = parent.children.findIndex((child) => child.id === id);
  if (deletingNodeIndex === -1) {
    throw new Error(`Deleting node index not found ${id}`);
  }

  const deletingNode = parent.children[deletingNodeIndex];
  const deletingNodeDto = getDto(id, scheme);

  parent.children.splice(deletingNodeIndex, 1);
  syncIcon(parent.id, scheme);

  scheme.events.fireEvent(EVENT_NODE_DELETED, {
    index: deletingNodeIndex,
    node: deletingNodeDto,
    parentId: parent.id,
  });

  scheme.nodes.delete(id);
  deletingNode.dispose();

  return true;
};
