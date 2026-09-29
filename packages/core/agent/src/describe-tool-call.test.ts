import { describe, expect, it } from 'vitest';
import type { ILlmToolCall } from './llm-client.js';
import { describeToolCall } from './describe-tool-call.js';

const call = (name: string, input: unknown): ILlmToolCall => ({ id: 'call-1', input, name });

describe('describeToolCall', () => {
  it('describes get_tree', () => {
    expect(describeToolCall(call('get_tree', {}))).toBe('Looked at the tree');
    expect(describeToolCall(call('get_tree', { nodeId: 'n1' }))).toBe('Looked at the tree at node n1');
  });

  it('describes get_node_kinds', () => {
    expect(describeToolCall(call('get_node_kinds', { parentId: 'n1' }))).toBe('Checked allowed node kinds under n1');
  });

  it('describes insert_node', () => {
    expect(describeToolCall(call('insert_node', { index: 2, name: 'action', parentId: 'n3' }))).toBe(
      "Insert 'action' into n3 at index 2",
    );
  });

  it('describes insert_nodes', () => {
    expect(describeToolCall(call('insert_nodes', { index: 0, node: { name: 'if' }, parentId: 'n3' }))).toBe(
      "Insert 'if' subtree into n3 at index 0",
    );
  });

  it('describes delete_node', () => {
    expect(describeToolCall(call('delete_node', { id: 'n1' }))).toBe('Delete node n1');
  });

  it('describes set_data and set_meta', () => {
    expect(describeToolCall(call('set_data', { data: 'x', id: 'n1' }))).toBe('Update data on node n1');
    expect(describeToolCall(call('set_meta', { id: 'n1', meta: {} }))).toBe('Update meta on node n1');
  });

  it('describes move_nodes', () => {
    expect(
      describeToolCall(
        call('move_nodes', { indexStart: 0, insertIndex: 1, length: 2, newParentId: 'n2', oldParentId: 'n1' }),
      ),
    ).toBe('Move 2 node(s) from n1 to n2');
  });

  it('describes set_out, set and clear', () => {
    expect(describeToolCall(call('set_out', { id: 'n1', name: 'action' }))).toBe("Set out-node 'action' on n1");
    expect(describeToolCall(call('set_out', { id: 'n1', name: null }))).toBe('Clear out-node on n1');
  });

  it('describes finish', () => {
    expect(describeToolCall(call('finish', { message: 'done' }))).toBe('Finished');
  });

  it('falls back to the raw tool name for an unknown tool', () => {
    expect(describeToolCall(call('no_such_tool', {}))).toBe('no_such_tool');
  });
});
