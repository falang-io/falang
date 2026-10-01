// oxlint-disable max-lines
import 'reflect-metadata';
import { action, autorun, computed, makeObservable, observable, runInAction, toJS } from 'mobx';
import { isValidFunctionName, type INode, type IProjectDocument } from '@falang/dto';
import {
  setSchemeStartPosition,
  TOKEN_HISTORY,
  type HistoryStore,
  type Scheme,
  type TVersionDiffSide,
} from '@falang/scheme';
import type { IAgentDocumentResolver, AgentSession } from '@falang/agent';
import {
  EVENT_LINK_CLICKED,
  TOKEN_PROJECT_DOCUMENTS_REGISTRY,
  type ProjectDocumentsRegistryStore,
} from '@falang/text-scheme';
import { LogicExportConfigurationStore } from '@falang/logic-scheme';
import type { ILogicExportResult } from '@falang/logic-export';
import { isCodeDocumentType } from '@falang/simple-code-dto';
import type { ICodeExportResult } from '@falang/simple-code-export';
import type { IDocumentLock, IProjectChangeEvent } from '@falang/desktop-project-fs';
import { resolveService, type DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import type { IPrintExportHost } from '@falang/antd';
import { AgentChatSessionStore, PrintExportStore, VersionHistoryStore } from '@falang/antd';
import {
  ALL_SKETCH_DOCUMENT_TYPES,
  buildDefaultSketchDocumentRoot,
  buildSketchDocumentScheme,
  createDesktopAgentDocumentResolver,
  createDesktopAgentSession,
  createSketchProjectContainer,
  isAgentCapableDocumentType,
  SKETCH_DOCUMENT_TYPES,
  subscribeDesktopDocumentSync,
  syncExternalApiRegistry,
  syncFunctionsRegistry,
  syncTypesRegistry,
  type SketchDocumentType,
} from '@falang/desktop-agent-host';
import { generateUuid } from './generate-uuid.js';
import { ExportProgressStore } from './export-progress-store.js';
import { reportError } from '../../shared/report-error.js';
import { ElectronAgentSessionStore } from './agent/electron-agent-session-store.js';
import { ElectronLlmClient } from './agent/electron-llm-client.js';
import { buildReadOnlySchemeForDiff as buildReadOnlySchemeForDiffImpl } from './versioning/build-read-only-scheme-for-diff.js';
import { createPrintExportHost } from './print/create-print-export-host.js';
import { ElectronVersionStore } from './versioning/electron-version-store.js';
import { allowedDocumentTypesFor } from '../../shared/project-types.js';

const SAVE_DEBOUNCE_MS = 500;

export type DocumentType = SketchDocumentType;

export interface DesktopFolder {
  id: string;
  name: string;
  parentId: string | null;
}

export interface DesktopDocument {
  id: string;
  name: string;
  type: DocumentType;
  folderId: string | null;
  root?: INode;
}

/** `app-sketch`'s document types (label, root node kind, scheme factory) — owned by `@falang/desktop-agent-host` (ADR 0051 (private)) so a headless host builds the same schemes. */
export const DOCUMENT_TYPES = SKETCH_DOCUMENT_TYPES;

const ALL_DOCUMENT_TYPES = ALL_SKETCH_DOCUMENT_TYPES;

/**
 * Builds the default (empty) tree for a brand-new document of `type` — `project-actions.ts`'s `createNewProject`
 * calls it *before* any `DesktopProjectStore`/container exists. See `@falang/desktop-agent-host`.
 */
export const buildDefaultDocumentRoot = buildDefaultSketchDocumentRoot;

/** Local editor state for one open project — folders, tabs, scheme instances. All I/O goes through `globalThis.falang`. */
export class DesktopProjectStore {
  readonly projectDir: string;
  readonly projectType: string;
  readonly container: DependencyContainer;
  readonly folders = observable<DesktopFolder>([]);
  readonly documents = observable<DesktopDocument>([]);
  @observable isLoadingTree = true;
  @observable openTabIds: string[] = [];
  @observable activeTabId: string | null = null;
  /**
   * Loaded from `<projectDir>/falang/config/logic-export.json` on open (see `@falang/logic-export`) and written
   * back explicitly via `saveLogicExportConfiguration` — the modal's Save/Cancel, not every keystroke.
   */
  readonly logicExportConfiguration = new LogicExportConfigurationStore();
  /** Progress for whichever of `exportLogicCode`/`exportCodeDocuments` is currently running — see
   * ADR 0019 (private)'s "Implementation notes (export worker …)". */
  readonly exportProgress = new ExportProgressStore();
  /** Git-backed version history over this project directory — see ADR 0025 (private) (package E2). */
  readonly versionHistory: VersionHistoryStore;
  /** This project's agent chat sessions (one JSON file per session under `falang/agent-sessions/`) — see ADR 0033 (private). */
  readonly agentChat: AgentChatSessionStore;
  /** The project's one `AgentSession` (ADR 0036 (private)
   * §1, amended §"no home document" — 2026-09-23) — not per scheme any more; every open document's
   * `Scheme` keeps only `HistoryModule`. There's no fixed "home" document any more either: a run's
   * effective active document is whatever `getAgentActiveDocumentId()` reports at send time (passed
   * as `IAgentRunOptions.activeDocumentId`), so the constructor's `defaultScheme` is `null`.
   * `cancel()`'d in `dispose()`. */
  readonly agentSession: AgentSession;
  /**
   * Resolves a tool call's `documentId` to a `Scheme` for `agentSession` above — throws a clear
   * error for an unknown or non-agent-capable document id (caught by `AgentSession` and turned into
   * a `fail()` tool result, not a fatal run error) rather than silently degrading. Exposed as its own
   * field (not built inline where `agentSession` is constructed) so tests can exercise it directly
   * without driving a full agent run through a fake LLM client.
   */
  readonly agentDocumentResolver: IAgentDocumentResolver = createDesktopAgentDocumentResolver('sketch', this);
  /** Which project-level panel the right sidebar shows, or neither — see `toggleRightPanel`. */
  @observable rightPanel: 'agent' | 'history' | null = null;
  @observable diffModalOpen = false;
  /** The PDF export flow (ADR 0048 (private)), `null` while closed. */
  @observable.ref printExport: PrintExportStore | null = null;

  /** Document types this project may create — see `../../shared/project-types.ts`. An unknown/legacy `falang.json` `type` (e.g. every project this app created before this feature existed, which always wrote `'text'` regardless of content) falls back to every document type rather than erroring. */
  @computed get allowedDocumentTypes(): DocumentType[] {
    return allowedDocumentTypesFor(this.projectType, ALL_DOCUMENT_TYPES) as DocumentType[];
  }

  /** Active locks keyed by `documentId` — see ADR 0029 (private)'s "Document locks" decision. Every lock here is treated as foreign: this store never acquires one itself in v1. */
  readonly locks = observable.map<string, IDocumentLock>();
  /**
   * Document ids waiting on a "changed on disk — Reload / Keep mine" decision (a dirty document
   * whose file changed externally). `DocumentConflictModal` renders `conflictQueue[0]`; resolving
   * it (either way) shifts the queue.
   */
  @observable.shallow conflictQueue: string[] = [];
  /**
   * Bumped every time a document is reloaded from disk in place, so `ProjectWorkspace` can key
   * `SchemeView` on `` `${activeId}:${reloadVersion}` `` and force a remount with the freshly-read
   * root — the same "change the `key` to force a fresh `Scheme`" mechanism already used for
   * switching tabs, just retriggered without the tab itself changing.
   */
  readonly reloadVersions = observable.map<string, number>();

  private readonly documentsRegistry: ProjectDocumentsRegistryStore;
  private readonly schemes = new Map<string, Scheme>();
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposeRegistrySync: () => void;
  private readonly disposeFunctionsRegistrySync: () => void;
  private readonly disposeExternalApiRegistrySync: () => void;
  private readonly disposeTypesRegistrySync: () => void;
  private readonly disposeProjectChangedSubscription: () => void;
  private readonly disposeExportProgressSubscriptions: () => void;
  private readonly electronVersionStore: ElectronVersionStore;

  constructor(projectDir: string, projectType: string) {
    this.projectDir = projectDir;
    this.projectType = projectType;
    // The project container (Monaco lib variant for this project type, the documents registry, the TypeScript project
    // service, the light theme) is `@falang/desktop-agent-host`'s `createSketchProjectContainer` — the same function a
    // headless host calls.
    this.container = createSketchProjectContainer(projectType);
    this.documentsRegistry = resolveService(TOKEN_PROJECT_DOCUMENTS_REGISTRY, this.container);
    makeObservable(this);
    this.electronVersionStore = new ElectronVersionStore(projectDir);
    this.versionHistory = new VersionHistoryStore({
      store: this.electronVersionStore,
      onRestored: () => {
        this.reloadAfterRestore().catch((error: unknown) => reportError('Failed to reload after restore', error));
      },
    });
    this.agentChat = new AgentChatSessionStore(new ElectronAgentSessionStore(projectDir), {
      allowQuestionsStorageKey: `falang:agent-allow-questions:${projectDir}`,
    });
    this.agentChat.loadSessions();
    // Fires `onOpenDocument` before every core (node) tool call, for whichever document it targets — "ensure open", not
    // "steal the active tab": a document with no tab yet is opened and activated, one that already has a tab is left
    // alone (ADR 0036 (private), "Opening a document the agent touches" amendment).
    this.agentSession = createDesktopAgentSession({
      product: 'sketch',
      llmClient: new ElectronLlmClient(),
      store: this,
      documentResolver: this.agentDocumentResolver,
      onOpenDocument: (id) => this.ensureAgentDocumentOpen(id),
    });
    this.disposeRegistrySync = autorun(() => {
      this.documentsRegistry.setDocuments(
        this.documents.map((doc) => ({ id: doc.id, type: doc.type, name: doc.name, folderId: doc.folderId })),
      );
    });
    this.disposeFunctionsRegistrySync = autorun(() => {
      // Filter *before* reading `.root`, same reasoning as `syncExternalApiRegistry`/`syncTypesRegistry`
      // below (see ADR 0019 (private)'s "call-api live picker" notes, which fixed this exact class of
      // bug for those two syncs but left this one — the original, "verbatim" version the fix was
      // modeled on — untouched): reading `.root` unconditionally means this autorun tracks *every*
      // document's `root`, including non-`function` ones, so any edit anywhere in the project re-runs
      // it for no benefit and, combined with `onSchemeChanged` reassigning `doc.root` while an editor
      // is open, can retrigger this autorun from inside its own reaction — MobX then logs
      // "cycle in reaction", live-reproduced by opening a real multi-document project (`example-snake`,
      // 12 documents) straight from disk, before any node was even edited.
      syncFunctionsRegistry(
        this.container,
        this.documents
          .filter((doc) => doc.type === 'function')
          .map((doc) => ({ id: doc.id, name: doc.name, type: doc.type, root: doc.root })),
      );
    });
    this.disposeExternalApiRegistrySync = autorun(() => {
      // Filter *before* reading `.root`, unlike `syncFunctionsRegistry`'s snapshot above — this
      // autorun only ever cares about `external-api-structure` documents, so there's no reason for
      // it to also track every `function` document's `root` (which changes on every keystroke/node
      // edit elsewhere in the project and would otherwise re-run this autorun for no benefit).
      syncExternalApiRegistry(
        this.container,
        this.documents
          .filter((doc) => doc.type === 'external-api-structure')
          .map((doc) => ({ id: doc.id, name: doc.name, type: doc.type, root: doc.root })),
      );
    });
    this.disposeTypesRegistrySync = autorun(() => {
      // Same "filter before reading `.root`" posture as `syncExternalApiRegistry` above, not
      // `syncFunctionsRegistry`'s: `objects-structure` documents are edited far less often than
      // `function` bodies, so there's no reason to re-run this on every keystroke elsewhere.
      syncTypesRegistry(
        this.container,
        this.documents
          .filter((doc) => doc.type === 'objects-structure')
          .map((doc) => ({ id: doc.id, name: doc.name, type: doc.type, root: doc.root })),
      );
    });
    this.disposeProjectChangedSubscription = globalThis.falang.project.onChanged((event) =>
      this.handleProjectChanged(event),
    );
    const offLogicExportProgress = globalThis.falang.logicExport.onProgress((requestId, progress) =>
      this.exportProgress.reportProgress(requestId, progress),
    );
    const offCodeExportProgress = globalThis.falang.codeExport.onProgress((requestId, progress) =>
      this.exportProgress.reportProgress(requestId, progress),
    );
    this.disposeExportProgressSubscriptions = () => {
      offLogicExportProgress();
      offCodeExportProgress();
    };
    this.loadTree().catch((error: unknown) => reportError('Failed to load project tree', error));
    this.loadLogicExportConfiguration().catch((error: unknown) =>
      reportError('Failed to load logic export configuration', error),
    );
    this.refreshLocks().catch((error: unknown) => reportError('Failed to read document locks', error));
  }

  /**
   * Dispatches one `main`-pushed filesystem-change event (ADR 0029 (private)'s watcher) — see
   * that ADR's "Filesystem watcher" decision and this store's `handleDocumentsChanged`/
   * `refreshTreeMetadata`/`handleLocksChanged` below for what each `kind` does.
   */
  private handleProjectChanged(event: IProjectChangeEvent): void {
    if (event.kind === 'manifest') {
      this.refreshTreeMetadata().catch((error: unknown) => reportError('Failed to refresh project tree', error));
    } else if (event.kind === 'locks') {
      this.handleLocksChanged().catch((error: unknown) => reportError('Failed to refresh document locks', error));
    } else {
      this.handleDocumentsChanged(event.documentIds ?? []).catch((error: unknown) =>
        reportError('Failed to handle changed documents', error),
      );
    }
  }

  private async refreshLocks(): Promise<void> {
    const locks = await globalThis.falang.locks.read(this.projectDir);
    runInAction(() => this.locks.replace(locks.map((lock): [string, IDocumentLock] => [lock.documentId, lock])));
  }

  getLock(documentId: string): IDocumentLock | undefined {
    return this.locks.get(documentId);
  }

  getReloadVersion(documentId: string): number {
    return this.reloadVersions.get(documentId) ?? 0;
  }

  /**
   * `locks` changed on disk — re-read them, then for every document that just transitioned from
   * locked to unlocked: flush a pending autosave that had been suspended while it was locked (see
   * `saveDocumentNow`'s own lock guard), or — if there was nothing pending — reload it from disk,
   * since a `set_document` MCP call made while it was locked was deliberately never turned into a
   * "changed on disk" reload/prompt while the lock was held (see `handleDocumentsChanged`).
   */
  private async handleLocksChanged(): Promise<void> {
    const previouslyLocked = new Set(this.locks.keys());
    await this.refreshLocks();
    const stillLocked = new Set(this.locks.keys());
    const justUnlocked = [...previouslyLocked].filter((id) => !stillLocked.has(id));
    for (const id of justUnlocked) {
      if (this.saveTimers.has(id)) this.saveDocumentNow(id);
      // oxlint-disable-next-line no-await-in-loop -- one document at a time, same posture as handleDocumentsChanged below
      else await this.reloadDocumentFromDisk(id);
    }
  }

  /**
   * `falang/schemes/` changed on disk. A document that's currently locked (foreign, by MCP convention)
   * is skipped entirely — its overlay already tells the user it's off-limits, and reloading it
   * mid-agent-edit would just show a half-written tree; `handleLocksChanged` above catches up once
   * the lock clears. A dirty-but-unlocked document queues a Reload/Keep-mine prompt instead of
   * silently clobbering in-memory edits; anything else reloads immediately.
   */
  private async handleDocumentsChanged(documentIds: readonly string[]): Promise<void> {
    for (const id of documentIds) {
      if (this.locks.has(id)) continue;
      if (this.saveTimers.has(id)) {
        if (!this.conflictQueue.includes(id)) runInAction(() => (this.conflictQueue = [...this.conflictQueue, id]));
        continue;
      }
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose, mirrors scaffoldRequiredDocument's own reasoning elsewhere in this codebase (avoid concurrent project-fs reads racing each other)
      await this.reloadDocumentFromDisk(id);
    }
  }

  /** "Reload" from `DocumentConflictModal` — discards the in-memory edit and re-reads the file. */
  @action resolveConflictReload(documentId: string): void {
    this.conflictQueue = this.conflictQueue.filter((id) => id !== documentId);
    this.reloadDocumentFromDisk(documentId).catch((error: unknown) => reportError('Failed to reload document', error));
  }

  /** "Keep mine" from `DocumentConflictModal` — the in-memory version stays; its already-scheduled (or next) autosave overwrites disk. */
  @action resolveConflictKeepMine(documentId: string): void {
    this.conflictQueue = this.conflictQueue.filter((id) => id !== documentId);
  }

  /**
   * Re-reads one document from disk and, if it's currently open, disposes its live `Scheme` and
   * bumps `reloadVersions` so `ProjectWorkspace` remounts a fresh one from the new content (see
   * `reloadVersions`'s own doc comment). If the document isn't in `this.documents` yet (e.g. an MCP
   * `create_document` call that landed between two watcher debounce windows), refreshes the tree
   * metadata first so there's an entry to update. If the read fails (the document was deleted
   * externally), drops it from the tree/tabs instead.
   */
  private async reloadDocumentFromDisk(id: string): Promise<void> {
    if (!this.getDocument(id)) await this.refreshTreeMetadata();

    const full = await globalThis.falang.document.read(this.projectDir, id).catch(() => null);
    if (!full) {
      runInAction(() => this.documents.replace(this.documents.filter((d) => d.id !== id)));
      this.closeTab(id);
      return;
    }

    const doc = this.getDocument(id);
    // Still unknown after a tree refresh above — nothing to update.
    if (!doc) return;
    runInAction(() => {
      doc.root = full.root;
      doc.name = full.name;
    });

    const existingScheme = this.schemes.get(id);
    if (existingScheme) {
      existingScheme.dispose();
      this.schemes.delete(id);
    }
    runInAction(() => this.reloadVersions.set(id, (this.reloadVersions.get(id) ?? 0) + 1));
  }

  /**
   * Refreshes the folder/document *index* from `falang.json` without touching any already-loaded
   * document's in-memory `root` — a plain `loadTree()` re-run would re-fetch every document's full
   * content unconditionally, clobbering unsaved edits in whatever's currently open. Closes tabs for
   * documents that no longer exist on disk.
   */
  private async refreshTreeMetadata(): Promise<void> {
    const tree = await globalThis.falang.project.listTree(this.projectDir);
    // An already-known document keeps its object identity (only its index fields are updated in place): a live `Scheme`
    // syncs its edits into the very `doc` object it was built from (`subscribeDesktopDocumentSync`), so replacing that
    // object with a fresh one — which every watcher `manifest` event used to do, e.g. right after "New Project…" created
    // the default document — left the scheme writing into an orphan while autosave read the new, stale copy (found live:
    // edits made after the first tree refresh never reached disk).
    const existingById = new Map(this.documents.map((doc) => [doc.id, doc] as const));
    const idsToClose = runInAction(() => {
      const nextDocuments = tree.documents.map((entry): DesktopDocument => {
        const existing = existingById.get(entry.id);
        if (!existing) {
          return { id: entry.id, name: entry.name, type: entry.type as DocumentType, folderId: entry.folderId };
        }
        existing.name = entry.name;
        existing.type = entry.type as DocumentType;
        existing.folderId = entry.folderId;
        return existing;
      });
      const validIds = new Set(nextDocuments.map((doc) => doc.id));
      this.folders.replace(tree.folders);
      this.documents.replace(nextDocuments);
      return this.openTabIds.filter((id) => !validIds.has(id));
    });
    for (const id of idsToClose) this.closeTab(id);
  }

  private async loadLogicExportConfiguration(): Promise<void> {
    const config = await globalThis.falang.logicExport.readConfig(this.projectDir);
    if (config) this.logicExportConfiguration.setConfig(config);
  }

  saveLogicExportConfiguration(): Promise<void> {
    return globalThis.falang.logicExport.writeConfig(this.projectDir, this.logicExportConfiguration.getConfig());
  }

  /**
   * Runs every configured export against the current in-memory documents (so edits still waiting
   * on the debounced save are included). `toJS` matters: `documents` is a deep MobX observable, and
   * a MobX proxy can't cross the IPC structured-clone boundary.
   */
  async exportLogicCode(): Promise<ILogicExportResult> {
    // `toJS` must run on `doc` itself, not on a freshly-built `{ ...doc.root }` literal: `toJS` only
    // recurses into an argument that is *itself* an observable container — `this.documents` is a
    // deep-observable array, so `doc` qualifies, but wrapping its (still-proxied) `root` field in a
    // brand-new plain object first defeats that recursion, leaving the proxy untouched underneath.
    // A plain object holding a leftover MobX proxy fails Electron's IPC structured clone with an
    // opaque "An object could not be cloned" — confirmed directly against Node's own
    // `structuredClone` (same algorithm Electron's `contextBridge`/`ipcRenderer` use) before settling
    // on this fix, since the failure otherwise looks identical to the unrelated `contour` node
    // DataCloneError this same codebase hit before (see ADR 0005 (private)).
    const documents: IProjectDocument[] = this.documents.map((doc) => {
      const plain = toJS(doc);
      return { id: plain.id, type: plain.type, name: plain.name, root: plain.root };
    });
    // Runs in a disposable worker process, not inline here or in `main` — see ADR 0019 (private)'s
    // "Implementation notes (export worker …)". `exportProgress` tracks it for `ExportProgressModal`.
    const requestId = this.exportProgress.start('logic');
    try {
      const outcome = await globalThis.falang.logicExport.run(requestId, this.projectDir, {
        documents,
        exports: [...this.logicExportConfiguration.getConfig().exports],
      });
      return outcome.result;
    } finally {
      this.exportProgress.finish();
    }
  }

  /**
   * Compiles+writes every `code-*` document to `<projectDir>/generated` — no configuration to load
   * first (unlike `exportLogicCode`): a `code` document's language is fixed by its own `DocumentType`,
   * so there's no per-project fan-out to configure. Same `toJS` discipline as `exportLogicCode` above.
   */
  async exportCodeDocuments(): Promise<ICodeExportResult> {
    const documents: IProjectDocument[] = this.documents
      .filter((doc) => isCodeDocumentType(doc.type))
      .map((doc) => {
        const plain = toJS(doc);
        return { id: plain.id, type: plain.type, name: plain.name, root: plain.root };
      });
    const requestId = this.exportProgress.start('code');
    try {
      const outcome = await globalThis.falang.codeExport.run(requestId, this.projectDir, { documents });
      return outcome.result;
    } finally {
      this.exportProgress.finish();
    }
  }

  private async loadTree(): Promise<void> {
    const tree = await globalThis.falang.project.listTree(this.projectDir);
    const documents = await Promise.all(
      tree.documents.map(async (entry): Promise<DesktopDocument> => {
        const full = await globalThis.falang.document.read(this.projectDir, entry.id);
        return {
          id: entry.id,
          name: entry.name,
          type: entry.type as DocumentType,
          folderId: entry.folderId,
          root: full.root,
        };
      }),
    );
    runInAction(() => {
      this.folders.replace(tree.folders);
      this.documents.replace(documents);
      this.isLoadingTree = false;
    });

    // Nothing is created here any more (see ADR 0005 (private)'s "Implementation notes (project
    // types, new-project dialog, single default document — 2026-09-20)"): a brand-new project's
    // one default document is created once, up front, by `project-actions.ts`'s `createNewProject`
    // — creating it here too raced under React StrictMode's dev-only mount→cleanup→mount double
    // `DesktopProjectStore`, since both instances' `loadTree()` calls were already in flight before
    // either saw the other's write, and both saw an empty tree. Just open the one tab a
    // single-document project already has, so a freshly created project lands with something open.
    if (this.openTabIds.length === 0 && documents.length === 1) {
      const onlyDoc = documents[0];
      if (onlyDoc) this.openTab(onlyDoc.id);
    }
  }

  async createFolder(name: string, parentId: string | null = null): Promise<void> {
    const folder = await globalThis.falang.folder.create(this.projectDir, { name, parentId });
    runInAction(() => this.folders.push(folder));
  }

  @action renameFolder(id: string, name: string): void {
    const folder = this.folders.find((f) => f.id === id);
    if (!folder) return;
    folder.name = name;
    globalThis.falang.folder
      .rename(this.projectDir, id, name)
      .catch((error: unknown) => reportError('Failed to rename folder', error));
  }

  @action moveFolder(folderId: string, parentId: string | null): void {
    if (parentId !== null) {
      if (folderId === parentId) return;
      if (this.getFolderDescendantIds(folderId).includes(parentId)) return;
    }
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder) return;
    folder.parentId = parentId;
    globalThis.falang.folder
      .move(this.projectDir, folderId, parentId)
      .catch((error: unknown) => reportError('Failed to move folder', error));
  }

  @action deleteFolder(id: string): void {
    const allIds = new Set([id, ...this.getFolderDescendantIds(id)]);
    const docsToDelete = this.documents.filter((d) => d.folderId !== null && allIds.has(d.folderId));
    for (const doc of docsToDelete) this.closeTab(doc.id);
    this.documents.replace(this.documents.filter((d) => d.folderId === null || !allIds.has(d.folderId)));
    this.folders.replace(this.folders.filter((f) => !allIds.has(f.id)));
    globalThis.falang.folder
      .delete(this.projectDir, id)
      .catch((error: unknown) => reportError('Failed to delete folder', error));
  }

  @action createDocument(type: DocumentType, name: string, folderId: string | null = null): string {
    if (type === 'function' && !isValidFunctionName(name)) {
      throw new Error(
        `Function name "${name}" is invalid — it must be an English, camelCase identifier ` +
          '(e.g. myFunctionName), with no spaces, punctuation, or non-Latin script',
      );
    }
    const id = generateUuid();
    const root = buildDefaultDocumentRoot(type, this.container);
    this.documents.push({ id, name, type, folderId, root });
    globalThis.falang.document
      .create(this.projectDir, { document: { id, type, name, root }, folderId })
      .catch((error: unknown) => reportError('Failed to create document', error));
    this.openTab(id);
    return id;
  }

  @action deleteDocument(id: string): void {
    this.closeTab(id);
    this.documents.replace(this.documents.filter((d) => d.id !== id));
    globalThis.falang.document
      .delete(this.projectDir, id)
      .catch((error: unknown) => reportError('Failed to delete document', error));
  }

  @action renameDocument(id: string, name: string): void {
    const doc = this.documents.find((d) => d.id === id);
    if (!doc) return;
    if (doc.type === 'function' && !isValidFunctionName(name)) {
      throw new Error(
        `Function name "${name}" is invalid — it must be an English, camelCase identifier ` +
          '(e.g. myFunctionName), with no spaces, punctuation, or non-Latin script',
      );
    }
    doc.name = name;
    globalThis.falang.document
      .rename(this.projectDir, id, name)
      .catch((error: unknown) => reportError('Failed to rename document', error));
  }

  @action moveDocument(docId: string, folderId: string | null): void {
    const doc = this.documents.find((d) => d.id === docId);
    if (!doc) return;
    doc.folderId = folderId;
    globalThis.falang.document
      .move(this.projectDir, docId, folderId)
      .catch((error: unknown) => reportError('Failed to move document', error));
  }

  @action openTab(id: string): void {
    if (!this.openTabIds.includes(id)) this.openTabIds = [...this.openTabIds, id];
    this.activeTabId = id;
  }

  /**
   * `agentSession`'s `onOpenDocument` handler (ADR 0036 (private), "Opening a document the agent
   * touches" amendment) — "ensure open", not "activate no matter what": opens `id` as a new tab
   * (which also activates it, per `openTab` above) only when it has no tab at all yet; a document
   * that's already open, active or not, is left exactly as it was, so a cross-document tool call
   * never steals the tab the user is actually looking at mid-run. Public so tests can exercise both
   * branches directly, without driving a full agent run.
   */
  ensureAgentDocumentOpen(id: string): void {
    if (!this.openTabIds.includes(id)) this.openTab(id);
  }

  @action closeTab(id: string): void {
    this.openTabIds = this.openTabIds.filter((t) => t !== id);
    if (this.activeTabId === id) this.activeTabId = this.openTabIds.at(-1) ?? null;
    const scheme = this.schemes.get(id);
    if (scheme) {
      scheme.dispose();
      this.schemes.delete(id);
    }
  }

  getFolderDescendantIds(folderId: string): string[] {
    const direct = this.folders.filter((f) => f.parentId === folderId).map((f) => f.id);
    const result: string[] = [...direct];
    for (const childId of direct) result.push(...this.getFolderDescendantIds(childId));
    return result;
  }

  getDocument(id: string): DesktopDocument | undefined {
    return this.documents.find((d) => d.id === id);
  }

  getScheme(docId: string): Scheme {
    const existing = this.schemes.get(docId);
    if (existing) return existing;
    const doc = this.getDocument(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    const scheme = this.buildScheme(doc);
    this.schemes.set(docId, scheme);
    setTimeout(() => {
      setSchemeStartPosition(scheme);
    }, 10);
    return scheme;
  }

  /** Fire-and-forget wrapper around `saveDocumentAsync` — every existing call site only needs "kick
   * off the write", not its result. Use `flushPendingSaves` when the caller must know every pending
   * write has actually landed on disk before proceeding (closing the window). */
  saveDocumentNow(id: string): void {
    this.saveDocumentAsync(id).catch((error: unknown) => reportError('Failed to save document', error));
  }

  private saveDocumentAsync(id: string): Promise<void> {
    // Autosave is suspended while a document is locked (ADR 0029 (private)'s "Document locks"
    // decision) — deliberately returns *before* clearing `saveTimers`, so the document stays
    // "dirty" (see `handleDocumentsChanged`'s `saveTimers.has(id)` check) until `handleLocksChanged`
    // flushes it once the lock clears, rather than silently reporting "saved" while nothing wrote.
    if (this.locks.has(id)) return Promise.resolve();
    const existingTimer = this.saveTimers.get(id);
    if (existingTimer) clearTimeout(existingTimer);
    this.saveTimers.delete(id);
    const doc = this.getDocument(id);
    if (!doc?.root) return Promise.resolve();
    // `toJS` must run on `doc` itself, not on a freshly-built `{ id: doc.id, ... }` literal — same
    // gotcha `exportLogicCode` above already documents: `toJS` only recurses into an argument that
    // is *itself* an observable container, and `this.documents` is a deep-observable array, so a
    // document whose `root` was reassigned after an edit (`onSchemeChanged` below) is one. Wrapping
    // the still-proxied `root` in a brand-new plain object first defeats that recursion and fails
    // Electron's IPC structured clone with an opaque "An object could not be cloned".
    const plain = toJS(doc);
    return globalThis.falang.document.write(this.projectDir, {
      id: plain.id,
      type: plain.type,
      name: plain.name,
      root: plain.root,
    });
  }

  saveAllOpenTabsNow(): void {
    for (const id of this.openTabIds) this.saveDocumentNow(id);
  }

  /** Awaits every pending debounced autosave — used before the window is allowed to close (see
   * `main/index.ts`'s graceful-close flow) so an edit made in the last `SAVE_DEBOUNCE_MS` before
   * quitting isn't silently discarded along with the renderer process. */
  async flushPendingSaves(): Promise<void> {
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot the keys first: saveDocumentAsync deletes from saveTimers as it goes, which would skip entries if iterating the live Map directly.
    const ids = [...this.saveTimers.keys()];
    const results = await Promise.allSettled(ids.map((id) => this.saveDocumentAsync(id)));
    for (const result of results) {
      if (result.status === 'rejected') reportError('Failed to save document', result.reason);
    }
  }

  /** The native "Project" menu's "Version History"/"Agent" items (`IPC.menuToggleVersionHistory`/
   * `IPC.menuToggleAgent`) — ADR 0036 (private) §3/§4.
   * Clicking the already-open panel's toggle closes the sidebar; clicking the other one switches to
   * it. Opening `'history'` refreshes `versionHistory`, same as the old `toggleHistoryPanel` did. */
  @action toggleRightPanel(panel: 'agent' | 'history'): void {
    this.rightPanel = this.rightPanel === panel ? null : panel;
    if (this.rightPanel === 'history') this.versionHistory.refresh();
  }

  /**
   * ADR 0036 §5, "no home document" amendment — the active tab's id, if the agent can edit it
   * (`function` or any `simple-code-*` language, the same scoping `buildScheme`'s `extraModules`
   * below and `agentDocumentResolver` above use), else `null` — a perfectly normal value, not a
   * reason to disable Send (an empty project, or a non-agent-capable document, is still workable).
   * Read fresh by `AgentChatPanel`'s `getActiveDocumentId()` on every render/send.
   */
  getAgentActiveDocumentId(): string | null {
    const id = this.activeTabId;
    if (!id) return null;
    const doc = this.getDocument(id);
    if (!doc || !this.isAgentCapableDocument(doc)) return null;
    return id;
  }

  /** Shared by `agentDocumentResolver`, `getAgentActiveDocumentId`, `agentCapableDocumentSummaries`,
   *  and `buildScheme`'s `HistoryModule` scoping — `function` or any `simple-code-*` language. */
  private isAgentCapableDocument(doc: DesktopDocument): boolean {
    return isAgentCapableDocumentType('sketch', doc.type);
  }

  /**
   * The active document's `HistoryStore` (resolved from its scheme's own container), or `null` when
   * there's no active document or its scheme has no `HistoryModule` registered — ADR 0036 §2/§3.
   * Deliberately independent of `getAgentHome()`: Undo/Redo in the agent panel follow whichever
   * document is on screen, not just an agent-capable one.
   */
  getActiveHistory(): HistoryStore | null {
    const id = this.activeTabId;
    if (!id) return null;
    try {
      return resolveService(TOKEN_HISTORY, this.getScheme(id).container);
    } catch {
      return null;
    }
  }

  /** Opens the PDF export modal (native menu "Export PDF…") — ADR 0048 (private). */
  @action openPrintExport(): void {
    this.printExport?.dispose();
    this.printExport = new PrintExportStore(this.buildPrintExportHost());
  }

  @action closePrintExport(): void {
    this.printExport?.dispose();
    this.printExport = null;
  }

  private buildPrintExportHost(): IPrintExportHost {
    return createPrintExportHost({
      projectDir: this.projectDir,
      container: this.container,
      folders: () => this.folders,
      documents: () => this.documents,
      activeTabId: () => this.activeTabId,
      getLiveScheme: (id) => this.schemes.get(id),
      isPrintable: (doc) => doc.type in DOCUMENT_TYPES,
    });
  }

  @action openDiffModal(): void {
    this.diffModalOpen = true;
  }

  @action closeDiffModal(): void {
    this.diffModalOpen = false;
  }

  /**
   * A read-only scheme for one side of the split diff view (ADR 0025 (private))
   * — an arrow-function field (not a prototype method) so `ProjectWorkspace` can pass it straight to
   * `VersionDiffView`'s `buildReadOnlyScheme` prop without losing its `this` binding, mirroring the
   * workflow client's own `buildReadOnlySchemeForDiff`. The bulk of the logic lives in
   * `versioning/build-read-only-scheme-for-diff.ts`.
   */
  buildReadOnlySchemeForDiff = (
    document: ISnapshotDocument,
    diff: INodeTreeDiff,
    side: TVersionDiffSide,
  ): Scheme | null => buildReadOnlySchemeForDiffImpl({ document, diff, side, container: this.container });

  /**
   * `VersionHistoryStore`'s `onRestored` hook: the working copy on disk just changed underneath
   * every open tab, so every open scheme is disposed and the tree is reloaded from scratch (same
   * "same as reopening the project" reasoning ADR 0025 (private)'s "When
   * commits happen" section gives for a restore clearing undo history) — the previously active tab
   * is reopened afterwards if its document still exists post-restore. `logic-export.json` is
   * versioned too (see the ADR's "Git specifics (desktop)"), so it's reloaded alongside the tree.
   */
  private async reloadAfterRestore(): Promise<void> {
    const previousActiveId = this.activeTabId;
    for (const id of this.openTabIds) this.closeTab(id);
    await this.loadTree();
    await this.loadLogicExportConfiguration();
    if (previousActiveId && this.getDocument(previousActiveId)) this.openTab(previousActiveId);
  }

  dispose(): void {
    this.agentSession.cancel();
    this.printExport?.dispose();
    this.disposeRegistrySync();
    this.disposeFunctionsRegistrySync();
    this.disposeExternalApiRegistrySync();
    this.disposeTypesRegistrySync();
    this.disposeProjectChangedSubscription();
    this.disposeExportProgressSubscriptions();
    // Flush rather than discard: a pending debounced autosave (see `onSchemeChanged`) means an edit
    // sits unwritten on disk for up to `SAVE_DEBOUNCE_MS` — switching projects (React unmounting
    // `ProjectWorkspace`) must not silently drop it. `dispose()` itself must stay synchronous (React's
    // cleanup contract), so this is fire-and-forget here; the window-close path awaits the same method
    // directly instead (see `main/index.ts`'s graceful-close flow).
    this.flushPendingSaves().catch((error: unknown) => reportError('Failed to flush pending saves', error));
    for (const scheme of this.schemes.values()) scheme.dispose();
    this.schemes.clear();
  }

  private buildScheme(doc: DesktopDocument): Scheme {
    // One request from the project's single `AgentSession` (see the `agentSession` field above) is one undo group on
    // whichever scheme it touches — `buildSketchDocumentScheme` adds `HistoryModule` for every agent-capable type
    // (`function`, every `simple-code-*` language; not `contour`/`text-function`/`mind-tree` or the `*-structure`
    // editors, mirroring the workflow product's own function-document scoping — ADR 0026 (private)).
    const scheme = buildSketchDocumentScheme({ doc, parentContainer: this.container });
    // No types-registry update here, unlike an earlier version: `doc.root`'s reassignment by the sync is itself the MobX
    // trigger the project-wide `disposeTypesRegistrySync` autorun (see the constructor) reacts to — the same "no per-tab
    // path, only the project-wide sync" posture `syncFunctionsRegistry`/`syncExternalApiRegistry` already use.
    subscribeDesktopDocumentSync(doc, scheme, { onSynced: () => this.scheduleSave(doc.id) });
    scheme.events.subscribeEvent(EVENT_LINK_CLICKED, ({ documentId }) => {
      if (this.getDocument(documentId)) this.openTab(documentId);
      return true;
    });
    return scheme;
  }

  private scheduleSave(docId: string): void {
    const existingTimer = this.saveTimers.get(docId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => this.saveDocumentNow(docId), SAVE_DEBOUNCE_MS);
    this.saveTimers.set(docId, timer);
  }
}
