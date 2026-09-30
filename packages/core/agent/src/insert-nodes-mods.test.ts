import { beforeEach, describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import { executeToolCall } from './tool-executor.js';

describe('insert_nodes and mods', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  beforeEach(() => {
    scheme = schemeFactory({ document: { ...getTestEmptyDoc(), type: 'function' }, infra: getTestInfrastructure() });
    if (!scheme.rootNode) throw new Error('Root not set');
    bodyId = scheme.rootNode.children[1].id;
  });

  const run = (node: unknown) =>
    executeToolCall({ id: 'c', input: { index: 0, node, parentId: bodyId }, name: 'insert_nodes' }, scheme);

  it('rejects a spec with a mods key, at the top and nested', () => {
    for (const node of [
      { data: 'x', mods: [], name: 'action' },
      { children: [{ data: 'x', mods: [{ name: 'mod1' }], name: 'action' }], data: 'c', name: 'while' },
    ]) {
      const result = run(node);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toContain('use set_document');
    }
    expect(scheme.nodes.getNode(bodyId).children).toHaveLength(0);
  });

  it('still inserts a spec without mods', () => {
    expect(run({ data: 'x', name: 'action' }).ok).toBe(true);
  });
});
