import type { Scheme } from '../scheme/scheme.js';
import { createNodeStoreFromNode } from '../utils/create-node-store-from-node.js';
import { syncIcon } from '../utils/sync-icon.js';
import type { INode } from '@falang/dto';
import { EVENT_NODE_INSERTED, type TNodeSlot } from '../scheme/scheme-events.js';

export interface IInsertNodeCommandParams {
  parentId: string;
  index: number;
  node: INode;
  /** `'children'` (default) or `'mods'` — the parent's side-icon list (ADR 0049). */
  slot?: TNodeSlot;
}

const assertModAllowed = (parentId: string, node: INode, scheme: Scheme): void => {
  const parent = scheme.nodes.getNode(parentId);
  const policy = scheme.infra.structure.getConfig(parent.name).mods;
  if (!policy?.includes(node.name)) {
    throw new Error(`Node "${parent.name}" does not allow "${node.name}" as a mod`);
  }
  if (parent.mods.some((mod) => mod.name === node.name)) {
    throw new Error(`Node ${parent.id} already has a "${node.name}" mod`);
  }
};

export const insertNode = (
  { index, node, parentId, slot = 'children' }: IInsertNodeCommandParams,
  scheme: Scheme,
): boolean => {
  const parent = scheme.nodes.getNode(parentId);
  if (slot === 'mods') assertModAllowed(parentId, node, scheme);
  const nodeStore = createNodeStoreFromNode(node, scheme);
  nodeStore.parent = parent;
  (slot === 'mods' ? parent.mods : parent.children).spliceWithArray(index, 0, [nodeStore]);
  syncIcon(parent.id, scheme);
  scheme.events.fireEvent(EVENT_NODE_INSERTED, {
    node: nodeStore,
  });
  return true;
};
