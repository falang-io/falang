import type { Scheme } from '../scheme/scheme.js';
import type { NodeStore } from '../store/node.store.js';

export const deleteNodeStore = (node: NodeStore, scheme: Scheme) => {
  if (node.children.length > 0) {
    node.children.forEach((child) => deleteNodeStore(child, scheme));
  }
  node.dispose();
  scheme.nodes.delete(node.id);
};
