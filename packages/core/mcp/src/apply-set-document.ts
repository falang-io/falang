import type { INode, IProjectDocument } from '@falang/dto';
import { acquireLock, type IDocumentLock } from './locks.js';
import { preserveMeta } from './preserve-meta.js';
import type { DocumentStackRegistry } from './stack-registry.js';
import { validateDocument } from './validate-document.js';

export type TApplySetDocumentResult =
  | { readonly ok: true; readonly document: IProjectDocument; readonly locks: readonly IDocumentLock[] }
  | { readonly ok: false; readonly error: string };

export interface IApplySetDocumentParams {
  readonly projectType: string;
  readonly oldDocument: IProjectDocument;
  readonly newRoot: INode;
  readonly locks: readonly IDocumentLock[];
  readonly owner: string;
  readonly now: number;
  readonly ttlMs?: number;
  readonly registry: DocumentStackRegistry;
}

/**
 * The one `set_document` code path both the desktop stdio host and the workflow HTTP host run
 * through, so the two can't drift on lock/validate/meta semantics (see
 * ADR 0029 (private), "`set_document` is the only write path"):
 * auto-acquires (or renews) the document's lock for `owner`, validates `newRoot` against
 * `projectType`/`oldDocument.type`'s `NodesStack`, then restores `oldDocument.root`'s `meta` onto
 * every surviving node id via `preserveMeta`. Any failure (lock conflict or validation error) leaves
 * both the document and `locks` untouched — the caller gets back only an `error` string.
 */
export const applySetDocument = (params: IApplySetDocumentParams): TApplySetDocumentResult => {
  const { locks, now, oldDocument, owner, projectType, registry, ttlMs, newRoot } = params;

  const lockResult = acquireLock(locks, { documentId: oldDocument.id, now, owner, ttlMs });
  if (!lockResult.ok) return { error: lockResult.error, ok: false };

  const candidate: IProjectDocument = { ...oldDocument, root: newRoot };
  const validation = validateDocument(projectType, candidate, registry);
  if (!validation.ok) return { error: validation.error, ok: false };

  const validatedRoot = validation.document.root;
  if (!validatedRoot) return { error: 'set_document: validated document has no root', ok: false };
  const mergedRoot = oldDocument.root ? preserveMeta(oldDocument.root, validatedRoot) : validatedRoot;

  return {
    document: { ...validation.document, root: mergedRoot },
    locks: lockResult.locks,
    ok: true,
  };
};
