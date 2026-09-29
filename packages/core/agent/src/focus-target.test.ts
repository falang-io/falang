import { beforeEach, describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import type { ILlmToolCall } from './llm-client.js';
import { executeToolCall } from './tool-executor.js';
import { getFocusTargetId } from './focus-target.js';

const call = (name: string, input: unknown): ILlmToolCall => ({ id: 'call-1', input, name });

describe('getFocusTargetId', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  beforeEach(() => {
    scheme = schemeFactory({ document: { ...getTestEmptyDoc(), type: 'function' }, infra: getTestInfrastructure() });
    if (!scheme.rootNode) throw new Error('Root not set');
    bodyId = scheme.rootNode.children[1].id;
    executeToolCall(call('insert_node', { index: 0, name: 'action', parentId: bodyId }), scheme);
  });

  it('insert_node at index 0 focuses the parent', () => {
    expect(getFocusTargetId(call('insert_node', { index: 0, name: 'action', parentId: bodyId }), scheme)).toBe(bodyId);
  });

  it('insert_node at index > 0 focuses the previous sibling', () => {
    const firstChildId = scheme.nodes.getNode(bodyId).children[0].id;
    expect(getFocusTargetId(call('insert_node', { index: 1, name: 'action', parentId: bodyId }), scheme)).toBe(
      firstChildId,
    );
  });

  it("insert_nodes shares insert_node's parentId/index focus target", () => {
    expect(getFocusTargetId(call('insert_nodes', { index: 0, node: { name: 'if' }, parentId: bodyId }), scheme)).toBe(
      bodyId,
    );
    const firstChildId = scheme.nodes.getNode(bodyId).children[0].id;
    expect(getFocusTargetId(call('insert_nodes', { index: 1, node: { name: 'if' }, parentId: bodyId }), scheme)).toBe(
      firstChildId,
    );
  });

  it('delete_node/set_data/set_meta/set_out focus the node itself', () => {
    expect(getFocusTargetId(call('delete_node', { id: 'n1' }), scheme)).toBe('n1');
    expect(getFocusTargetId(call('set_data', { data: 'x', id: 'n2' }), scheme)).toBe('n2');
    expect(getFocusTargetId(call('set_meta', { id: 'n3', meta: {} }), scheme)).toBe('n3');
    expect(getFocusTargetId(call('set_out', { id: 'n4', name: null }), scheme)).toBe('n4');
  });

  it('move_nodes focuses the first moved node', () => {
    const firstChildId = scheme.nodes.getNode(bodyId).children[0].id;
    expect(
      getFocusTargetId(
        call('move_nodes', {
          indexStart: 0,
          insertIndex: 0,
          length: 1,
          newParentId: bodyId,
          oldParentId: bodyId,
        }),
        scheme,
      ),
    ).toBe(firstChildId);
  });

  it('read-only tools, finish, and invalid input have no focus target', () => {
    expect(getFocusTargetId(call('get_tree', { nodeId: bodyId }), scheme)).toBeNull();
    expect(getFocusTargetId(call('get_node_kinds', { parentId: bodyId }), scheme)).toBeNull();
    expect(getFocusTargetId(call('finish', { message: 'done' }), scheme)).toBeNull();
    expect(getFocusTargetId(call('insert_node', null), scheme)).toBeNull();
    expect(getFocusTargetId(call('insert_node', {}), scheme)).toBeNull();
  });
});
