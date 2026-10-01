import type { Scheme } from '../scheme/scheme.js';
import type { NodeStore } from '../store/node.store.js';

export interface IDeleteNodeStoreOptions {
  /** Also drop the subtree's icons from `scheme.icons` (the caller no longer relies on `syncIcon` finding them). */
  withIcons?: boolean;
}

/** Disposes a node and everything hanging off it (children, mods, out) and drops them from the scheme's indexes. */
export const deleteNodeStore = (node: NodeStore, scheme: Scheme, options: IDeleteNodeStoreOptions = {}) => {
  node.children.forEach((child) => deleteNodeStore(child, scheme, options));
  node.mods.forEach((mod) => deleteNodeStore(mod, scheme, options));
  if (node.out) deleteNodeStore(node.out, scheme, options);
  node.dispose();
  scheme.nodes.delete(node.id);
  if (options.withIcons) scheme.icons.delete(node.id);
};
