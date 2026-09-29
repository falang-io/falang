import { createHash } from 'node:crypto';
import { canonicalStringify, type ISnapshotDocument } from '@falang/versioning';

/**
 * One document's content-addressed form (`ProjectBlob.content`/`.hash`) — canonical JSON of exactly
 * the two fields a document's payload carries (`root` for `scheme`-typed documents, `data` for
 * `custom`-typed ones). `ISnapshotDocument.root`/`.data` are optional (omitted, not `null`, when a
 * document has no value for one) and `canonicalStringify` drops any `undefined`-valued key, so a
 * document missing one of the two round-trips through `JSON.parse` (in `versioning.service.ts`'s
 * `snapshotDocumentFromBlob`) without gaining a spurious key back.
 */
export const blobContentOf = (document: Pick<ISnapshotDocument, 'root' | 'data'>): string =>
  canonicalStringify({ root: document.root, data: document.data });

export const hashBlobContent = (content: string): string => createHash('sha256').update(content).digest('hex');
