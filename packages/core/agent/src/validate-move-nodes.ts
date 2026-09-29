import type { NodeStore, Scheme } from '@falang/scheme';
import type { IAgentNodeKindFilter } from './node-kind-filter.js';
import { describeFirstChildOutError, describeNotAllowedError } from './node-errors.js';
import { getAllowedChildNames } from './node-kinds.js';

export interface IMoveNodesRange {
  readonly oldParent: NodeStore;
  readonly newParent: NodeStore;
  readonly indexStart: number;
  readonly length: number;
  readonly insertIndex: number;
}

/** The children `parent` ends up with after the move — same index arithmetic as `@falang/scheme`'s
 *  `moveNodes` (a same-parent forward move's `insertIndex` counts the moved range, so it's shifted back). */
const childrenAfterMove = (range: IMoveNodesRange, parent: NodeStore): readonly NodeStore[] => {
  const { indexStart, insertIndex, length, newParent, oldParent } = range;
  const moved = oldParent.children.slice(indexStart, indexStart + length);
  const isSameParent = oldParent === newParent;
  let result = [...parent.children];
  if (parent === oldParent) result.splice(indexStart, length);
  if (parent === newParent) {
    const realInsertIndex = isSameParent && insertIndex > indexStart ? insertIndex - length : insertIndex;
    result = [...result.slice(0, realInsertIndex), ...moved, ...result.slice(realInsertIndex)];
  }
  return result;
};

const isInsideMoved = (node: NodeStore, moved: readonly NodeStore[]): boolean => {
  for (let current: NodeStore | null = node; current; current = current.parent) {
    if (moved.includes(current)) return true;
  }
  return false;
};

/**
 * `null` when a `move_nodes` call (bounds already checked) leaves a valid tree, otherwise the error to hand
 * back to the LLM. Before this, `move_nodes` checked only index bounds — a real gap flagged in
 * ADR 0034 (private) (2026-09-22), unlike `insert_node`/`insert_nodes`, which always validated the
 * target's children policy:
 * - a node moved to another parent must be a kind `getAllowedChildNames` allows there (so nothing ever
 *   lands in a fixed tuple like `if`'s, and no `documentRootOnly`/structural kind in a statement list);
 * - a fixed tuple's slot (`if-child`, `function-body`, …) can't be moved out of its parent at all;
 * - a node can't be moved into itself or its own subtree;
 * - neither parent may end up with a `children[0]` that carries an `out` (`@falang/scheme`'s `canHaveOut`
 *   rule — `setOutNode` enforces it on writes, but a move can shift an existing out into position 0).
 */
export const validateMoveNodes = (
  scheme: Scheme,
  range: IMoveNodesRange,
  nodeKindFilter?: IAgentNodeKindFilter,
): string | null => {
  const { indexStart, length, newParent, oldParent } = range;
  const stack = scheme.infra.structure;
  const moved = oldParent.children.slice(indexStart, indexStart + length);

  if (isInsideMoved(newParent, moved)) {
    return 'move_nodes: cannot move a node into itself or its own subtree';
  }
  if (oldParent !== newParent) {
    const oldTuple = stack.getConfig(oldParent.name).childTuple;
    if (oldTuple) {
      return (
        `move_nodes: the children of "${oldParent.name}" are a fixed tuple (${oldTuple.join(', ')}) — its slots ` +
        "can't be moved out. Move the slot's own children instead (oldParentId = the slot's id)."
      );
    }
    const allowedNames = getAllowedChildNames(newParent.name, stack);
    const notAllowed = moved.find((node) => !allowedNames.includes(node.name));
    if (notAllowed) {
      return `move_nodes: ${describeNotAllowedError(notAllowed.name, newParent.name, stack, nodeKindFilter)}`;
    }
  }
  const parents = oldParent === newParent ? [oldParent] : [oldParent, newParent];
  for (const parent of parents) {
    if (childrenAfterMove(range, parent)[0]?.out) return describeFirstChildOutError(parent.name, 'move_nodes');
  }
  return null;
};
