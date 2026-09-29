import type { INode } from '@falang/dto';
import { snapshotFromExportPayload, type ISnapshotDocument, type IProjectSnapshot } from '@falang/versioning';
import type { IProjectExportDocument, IProjectExportPayload } from '../export/project-export.service.js';
import type { ICommitTree } from './project-commit.entity.js';

/**
 * `IProjectExportPayload`'s document shape (`ProjectExportService.exportProject`'s output) always
 * carries `root`/`data` keys, `null` when a document has no value for one — the same convention
 * `Document`'s own columns use. `ISnapshotDocument` instead *omits* the key entirely for "no value"
 * (see `@falang/versioning`'s `diffSnapshots`, which tells "no tree at all" apart from "an empty
 * tree" via `'root' in doc`), matching `DocumentsService`'s own `toProjectDocument`. This is the one
 * conversion point between the two conventions — everywhere else in this domain already speaks
 * `ISnapshotDocument`.
 */
export const toSnapshotDocument = (document: IProjectExportDocument): ISnapshotDocument => ({
  id: document.id,
  type: document.type,
  name: document.name,
  folderId: document.folderId,
  pinned: document.pinned,
  ...(document.root === null ? {} : { root: document.root as INode }),
  ...(document.data === null ? {} : { data: document.data }),
});

/** The working copy, as an `IProjectSnapshot` — see `VersioningService.getWorkingCopy`. */
export const exportPayloadToSnapshot = (payload: IProjectExportPayload): IProjectSnapshot =>
  snapshotFromExportPayload({ folders: payload.folders, documents: payload.documents.map(toSnapshotDocument) });

/** Rebuilds a commit's `ICommitTreeDocument` (id/type/name/folderId/pinned + a `blobHash`) back into a full `ISnapshotDocument`, given that blob's already-parsed `{ root?, data? }` content. */
export const snapshotDocumentFromTreeEntry = (
  entry: ICommitTree['documents'][number],
  content: { root?: INode; data?: unknown },
): ISnapshotDocument => ({
  id: entry.id,
  type: entry.type,
  name: entry.name,
  folderId: entry.folderId,
  pinned: entry.pinned,
  ...('root' in content ? { root: content.root } : {}),
  ...('data' in content ? { data: content.data } : {}),
});
