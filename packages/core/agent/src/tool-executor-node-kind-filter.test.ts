import { beforeEach, describe, expect, it } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { schemeFactory } from '@falang/scheme';
import { getTestInfrastructure } from '@falang/scheme/test-utils/get-test-infrastructure.js';
import { getTestEmptyDoc } from '@falang/scheme/test-utils/get-test-empty-doc.js';
import type { ILlmToolCall } from './llm-client.js';
import { executeToolCall } from './tool-executor.js';

const call = (name: string, input: unknown): ILlmToolCall => ({ id: 'call-1', input, name });

describe('executeToolCall with a nodeKindFilter', () => {
  // oxlint-disable-next-line init-declarations
  let scheme: Scheme;
  // oxlint-disable-next-line init-declarations
  let bodyId: string;

  beforeEach(() => {
    scheme = schemeFactory({ document: { ...getTestEmptyDoc(), type: 'function' }, infra: getTestInfrastructure() });
    if (!scheme.rootNode) throw new Error('Root not set');
    bodyId = scheme.rootNode.children[1].id;
  });

  it('get_node_kinds lists only what nodeKindFilter allows, with its hiddenNote', () => {
    const nodeKindFilter = { hiddenNote: 'create an integration first', isListed: (name: string) => name !== 'if' };
    const result = executeToolCall(call('get_node_kinds', { parentId: bodyId }), scheme, { nodeKindFilter });
    if (!result.ok) throw new Error(result.error);
    const parsed = JSON.parse(result.content) as { nodeKinds: { name: string }[]; note?: string };
    expect(parsed.nodeKinds.map((kind) => kind.name)).toContain('action');
    expect(parsed.nodeKinds.map((kind) => kind.name)).not.toContain('if');
    expect(parsed.note).toBe('create an integration first');
  });

  it('get_node_kinds omits the note when the filter hid nothing', () => {
    const nodeKindFilter = { hiddenNote: 'unused', isListed: () => true };
    const result = executeToolCall(call('get_node_kinds', { parentId: bodyId }), scheme, { nodeKindFilter });
    if (!result.ok) throw new Error(result.error);
    expect(JSON.parse(result.content)).not.toHaveProperty('note');
  });

  it('a kind hidden by nodeKindFilter can still be inserted (filtering is listing-only)', () => {
    const nodeKindFilter = { isListed: (name: string) => name !== 'action' };
    const result = executeToolCall(
      call('insert_node', { data: 'x = 1', index: 0, name: 'action', parentId: bodyId }),
      scheme,
      { nodeKindFilter },
    );
    expect(result.ok).toBe(true);
  });
});
