import { describe, expect, it } from 'vitest';
import { findDocumentNameConflict, validateDocumentName } from './document-names.js';

const docs = [
  { id: '1', name: 'Order' },
  { id: '2', name: 'run' },
];

describe('findDocumentNameConflict', () => {
  it('matches case-insensitively and ignores surrounding spaces', () => {
    expect(findDocumentNameConflict(docs, ' ORDER ')?.id).toBe('1');
  });
  it('returns undefined for a free name', () => {
    expect(findDocumentNameConflict(docs, 'other')).toBeUndefined();
  });
  it('excludes the document being renamed', () => {
    expect(findDocumentNameConflict(docs, 'order', '1')).toBeUndefined();
    expect(findDocumentNameConflict(docs, 'order', '2')?.id).toBe('1');
  });
});

describe('validateDocumentName', () => {
  it('reports each failure', () => {
    expect(validateDocumentName(docs, 'function', '  ')).toBe('required');
    expect(validateDocumentName(docs, 'function', 'Мой бот')).toBe('invalid-function-name');
    expect(validateDocumentName(docs, 'trigger-function', 'my bot')).toBe('invalid-function-name');
    expect(validateDocumentName(docs, 'function', 'RUN')).toBe('invalid-function-name');
    expect(validateDocumentName(docs, 'objects-structure', 'RUN')).toBe('taken');
    expect(validateDocumentName(docs, 'function', 'run')).toBe('taken');
  });
  it('accepts a free valid name and the renamed document itself', () => {
    expect(validateDocumentName(docs, 'function', 'other')).toBeNull();
    expect(validateDocumentName(docs, 'objects-structure', 'ORDER', '1')).toBeNull();
  });
});
