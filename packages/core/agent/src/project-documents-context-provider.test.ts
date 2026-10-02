import { describe, expect, it } from 'vitest';
import { ProjectDocumentsContextProvider } from './project-documents-context-provider.js';

const context = { activeDocumentId: null, getActiveScheme: () => null } as never;

describe('ProjectDocumentsContextProvider', () => {
  it('keeps the plain line format without a path', () => {
    const provider = new ProjectDocumentsContextProvider(() => [{ id: 'd1', name: 'f', type: 'function' }]);
    expect(provider.describe(context)).toBe('Documents in this project (documentId, type, name):\n- d1 (function) "f"');
  });

  it('renders the optional path and extra lines', () => {
    const provider = new ProjectDocumentsContextProvider(
      () => [{ id: 'd1', name: 'f', path: 'Functions/Sub', type: 'function' }],
      () => ['Sections: …'],
    );
    expect(provider.describe(context)).toBe(
      'Documents in this project (documentId, type, name):\n- d1 (function) "f" in Functions/Sub\nSections: …',
    );
  });

  it('still lists extra lines for an empty project', () => {
    const provider = new ProjectDocumentsContextProvider(
      () => [],
      () => ['Sections: …'],
    );
    expect(provider.describe(context)).toBe('This project has no documents yet.\nSections: …');
  });
});
