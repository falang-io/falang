import type { INode } from '@falang/dto';
import type { Scheme } from '../scheme/scheme.js';
import { NodeStore } from '../store/node.store.js';

export const createNodeStoreFromNode = (node: INode, scheme: Scheme): NodeStore => {
  const store = new NodeStore(node);
  scheme.nodes.add(store);
  if (node.children && node.children.length > 0) {
    const children = node.children.map((child) => createNodeStoreFromNode(child, scheme));
    store.children.replace(children);
    children.forEach((child) => {
      child.parent = store;
    });
  }
  if (node.mods && node.mods.length > 0) {
    const mods = node.mods.map((mod) => createNodeStoreFromNode(mod, scheme));
    store.mods.replace(mods);
    mods.forEach((mod) => {
      mod.parent = store;
    });
  }
  if (node.out) {
    const outStore = createNodeStoreFromNode(node.out, scheme);
    outStore.parent = store;
    store.out = outStore;
  }
  return store;
};
