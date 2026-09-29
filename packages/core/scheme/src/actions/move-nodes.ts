import { EVENT_NODES_MOVED } from '../scheme/scheme-events.js';
import type { Scheme } from '../scheme/scheme.js';
import { syncIcon } from '../utils/sync-icon.js';

export interface IMoveNodesCommandParams {
  oldParentId: string;
  indexStart: number;
  length: number;
  newParentId: string;
  insertIndex: number;
}

export const moveNodes = (params: IMoveNodesCommandParams, scheme: Scheme): boolean => {
  const { indexStart, insertIndex, length, newParentId, oldParentId } = params;
  const parentNodeFrom = scheme.nodes.getNode(oldParentId);
  const parentNodeTo = scheme.nodes.getNode(newParentId);
  const isSameParent = oldParentId === newParentId;
  let realInsertIndex = insertIndex;
  const isMoveForwardSameNode = isSameParent && insertIndex > indexStart;
  if (isSameParent && isMoveForwardSameNode) {
    realInsertIndex = insertIndex - length;
  }

  const nodesSplice = parentNodeFrom.children.splice(indexStart, length);
  parentNodeTo.children.spliceWithArray(realInsertIndex, 0, nodesSplice);
  nodesSplice.forEach((node) => {
    node.parent = parentNodeTo;
  });

  syncIcon(oldParentId, scheme);
  if (oldParentId !== newParentId) {
    syncIcon(newParentId, scheme);
  }

  scheme.events.fireEvent(EVENT_NODES_MOVED, params);

  return true;
};
