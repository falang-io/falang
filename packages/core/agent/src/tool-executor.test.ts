import { beforeEach, describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import type { ILlmToolCall } from './llm-client.js';
import { executeToolCall } from './tool-executor.js';

const call = (name: string, input: unknown): ILlmToolCall => ({ id: 'call-1', input, name });

describe('executeToolCall', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;
  // oxlint-disable-next-line init-declarations
  let headerId: string;

  beforeEach(() => {
    scheme = schemeFactory({ document: { ...getTestEmptyDoc(), type: 'function' }, infra: getTestInfrastructure() });
    if (!scheme.rootNode) throw new Error('Root not set');
    headerId = scheme.rootNode.children[0].id;
    bodyId = scheme.rootNode.children[1].id;
  });

  it('insert_node inserts a node with the given data', () => {
    const result = executeToolCall(
      call('insert_node', { data: 'hello', index: 0, name: 'action', parentId: bodyId }),
      scheme,
    );
    expect(result.ok).toBe(true);
    const body = scheme.nodes.getNode(bodyId);
    expect(body.children).toHaveLength(1);
    expect(body.children[0].data).toBe('hello');
  });

  it('insert_node without data uses the kind default', () => {
    executeToolCall(call('insert_node', { index: 0, name: 'action', parentId: bodyId }), scheme);
    const body = scheme.nodes.getNode(bodyId);
    expect(body.children[0].data).toBe('');
  });

  it('insert_node rejects an unknown node kind', () => {
    const result = executeToolCall(call('insert_node', { index: 0, name: 'no-such', parentId: bodyId }), scheme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('no-such');
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(0);
  });

  it('insert_node rejects a kind not allowed under the parent', () => {
    const result = executeToolCall(call('insert_node', { index: 0, name: 'action', parentId: headerId }), scheme);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not allowed');
  });

  it('insert_node rejects data that fails the schema', () => {
    const result = executeToolCall(
      call('insert_node', { data: 42, index: 0, name: 'action', parentId: bodyId }),
      scheme,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('string');
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(0);
  });

  it('insert_node rejects an out-of-bounds index', () => {
    const result = executeToolCall(
      call('insert_node', { data: '', index: 5, name: 'action', parentId: bodyId }),
      scheme,
    );
    expect(result.ok).toBe(false);
  });

  it('insert_node gives a fixed-tuple-aware error when targeting a tuple parent directly', () => {
    executeToolCall(call('insert_node', { index: 0, name: 'if', parentId: bodyId }), scheme);
    const ifId = scheme.nodes.getNode(bodyId).children[0].id;
    const result = executeToolCall(call('insert_node', { data: '', index: 0, name: 'action', parentId: ifId }), scheme);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('fixed');
      expect(result.error).toContain('if-child');
      expect(result.error).toContain('insert_nodes');
    }
  });

  describe('insert_nodes', () => {
    it('inserts a whole subtree — an if with both branches filled — in one call', () => {
      const result = executeToolCall(
        call('insert_nodes', {
          index: 0,
          node: {
            children: [
              { children: [{ data: 'then', name: 'action' }], name: 'if-child' },
              { children: [{ data: 'else', name: 'action' }], name: 'if-child', out: { name: 'out' } },
            ],
            data: 'x > 0',
            name: 'if',
          },
          parentId: bodyId,
        }),
        scheme,
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(JSON.parse(result.content)).toMatchObject({ insertedCount: 6 });

      const body = scheme.nodes.getNode(bodyId);
      expect(body.children).toHaveLength(1);
      const ifNode = body.children[0];
      expect(ifNode.name).toBe('if');
      expect(ifNode.data).toBe('x > 0');
      expect(ifNode.children).toHaveLength(2);
      expect(ifNode.children[0].children[0].data).toBe('then');
      expect(ifNode.children[1].children[0].data).toBe('else');
      expect(ifNode.children[1].out?.name).toBe('out');
    });

    it('without a children key, a tuple parent keeps the factory default (two empty if-child branches)', () => {
      const result = executeToolCall(
        call('insert_nodes', { index: 0, node: { data: 'true', name: 'if' }, parentId: bodyId }),
        scheme,
      );
      expect(result.ok).toBe(true);
      const ifNode = scheme.nodes.getNode(bodyId).children[0];
      expect(ifNode.children).toHaveLength(2);
      expect(ifNode.children[0].name).toBe('if-child');
      expect(ifNode.children[0].children).toHaveLength(0);
    });

    it('rejects the whole subtree atomically when a nested node is invalid — nothing is inserted', () => {
      const result = executeToolCall(
        call('insert_nodes', {
          index: 0,
          node: {
            children: [{ children: [{ data: 42, name: 'action' }], name: 'if-child' }, { name: 'if-child' }],
            name: 'if',
          },
          parentId: bodyId,
        }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('node.children[0].children[0]');
      expect(scheme.nodes.getNode(bodyId).children).toHaveLength(0);
    });

    it('rejects a tuple children array of the wrong length', () => {
      const result = executeToolCall(
        call('insert_nodes', { index: 0, node: { children: [{ name: 'if-child' }], name: 'if' }, parentId: bodyId }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('fixed');
      expect(scheme.nodes.getNode(bodyId).children).toHaveLength(0);
    });

    it('rejects a tuple slot whose name does not match the expected slot', () => {
      const result = executeToolCall(
        call('insert_nodes', {
          index: 0,
          node: { children: [{ data: '', name: 'action' }, { name: 'if-child' }], name: 'if' },
          parentId: bodyId,
        }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('if-child');
    });

    it('rejects children on a node kind that does not accept them', () => {
      const result = executeToolCall(
        call('insert_nodes', {
          index: 0,
          node: { children: [{ data: '', name: 'action' }], data: '', name: 'action' },
          parentId: bodyId,
        }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('does not accept children');
    });

    it('rejects out on a node kind without haveOut', () => {
      const result = executeToolCall(
        call('insert_nodes', { index: 0, node: { data: '', name: 'action', out: { name: 'out' } }, parentId: bodyId }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('cannot have an out-node');
    });

    it('rejects an out on the first (index 0) if-child branch — nothing is applied', () => {
      const result = executeToolCall(
        call('insert_nodes', {
          index: 0,
          node: {
            children: [
              { children: [{ data: 'then', name: 'action' }], name: 'if-child', out: { name: 'out' } },
              { name: 'if-child' },
            ],
            data: 'x > 0',
            name: 'if',
          },
          parentId: bodyId,
        }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('node.children[0].out');
        expect(result.error).toContain('if');
      }
      expect(scheme.nodes.getNode(bodyId).children).toHaveLength(0);
    });

    it('rejects an if inserted at index 0 under a branch-container parent when the if itself has an out', () => {
      // Same rule at the top level of insert_nodes, not just nested inside a spec's own `children`: the
      // whole subtree being inserted becomes the *parent's* children[0] here.
      executeToolCall(call('insert_node', { index: 0, name: 'switch', parentId: bodyId }), scheme);
      const switchId = scheme.nodes.getNode(bodyId).children[0].id;
      const result = executeToolCall(
        call('insert_nodes', { index: 0, node: { name: 'switch-option', out: { name: 'out' } }, parentId: switchId }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('node.out');
    });

    it('gives the same fixed-tuple-aware error as insert_node when targeting a tuple parent directly', () => {
      executeToolCall(call('insert_node', { index: 0, name: 'if', parentId: bodyId }), scheme);
      const ifId = scheme.nodes.getNode(bodyId).children[0].id;
      const result = executeToolCall(
        call('insert_nodes', { index: 0, node: { data: '', name: 'action' }, parentId: ifId }),
        scheme,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('if-child');
    });
  });

  it('set_data rejects invalid data', () => {
    const result = executeToolCall(call('set_data', { data: 42, id: bodyId }), scheme);
    expect(result.ok).toBe(false);
  });

  it('delete_node rejects a missing node', () => {
    const result = executeToolCall(call('delete_node', { id: 'does-not-exist' }), scheme);
    expect(result.ok).toBe(false);
  });

  it('move_nodes rejects a missing parent', () => {
    const result = executeToolCall(
      call('move_nodes', {
        indexStart: 0,
        insertIndex: 0,
        length: 1,
        newParentId: bodyId,
        oldParentId: 'does-not-exist',
      }),
      scheme,
    );
    expect(result.ok).toBe(false);
  });

  it('set_out rejects a node kind without outType', () => {
    const result = executeToolCall(call('set_out', { id: bodyId, name: 'action' }), scheme);
    expect(result.ok).toBe(false);
  });

  it('set_out rejects an out on the first (index 0) if-child branch, but allows it on the second and allows clearing', () => {
    executeToolCall(call('insert_node', { index: 0, name: 'if', parentId: bodyId }), scheme);
    const ifNode = scheme.nodes.getNode(bodyId).children[0];
    const [firstBranchId, secondBranchId] = ifNode.children.map((c) => c.id);

    const rejected = executeToolCall(call('set_out', { id: firstBranchId, name: 'out' }), scheme);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.error).toContain('if');
    expect(scheme.nodes.getNode(firstBranchId).out).toBeNull();

    expect(executeToolCall(call('set_out', { id: secondBranchId, name: 'out' }), scheme).ok).toBe(true);
    expect(executeToolCall(call('set_out', { id: firstBranchId, name: null }), scheme).ok).toBe(true);
  });

  it('get_tree returns the serialized subtree', () => {
    const result = executeToolCall(call('get_tree', { nodeId: bodyId }), scheme);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toContain('"id":"2"');
  });

  it('get_node_kinds returns the allowed child kinds', () => {
    const result = executeToolCall(call('get_node_kinds', { parentId: bodyId }), scheme);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.content).toContain('action');
  });

  it('rejects an unknown tool name', () => {
    const result = executeToolCall(call('no_such_tool', {}), scheme);
    expect(result.ok).toBe(false);
  });
});
