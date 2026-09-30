import type { ILlmToolCall } from './llm-client.js';

const asRecord = (input: unknown): Record<string, unknown> | null =>
  typeof input === 'object' && input !== null && !Array.isArray(input) ? (input as Record<string, unknown>) : null;

const str = (params: Record<string, unknown> | null, key: string): string =>
  params && typeof params[key] === 'string' ? (params[key] as string) : `?${key}`;

const num = (params: Record<string, unknown> | null, key: string): string =>
  params && typeof params[key] === 'number' ? String(params[key]) : `?${key}`;

const describeOther = (call: ILlmToolCall, params: Record<string, unknown> | null): string =>
  call.name === 'ask_user' ? `Asked: ${str(params, 'question')}` : call.name;

/** A short, human-readable one-liner for a tool call — what the agent chat's step trace shows instead of the
 *  bare tool name, e.g. "Insert 'action' into n3 at index 2" rather than just "insert_node". */
export const describeToolCall = (call: ILlmToolCall): string => {
  const params = asRecord(call.input);
  switch (call.name) {
    case 'get_tree': {
      return params && typeof params.nodeId === 'string'
        ? `Looked at the tree at node ${params.nodeId}`
        : 'Looked at the tree';
    }
    case 'get_node_kinds': {
      return `Checked allowed node kinds under ${str(params, 'parentId')}`;
    }
    case 'insert_node': {
      return `Insert '${str(params, 'name')}' into ${str(params, 'parentId')} at index ${num(params, 'index')}`;
    }
    case 'insert_nodes': {
      const nodeRec =
        params && typeof params.node === 'object' && params.node !== null
          ? (params.node as Record<string, unknown>)
          : null;
      const name = nodeRec && typeof nodeRec.name === 'string' ? nodeRec.name : '?name';
      return `Insert '${name}' subtree into ${str(params, 'parentId')} at index ${num(params, 'index')}`;
    }
    case 'delete_node': {
      return `Delete node ${str(params, 'id')}`;
    }
    case 'set_data': {
      return `Update data on node ${str(params, 'id')}`;
    }
    case 'set_meta': {
      return `Update meta on node ${str(params, 'id')}`;
    }
    case 'move_nodes': {
      return `Move ${num(params, 'length')} node(s) from ${str(params, 'oldParentId')} to ${str(params, 'newParentId')}`;
    }
    case 'set_out': {
      return params && params.name === null
        ? `Clear out-node on ${str(params, 'id')}`
        : `Set out-node '${str(params, 'name')}' on ${str(params, 'id')}`;
    }
    case 'finish': {
      return 'Finished';
    }
    default: {
      return describeOther(call, params);
    }
  }
};
