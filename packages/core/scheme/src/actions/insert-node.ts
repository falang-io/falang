import type { Scheme } from '../scheme/scheme.js';
import { createNodeStoreFromNode } from '../utils/create-node-store-from-node.js';
import { syncIcon } from '../utils/sync-icon.js';
import type { INode } from '@falang/dto';
import { EVENT_NODE_INSERTED } from '../scheme/scheme-events.js';

export interface IInsertNodeCommandParams {
  parentId: string;
  index: number;
  node: INode;
}

export const insertNode = ({ index, node, parentId }: IInsertNodeCommandParams, scheme: Scheme): boolean => {
  const parent = scheme.nodes.getNode(parentId);
  const nodeStore = createNodeStoreFromNode(node, scheme);
  nodeStore.parent = parent;
  parent.children.spliceWithArray(index, 0, [nodeStore]);
  syncIcon(parent.id, scheme);
  scheme.events.fireEvent(EVENT_NODE_INSERTED, {
    node: nodeStore,
  });
  return true;
};
