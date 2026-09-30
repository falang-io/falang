import { eventTracker } from './analytics/event-tracker.js';
// oxlint-disable max-lines -- one class owning every kind of backend I/O for one open project
// (tree/documents CRUD, debounced content saves now lock-aware per ADR 0029 (private), build/run/
// publish/prod); splitting it defeats the "one place to see everything a project sync does" point
// of the class, the same reasoning `workflow-store.ts` already gives for its own disable.
import { action, makeObservable, observable, runInAction } from 'mobx';
import type { INode } from '@falang/dto';
import {
  workflowApi,
  ApiCompileErrorsError,
  DocumentLockedError,
  type IApiBuildResult,
  type IApiCompileError,
  type IApiCompileErrorFile,
  type IApiProjectDocument,
  type IApiProjectVersion,
} from './api-client.js';
import { PendingSaves } from './pending-saves.js';
import { loadDevStatus, loadProdStatus } from './project-sync-status.js';
import type { WorkflowDocument, WorkflowFolder } from './workflow-types.js';

const SAVE_DEBOUNCE_MS = 500;

export type TBuildStatus = 'idle' | 'building' | 'running' | 'stopping' | 'error';

export type TOnTreeLoaded = (folders: WorkflowFolder[], documents: WorkflowDocument[]) => void;
export type TOnDocumentsLoaded = (documents: IApiProjectDocument[]) => void;

/**
 * `WorkflowStore` wires this to its `DocumentLocksStore` — kept as a narrow hook interface (mirrors
 * `ILiveRunStoreHooks`) rather than a direct dependency on that class, so `ProjectSync` doesn't need
 * to know anything about polling.
 */
export interface IProjectSyncLockHooks {
  readonly isDocumentLocked: (documentId: string) => boolean;
  /** A `PATCH`/`DELETE` 409'd on a document the 5s poll hadn't caught up with yet — see `DocumentLocksStore.markLockedFromConflict`. */
  readonly onDocumentLockConflict: (documentId: string, lockExpiresAt: string) => void;
  /**
   * This tab's own agent-lock owner id for `documentId`, if it currently holds one — `null`
   * otherwise. Passed through as `PATCH`'s `lockOwner` so a save from the same tab that holds the
   * lock doesn't 409 against itself (ADR 0034 §2.4).
   */
  readonly getOwnLockOwner: (documentId: string) => string | null;
}

/**
 * Owns everything that talks to `@falang/workflow-backend`'s HTTP API for one open project.
 * Loads in two phases, per the product requirement that cross-document type-checking needs every
 * document loaded: first the structure (`GET /tree` — folders + document metadata, no payloads,
 * so the tree renders immediately), then every document's full payload (`GET /documents`). Kept
 * separate from `WorkflowStore` (local editor state — tabs, scheme instances, selection) so each
 * class has one reason to change.
 */
export class ProjectSync {
  @observable isLoadingTree = true;
  @observable isLoadingDocuments = true;
  @observable connectionError: string | null = null;
  @observable buildStatus: TBuildStatus = 'idle';
  @observable lastBuildResult: IApiBuildResult | null = null;
  /** Populated instead of `connectionError` when a build fails because the project doesn't compile — one entry per broken document, see `ApiCompileErrorsError`. */
  @observable buildErrors: readonly IApiCompileError[] = [];
  /** The compiled-or-partially-compiled code accompanying `buildErrors`, so the user can see it alongside the errors — see `ApiCompileErrorsError.files`. */
  @observable buildFiles: readonly IApiCompileErrorFile[] = [];
  @observable isPublishing = false;
  @observable lastPublishedVersion: IApiProjectVersion | null = null;
  @observable prodRunning = false;
  @observable hasVersions = false;
  @observable isProdActionLoading = false;
  /** Whether any document changed (content, name, structure) since the last successful dev build — the "Run" button rebuilds when this is set, see `WorkflowStore.ensureDevBuilt`. */
  @observable changedSinceBuild = false;

  private readonly projectId: string;
  private readonly lockHooks: IProjectSyncLockHooks;
  private readonly pendingSaves = new PendingSaves(SAVE_DEBOUNCE_MS, (error) => this.reportError(error));
  /** One suspended debounced save per locked document — see `scheduleSaveDocument`/`onLocksChanged`. */
  private readonly suspendedSaves = new Map<string, () => Promise<unknown>>();

  constructor(
    projectId: string,
    lockHooks: IProjectSyncLockHooks,
    onTreeLoaded: TOnTreeLoaded,
    onDocumentsLoaded: TOnDocumentsLoaded,
  ) {
    this.projectId = projectId;
    this.lockHooks = lockHooks;
    makeObservable(this);
    this.init(onTreeLoaded, onDocumentsLoaded);
    loadDevStatus(
      projectId,
      () => this.buildStatus,
      (status) => (this.buildStatus = status),
    );
    loadProdStatus(projectId, (prodRunning, hasVersions) => {
      this.prodRunning = prodRunning;
      this.hasVersions = hasVersions;
    });
  }

  private async init(onTreeLoaded: TOnTreeLoaded, onDocumentsLoaded: TOnDocumentsLoaded): Promise<void> {
    try {
      const tree = await workflowApi.getProjectTree(this.projectId);
      const folders: WorkflowFolder[] = tree.folders.map((folder) => ({ ...folder }));
      const documents: WorkflowDocument[] = tree.documents.map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type,
        folderId: doc.folderId,
        pinned: doc.pinned,
      }));
      onTreeLoaded(folders, documents);
      runInAction(() => {
        this.isLoadingTree = false;
      });
    } catch (error) {
      runInAction(() => {
        this.connectionError = error instanceof Error ? error.message : 'Failed to load the project';
        this.isLoadingTree = false;
        this.isLoadingDocuments = false;
      });
      return;
    }

    try {
      const documents = await workflowApi.getProjectDocuments(this.projectId);
      onDocumentsLoaded(documents);
      runInAction(() => {
        this.isLoadingDocuments = false;
      });
    } catch (error) {
      runInAction(() => {
        this.connectionError = error instanceof Error ? error.message : 'Failed to load documents';
        this.isLoadingDocuments = false;
      });
    }
  }

  createFolderRemote(folder: WorkflowFolder): void {
    workflowApi.createFolder(this.projectId, folder).catch((error: unknown) => this.reportError(error));
  }

  updateFolderRemote(id: string, input: { name?: string; parentId?: string | null }): void {
    workflowApi.updateFolder(this.projectId, id, input).catch((error: unknown) => this.reportError(error));
  }

  deleteFolderRemote(id: string): void {
    workflowApi.deleteFolder(this.projectId, id).catch((error: unknown) => this.reportError(error));
  }

  createDocumentRemote(doc: WorkflowDocument): void {
    this.markChanged();
    workflowApi
      .createDocument(this.projectId, {
        id: doc.id,
        type: doc.type,
        name: doc.name,
        folderId: doc.folderId,
        root: doc.data,
      })
      .catch((error: unknown) => this.reportError(error));
  }

  updateDocumentRemote(id: string, input: { name?: string; folderId?: string | null }): void {
    // A rename changes the compiled function's name — a folder move doesn't, but it's not worth
    // distinguishing for a flag that only costs an extra build.
    this.markChanged();
    workflowApi
      .updateDocument(this.projectId, id, input)
      .catch((error: unknown) => this.handleDocumentSaveError(id, error));
  }

  deleteDocumentRemote(id: string): void {
    this.pendingSaves.cancel(id);
    this.suspendedSaves.delete(id);
    this.markChanged();
    workflowApi.deleteDocument(this.projectId, id).catch((error: unknown) => this.handleDocumentSaveError(id, error));
  }

  /**
   * Debounces saving a changed document's content so rapid edits don't hammer the backend with one
   * PATCH per keystroke — suspended entirely (never scheduled, never sent) while `doc` is locked
   * (see ADR 0029 (private)'s "Document locks" decision): the edit stays
   * in memory (`doc.data` already holds it, set by the caller before this runs) and the save itself
   * is replayed once `onLocksChanged` sees the lock is gone.
   */
  scheduleSaveDocument(doc: WorkflowDocument): void {
    const root: INode | undefined = doc.data;
    this.markChanged();
    const performSave = () =>
      (root
        ? workflowApi.updateDocument(this.projectId, doc.id, { name: doc.name, root, ...this.ownLockOwnerBody(doc.id) })
        : Promise.resolve(null)
      ).catch((error: unknown) => this.handleDocumentSaveError(doc.id, error));
    this.scheduleOrSuspend(doc.id, performSave);
  }

  /** Same debounce (and lock-suspend) as `scheduleSaveDocument`, but for `custom`-typed documents (e.g. `integrations`) whose payload is `data`, not `root`. */
  scheduleSaveCustomDocument(doc: WorkflowDocument): void {
    const data = doc.customData;
    this.markChanged();
    const performSave = () =>
      workflowApi
        .updateDocument(this.projectId, doc.id, { name: doc.name, data, ...this.ownLockOwnerBody(doc.id) })
        .catch((error: unknown) => this.handleDocumentSaveError(doc.id, error));
    this.scheduleOrSuspend(doc.id, performSave);
  }

  /** Cancels any pending debounced save for `doc` and saves it immediately — used before a step (e.g. OAuth2's "Connect") that needs the document to exist server-side right away, not up to `SAVE_DEBOUNCE_MS` later. Not lock-aware: the caller already needs this write to happen now, so a 409 here surfaces as a normal thrown error, same as before this document had locks at all. */
  async flushSaveCustomDocument(doc: WorkflowDocument): Promise<void> {
    this.pendingSaves.cancel(doc.id);
    const data = doc.customData;
    await workflowApi.updateDocument(this.projectId, doc.id, {
      name: doc.name,
      data,
      ...this.ownLockOwnerBody(doc.id),
    });
  }

  /** `{ lockOwner }` when this tab holds its own agent-lock on `documentId`, `{}` otherwise — spread into a save's body so it doesn't 409 against a lock it holds itself (ADR 0034 §2.4). */
  private ownLockOwnerBody(documentId: string): { lockOwner?: string } {
    const owner = this.lockHooks.getOwnLockOwner(documentId);
    return owner ? { lockOwner: owner } : {};
  }

  /**
   * Runs every still-debounced save right now and waits for them — `buildProject` calls this first,
   * otherwise a "Run" click within `SAVE_DEBOUNCE_MS` of the last edit would compile the documents
   * as they were *before* that edit (the backend compiles what it has stored, not what the editor
   * shows). Save failures are reported through `connectionError` like any other save (see `PendingSaves`).
   * Deliberately does **not** flush a lock-suspended save (a locked document's last saved content is
   * still whatever the backend already has — the agent holding the lock, not this client's stale
   * in-memory copy — so a build correctly compiles that instead).
   */
  flushPendingSaves(): Promise<void> {
    return this.pendingSaves.flushAll();
  }

  /**
   * Called by `WorkflowStore` whenever `DocumentLocksStore`'s poll (or a just-discovered 409
   * conflict) changes lock state — resumes any save that was suspended while its document was locked.
   */
  onLocksChanged(): void {
    const stillLocked = new Map<string, () => Promise<unknown>>();
    for (const [documentId, save] of this.suspendedSaves) {
      if (this.lockHooks.isDocumentLocked(documentId)) stillLocked.set(documentId, save);
      else this.pendingSaves.schedule(documentId, save);
    }
    this.suspendedSaves.clear();
    for (const [documentId, save] of stillLocked) this.suspendedSaves.set(documentId, save);
  }

  private scheduleOrSuspend(documentId: string, performSave: () => Promise<unknown>): void {
    if (this.lockHooks.isDocumentLocked(documentId)) {
      this.pendingSaves.cancel(documentId);
      this.suspendedSaves.set(documentId, performSave);
      return;
    }
    this.pendingSaves.schedule(documentId, performSave);
  }

  /** A `DocumentLockedError` (a 409 the 5s lock poll hadn't caught up with yet) is reported through the lock hooks, not `connectionError` — everything else falls back to the generic path. */
  private handleDocumentSaveError(documentId: string, error: unknown): void {
    if (error instanceof DocumentLockedError) {
      this.lockHooks.onDocumentLockConflict(documentId, error.lockExpiresAt);
      return;
    }
    this.reportError(error);
  }

  @action private markChanged(): void {
    this.changedSinceBuild = true;
  }

  @action async buildProject(): Promise<void> {
    this.buildStatus = 'building';
    this.connectionError = null;
    this.buildErrors = [];
    this.buildFiles = [];
    try {
      await this.flushPendingSaves();
      const result = await workflowApi.build(this.projectId);
      runInAction(() => {
        this.buildStatus = 'running';
        this.lastBuildResult = result;
        this.changedSinceBuild = false;
      });
    } catch (error) {
      runInAction(() => {
        this.buildStatus = 'error';
        if (error instanceof ApiCompileErrorsError) {
          this.buildErrors = error.errors;
          this.buildFiles = error.files;
        } else {
          this.connectionError = error instanceof Error ? error.message : 'Build failed';
        }
      });
    }
  }

  @action async stopProject(): Promise<void> {
    this.buildStatus = 'stopping';
    try {
      await workflowApi.stop(this.projectId);
      runInAction(() => {
        this.buildStatus = 'idle';
        this.lastBuildResult = null;
      });
    } catch (error) {
      runInAction(() => {
        this.buildStatus = 'error';
        this.connectionError = error instanceof Error ? error.message : 'Stop failed';
      });
    }
  }

  @action async publishProject(): Promise<void> {
    this.isPublishing = true;
    this.connectionError = null;
    try {
      const version = await workflowApi.publish(this.projectId);
      runInAction(() => {
        this.isPublishing = false;
        this.lastPublishedVersion = version;
        this.hasVersions = true;
      });
      eventTracker.track('version_published');
    } catch (error) {
      runInAction(() => {
        this.isPublishing = false;
        this.connectionError = error instanceof Error ? error.message : 'Publish failed';
      });
    }
  }

  @action async startProdRunner(): Promise<void> {
    this.isProdActionLoading = true;
    this.connectionError = null;
    try {
      await workflowApi.startProd(this.projectId);
      runInAction(() => {
        this.prodRunning = true;
        this.isProdActionLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.connectionError = error instanceof Error ? error.message : 'Failed to start production';
        this.isProdActionLoading = false;
      });
    }
  }

  @action async stopProdRunner(): Promise<void> {
    this.isProdActionLoading = true;
    this.connectionError = null;
    try {
      await workflowApi.stopProd(this.projectId);
      runInAction(() => {
        this.prodRunning = false;
        this.isProdActionLoading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.connectionError = error instanceof Error ? error.message : 'Failed to stop production';
        this.isProdActionLoading = false;
      });
    }
  }

  @action private reportError(error: unknown): void {
    this.connectionError = error instanceof Error ? error.message : 'Failed to reach the workflow backend';
  }
}
