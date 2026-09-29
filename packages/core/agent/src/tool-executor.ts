import type { INodeMeta } from '@falang/dto';
import type { Scheme } from '@falang/scheme';
import {
  CMD_DELETE_NODE,
  CMD_INSERT_NODE,
  CMD_MOVE_NODES,
  CMD_SET_DATA,
  CMD_SET_META,
  CMD_SET_OUT,
  canHaveOut,
} from '@falang/scheme';
import type { ILlmToolCall } from './llm-client.js';
import type { IAgentNodeKindFilter } from './node-kind-filter.js';
import { executeInsertNodes } from './insert-nodes.js';
import { describeFirstChildOutError, describeNotAllowedError } from './node-errors.js';
import { describeNodeKinds, getAllowedChildNames } from './node-kinds.js';
import { serializeTree } from './serialize.js';
import { validateMoveNodes } from './validate-move-nodes.js';
import type { TToolExecutionResult } from './tool-result.js';
import { asRecord, asRecordLenient, fail, formatZodIssues, ok, safeParseLenient } from './tool-result.js';

export type { TToolExecutionResult } from './tool-result.js';

const executeGetTree = (input: unknown, scheme: Scheme): TToolExecutionResult => {
  const params = asRecord(input) ?? {};
  const nodeId = typeof params.nodeId === 'string' ? params.nodeId : null;
  const root = nodeId ? scheme.nodes.getNodeSafe(nodeId) : scheme.rootNode;
  if (!root) return fail(nodeId ? `Node not found: ${nodeId}` : 'Document has no root node');
  return ok(serializeTree(root));
};

export interface IExecuteToolCallOptions {
  /** See `IAgentNodeKindFilter` — trims `get_node_kinds`' listing only, never validation. */
  readonly nodeKindFilter?: IAgentNodeKindFilter;
}

const executeGetNodeKinds = (
  input: unknown,
  scheme: Scheme,
  nodeKindFilter: IAgentNodeKindFilter | undefined,
): TToolExecutionResult => {
  const params = asRecord(input);
  const parentId = params && typeof params.parentId === 'string' ? params.parentId : null;
  if (!parentId) return fail('get_node_kinds: parentId is required');
  const parent = scheme.nodes.getNodeSafe(parentId);
  if (!parent) return fail(`Node not found: ${parentId}`);
  const stack = scheme.infra.structure;
  const allowedNames = getAllowedChildNames(parent.name, stack);
  const listedNames = nodeKindFilter ? allowedNames.filter((name) => nodeKindFilter.isListed(name)) : allowedNames;
  const listing = describeNodeKinds(listedNames, stack);
  const note = listedNames.length < allowedNames.length ? nodeKindFilter?.hiddenNote : null;
  return ok(JSON.stringify(note ? { ...listing, note } : listing));
};

const executeInsertNode = (
  input: unknown,
  scheme: Scheme,
  nodeKindFilter: IAgentNodeKindFilter | undefined,
): TToolExecutionResult => {
  const params = asRecord(input);
  if (!params) return fail('insert_node: invalid input');
  const { data, index, name, parentId } = params;
  if (typeof parentId !== 'string') return fail('insert_node: parentId is required');
  if (typeof name !== 'string') return fail('insert_node: name is required');
  if (typeof index !== 'number' || !Number.isInteger(index)) return fail('insert_node: index must be an integer');
  const parent = scheme.nodes.getNodeSafe(parentId);
  if (!parent) return fail(`Node not found: ${parentId}`);
  const stack = scheme.infra.structure;
  const allowedNames = getAllowedChildNames(parent.name, stack);
  if (!allowedNames.includes(name)) {
    return fail(describeNotAllowedError(name, parent.name, stack, nodeKindFilter));
  }
  if (index < 0 || index > parent.children.length) {
    return fail(`insert_node: index ${index} is out of bounds [0, ${parent.children.length}]`);
  }
  const cfg = stack.getConfig(name);
  let node = stack.factory(name);
  if ('data' in params) {
    if (!cfg.data) return fail(`Node kind "${name}" does not accept data`);
    const parsed = safeParseLenient(cfg.data.type, data);
    if (!parsed.success) return fail(`insert_node: invalid data — ${formatZodIssues(parsed.error.issues)}`);
    node = { ...node, data: parsed.data };
  }
  scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index, node, parentId });
  return ok(JSON.stringify({ insertedId: node.id }));
};

const executeDeleteNode = (input: unknown, scheme: Scheme): TToolExecutionResult => {
  const params = asRecord(input);
  const id = params && typeof params.id === 'string' ? params.id : null;
  if (!id) return fail('delete_node: id is required');
  const node = scheme.nodes.getNodeSafe(id);
  if (!node) return fail(`Node not found: ${id}`);
  if (!node.parent) return fail('delete_node: cannot delete the root node');
  scheme.commands.dispatchCommand(CMD_DELETE_NODE, { id });
  return ok(JSON.stringify({ deleted: id }));
};

const executeSetData = (input: unknown, scheme: Scheme): TToolExecutionResult => {
  const params = asRecord(input);
  if (!params) return fail('set_data: invalid input');
  const { data, id } = params;
  if (typeof id !== 'string') return fail('set_data: id is required');
  const node = scheme.nodes.getNodeSafe(id);
  if (!node) return fail(`Node not found: ${id}`);
  const cfg = scheme.infra.structure.getConfig(node.name);
  if (!cfg.data) return fail(`Node kind "${node.name}" does not accept data`);
  const parsed = safeParseLenient(cfg.data.type, data);
  if (!parsed.success) return fail(`set_data: invalid data — ${formatZodIssues(parsed.error.issues)}`);
  scheme.commands.dispatchCommand(CMD_SET_DATA, { data: parsed.data, id });
  return ok(JSON.stringify({ id }));
};

const executeSetMeta = (input: unknown, scheme: Scheme): TToolExecutionResult => {
  const params = asRecord(input);
  if (!params) return fail('set_meta: invalid input');
  const { id, meta } = params;
  if (typeof id !== 'string') return fail('set_meta: id is required');
  const metaRecord = asRecordLenient(meta);
  if (!metaRecord) return fail('set_meta: meta must be an object');
  if (!scheme.nodes.getNodeSafe(id)) return fail(`Node not found: ${id}`);
  scheme.commands.dispatchCommand(CMD_SET_META, { id, meta: metaRecord as INodeMeta });
  return ok(JSON.stringify({ id }));
};

const executeMoveNodes = (
  input: unknown,
  scheme: Scheme,
  nodeKindFilter: IAgentNodeKindFilter | undefined,
): TToolExecutionResult => {
  const params = asRecord(input);
  if (!params) return fail('move_nodes: invalid input');
  const { indexStart, insertIndex, length, newParentId, oldParentId } = params;
  if (typeof oldParentId !== 'string' || typeof newParentId !== 'string') {
    return fail('move_nodes: oldParentId and newParentId are required');
  }
  if (
    typeof indexStart !== 'number' ||
    typeof length !== 'number' ||
    typeof insertIndex !== 'number' ||
    !Number.isInteger(indexStart) ||
    !Number.isInteger(length) ||
    !Number.isInteger(insertIndex)
  ) {
    return fail('move_nodes: indexStart, length and insertIndex must be integers');
  }
  const oldParent = scheme.nodes.getNodeSafe(oldParentId);
  if (!oldParent) return fail(`Node not found: ${oldParentId}`);
  const newParent = scheme.nodes.getNodeSafe(newParentId);
  if (!newParent) return fail(`Node not found: ${newParentId}`);
  if (indexStart < 0 || length <= 0 || indexStart + length > oldParent.children.length) {
    return fail(
      `move_nodes: invalid range [${indexStart}, ${indexStart + length}) for ${oldParent.children.length} children`,
    );
  }
  if (insertIndex < 0 || insertIndex > newParent.children.length) {
    return fail(`move_nodes: insertIndex ${insertIndex} is out of bounds [0, ${newParent.children.length}]`);
  }
  const moveError = validateMoveNodes(
    scheme,
    { indexStart, insertIndex, length, newParent, oldParent },
    nodeKindFilter,
  );
  if (moveError) return fail(moveError);
  scheme.commands.dispatchCommand(CMD_MOVE_NODES, { indexStart, insertIndex, length, newParentId, oldParentId });
  return ok(JSON.stringify({ moved: length }));
};

const executeSetOut = (input: unknown, scheme: Scheme): TToolExecutionResult => {
  const params = asRecord(input);
  if (!params) return fail('set_out: invalid input');
  const { data, id, name } = params;
  if (typeof id !== 'string') return fail('set_out: id is required');
  const targetNode = scheme.nodes.getNodeSafe(id);
  if (!targetNode) return fail(`Node not found: ${id}`);
  if (name === null) {
    scheme.commands.dispatchCommand(CMD_SET_OUT, { id, outNode: null });
    return ok(JSON.stringify({ id, out: null }));
  }
  if (typeof name !== 'string') return fail('set_out: name must be a string or null');
  const stack = scheme.infra.structure;
  // `setOutNode` itself now throws for exactly this (see `@falang/scheme`'s `canHaveOut`) — checked here
  // first so the tool returns a clear, actionable `fail()` result instead of an uncaught exception. The
  // "no haveOut at all" half of `canHaveOut` is redundant with the `cfg.outType`/`haveOut` checks below in
  // practice, but calling the real, shared implementation instead of re-deriving its rule here means this
  // stays correct even if that rule's exact shape changes later.
  if (!canHaveOut(scheme, id)) {
    const parent = targetNode.parent;
    return fail(
      parent && parent.children[0]?.id === id
        ? describeFirstChildOutError(parent.name, 'set_out')
        : `set_out: node kind "${targetNode.name}" cannot have an out-node`,
    );
  }
  if (!stack.configsMap.has(name)) return fail(`Unknown node kind: ${name}`);
  const cfg = stack.getConfig(name);
  if (!cfg.outType) return fail(`Node kind "${name}" cannot be used as an out-node (no outType)`);
  let node = stack.factory(name);
  if ('data' in params) {
    if (!cfg.data) return fail(`Node kind "${name}" does not accept data`);
    const parsed = safeParseLenient(cfg.data.type, data);
    if (!parsed.success) return fail(`set_out: invalid data — ${formatZodIssues(parsed.error.issues)}`);
    node = { ...node, data: parsed.data };
  }
  scheme.commands.dispatchCommand(CMD_SET_OUT, { id, outNode: node });
  return ok(JSON.stringify({ id, out: node.id }));
};

/** `finish` never touches any document — exported so `AgentSession` can call it directly, bypassing the
 *  document-resolution/`onOpenDocument`/undo-group dance every other core tool goes through (ADR 0036:
 *  a run with no active document at all must still be able to `finish`). */
export const executeFinish = (input: unknown): TToolExecutionResult => {
  const params = asRecord(input);
  const message = params && typeof params.message === 'string' ? params.message : '';
  return ok(JSON.stringify({ message }));
};

export const executeToolCall = (
  call: ILlmToolCall,
  scheme: Scheme,
  options: IExecuteToolCallOptions = {},
): TToolExecutionResult => {
  switch (call.name) {
    case 'get_tree': {
      return executeGetTree(call.input, scheme);
    }
    case 'get_node_kinds': {
      return executeGetNodeKinds(call.input, scheme, options.nodeKindFilter);
    }
    case 'insert_node': {
      return executeInsertNode(call.input, scheme, options.nodeKindFilter);
    }
    case 'insert_nodes': {
      return executeInsertNodes(call.input, scheme, options.nodeKindFilter);
    }
    case 'delete_node': {
      return executeDeleteNode(call.input, scheme);
    }
    case 'set_data': {
      return executeSetData(call.input, scheme);
    }
    case 'set_meta': {
      return executeSetMeta(call.input, scheme);
    }
    case 'move_nodes': {
      return executeMoveNodes(call.input, scheme, options.nodeKindFilter);
    }
    case 'set_out': {
      return executeSetOut(call.input, scheme);
    }
    case 'finish': {
      return executeFinish(call.input);
    }
    default: {
      return fail(`Unknown tool: ${call.name}`);
    }
  }
};
