import { describe, expect, it } from 'vitest';
import { shouldOpenAgentDocumentTab } from './follow-agent-document.js';

describe('shouldOpenAgentDocumentTab', () => {
  it('is true for a document with no open tab yet', () => {
    expect(shouldOpenAgentDocumentTab(['doc-a', 'doc-b'], 'doc-c')).toBe(true);
  });

  it('is true when there are no open tabs at all', () => {
    expect(shouldOpenAgentDocumentTab([], 'doc-a')).toBe(true);
  });

  it('is false when the document already has an open tab — never steals the active tab mid-run', () => {
    expect(shouldOpenAgentDocumentTab(['doc-a', 'doc-b'], 'doc-b')).toBe(false);
  });
});
