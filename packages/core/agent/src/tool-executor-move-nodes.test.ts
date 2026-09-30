import { beforeEach, describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { CMD_INSERT_NODE, schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import type { ILlmToolCall } from './llm-client.js';
import type { TToolExecutionResult } from './tool-executor.js';
import { executeToolCall } from './tool-executor.js';

const call = (name: string, input: unknown): ILlmToolCall => ({ id: 'call-1', input, name });

const errorOf = (result: TToolExecutionResult): string => {
  if (result.ok) throw new Error(`expected a failure, got ${result.content}`);
  return result.error;
};

describe('move_nodes validation', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  const insert = (parentId: string, index: number, name: string, data: string | null = null): string => {
    const result = executeToolCall(
      call('insert_node', { index, name, parentId, ...(data === null ? {} : { data }) }),
      scheme,
    );
    if (!result.ok) throw new Error(result.error);
    return (JSON.parse(result.content) as { insertedId: string }).insertedId;
  };

  const move = (
    oldParentId: string,
    indexStart: number,
    newParentId: string,
    insertIndex: number,
    options: Parameters<typeof executeToolCall>[2] = {},
  ) =>
    executeToolCall(
      call('move_nodes', { indexStart, insertIndex, length: 1, newParentId, oldParentId }),
      scheme,
      options,
    );

  beforeEach(() => {
    scheme = schemeFactory({ document: { ...getTestEmptyDoc(), type: 'function' }, infra: getTestInfrastructure() });
    if (!scheme.rootNode) throw new Error('Root not set');
    bodyId = scheme.rootNode.children[1].id;
  });

  it('moves a statement into an if branch', () => {
    insert(bodyId, 0, 'action', 'x = 1');
    const ifId = insert(bodyId, 1, 'if');
    const branchId = scheme.nodes.getNode(ifId).children[0].id;

    expect(move(bodyId, 0, branchId, 0).ok).toBe(true);
    expect(scheme.nodes.getNode(branchId).children.map((node) => node.name)).toEqual(['action']);
  });

  it('rejects moving a statement directly under a fixed-tuple parent', () => {
    insert(bodyId, 0, 'action', 'x = 1');
    const ifId = insert(bodyId, 1, 'if');

    expect(errorOf(move(bodyId, 0, ifId, 0))).toContain('if-child');
    expect(scheme.nodes.getNode(ifId).children).toHaveLength(2);
  });

  it('rejects moving a fixed-tuple slot out of its parent', () => {
    const ifId = insert(bodyId, 0, 'if');

    expect(errorOf(move(ifId, 0, bodyId, 1))).toContain('fixed tuple');
    expect(scheme.nodes.getNode(ifId).children).toHaveLength(2);
  });

  it('rejects moving a node into its own subtree', () => {
    const outerIfId = insert(bodyId, 0, 'if');
    const branchId = scheme.nodes.getNode(outerIfId).children[1].id;

    expect(errorOf(move(bodyId, 0, branchId, 0))).toContain('own subtree');
    expect(scheme.nodes.getNode(bodyId).children.map((node) => node.id)).toEqual([outerIfId]);
  });

  it('rejects a reorder that leaves an out on the first child', () => {
    const ifId = insert(bodyId, 0, 'if');
    const [firstBranchId, secondBranchId] = scheme.nodes.getNode(ifId).children.map((node) => node.id);
    expect(executeToolCall(call('set_out', { id: secondBranchId, name: 'out' }), scheme).ok).toBe(true);

    expect(errorOf(move(ifId, 0, ifId, 2))).toContain('first child');
    expect(scheme.nodes.getNode(ifId).children.map((node) => node.id)).toEqual([firstBranchId, secondBranchId]);
  });

  it('allows a same-parent reorder', () => {
    const firstId = insert(bodyId, 0, 'action', 'x = 1');
    const secondId = insert(bodyId, 1, 'action', 'y = 2');

    expect(move(bodyId, 0, bodyId, 2).ok).toBe(true);
    expect(scheme.nodes.getNode(bodyId).children.map((node) => node.id)).toEqual([secondId, firstId]);
  });

  it("lists only nodeKindFilter's kinds in the not-allowed error, counting the hidden ones", () => {
    insert(bodyId, 0, 'action', 'x = 1');
    const switchId = insert(bodyId, 1, 'switch');
    const listAll = { isListed: () => true };
    const hideOptions = {
      hiddenNote: 'create an integration first',
      isListed: (name: string) => name !== 'switch-option',
    };

    expect(errorOf(move(bodyId, 0, switchId, 0, { nodeKindFilter: listAll }))).toMatch(/allowed: switch-option$/);
    expect(errorOf(move(bodyId, 0, switchId, 0, { nodeKindFilter: hideOptions }))).toMatch(
      /allowed: \(\+1 not listed — create an integration first\)$/,
    );
  });

  it("does not accept a node living in a parent's mods as a move source", () => {
    const host = insert(bodyId, 0, 'action', 'h');
    const target = insert(bodyId, 1, 'while', 'c');
    const mod = scheme.infra.structure.factory('mod1');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, { index: 0, node: mod, parentId: host, slot: 'mods' });

    expect(move(host, 0, target, 0).ok).toBe(false);
    expect(scheme.nodes.getNode(host).mods.map((m) => m.id)).toEqual([mod.id]);
    expect(scheme.nodes.getNode(target).children).toHaveLength(0);
  });
});
