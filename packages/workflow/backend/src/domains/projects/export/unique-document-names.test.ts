import { describe, expect, it } from 'vitest';
import { dedupeDocumentNames } from './unique-document-names.js';

describe('dedupeDocumentNames', () => {
  it('keeps unique names untouched', () => {
    const docs = [
      { type: 'function', name: 'a' },
      { type: 'function', name: 'b' },
    ];
    expect(dedupeDocumentNames(docs, [])).toEqual(docs);
  });

  it('renames case-insensitive duplicates, valid identifiers for functions', () => {
    const result = dedupeDocumentNames(
      [
        { type: 'function', name: 'run' },
        { type: 'trigger-function', name: 'Run' },
        { type: 'objects-structure', name: 'run' },
      ],
      [],
    );
    expect(result.map((d) => d.name)).toEqual(['run', 'Run2', 'run (2)']);
  });

  it('respects reserved names across types', () => {
    const result = dedupeDocumentNames([{ type: 'objects-structure', name: 'integrations' }], ['Integrations']);
    expect(result[0]?.name).toBe('integrations (2)');
  });
});
