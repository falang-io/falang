import type { INode } from '@falang/dto';

/** `'children'`/`'mods'`/`'out'` — the three places a node can hang off its parent (`@falang/dto`'s `INode`). */
export type TNodeSlotKind = 'children' | 'mods' | 'out';

export interface INodeSlot {
  parentId: string | null;
  slot: TNodeSlotKind;
  index: number;
}

export interface IFlatNode {
  node: INode;
  parentId: string | null;
  slot: TNodeSlotKind;
  index: number;
}

export interface IFlattenResult {
  byId: Map<string, IFlatNode>;
  /** Pre-order traversal, `children` then `mods` then `out` at each node. */
  order: string[];
}

/** Flattens an `INode` tree (or `null`/`undefined`, yielding an empty result) into an id-indexed map plus a pre-order id list. */
export const flattenTree = (root: INode | null | undefined): IFlattenResult => {
  const byId = new Map<string, IFlatNode>();
  const order: string[] = [];
  if (!root) {
    return { byId, order };
  }
  const visit = (node: INode, parentId: string | null, slot: TNodeSlotKind, index: number): void => {
    byId.set(node.id, { node, parentId, slot, index });
    order.push(node.id);
    const children = node.children ?? [];
    children.forEach((child, index_) => visit(child, node.id, 'children', index_));
    const mods = node.mods ?? [];
    mods.forEach((mod, index_) => visit(mod, node.id, 'mods', index_));
    if (node.out) {
      visit(node.out, node.id, 'out', 0);
    }
  };
  // The root itself has no slot of its own (`parentId: null`) — `slot`/`index` are placeholders,
  // never inspected: a root/root comparison can never look "moved" since both sides share the same
  // placeholder.
  visit(root, null, 'children', 0);
  return { byId, order };
};

/** Ids of the siblings of `(parentId, slot)` in `map`, restricted to ids that also exist in `otherMap`, in their original order — used to tell a real move from a mere index shift caused by an unrelated sibling insert/removal. */
export const siblingIdsInBoth = (
  map: Map<string, IFlatNode>,
  otherMap: Map<string, IFlatNode>,
  parentId: string | null,
  slot: TNodeSlotKind,
): string[] => {
  const siblings: IFlatNode[] = [];
  for (const flat of map.values()) {
    if (flat.parentId === parentId && flat.slot === slot && otherMap.has(flat.node.id)) {
      siblings.push(flat);
    }
  }
  return siblings.toSorted((a, b) => a.index - b.index).map((flat) => flat.node.id);
};

/** Ancestor ids of `id` in `map`, from its immediate parent upward. */
export const ancestorIds = (map: Map<string, IFlatNode>, id: string): string[] => {
  const ancestors: string[] = [];
  let current = map.get(id);
  while (current && current.parentId !== null) {
    ancestors.push(current.parentId);
    current = map.get(current.parentId);
  }
  return ancestors;
};
