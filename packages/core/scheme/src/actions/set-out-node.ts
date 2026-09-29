import type { INode } from '@falang/dto';
import type { Scheme } from '../scheme/scheme.js';
import { getNodeStoreDto } from '../utils/get-dto.js';
import { deleteNodeStore } from '../utils/delete-node-store.js';
import type { NodeStore } from '../store/node.store.js';
import { createNodeStoreFromNode } from '../utils/create-node-store-from-node.js';
import { syncIcon } from '../utils/sync-icon.js';
import { EVENT_OUT_UPDATED } from '../scheme/scheme-events.js';
import { canHaveOut } from '../utils/can-have-out.js';

export interface ISetOutNodeCommandParams {
  id: string;
  outNode: INode | null;
  historyMove?: boolean;
}

export const setOutNode = ({ id, outNode }: ISetOutNodeCommandParams, scheme: Scheme): boolean => {
  // Clearing an out (`outNode: null`) is always allowed, including to repair an already-invalid
  // document — only setting a new one is guarded.
  if (outNode && !canHaveOut(scheme, id)) {
    throw new Error(
      `Cannot set "out" on node "${id}": either its node kind doesn't support an out ` +
        '(break/continue/return/throw) at all, or the node is the first child of its parent — in this ' +
        "visual language the first child always continues the parent's main execution path straight down " +
        'and must never jump elsewhere. Set the out on a later sibling instead, or restructure the tree so ' +
        'the jump is not the first statement of this branch/body.',
    );
  }
  const node = scheme.nodes.getNode(id);
  const currentOutStore = node.out;
  let currentOut: INode | null = null;
  if (currentOutStore) {
    currentOut = getNodeStoreDto(currentOutStore);
    deleteNodeStore(currentOutStore, scheme);
  }
  let newNodeStore: NodeStore | null = null;
  if (outNode) {
    const nodeConfig = scheme.infra.structure.getConfig(outNode.name);
    if (!nodeConfig) throw new Error(`Icon config not found: ${outNode.name}`);
    if (!nodeConfig.outType) throw new Error(`Node config dont have out type: ${outNode.name}`);
    newNodeStore = createNodeStoreFromNode(outNode, scheme);
    newNodeStore.parent = node;
  }
  node.out = newNodeStore;
  syncIcon(id, scheme);
  scheme.events.fireEvent(EVENT_OUT_UPDATED, {
    node,
    oldOut: currentOut,
  });
  return true;
};
