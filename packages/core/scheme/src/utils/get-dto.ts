import type { INode } from '@falang/dto';
import type { Scheme } from '../scheme/scheme.js';
import type { NodeStore } from '../store/node.store.js';

export const getNodeStoreDto = (store: NodeStore, scheme?: Scheme): INode => {
  let returnValue: INode = {
    id: store.id,
    name: store.name,
  };
  if (typeof store.data === 'boolean' || store.data) {
    returnValue = {
      ...returnValue,
      data: store.data,
    };
  }
  if (store.children.length > 0) {
    returnValue = {
      ...returnValue,
      children: store.children.map((child) => getNodeStoreDto(child, scheme)),
    };
  }
  // The icon's own `getMeta()` computes fields (e.g. `if`'s `trueOnRight`) from the same `meta` the
  // node already carries, so for a node that already has that key this is a no-op merge — but for a
  // node with no meta at all it makes the icon's computed default explicit in the serialized DTO,
  // which is what lets it round-trip (see ADR 0009 (private)'s node-kind notes / the `if`/`while`
  // direction-flag work). Values on `store.meta` itself always win.
  const meta = { ...scheme?.icons.getIconSafe(store.id)?.getMeta(), ...store.meta };
  if (Object.values(meta).length > 0) {
    returnValue = {
      ...returnValue,
      meta,
    };
  }
  if (store.out) {
    returnValue = {
      ...returnValue,
      out: getNodeStoreDto(store.out, scheme),
    };
  }
  if (store.mods.length > 0) {
    returnValue = {
      ...returnValue,
      mods: store.mods.map((mod) => getNodeStoreDto(mod, scheme)),
    };
  }
  return returnValue;
};

export const getDto = (nodeId: string, scheme: Scheme): INode => {
  const node = scheme.nodes.get(nodeId);
  if (!node) throw new Error(`Node ${nodeId} not found`);
  return getNodeStoreDto(node, scheme);
};
