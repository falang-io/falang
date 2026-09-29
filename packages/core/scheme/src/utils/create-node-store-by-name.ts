import type { Scheme } from '../scheme/scheme.js';
import type { NodeStore } from '../store/node.store.js';
import { createINodeByName } from './create-i-node-by-name.js';
import { createNodeStoreFromNode } from './create-node-store-from-node.js';

export const createNodeStoreByName = (name: string, scheme: Scheme): NodeStore => {
  const node = createINodeByName(name, scheme);
  return createNodeStoreFromNode(node, scheme);
};
