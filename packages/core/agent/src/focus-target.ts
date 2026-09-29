import type { Scheme } from '@falang/scheme';
import type { ILlmToolCall } from './llm-client.js';

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

/** `insert_node`/`insert_nodes` focus target — the icon just above the new node: the previous sibling at
 *  `index`, or the parent itself when inserting at index 0 (or the sibling isn't found). Both tools share
 *  the same `parentId`/`index` shape at the top level. */
const getInsertNodeFocusTarget = (input: Record<string, unknown>, scheme: Scheme): string | null => {
  const parentId = typeof input.parentId === 'string' ? input.parentId : null;
  if (!parentId) return null;
  const index = typeof input.index === 'number' ? input.index : null;
  const parent = scheme.nodes.getNodeSafe(parentId);
  const prevSibling = parent && index !== null && index > 0 ? parent.children[index - 1] : null;
  return prevSibling?.id ?? parentId;
};

/** `move_nodes` focus target — the first node in the range about to move. */
const getMoveNodesFocusTarget = (input: Record<string, unknown>, scheme: Scheme): string | null => {
  const oldParentId = typeof input.oldParentId === 'string' ? input.oldParentId : null;
  const indexStart = typeof input.indexStart === 'number' ? input.indexStart : null;
  const oldParent = oldParentId ? scheme.nodes.getNodeSafe(oldParentId) : null;
  return oldParent && indexStart !== null ? (oldParent.children[indexStart]?.id ?? null) : null;
};

/**
 * The node a tool call is about to touch, for the "focus the icon, pause, then apply" UX (ADR 0034):
 * the icon that will change for a mutating call, or `null` for read-only tools (`get_tree`/
 * `get_node_kinds`), `finish`, or a call whose referenced node/parent doesn't exist (an invalid call —
 * `executeToolCall` still validates and reports the error as usual, this just skips the focus/pause).
 */
export const getFocusTargetId = (call: ILlmToolCall, scheme: Scheme): string | null => {
  const input = asRecord(call.input);
  if (!input) return null;
  switch (call.name) {
    case 'insert_node':
    case 'insert_nodes': {
      return getInsertNodeFocusTarget(input, scheme);
    }
    case 'delete_node':
    case 'set_data':
    case 'set_meta':
    case 'set_out': {
      return typeof input.id === 'string' ? input.id : null;
    }
    case 'move_nodes': {
      return getMoveNodesFocusTarget(input, scheme);
    }
    default: {
      return null;
    }
  }
};
