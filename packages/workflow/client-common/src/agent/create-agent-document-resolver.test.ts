import { describe, expect, it, vi } from 'vitest';
import type { Scheme } from '@falang/scheme';
import { createAgentDocumentResolver, type IAgentResolvableDocument } from './create-agent-document-resolver.js';

const fakeScheme = (): Scheme => ({}) as Scheme;

const buildResolver = (documents: Record<string, IAgentResolvableDocument>) => {
  const scheme = fakeScheme();
  const getScheme = vi.fn().mockReturnValue(scheme);
  const getDocument = vi.fn((documentId: string) => documents[documentId]);
  const acquireLock = vi.fn();
  const resolver = createAgentDocumentResolver({ acquireLock, getDocument, getScheme });
  return { acquireLock, getDocument, getScheme, resolver, scheme };
};

describe('createAgentDocumentResolver', () => {
  it('a function document resolves through getScheme and acquires a lock for it', () => {
    const { acquireLock, getScheme, resolver, scheme } = buildResolver({
      'doc-b': { pinned: false, type: 'function' },
    });

    expect(resolver.resolve('doc-b')).toBe(scheme);
    expect(getScheme).toHaveBeenCalledWith('doc-b');
    expect(acquireLock).toHaveBeenCalledWith('doc-b');
  });

  it('a trigger-function document resolves too', () => {
    const { resolver, scheme } = buildResolver({ 'doc-t': { type: 'trigger-function' } });
    expect(resolver.resolve('doc-t')).toBe(scheme);
  });

  it('every call goes through getScheme/acquireLock, even for the same id twice', () => {
    const { acquireLock, getScheme, resolver } = buildResolver({ 'doc-a': { type: 'function' } });

    resolver.resolve('doc-a');
    resolver.resolve('doc-a');
    expect(getScheme).toHaveBeenCalledTimes(2);
    expect(acquireLock).toHaveBeenCalledTimes(2);
  });

  it('throws for an unknown documentId, without acquiring a lock or calling getScheme', () => {
    const { acquireLock, getScheme, resolver } = buildResolver({});
    expect(() => resolver.resolve('missing')).toThrow(/not found/);
    expect(acquireLock).not.toHaveBeenCalled();
    expect(getScheme).not.toHaveBeenCalled();
  });

  it('throws for a pinned document, without acquiring a lock or calling getScheme', () => {
    const { acquireLock, getScheme, resolver } = buildResolver({
      'integrations-doc': { pinned: true, type: 'custom' },
    });
    expect(() => resolver.resolve('integrations-doc')).toThrow(/pinned/);
    expect(acquireLock).not.toHaveBeenCalled();
    expect(getScheme).not.toHaveBeenCalled();
  });

  it('throws for a document that is not function/trigger-function/objects-structure, without acquiring a lock or calling getScheme', () => {
    const { acquireLock, getScheme, resolver } = buildResolver({
      'enum-doc': { type: 'enum-structure' },
    });
    expect(() => resolver.resolve('enum-doc')).toThrow(/enum-structure/);
    expect(acquireLock).not.toHaveBeenCalled();
    expect(getScheme).not.toHaveBeenCalled();
  });

  it('resolves an objects-structure document (interface declarations are agent-editable)', () => {
    const { acquireLock, getScheme, resolver } = buildResolver({
      'struct-doc': { type: 'objects-structure' },
    });
    resolver.resolve('struct-doc');
    expect(acquireLock).toHaveBeenCalledWith('struct-doc');
    expect(getScheme).toHaveBeenCalledWith('struct-doc');
  });
});
