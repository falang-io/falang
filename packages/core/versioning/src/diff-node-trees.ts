import type { INode } from '@falang/dto';
import { diffFieldPaths, type IFieldChange } from './field-diff.js';
import { ancestorIds, flattenTree, siblingIdsInBoth, type IFlatNode, type INodeSlot } from './node-tree-flatten.js';

export interface INodeChange {
  id: string;
  name: string;
  kind: 'added' | 'removed' | 'modified' | 'moved';
  parentId: string | null;
  /**
   * True unless an ancestor of this node, in the same tree, is itself `added` (for an `added` node)
   * or `removed` (for a `removed` node) — so a whole added/removed subtree is reported once at its
   * top for a summary list, while every descendant id is still present in `addedIds`/`removedIds`
   * for canvas highlighting. Always `true` for `modified`/`moved`.
   */
  topLevel: boolean;
  fields?: IFieldChange[];
  /** Set when this node is `moved`, or `modified` and also moved (one change entry covers both). */
  move?: { from: INodeSlot; to: INodeSlot };
}

export interface INodeTreeDiff {
  changes: INodeChange[];
  addedIds: string[];
  removedIds: string[];
  modifiedIds: string[];
  movedIds: string[];
  isEmpty: boolean;
}

type IByIdMap = Map<string, IFlatNode>;

/** Ids present on both sides where `name` differs — a defensive "shouldn't happen" case (ADR: reported as `removed` + `added`, since a node's `name` picks its schema and nothing about "which fields changed" makes sense across two different schemas). */
const findReplacedIds = (byIdA: IByIdMap, byIdB: IByIdMap): Set<string> => {
  const replacedIds = new Set<string>();
  for (const [id, flatA] of byIdA) {
    const flatB = byIdB.get(id);
    if (flatB && flatA.node.name !== flatB.node.name) {
      replacedIds.add(id);
    }
  }
  return replacedIds;
};

const findAddedIds = (byIdA: IByIdMap, byIdB: IByIdMap, replacedIds: Set<string>): Set<string> => {
  const addedIds = new Set<string>();
  for (const id of byIdB.keys()) {
    if (!byIdA.has(id) || replacedIds.has(id)) {
      addedIds.add(id);
    }
  }
  return addedIds;
};

const findRemovedIds = (byIdA: IByIdMap, byIdB: IByIdMap, replacedIds: Set<string>): Set<string> => {
  const removedIds = new Set<string>();
  for (const id of byIdA.keys()) {
    if (!byIdB.has(id) || replacedIds.has(id)) {
      removedIds.add(id);
    }
  }
  return removedIds;
};

/** `b`'s pre-order first (added/modified/moved/unchanged/replaced-added), then whatever's left over from `a`'s pre-order (purely removed ids) — deterministic, tree-order-following iteration. */
const buildOrderedIds = (orderA: string[], orderB: string[]): string[] => {
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const id of [...orderB, ...orderA]) {
    if (!seen.has(id)) {
      orderedIds.push(id);
      seen.add(id);
    }
  }
  return orderedIds;
};

const describeEndpoint = (id: string, flat: IFlatNode, kind: 'added' | 'removed', topLevel: boolean): INodeChange => ({
  id,
  name: flat.node.name,
  kind,
  parentId: flat.parentId,
  topLevel,
});

const computeMove = (
  id: string,
  nodeA: IFlatNode,
  nodeB: IFlatNode,
  byIdA: IByIdMap,
  byIdB: IByIdMap,
): { from: INodeSlot; to: INodeSlot } | null => {
  const siblingsA = siblingIdsInBoth(byIdA, byIdB, nodeA.parentId, nodeA.slot);
  const siblingsB = siblingIdsInBoth(byIdB, byIdA, nodeB.parentId, nodeB.slot);
  const moved =
    nodeA.parentId !== nodeB.parentId || nodeA.slot !== nodeB.slot || siblingsA.indexOf(id) !== siblingsB.indexOf(id);
  if (!moved) {
    return null;
  }
  return {
    from: { parentId: nodeA.parentId, slot: nodeA.slot, index: nodeA.index },
    to: { parentId: nodeB.parentId, slot: nodeB.slot, index: nodeB.index },
  };
};

/** Both sides present, same `name`: `modified`/`moved`/both, or `null` when nothing changed. */
const describePair = (
  id: string,
  nodeA: IFlatNode,
  nodeB: IFlatNode,
  byIdA: IByIdMap,
  byIdB: IByIdMap,
): INodeChange | null => {
  const fields = [
    ...diffFieldPaths('data', nodeA.node.data, nodeB.node.data),
    ...diffFieldPaths('meta', nodeA.node.meta, nodeB.node.meta),
  ];
  const move = computeMove(id, nodeA, nodeB, byIdA, byIdB);
  const modified = fields.length > 0;

  if (!modified && move === null) {
    return null;
  }

  return {
    id,
    name: nodeB.node.name,
    kind: modified ? 'modified' : 'moved',
    parentId: nodeB.parentId,
    topLevel: true,
    ...(modified ? { fields } : {}),
    ...(move === null ? {} : { move }),
  };
};

/**
 * Diffs two `INode` trees by id (per ADR 0025 (private), "The diff engine").
 * `a`/`b` are `null`/`undefined`-tolerant so a whole added/removed document can be diffed against
 * nothing.
 */
export const diffNodeTrees = (a: INode | null | undefined, b: INode | null | undefined): INodeTreeDiff => {
  const flatA = flattenTree(a);
  const flatB = flattenTree(b);

  const replacedIds = findReplacedIds(flatA.byId, flatB.byId);
  const addedIdSet = findAddedIds(flatA.byId, flatB.byId, replacedIds);
  const removedIdSet = findRemovedIds(flatA.byId, flatB.byId, replacedIds);

  const isAddedTopLevel = (id: string): boolean =>
    !ancestorIds(flatB.byId, id).some((ancestor) => addedIdSet.has(ancestor));
  const isRemovedTopLevel = (id: string): boolean =>
    !ancestorIds(flatA.byId, id).some((ancestor) => removedIdSet.has(ancestor));

  const changes: INodeChange[] = [];
  const addedIds: string[] = [];
  const removedIds: string[] = [];
  const modifiedIds: string[] = [];
  const movedIds: string[] = [];

  for (const id of buildOrderedIds(flatA.order, flatB.order)) {
    const nodeA = flatA.byId.get(id);
    const nodeB = flatB.byId.get(id);

    if (replacedIds.has(id) && nodeA && nodeB) {
      changes.push(describeEndpoint(id, nodeA, 'removed', isRemovedTopLevel(id)));
      removedIds.push(id);
      changes.push(describeEndpoint(id, nodeB, 'added', isAddedTopLevel(id)));
      addedIds.push(id);
      continue;
    }

    if (nodeA && !nodeB) {
      changes.push(describeEndpoint(id, nodeA, 'removed', isRemovedTopLevel(id)));
      removedIds.push(id);
      continue;
    }

    if (nodeB && !nodeA) {
      changes.push(describeEndpoint(id, nodeB, 'added', isAddedTopLevel(id)));
      addedIds.push(id);
      continue;
    }

    if (!nodeA || !nodeB) {
      // Unreachable — every branch above handles a missing side; kept so `nodeA`/`nodeB` narrow to
      // `IFlatNode` below without a non-null assertion.
      continue;
    }

    const change = describePair(id, nodeA, nodeB, flatA.byId, flatB.byId);
    if (change === null) {
      continue;
    }
    changes.push(change);
    if (change.kind === 'modified') {
      modifiedIds.push(id);
    }
    if (change.move) {
      movedIds.push(id);
    }
  }

  return {
    changes,
    addedIds,
    removedIds,
    modifiedIds,
    movedIds,
    isEmpty: changes.length === 0,
  };
};
