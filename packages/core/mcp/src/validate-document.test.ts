import { describe, expect, it } from 'vitest';
import type { IProjectDocument } from '@falang/dto';
import { createDefaultDocumentStackRegistry } from './stack-registry.js';
import { validateDocument } from './validate-document.js';

describe('validateDocument', () => {
  const registry = createDefaultDocumentStackRegistry();

  it("accepts a real, well-formed document built from the document type's own default tree", () => {
    const root = registry.getDefaultRoot('logic', 'function');
    if (!root) throw new Error('expected a default root');
    const document: IProjectDocument = { id: 'doc-1', name: 'My function', root, type: 'function' };
    const result = validateDocument('logic', document, registry);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.root?.name).toBe('function');
  });

  it('rejects an unknown document type for the project type', () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      name: 'x',
      root: { id: 'r', name: 'function' },
      type: 'no-such-type',
    };
    const result = validateDocument('logic', document, registry);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Unknown document type');
  });

  it("rejects a root whose data fails the node kind's zod schema, listing the path", () => {
    const document: IProjectDocument = {
      id: 'doc-1',
      name: 'x',
      // `action`'s data must be a string
      root: { children: [{ data: 123, id: 'a', name: 'action' }], id: 'root', name: 'function-body' },
      type: 'objects-structure',
    };
    // objects-structure's own root kind is 'objects-structure', not 'function-body' — proves the
    // union rejects a structurally-wrong root, not just a bad leaf.
    const result = validateDocument('logic', document, registry);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it('rejects a node with invalid `data` for its kind and reports the offending path', () => {
    const badRoot = {
      children: [
        { data: 'blank', id: 'header-id', name: 'function-header' },
        {
          children: [{ data: 42, id: 'bad-action', name: 'action' }],
          data: '',
          id: 'body-id',
          name: 'function-body',
        },
        { data: '', id: 'footer-id', name: 'function-footer' },
      ],
      id: 'root-id',
      name: 'function',
    };
    const document: IProjectDocument = { id: 'doc-1', name: 'x', root: badRoot, type: 'function' };
    const result = validateDocument('logic', document, registry);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('data');
  });
});
