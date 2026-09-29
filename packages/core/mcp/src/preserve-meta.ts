import type { INode } from '@falang/dto';

const indexById = (node: INode, map: Map<string, INode>): void => {
  map.set(node.id, node);
  node.children?.forEach((child) => indexById(child, map));
  node.mods?.forEach((mod) => indexById(mod, map));
  if (node.out) indexById(node.out, map);
};

const applyPreserve = (node: INode, oldById: ReadonlyMap<string, INode>): INode => {
  const old = oldById.get(node.id);
  return {
    ...node,
    ...(node.children ? { children: node.children.map((child) => applyPreserve(child, oldById)) } : {}),
    ...(node.mods ? { mods: node.mods.map((mod) => applyPreserve(mod, oldById)) } : {}),
    ...(node.out ? { out: applyPreserve(node.out, oldById) } : {}),
    // oxlint-disable-next-line no-undefined
    ...(node.meta === undefined && old?.meta !== undefined ? { meta: old.meta } : {}),
  };
};

/**
 * For every node in `newRoot` whose `id` also exists in `oldRoot` and that carries no `meta` of its
 * own, copies the old node's `meta` across — so an agent rewriting a document via `set_document`
 * doesn't blow away layout the user hand-tuned (see ADR 0029 (private),
 * "`set_document` is the only write path"). A node with its own `meta` always keeps it; a node whose
 * `id` doesn't exist in `oldRoot` (newly inserted) is untouched. Pure — never mutates either input.
 */
export const preserveMeta = (oldRoot: INode, newRoot: INode): INode => {
  const oldById = new Map<string, INode>();
  indexById(oldRoot, oldById);
  return applyPreserve(newRoot, oldById);
};
