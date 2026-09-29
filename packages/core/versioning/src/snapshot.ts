import type { INode, IProjectTreeFolder } from '@falang/dto';

/**
 * One document inside an `IProjectSnapshot` — field-for-field `IProjectExportPayload`'s document
 * shape minus `project`/`formatVersion` (see ADR 0025 (private), "Contracts
 * the packages share"). Scheme-typed documents carry `root`; `custom`-typed documents (e.g.
 * `integrations`) carry `data` instead.
 */
export interface ISnapshotDocument {
  id: string;
  type: string;
  name: string;
  folderId: string | null;
  pinned: boolean;
  /** Present for scheme-typed documents. */
  root?: INode;
  /** Present for custom-typed documents (e.g. `integrations`, secrets stripped before snapshotting). */
  data?: unknown;
}

/**
 * An immutable, whole-project snapshot — every document's payload plus the folder/document tree.
 * See ADR 0025 (private), "One model, two stores".
 */
export interface IProjectSnapshot {
  folders: IProjectTreeFolder[];
  documents: ISnapshotDocument[];
}

/**
 * `'auto'` — created on the receiving side of a write when the project's previous edit was more
 * than `AUTO_VERSION_GAP_MS` ago (see `session-gap.ts`), with a generated message.
 * `'named'` — a deliberate checkpoint with a user-supplied (or later user-renamed) message.
 */
export type TCommitKind = 'auto' | 'named';

export interface ICommitInfo {
  id: string;
  parentId: string | null;
  kind: TCommitKind;
  /** Generated for `auto` (e.g. "Auto-save 2026-09-17 14:03"), the user's own text for `named`. */
  message: string;
  author: string;
  /** ISO timestamp. */
  createdAt: string;
}

/**
 * One version store, implemented once per product (`DbVersionStore` in `@falang/workflow-backend`,
 * `GitVersionStore` in `@falang/desktop-project-fs`) — see ADR 0025 (private),
 * "Decisions (2026-09-17)". Each implementation reads its own working copy when committing, so the
 * canonical snapshot form is always computed in exactly one place per store, never by a client.
 */
export interface IVersionStore {
  /** Newest first. */
  listCommits(): Promise<ICommitInfo[]>;
  getSnapshot(commitId: string): Promise<IProjectSnapshot>;
  getWorkingCopy(): Promise<IProjectSnapshot>;
  /** Snapshots the working copy. Returns `null` (no new commit) when the tree diff against HEAD is empty. */
  commit(params: { kind: TCommitKind; message: string }): Promise<ICommitInfo | null>;
  /** Promotes an `auto` commit to `named` (or renames a `named` one) — metadata only, history is never rewritten. */
  nameCommit(commitId: string, message: string): Promise<ICommitInfo>;
  /** Overwrites the working copy in place with that snapshot, then auto-creates the "Restore …" named commit. Returns it. */
  restore(commitId: string): Promise<ICommitInfo>;
}

/**
 * Structural — deliberately not typed against `IProjectExportPayload` (a `backend`-owned type) so
 * this package stays dependency-free of that layer; any object shaped like the export payload minus
 * `project`/`formatVersion` (extra properties on it are simply ignored) works as input.
 */
export const snapshotFromExportPayload = (payload: {
  folders: IProjectTreeFolder[];
  documents: ISnapshotDocument[];
}): IProjectSnapshot => ({ folders: payload.folders, documents: payload.documents });
