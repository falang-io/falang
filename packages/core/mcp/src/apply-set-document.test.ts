import { describe, expect, it } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import { applySetDocument } from './apply-set-document.js';
import { DEFAULT_LOCK_TTL_MS, type IDocumentLock } from './locks.js';
import { createDefaultDocumentStackRegistry } from './stack-registry.js';

const NOW = 1_700_000_000_000;

describe('applySetDocument', () => {
  const registry = createDefaultDocumentStackRegistry();

  const makeOldDocument = (): { document: IProjectDocument; root: INode } => {
    const defaultRoot = registry.getDefaultRoot('logic', 'function');
    if (!defaultRoot) throw new Error('expected a default root');
    const root: INode = { ...defaultRoot, meta: { x: 1, y: 2 } };
    return { document: { id: 'doc-1', name: 'My function', root, type: 'function' }, root };
  };

  it('acquires the lock, validates, merges meta and returns the new document + locks', () => {
    const { document: oldDocument, root: oldRoot } = makeOldDocument();
    // Same id/shape, no meta of its own — should inherit the old root's meta.
    const plainRoot = structuredClone(oldRoot) as unknown as Record<string, unknown>;
    delete plainRoot.meta;
    const rootWithoutMeta = plainRoot as unknown as INode;
    const result = applySetDocument({
      locks: [],
      newRoot: rootWithoutMeta,
      now: NOW,
      oldDocument,
      owner: 'agent-1',
      projectType: 'logic',
      registry,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.root?.meta).toEqual({ x: 1, y: 2 });
    expect(result.locks).toEqual([
      {
        acquiredAt: new Date(NOW).toISOString(),
        documentId: 'doc-1',
        expiresAt: new Date(NOW + DEFAULT_LOCK_TTL_MS).toISOString(),
        owner: 'agent-1',
      },
    ]);
  });

  it('fails without touching the document when the lock is held by another session', () => {
    const { document: oldDocument, root: oldRoot } = makeOldDocument();
    const existingLock: IDocumentLock = {
      acquiredAt: new Date(NOW).toISOString(),
      documentId: 'doc-1',
      expiresAt: new Date(NOW + 60_000).toISOString(),
      owner: 'agent-other',
    };
    const result = applySetDocument({
      locks: [existingLock],
      newRoot: oldRoot,
      now: NOW + 10,
      oldDocument,
      owner: 'agent-1',
      projectType: 'logic',
      registry,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('locked by another session');
  });

  it('fails without touching locks when the new root does not validate', () => {
    const { document: oldDocument } = makeOldDocument();
    const result = applySetDocument({
      locks: [],
      newRoot: { id: 'bad', name: 'not-a-real-node-kind' },
      now: NOW,
      oldDocument,
      owner: 'agent-1',
      projectType: 'logic',
      registry,
    });
    expect(result.ok).toBe(false);
  });

  it('a node the agent itself gives its own meta keeps that meta, not the old one', () => {
    const { document: oldDocument, root: oldRoot } = makeOldDocument();
    const result = applySetDocument({
      locks: [],
      newRoot: { ...oldRoot, meta: { fresh: true } },
      now: NOW,
      oldDocument,
      owner: 'agent-1',
      projectType: 'logic',
      registry,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.root?.meta).toEqual({ fresh: true });
  });
});
