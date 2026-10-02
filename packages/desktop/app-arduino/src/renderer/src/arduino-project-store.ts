// oxlint-disable max-lines -- grew past 300 lines with ADR 0029 (private)'s watcher/locks/conflict handling and ADR 0025 (private)'s versioning (a handful of small fields/methods; the bulk of that logic lives in `versioning/*.ts` to keep this file's growth minimal); @falang/desktop-app-sketch's DesktopProjectStore (the same shape, further along) carries the identical disable for the same reasons.
import 'reflect-metadata';
import { action, autorun, makeObservable, observable, runInAction, toJS, when } from 'mobx';
import { isValidFunctionName, type INode, type IProjectDocument } from '@falang/dto';
import {
  EVENT_NODE_INSERTED,
  setSchemeStartPosition,
  DebuggerModule,
  TOKEN_HISTORY,
  type HistoryStore,
  type Scheme,
  type DebugSessionStore,
  type IDebugSessionStartParams,
  type TVersionDiffSide,
} from '@falang/scheme';
import type { AgentSession, IAgentDocumentResolver } from '@falang/agent';
import { TOKEN_TYPESCRIPT_PROJECT_SERVICE } from '@falang/typescript-scheme';
import type { IDocumentLock, IProjectChangeEvent } from '@falang/desktop-project-fs';
import { resolveService, type DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import type { IPrintExportHost } from '@falang/antd';
import { AgentChatSessionStore, PrintExportStore, VersionHistoryStore } from '@falang/antd';
import { parseDriverActionNodeName } from '@falang/desktop-arduino-dto/src/driver-node-name.js';
import { generateUuid } from './generate-uuid.js';
import { driversRegistry } from './drivers-registry-store.js';
import { ElectronAgentSessionStore } from './agent/electron-agent-session-store.js';
import { ElectronLlmClient } from './agent/electron-llm-client.js';
import { DEFAULT_BOARD_FQBN } from '../../shared/board.js';
import { DEVICES_DOCUMENT_TYPE, type IDevicesDocumentData } from '../../shared/devices-document.js';
import { reportError } from '../../shared/report-error.js';
import { createArduinoDebugSession } from './create-arduino-debug-session.js';
import * as folderActions from './folder-actions.js';
import { arduinoSchemeFactory } from '@falang/desktop-arduino-scheme';
import {
  buildArduinoDocumentScheme,
  createArduinoProjectContainer,
  createDesktopAgentDocumentResolver,
  createDesktopAgentSession,
  isAgentCapableDocumentType,
  subscribeDesktopDocumentSync,
  syncFunctionsRegistry,
} from '@falang/desktop-agent-host';
import { createPrintExportHost } from './print/create-print-export-host.js';
import { isArduinoPinnedDocument, REQUIRED_ROOT_DOCUMENT_NAMES } from './pinned-documents.js';
import { buildReadOnlySchemeForDiff as buildReadOnlySchemeForDiffImpl } from './versioning/build-read-only-scheme-for-diff.js';
import { ElectronVersionStore } from './versioning/electron-version-store.js';

const SAVE_DEBOUNCE_MS = 500;

/**
 * An Arduino project has two document types: `function` (the `packages/desktop/app-sketch` "Logic"
 * node model, see ADR 0020 (private)) for `setup`/`loop`/any further function a user adds, and the
 * one-per-project `devices` document (see ADR 0032 (private),
 * "Decision → 3") describing pins/hardware, edited as plain `data` — no scheme, no `root` (see
 * `getScheme`'s guard below). All three fixed documents (`setup`/`loop`/`Devices`) are created by
 * `main`'s `ensureArduinoProjectDocuments` on project create/open/restore, never by this store (see
 * that function's own doc comment, `main/ensure-project-documents.ts`, for why) — this store's job is
 * just to carry whichever documents already exist on disk through the tree/save/reload paths without
 * assuming every document is a scheme, and to edit `devices`' `data` once C2's editor is open on it.
 */
export type DocumentType = 'function' | typeof DEVICES_DOCUMENT_TYPE;

export const DOCUMENT_TYPE_LABEL = 'Function';

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
  /** The `devices` document's payload (`IDevicesDocumentData`, kept `unknown` here — parsing/validating it is C2's editor's job, not this store's) — a `function` document never has this. */
  data?: unknown;
}

/** Local editor state for one open project — folders, tabs, scheme instances. All I/O goes through `globalThis.falang`. */
export class ArduinoProjectStore {
  readonly projectDir: string;
  readonly container: DependencyContainer;
  readonly folders = observable<DesktopFolder>([]);
  readonly documents = observable<DesktopDocument>([]);
  @observable isLoadingTree = true;
  @observable openTabIds: string[] = [];
  @observable activeTabId: string | null = null;
  /** The project's chosen board — set once at project creation, never changed after (see
   * ADR 0032 (private), "Decision → 1"). Loaded once below;
   * falls back to `DEFAULT_BOARD_FQBN` for a pre-existing project the `IPC.projectOpen` handler
   * hasn't caught up with yet (it always will have, by the time this resolves, but the handler's own
   * write races this read rather than gating it). */
  @observable board: string = DEFAULT_BOARD_FQBN;

  /** Shared by every open scheme's `DebuggerModule` — one session per project, see ADR 0021 (private) §3. */
  readonly debugSession: DebugSessionStore;
  /** Git-backed version history over this project directory — see ADR 0025 (private) (package E2). */
  readonly versionHistory: VersionHistoryStore;
  /** This project's agent chat sessions (one JSON file per session under `falang/agent-sessions/`) — see ADR 0033 (private). */
  readonly agentChat: AgentChatSessionStore;
  /** The project's one `AgentSession` (ADR 0036 (private)
   * §1, amended §"no home document" — 2026-09-23) — not per scheme any more; every open document
   * keeps only `HistoryModule`. There's no fixed "home" document any more either: a run's effective
   * active document is whatever `getAgentActiveDocumentId()` reports at send time (passed as
   * `IAgentRunOptions.activeDocumentId`), so the constructor's `defaultScheme` is `null`.
   * `cancel()`'d in `dispose()`. */
  readonly agentSession: AgentSession;
  /**
   * Resolves a tool call's `documentId` to a `Scheme` for `agentSession` above — throws a clear
   * error for an unknown document id or the `devices` document (no `Scheme` at all — see `getScheme`'s
   * own guard) rather than silently degrading; the throw is caught by `AgentSession` and turned into
   * a `fail()` tool result, not a fatal run error. Exposed as its own field (not built inline where
   * `agentSession` is constructed) so tests can exercise it directly without driving a full agent run
   * through a fake LLM client.
   */
  readonly agentDocumentResolver: IAgentDocumentResolver = createDesktopAgentDocumentResolver('arduino', this);
  /** Which project-level panel the right sidebar shows, or neither — see `toggleRightPanel`. */
  @observable rightPanel: 'agent' | 'history' | null = null;
  @observable diffModalOpen = false;
  /** The PDF export flow (ADR 0048 (private)), `null` while closed. */
  @observable.ref printExport: PrintExportStore | null = null;

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

  private readonly schemes = new Map<string, Scheme>();
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly disposeFunctionsRegistrySync: () => void;
  private readonly disposeDebugSession: () => void;
  private readonly disposeProjectChangedSubscription: () => void;
  private readonly electronVersionStore: ElectronVersionStore;
  private readonly disposeDriversSubscription: () => void;
  /** Resolves once this project's driver set (bundled ∪ library ∪ project) is in the scheme registry — `loadTree` waits for it so no scheme is ever built from a stale set. */
  private readonly initialDriversLoad: Promise<unknown>;
  /** The driver set changed and open schemes still carry the old node kinds (waiting for an agent run to end, or for `rebuildOpenSchemes`). */
  private pendingDriverRebuild = false;
  private isDisposed = false;

  constructor(projectDir: string) {
    this.projectDir = projectDir;
    // The project container (portable Monaco lib + the Arduino builtin declarations, the TypeScript project service, the
    // light theme — app-arduino's whole UI is light, see ADR 0020 (private)'s "Implementation notes (light theme for
    // app-arduino …)") is `@falang/desktop-agent-host`'s `createArduinoProjectContainer` — the same function a headless
    // host calls.
    this.container = createArduinoProjectContainer();
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
      product: 'arduino',
      llmClient: new ElectronLlmClient(),
      store: this,
      documentResolver: this.agentDocumentResolver,
      onOpenDocument: (id) => this.ensureAgentDocumentOpen(id),
    });
    this.disposeFunctionsRegistrySync = autorun(() => {
      // `call-function`'s registry only ever makes sense for `function` documents — the `devices`
      // document has no `root`/function body at all, and must never be offered as a call target.
      syncFunctionsRegistry(
        this.container,
        this.documents
          .filter((doc) => doc.type === 'function')
          .map((doc) => ({ id: doc.id, name: doc.name, type: doc.type, root: doc.root })),
      );
    });
    const debugSession = createArduinoDebugSession(projectDir, () => this.toProjectDocuments());
    this.debugSession = debugSession.session;
    this.disposeDebugSession = debugSession.dispose;
    this.disposeProjectChangedSubscription = globalThis.falang.project.onChanged((event) =>
      this.handleProjectChanged(event),
    );
    this.initialDriversLoad = driversRegistry
      .refresh()
      .catch((error: unknown) => reportError('Failed to load the project drivers', error));
    this.disposeDriversSubscription = driversRegistry.onConfigsChanged(() => this.handleDriversChanged());
    this.loadTree().catch((error: unknown) => reportError('Failed to load project tree', error));
    this.refreshLocks().catch((error: unknown) => reportError('Failed to read document locks', error));
    globalThis.falang.arduino
      .getProjectConfig(projectDir)
      .then((config) => runInAction(() => (this.board = config?.board ?? DEFAULT_BOARD_FQBN)))
      .catch((error: unknown) => reportError('Failed to load the project board', error));
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
      // oxlint-disable-next-line no-await-in-loop -- sequential on purpose, avoids concurrent project-fs reads racing each other
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
      doc.data = full.data;
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

  /** "Upload (debug)": build with tracing on, upload, attach (ADR 0021 (private) §6). Pauses on entry only with no breakpoints set yet, so a first debug upload always stops somewhere. */
  debugSketch(fqbn: string, port: string): Promise<void> {
    const params: IDebugSessionStartParams = {
      pauseOnEntry: this.debugSession.breakpointList.length === 0,
      entry: { fqbn, port },
    };
    return this.debugSession.start(params);
  }

  private async loadTree(): Promise<void> {
    await this.initialDriversLoad;
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
          data: full.data,
        };
      }),
    );
    runInAction(() => {
      this.folders.replace(tree.folders);
      this.documents.replace(documents);
      this.isLoadingTree = false;
    });
    // `setup`/`loop`/`Devices` are no longer scaffolded here — `main`'s `IPC.projectCreate`/
    // `IPC.projectOpen` handlers already created them (via `ensureArduinoProjectDocuments`) before
    // this store's constructor ever calls `loadTree()`, so `tree.documents` above already includes
    // them for both a brand-new and a pre-existing project. See `main/ensure-project-documents.ts`'s
    // doc comment for why this moved out of the renderer (a StrictMode double-`ArduinoProjectStore`
    // bug that produced a duplicate `Devices` document — found and fixed 2026-09-21).
  }

  createFolder(name: string, parentId: string | null = null): Promise<void> {
    return folderActions.createFolder(this, name, parentId);
  }

  @action renameFolder(id: string, name: string): void {
    folderActions.renameFolder(this, id, name);
  }

  @action moveFolder(folderId: string, parentId: string | null): void {
    folderActions.moveFolder(this, folderId, parentId);
  }

  @action deleteFolder(id: string): void {
    folderActions.deleteFolder(this, id);
  }

  @action createDocument(name: string, folderId: string | null = null): string | null {
    if (!isValidFunctionName(name)) {
      reportError(
        'Invalid function name',
        new Error(
          `"${name}" is invalid — a function name must be an English, camelCase identifier ` +
            '(e.g. myFunctionName), with no spaces, punctuation, or non-Latin script',
        ),
      );
      return null;
    }
    const id = generateUuid();
    const scheme = arduinoSchemeFactory({ id, name, parentContainer: this.container });
    const root = scheme.infra.structure.factory('function');
    scheme.dispose();
    this.documents.push({ id, name, type: 'function', folderId, root });
    globalThis.falang.document
      .create(this.projectDir, { document: { id, type: 'function', name, root }, folderId })
      .catch((error: unknown) => reportError('Failed to create document', error));
    this.openTab(id);
    return id;
  }

  @action deleteDocument(id: string): void {
    const doc = this.documents.find((d) => d.id === id);
    if (doc && isArduinoPinnedDocument(doc)) {
      reportError('Document is pinned', new Error(`"${doc.name}" is a pinned document and cannot be deleted`));
      return;
    }
    this.closeTab(id);
    this.documents.replace(this.documents.filter((d) => d.id !== id));
    globalThis.falang.document
      .delete(this.projectDir, id)
      .catch((error: unknown) => reportError('Failed to delete document', error));
  }

  @action renameDocument(id: string, name: string): void {
    const doc = this.documents.find((d) => d.id === id);
    if (!doc) return;
    if (isArduinoPinnedDocument(doc)) {
      reportError('Document is pinned', new Error(`"${doc.name}" is a pinned document and cannot be renamed`));
      return;
    }
    if (!isValidFunctionName(name)) {
      reportError(
        'Invalid function name',
        new Error(
          `"${name}" is invalid — a function name must be an English, camelCase identifier ` +
            '(e.g. myFunctionName), with no spaces, punctuation, or non-Latin script',
        ),
      );
      return;
    }
    doc.name = name;
    globalThis.falang.document
      .rename(this.projectDir, id, name)
      .catch((error: unknown) => reportError('Failed to rename document', error));
  }

  @action moveDocument(docId: string, folderId: string | null): void {
    const doc = this.documents.find((d) => d.id === docId);
    if (!doc) return;
    if (isArduinoPinnedDocument(doc)) {
      reportError('Document is pinned', new Error(`"${doc.name}" is a pinned document and cannot be moved`));
      return;
    }
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
    return folderActions.getFolderDescendantIds(this, folderId);
  }

  getDocument(id: string): DesktopDocument | undefined {
    return this.documents.find((d) => d.id === id);
  }

  /** Whether `id` is a pinned document (`setup`/`loop` at the project root, or `Devices`) — see `pinned-documents.ts`. Unknown ids are never pinned. */
  isPinned(id: string): boolean {
    const doc = this.getDocument(id);
    return doc ? isArduinoPinnedDocument(doc) : false;
  }

  /** `DevicesEditor`'s `onChange` callback (see `devices-document-store.ts`) — there's no `Scheme`/
   * `EVENT_ONCHANGE` behind the `Devices` document, so it can't go through `onSchemeChanged` like
   * every `function` document's edits do; this is the equivalent entry point, sharing the same
   * debounced-save scheduling via `scheduleSave`. */
  @action setDevicesDocumentData(id: string, data: IDevicesDocumentData): void {
    const doc = this.getDocument(id);
    if (!doc) return;
    doc.data = data;
    this.scheduleSave(doc.id);
    this.adoptLibraryDriversIfReferenced(data.devices.map((device) => device.driverId));
  }

  getScheme(docId: string): Scheme {
    const existing = this.schemes.get(docId);
    if (existing) return existing;
    const doc = this.getDocument(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    if (doc.type === DEVICES_DOCUMENT_TYPE) {
      throw new Error(`Document ${docId} is the Devices document and has no scheme editor`);
    }
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
    if (!doc) return Promise.resolve();
    // `toJS` must run on `doc` itself, not on a freshly-built `{ id: doc.id, ... }` literal — `doc`
    // is an element of the deep-observable `documents` array, so its `root`/`data` (reassigned in
    // `onSchemeChanged`/C2's devices editor) is itself a MobX-observable proxy by the time it gets
    // here. Sending that straight over `ipcRenderer.invoke` fails Electron's structured-clone with an
    // opaque "An object could not be cloned" — silently, since every call site only logs the
    // rejection to the (unopened, in a packaged build) DevTools console — so every save was silently
    // a no-op (found live: a user edited a document and it never reached disk). `toJS` strips the
    // proxying first; `@falang/desktop-app-sketch`'s own `saveDocumentNow` already does this, this
    // one had drifted.
    const plain = toJS(doc);
    // The `devices` document is a `custom` document (`data`, no `root` — see
    // ADR 0032 (private), "Decision → 3"); every other
    // document type is a `function` scheme (`root`, no `data`). Nothing yet drives a `devices`-doc
    // edit through this path (C2's editor does that), but the write itself must already be
    // type-aware so that wiring only has to call `saveDocumentNow` like everything else.
    if (plain.type === DEVICES_DOCUMENT_TYPE) {
      // oxlint-disable-next-line no-undefined -- `data` is genuinely `unknown | undefined` (no editor has ever set it yet, e.g. a project restored from before this document type existed); nothing to write in that case.
      if (plain.data === undefined) return Promise.resolve();
      return globalThis.falang.document.write(this.projectDir, {
        id: plain.id,
        type: plain.type,
        name: plain.name,
        data: plain.data,
      });
    }
    if (!plain.root) return Promise.resolve();
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

  /** The native "Sketch" menu's "Version History"/"Agent" items (ADR 0036 (private) §3/§4). Clicking the already-open panel's toggle closes the sidebar;
   * clicking the other one switches to it. Opening `'history'` refreshes `versionHistory`, same as
   * the old `toggleHistoryPanel` did. */
  @action toggleRightPanel(panel: 'agent' | 'history'): void {
    this.rightPanel = this.rightPanel === panel ? null : panel;
    if (this.rightPanel === 'history') this.versionHistory.refresh();
  }

  /**
   * ADR 0036 §5, "no home document" amendment — the active tab's id, if it's a scheme document (i.e.
   * not the `devices` document, which has no `Scheme` at all — see `getScheme`'s own guard), else
   * `null` — a perfectly normal value, not a reason to disable Send. Read fresh by `AgentChatPanel`'s
   * `getActiveDocumentId()` on every render/send.
   */
  getAgentActiveDocumentId(): string | null {
    const id = this.activeTabId;
    if (!id) return null;
    const doc = this.getDocument(id);
    if (!doc || !this.isAgentCapableDocument(doc)) return null;
    return id;
  }

  /** Shared by `agentDocumentResolver`, `getAgentActiveDocumentId`, and
   *  `agentCapableDocumentSummaries` — every document type except `devices` is a real `function`
   *  scheme document the agent can edit. */
  private isAgentCapableDocument(doc: DesktopDocument): boolean {
    return isAgentCapableDocumentType('arduino', doc.type);
  }

  /**
   * The active document's `HistoryStore` (resolved from its scheme's own container), or `null` when
   * there's no active document, it's the `devices` document (no `Scheme`), or its scheme has no
   * `HistoryModule` registered — ADR 0036 §2/§3.
   */
  getActiveHistory(): HistoryStore | null {
    const id = this.activeTabId;
    if (!id) return null;
    const doc = this.getDocument(id);
    if (!doc || doc.type === DEVICES_DOCUMENT_TYPE) return null;
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
      // Every scheme document; never the `Devices` custom document.
      isPrintable: (doc) => doc.type !== DEVICES_DOCUMENT_TYPE,
      // Same root-level order as `ProjectTree`: pinned `setup`, `loop` first, then the rest in insertion order.
      orderLevel: (docs, parentId) => {
        if (parentId !== null) return docs;
        const pinned = docs
          .filter((doc) => isArduinoPinnedDocument(doc))
          .toSorted(
            (a, b) =>
              (REQUIRED_ROOT_DOCUMENT_NAMES as readonly string[]).indexOf(a.name) -
              (REQUIRED_ROOT_DOCUMENT_NAMES as readonly string[]).indexOf(b.name),
          );
        return [...pinned, ...docs.filter((doc) => !isArduinoPinnedDocument(doc))];
      },
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
   * `VersionDiffView`'s `buildReadOnlyScheme` prop without losing its `this` binding. The bulk of the
   * logic lives in `versioning/build-read-only-scheme-for-diff.ts`.
   */
  buildReadOnlySchemeForDiff = (
    document: ISnapshotDocument,
    diff: INodeTreeDiff,
    side: TVersionDiffSide,
  ): Scheme | null => buildReadOnlySchemeForDiffImpl({ document, diff, side, container: this.container });

  /** Resolves once no agent run is in progress (an `awaiting-answer` run is idle too — nothing is being edited). */
  whenAgentIdle(): Promise<void> {
    return when(() => this.agentSession.status !== 'running');
  }

  /**
   * `drivers:changed` with a different set of driver configs (ADR 0054 (private) §5): open schemes were built with
   * the old node kinds (a Scheme's kinds are fixed at construction), so they have to be rebuilt — but never under a
   * running agent, whose tool calls hold live schemes; the rebuild waits for the run to end.
   */
  private handleDriversChanged(): void {
    this.pendingDriverRebuild = true;
    this.whenAgentIdle()
      .then(async () => {
        if (this.pendingDriverRebuild && !this.isDisposed) await this.rebuildOpenSchemes();
      })
      .catch((error: unknown) => reportError('Failed to rebuild schemes after a driver change', error));
  }

  /**
   * Re-reads the project's drivers and, if the set of configs changed (or a rebuild is still pending), rebuilds every
   * open scheme — immediately, with no agent deferral (the agent's own driver tools await this). Resolves once the
   * registry is current and the open schemes are being remounted.
   */
  async refreshDrivers(): Promise<void> {
    const changed = await driversRegistry.refresh();
    if (changed || this.pendingDriverRebuild) await this.rebuildOpenSchemes();
  }

  /**
   * Disposes every built scheme and bumps the reload version of every open tab so `ProjectWorkspace` remounts them
   * (and `DevicesEditor` re-reads its driver list) against the current driver registry. Documents are not re-read
   * from disk: pending autosaves are flushed first and a live scheme keeps `doc.root` current, so the rebuilt
   * scheme starts from the same tree. Undo history of the rebuilt schemes is reset.
   */
  async rebuildOpenSchemes(): Promise<void> {
    this.pendingDriverRebuild = false;
    await this.flushPendingSaves();
    runInAction(() => {
      for (const scheme of this.schemes.values()) scheme.dispose();
      this.schemes.clear();
      for (const id of this.openTabIds) this.reloadVersions.set(id, (this.reloadVersions.get(id) ?? 0) + 1);
    });
  }

  /** Copies library drivers a freshly inserted node/device refers to into the project (ADR 0054 (private) §3) — fire-and-forget; a no-op unless one of `driverIds` is currently library-scoped. */
  private adoptLibraryDriversIfReferenced(driverIds: readonly string[]): void {
    if (!driverIds.some((id) => driversRegistry.scopeOf(id) === 'library')) return;
    // `main` finds references by reading the documents from disk, so the edit that just introduced the reference
    // has to land first (the sync that updates `doc.root` runs in the same tick as the event, hence the microtask).
    Promise.resolve()
      .then(() => this.flushPendingSaves())
      .then(() => globalThis.falang.drivers.adoptReferenced())
      .catch((error: unknown) => reportError('Failed to add the library driver to the project', error));
  }

  /**
   * `VersionHistoryStore`'s `onRestored` hook: the working copy on disk just changed underneath
   * every open tab, so every open scheme is disposed and the tree reloaded from scratch (same "same
   * as reopening the project" reasoning ADR 0025 (private)'s "When commits
   * happen" section gives for a restore clearing undo history) — the previously active tab is
   * reopened afterwards if its document still exists post-restore. Calls `IPC.projectEnsureDocuments`
   * (`ensureArduinoProjectDocuments` in `main`) before `loadTree()`, since a restored snapshot may
   * itself predate `setup`/`loop`/`Devices` — this runs while the watcher is already active (unlike
   * the same call from `IPC.projectCreate`/`IPC.projectOpen`, which runs before it starts), but that's
   * fine: any document it creates that this store doesn't already know about is picked up by
   * `handleDocumentsChanged` → `reloadDocumentFromDisk`, which already refreshes the tree metadata
   * first for a not-yet-known id, and the `loadTree()` right after this re-reads the whole tree anyway.
   */
  private async reloadAfterRestore(): Promise<void> {
    const previousActiveId = this.activeTabId;
    for (const id of this.openTabIds) this.closeTab(id);
    await globalThis.falang.project.ensureDocuments(this.projectDir);
    await this.loadTree();
    if (previousActiveId && this.getDocument(previousActiveId)) this.openTab(previousActiveId);
  }

  /**
   * Plain data snapshot for the "Build & Upload" panel to send over IPC — `compileArduinoProject`
   * only runs in `main`, never here (it needs the real TS Compiler API/`node:path`, unavailable in
   * the renderer's browser-like Vite bundle — see ADR 0020 (private)'s Implementation notes).
   */
  toProjectDocuments(): IProjectDocument[] {
    const documents = this.documents.map((doc) => ({
      id: doc.id,
      type: doc.type,
      name: doc.name,
      root: doc.root,
      data: doc.data,
    }));
    // Structured-clone (`ipcRenderer.invoke`'s mechanism) can throw "An object could not be cloned"
    // on MobX's deep-observable proxying of `root` once the whole array crosses IPC at once
    // (confirmed live; a single `document.write` never hit this). JSON round-tripping strips every
    // proxy — safe since these trees are meant to be pure JSON anyway (`project-fs` disk format).
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- structuredClone is the mechanism failing above.
    return JSON.parse(JSON.stringify(documents)) as IProjectDocument[];
  }

  dispose(): void {
    this.isDisposed = true;
    this.disposeDriversSubscription();
    this.agentSession.cancel();
    this.printExport?.dispose();
    this.disposeFunctionsRegistrySync();
    this.disposeDebugSession();
    this.disposeProjectChangedSubscription();
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
    // whichever scheme it touches — that still requires `HistoryModule` on every scheme document (ADR 0009 (private)),
    // which `buildArduinoDocumentScheme` adds, even though `AgentModule` itself no longer lives here (ADR 0036 (private)
    // §1). Every Arduino document is a `function` node tree (`setup`/`loop`/any further function a user adds, see ADR 0020
    // (private)), unlike `packages/desktop/app-sketch`'s per-document-type scoping. The `devices` document never reaches
    // `buildScheme` at all (`getScheme` throws for it first).
    const scheme = buildArduinoDocumentScheme({
      doc,
      parentContainer: this.container,
      extraModules: [new DebuggerModule({ session: this.debugSession, documentId: doc.id })],
    });
    scheme.events.subscribeEvent(EVENT_NODE_INSERTED, ({ node }) => {
      const parsed = parseDriverActionNodeName(node.name);
      if (parsed) this.adoptLibraryDriversIfReferenced([parsed.driverId]);
      return false;
    });
    subscribeDesktopDocumentSync(doc, scheme, {
      typesRegistry: resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, this.container).typesRegistry,
      onSynced: () => this.scheduleSave(doc.id),
    });
    return scheme;
  }

  /** Debounced-autosave scheduling, shared by every document edit path — a `function` document's
   * `onSchemeChanged` above, and the `devices` document's `setDevicesDocumentData` above it. */
  private scheduleSave(docId: string): void {
    const existingTimer = this.saveTimers.get(docId);
    if (existingTimer) clearTimeout(existingTimer);
    const timer = setTimeout(() => this.saveDocumentNow(docId), SAVE_DEBOUNCE_MS);
    this.saveTimers.set(docId, timer);
  }
}
