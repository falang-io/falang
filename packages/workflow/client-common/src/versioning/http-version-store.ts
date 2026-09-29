import type { INode } from '@falang/dto';
import {
  snapshotFromExportPayload,
  type ICommitInfo,
  type IProjectSnapshot,
  type ISnapshotDocument,
  type IVersionStore,
  type TCommitKind,
} from '@falang/versioning';
import { workflowApi, type IApiProjectExportDocument } from '../api-client.js';

/**
 * `IApiProjectExportDocument`'s `root`/`data` always carry the key (`null` when a document has no
 * value for it, the same convention `Document`'s own columns use) — `ISnapshotDocument` instead
 * *omits* the key entirely for "no value" (see `@falang/versioning`'s `diffSnapshots`, which tells "no
 * tree at all" apart from "an empty tree" via `'root' in doc`). Mirrors `@falang/workflow-backend`'s
 * own `toSnapshotDocument` (`snapshot-conversion.ts`) — the one conversion point between the two
 * conventions on this side too.
 */
const toSnapshotDocument = (document: IApiProjectExportDocument): ISnapshotDocument => ({
  id: document.id,
  type: document.type,
  name: document.name,
  folderId: document.folderId,
  pinned: document.pinned,
  ...(document.root === null ? {} : { root: document.root as INode }),
  ...(document.data === null ? {} : { data: document.data }),
});

/**
 * `IVersionStore` over `@falang/workflow-backend`'s `/projects/:id/commits*` routes (ADR 0025 (private)) — one instance
 * per open project, held by `WorkflowStore.versionHistory`. `commit()`'s "no new commit" `null` case needs no special
 * handling on this side: `workflowApi`'s shared `request()` helper already turns an empty 2xx body into `null` for any
 * caller (see `versioning.controller.ts`'s own note on Nest's `isNil(body)` → bare `response.send()` behavior).
 */
export class HttpVersionStore implements IVersionStore {
  private readonly projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  listCommits(): Promise<ICommitInfo[]> {
    return workflowApi.listCommits(this.projectId);
  }

  getSnapshot(commitId: string): Promise<IProjectSnapshot> {
    return workflowApi.getCommitSnapshot(this.projectId, commitId);
  }

  async getWorkingCopy(): Promise<IProjectSnapshot> {
    const payload = await workflowApi.exportProject(this.projectId);
    return snapshotFromExportPayload({
      folders: payload.folders.map((folder) => ({ ...folder })),
      documents: payload.documents.map(toSnapshotDocument),
    });
  }

  commit(params: { kind: TCommitKind; message: string }): Promise<ICommitInfo | null> {
    return workflowApi.createCommit(this.projectId, params);
  }

  nameCommit(commitId: string, message: string): Promise<ICommitInfo> {
    return workflowApi.nameCommit(this.projectId, commitId, message);
  }

  restore(commitId: string): Promise<ICommitInfo> {
    return workflowApi.restoreCommit(this.projectId, commitId);
  }
}
