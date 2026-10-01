import { describe, expect, it } from 'vitest';
import { explainNotAgentCapable, isAgentCapableDocumentType } from './agent-capable-documents.js';

describe('isAgentCapableDocumentType', () => {
  it('sketch: function and every simple-code-* language only', () => {
    for (const type of [
      'function',
      'simple-code-cpp',
      'simple-code-js',
      'simple-code-ts',
      'simple-code-php',
      'simple-code-rust',
    ]) {
      expect(isAgentCapableDocumentType('sketch', type)).toBe(true);
    }
    for (const type of [
      'contour',
      'text-function',
      'mind-tree',
      'objects-structure',
      'enum-structure',
      'external-api-structure',
    ]) {
      expect(isAgentCapableDocumentType('sketch', type)).toBe(false);
    }
  });

  it('arduino: every scheme document except Devices', () => {
    expect(isAgentCapableDocumentType('arduino', 'function')).toBe(true);
    expect(isAgentCapableDocumentType('arduino', 'devices')).toBe(false);
  });

  it('explains the rejection per product', () => {
    expect(explainNotAgentCapable('arduino', { name: 'Devices', type: 'devices' })).toContain('Devices document');
    expect(explainNotAgentCapable('sketch', { name: 'Types', type: 'objects-structure' })).toContain(
      '(objects-structure) is not a document the agent can edit',
    );
  });
});
