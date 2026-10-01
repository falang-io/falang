import { container } from '@falang/di';
import { TOKEN_HISTORY, registerGlobalTokens } from '@falang/scheme';
import { afterEach, describe, expect, it } from 'vitest';
import { buildWorkflowDocumentScheme } from './build-workflow-document-scheme.js';
import type { Scheme } from '@falang/scheme';

describe('buildWorkflowDocumentScheme', () => {
  const schemes: Scheme[] = [];
  afterEach(() => {
    for (const scheme of schemes.splice(0)) scheme.dispose();
  });

  const build = (type: string, extra: Partial<Parameters<typeof buildWorkflowDocumentScheme>[0]> = {}) => {
    registerGlobalTokens();
    const scheme = buildWorkflowDocumentScheme({
      doc: { id: 'd1', name: 'doc', type },
      getCredentialInstances: () => [],
      parentContainer: container,
      ...extra,
    });
    schemes.push(scheme);
    return scheme;
  };

  it('builds a function document with the stack default root, workflow node kinds and a history module', () => {
    const scheme = build('function');
    expect(scheme.rootNode?.name).toBe('function');
    expect(() => scheme.infra.structure.factory('magic')).not.toThrow();
    expect(() => scheme.infra.structure.factory('telegram-send-message')).not.toThrow();
    expect(() => scheme.infra.structure.factory('no-such-kind')).toThrow();
    expect(scheme.container.isRegistered(TOKEN_HISTORY, true)).toBe(true);
  });

  it('builds a trigger-function and an objects-structure document with their own roots (both agent-editable)', () => {
    expect(build('trigger-function').rootNode?.name).toBe('trigger-function');
    const structure = build('objects-structure');
    expect(structure.rootNode?.name).toBe('objects-structure');
    expect(structure.container.isRegistered(TOKEN_HISTORY, true)).toBe(true);
  });

  it('uses the stored root when the document has one, and runs onSchemeCreated before the root is set', () => {
    let rootAtCallback: unknown = 'unset';
    const probe = build('function');
    const stored = {
      children: [
        { id: 'h', name: 'function-header', data: '' },
        { children: [{ data: 'x = 1', id: 'a1', name: 'action' }], data: '', id: 'b', name: 'function-body' },
        { id: 'f', name: 'function-footer', data: '' },
      ],
      id: 'root-1',
      name: 'function',
    };
    const scheme = build('function', {
      doc: { data: stored, id: 'd2', name: 'doc2', type: 'function' },
      onSchemeCreated: (created) => {
        rootAtCallback = created.rootNode;
      },
    });
    expect(probe.rootNode?.id).not.toBe('root-1');
    expect(scheme.rootNode?.id).toBe('root-1');
    expect(scheme.nodes.getNodeSafe('a1')?.data).toBe('x = 1');
    expect(rootAtCallback).toBeNull();
  });
});
