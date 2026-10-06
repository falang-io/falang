import { eventTracker } from './analytics/event-tracker.js';
// oxlint-disable max-lines -- versioning (ADR 0025 (private)) added a handful of small fields/methods; the bulk of the new logic itself lives in `versioning/*.ts` to keep this file's growth minimal.
import 'reflect-metadata';
import { action, makeObservable, observable, reaction, runInAction, type IReactionDisposer } from 'mobx';
import type { AgentSession } from '@falang/agent';
import {
  type Scheme,
  DebugSessionStore,
  DebuggerModule,
  type IDebugSessionStartParams,
  type HistoryStore,
  type ITheme,
  ExecutionPositionModule,
  focusNode,
  scrollToNode,
  setSchemeStartPosition,
  TOKEN_HISTORY,
  type TVersionDiffSide,
} from '@falang/scheme';
import {
  registerTypescriptProjectService,
  updateTypesRegistryFromINode,
  TOKEN_TYPESCRIPT_PROJECT_SERVICE,
  type TypesRegistryStore,
} from '@falang/typescript-scheme';
import { OBJECTS_STRUCTURE_NAME } from '@falang/typescript-dto';
import { container, resolveService, type DependencyContainer } from '@falang/di';
import type { INodeTreeDiff, ISnapshotDocument } from '@falang/versioning';
import { AgentChatSessionStore, PrintExportStore, VersionHistoryStore } from '@falang/antd';
import { navigationStore } from './navigation-store.js';
import { pruneKeepAlive, touchKeepAlive } from './keep-alive.js';
import type { IProjectTabs } from './project-tabs-storage.js';
import { startWorkspaceSync } from './workspace-sync.js';
import { createPrintExportHost } from './print/create-print-export-host.js';
import {
  checkDocumentPlacement,
  checkFolderPlacement,
  findSectionFolder,
  isFixedFolder,
  MAGIC_NAME,
  sectionForDocumentType,
  TRIGGER_FUNCTION_NAME,
  type TTriggerFunctionBodyData,
} from '@falang/workflow-dto';
import type { IIntegrationInstance } from '@falang/workflow-integrations-common';
import { SCHEDULE_VENDOR } from '@falang/workflow-integrations-schedule';
import { TOKEN_SCHEDULE_STATUS } from '@falang/workflow-scheme';
import { workflowApi } from './api-client.js';
import { AgentLockTracker } from './agent/agent-lock-tracker.js';
import { AgentSettingsStore } from './agent/agent-settings-store.js';
import { MagicInsertSetting } from './agent/magic-insert-setting.js';
import type { MagicRunStore } from './agent/magic-run-store.js';
import { authStore } from './auth-store.js';
import { buildMagicPopup, type IMagicPopup } from './magic/build-magic-popup.js';
import { isAgentEditableType } from './agent/create-agent-document-resolver.js';
import { createWorkflowAgentSession } from './agent/create-workflow-agent-session.js';
import { createWorkflowMagicRunStore, getMagicHostScheme } from './agent/create-workflow-magic-run-store.js';
import { shouldOpenAgentDocumentTab } from './agent/follow-agent-document.js';
import { HttpLlmClient } from './agent/http-llm-client.js';
import { IndexedDbAgentSessionStore } from './agent/indexed-db-session-store.js';
import type { IWorkflowAgentStore } from './agent/workflow-agent-store.js';
import { buildWorkflowDocumentScheme } from './build-workflow-document-scheme.js';
import { subscribeWorkflowDocumentSync } from './sync-document-from-scheme.js';
import { findDocumentNameConflict } from './document-names.js';
import { generateUuid } from './generate-uuid.js';
import { loadDisabledVendors } from './disabled-vendors.js';
import { REGISTERED_INTEGRATIONS } from './integrations-registry.js';
import {
  createActivepiecesCatalogProvider,
  createActivepiecesFieldOptionsProvider,
  createFieldOptionsProvider,
  deleteIntegrationInstanceAction,
  findIntegrationsDocument,
  getIntegrationInstances,
  saveIntegrationInstanceAction,
} from './integrations-document-helpers.js';
import { loadPersistedBreakpoints, persistBreakpoints } from './debug-breakpoints-storage.js';
import { DocumentLocksStore } from './document-locks-store.js';
import { FilesStore } from './files-store.js';
import { LiveRunStore } from './live-run-store.js';
import { ProjectSync, type IProjectSyncLockHooks } from './project-sync.js';
import { ScheduleStatusStore } from './schedule-status-store.js';
import { TasksStore } from './tasks-store.js';
import { TemporalDebugAdapter } from './temporal-debug-adapter.js';
import { buildTriggerFunctionDocument } from './trigger-function-document.js';
import { VendorDataStore } from './vendor-data-store.js';
import { resolveServerActivity, type TServerActivity } from './server-activity.js';
import { buildReadOnlySchemeForDiff as buildReadOnlySchemeForDiffImpl } from './versioning/build-read-only-scheme-for-diff.js';
import { HttpVersionStore } from './versioning/http-version-store.js';
import {
  getTriggerFunctionBodyData,
  type DocumentType,
  type WorkflowDocument,
  type WorkflowFolder,
} from './workflow-types.js';

export type { DocumentType, WorkflowDocument, WorkflowFolder } from './workflow-types.js';

const darkTheme: ITheme = {
  background: '#1e1e1e',
  gridColor: '#333',
  iconBackground: '#2d2d2d',
  iconBorderColor: '#aaa',
  textColor: '#e0e0e0',
  selectedBorderColor: '#1668dc',
};

/** Local editor state for one open project — folders, tabs, scheme instances, selection. Backend I/O is `ProjectSync`'s job. */
export class WorkflowStore implements IWorkflowAgentStore {
  readonly projectId: string;
  readonly container: DependencyContainer;
  readonly folders = observable<WorkflowFolder>([]);
  readonly documents = observable<WorkflowDocument>([]);
  @observable openTabIds: string[] = [];
  @observable activeTabId: string | null = null;
  @observable selectedNodeId: string | null = null;
  @observable selectedDocId: string | null = null;
  /**
   * Incremented after every finished agent run of this project — the chat's and every magic node's. Lets an
   * extension (`IClientExtensions.renderAgentPanelHeader`) refetch something that a turn changes, e.g. a balance.
   */
  @observable agentTurnsFinished = 0;
  /** The execution the editor is following, if any — see ADR 0022 (private). */
  readonly liveRun: LiveRunStore;
  /** Shared by every open scheme's `DebuggerModule` — one session per project, see ADR 0021 (private) §3. */
  readonly debugSession: DebugSessionStore;
  /** Polls active document locks every 5s — see ADR 0029 (private)'s "Document locks" decision. `SchemeView` reads `isLocked`/`lockExpiresAt` for its overlay; `ProjectSync` (via `lockHooks` below) suspends autosave for a locked document. */
  readonly documentLocksStore: DocumentLocksStore;
  /** Polls `GET /projects/:id/schedules` every 30s, only while the project has a `schedule`-vendor trigger-function — registered on `this.container` as `TOKEN_SCHEDULE_STATUS` so `TriggerFunctionBodyBlockComponent` reads it. See ADR 0037 (private) §7. */
  readonly scheduleStatus: ScheduleStatusStore;
  /** Commit list, working-copy dirtiness, and the current comparison — see ADR 0025 (private). */
  readonly versionHistory: VersionHistoryStore;
  /** The project's agent chat sessions (IndexedDB-backed) — see ADR 0033 (private). */
  readonly agentChat: AgentChatSessionStore;
  /** The project's one `AgentSession` (ADR 0036 (private)) —
   *  constructed once for the store's lifetime, unlike before that ADR where every agent-capable
   *  document's scheme got its own via `AgentModule`. `run()` always receives an explicit
   *  `activeDocumentId` (see `getAgentActiveDocumentId`, which may be `null` — the agent works fine
   *  with no document open, per the ADR's "no home document" amendment), so this session's own
   *  `defaultScheme` stays `null`. */
  readonly agentSession: AgentSession;
  /** Which project-level right-sidebar panel is open — replaces the old per-panel `historyPanelOpen`
   *  boolean (ADR 0036 (private) §3): at most one of Agent/History shows at a time. */
  @observable rightPanel: 'agent' | 'history' | null = null;
  /** `GET /agent/settings` once per project (ADR 0031 (private)) — shared by the chat panel and the magic-insert gate. */
  readonly agentSettings = new AgentSettingsStore();
  /** The per-user "Magic insert" toolbar toggle (ADR 0046 (private)). */
  readonly magicInsert: MagicInsertSetting;
  /** Every magic node's AI run, confirm dialog and popup-editor target (ADR 0046 (private)). */
  readonly magicRuns: MagicRunStore;
  @observable diffModalOpen = false;
  /** The PDF print export's selection/preview state (ADR 0048 (private)); `null` while closed. */
  @observable.ref printExport: PrintExportStore | null = null;
  /**
   * The project's uploaded/produced files (ADR 0038 (private) §7) — no
   * project-specific construction needed (unlike e.g. `scheduleStatus`), so this is a plain class-field
   * instance rather than something built in the constructor body.
   */
  readonly files = new FilesStore();
  /**
   * This project's human-in-the-loop tasks (ADR 0040 (private)) — loaded
   * filtered to `status: 'open'` at construction (below) purely to back the toolbar's "Tasks" button
   * badge; the "Tasks" view itself (`TasksPage`) owns its own, separately-filtered `TasksStore`
   * instance, same "no shared instance" split as `RunsPage`'s own store vs. this one.
   */
  readonly tasks = new TasksStore();
  /**
   * Backend-written, non-secret per-instance data (e.g. a synced database schema) for every configured
   * integration instance whose vendor supports it — see ADR 0039 (private) §4.
   * Loaded once, right after `ProjectSync`'s initial `GET /documents` resolves (below), and refreshed by
   * `IntegrationsEditor`'s "Sync structure" button.
   */
  readonly vendorData = new VendorDataStore();
  /**
   * Which non-document main-content view is showing, if any — `'files'` for the project-wide Files tab
   * (ADR 0038 (private) §7), `'tasks'` for the Tasks view (ADR 0040 (private) §2), both siblings of
   * the per-document scheme/`IntegrationsEditor` views `activeTabId` already drives. Cleared by
   * `openTab` so switching to a document tab always shows that document again.
   */
  @observable activeView: 'files' | 'tasks' | null = null;

  /**
   * Scheme tabs that stay mounted (the active one plus the most recently active others, hidden) so a
   * tab switch doesn't rebuild the canvas — see `keep-alive.ts` and `ProjectWorkspace`. Closing a tab
   * drops it (unmounts).
   */
  @observable keepAliveSchemeIds: string[] = [];

  private readonly sync: ProjectSync;
  private readonly workspaceSyncDisposer: () => void;
  private readonly keepAliveDisposer: IReactionDisposer;
  private readonly schemes = new Map<string, Scheme>();
  private readonly followRunDisposer: IReactionDisposer;
  private readonly persistBreakpointsDisposer: IReactionDisposer;
  private readonly httpVersionStore: HttpVersionStore;
  /**
   * Tracks which documents this tab's in-app editing agent holds a lock on for the duration of a run
   * — one owner id per `WorkflowStore` instance (i.e. per open tab/session, not per user), deliberately
   * not persisted across a reload, so two tabs of the same user still lock each other out (ADR 0034
   * §2.4, "Лок на время, пока агент держит чужую схему открытой"). See `AgentLockTracker`.
   */
  private readonly agentLocks: AgentLockTracker;

  constructor(projectId: string) {
    // The in-app agent's vendor tools hide vendors this deployment disabled (`disabledVendors` of `GET /auth/config`).
    loadDisabledVendors();
    this.projectId = projectId;
    this.container = container.createChildContainer();
    registerTypescriptProjectService(this.container);
    // `this.documents` (the observable array field above) is already the live instance at this point
    // (class field initializers run before constructor-body code) — safe for `hasScheduleTrigger`'s
    // closure to read it here, even though it's still empty until `ProjectSync`'s first load resolves.
    this.scheduleStatus = new ScheduleStatusStore(projectId, () => this.hasScheduleTrigger());
    this.container.register(TOKEN_SCHEDULE_STATUS, { useValue: this.scheduleStatus });
    this.tasks.load({ status: 'open', projectId });
    this.tasks.start();
    makeObservable(this);
    this.liveRun = new LiveRunStore(projectId, { ensureDevBuilt: () => this.ensureDevBuilt() });
    // Follow the watched run across documents: when it enters another function (`call-function`),
    // switch to that document's tab — its own `ExecutionPositionModule` then highlights the node.
    // A tab opened this way has no icons laid out yet on first render, so the pan runs a tick later
    // (same reason `jumpToNode` delays `focusNode`).
    this.followRunDisposer = reaction(
      () => this.liveRun.location,
      (location) => {
        if (!location || location.documentId === this.activeTabId || !this.getDocument(location.documentId)) return;
        this.openTab(location.documentId);
        const scheme = this.getScheme(location.documentId);
        setTimeout(() => scrollToNode(scheme, location.nodeId), 10);
      },
    );
    this.debugSession = new DebugSessionStore(
      new TemporalDebugAdapter(projectId, { ensureDevBuilt: () => this.ensureDevBuilt() }),
    );
    this.debugSession.replaceBreakpoints(loadPersistedBreakpoints(projectId));
    this.persistBreakpointsDisposer = reaction(
      () => this.debugSession.breakpointList,
      (breakpoints) => persistBreakpoints(projectId, breakpoints),
    );
    // `onLocksChanged` is only ever invoked after this constructor returns (the store's first poll
    // is async), so it's safe for this callback to close over `this.sync` before it's assigned below.
    this.documentLocksStore = new DocumentLocksStore(projectId, () => this.sync.onLocksChanged());
    this.agentLocks = new AgentLockTracker({
      lock: (documentId, owner) => workflowApi.lockDocument(projectId, documentId, owner),
      onConflict: (documentId, lockExpiresAt) =>
        this.documentLocksStore.markLockedFromConflict(documentId, lockExpiresAt),
      owner: `agent:${generateUuid()}`,
      unlock: (documentId, owner) => workflowApi.unlockDocument(projectId, documentId, owner),
    });
    const lockHooks: IProjectSyncLockHooks = {
      isDocumentLocked: (documentId) => this.documentLocksStore.isLocked(documentId),
      onDocumentLockConflict: (documentId, lockExpiresAt) =>
        this.documentLocksStore.markLockedFromConflict(documentId, lockExpiresAt),
      getOwnLockOwner: (documentId) => this.agentLocks.ownerFor(documentId),
    };
    this.httpVersionStore = new HttpVersionStore(projectId);
    this.versionHistory = new VersionHistoryStore({
      store: this.httpVersionStore,
      // The simplest correct way to get every open tab/scheme back in sync with a restored working
      // copy — a restore already clears the undo stack "same as reopening the project" (docs/
      // decisions/0025-scheme-versioning.md, "When commits happen"), so a full reload costs nothing
      // extra it wasn't already going to invalidate.
      onRestored: () => {
        if ('window' in globalThis) location.reload();
      },
    });
    this.agentChat = new AgentChatSessionStore(new IndexedDbAgentSessionStore(projectId), {
      allowQuestionsStorageKey: `falang:agent-allow-questions:${projectId}`,
    });
    this.agentChat.loadSessions();
    this.agentSession = createWorkflowAgentSession({
      acquireLock: (documentId) => this.agentLocks.acquire(documentId),
      llmClient: new HttpLlmClient(projectId),
      onOpenDocument: (documentId) => this.followAgentDocument(documentId),
      onRunFinished: (session) => {
        this.agentLocks.releaseAll();
        eventTracker.track('agent_turn', { status: session.status });
        this.noteAgentTurnFinished();
      },
      store: this,
    });
    this.agentSettings.load();
    this.magicInsert = new MagicInsertSetting(authStore.currentUser?.id);
    this.magicRuns = createWorkflowMagicRunStore({
      createLlmClient: () => new HttpLlmClient(projectId),
      getAllowQuestions: () => this.agentChat.allowQuestions,
      onRunFinished: () => this.noteAgentTurnFinished(),
      store: this,
    });
    this.sync = new ProjectSync(
      projectId,
      lockHooks,
      (folders, documents) => {
        this.folders.replace(folders);
        this.documents.replace(documents);
        this.registerProjectStructTypes();
      },
      (documents) => {
        for (const doc of documents) {
          const existing = this.documents.find((d) => d.id === doc.id);
          if (existing) {
            existing.data = doc.root;
            existing.customData = doc.data;
          }
        }
        // The `integrations` document's instances (if any) are only known once this callback runs —
        // see ADR 0039 (private) §4/§5. `loadAll` never rejects (per-instance
        // errors are logged and swallowed), so this fire-and-forget chain is safe.
        this.loadVendorData();
      },
    );
    // Keep-alive bookkeeping: whenever the active tab is a scheme document, it becomes the most recent.
    this.keepAliveDisposer = reaction(
      () => this.activeSchemeDocumentId,
      (id) => {
        if (id) this.touchKeepAlive(id);
      },
      { fireImmediately: true },
    );
    // Restore/persist the open tabs and mirror the active one into the URL (`workspace-sync.ts`).
    this.workspaceSyncDisposer = startWorkspaceSync(this);
  }

  /** The active tab's id when it is a document with a scheme editor (not the pinned `integrations`, not a loading placeholder). */
  get activeSchemeDocumentId(): string | null {
    const id = this.activeTabId;
    if (!id) return null;
    const doc = this.getDocument(id);
    return doc && !doc.pinned ? id : null;
  }

  @action noteAgentTurnFinished(): void {
    this.agentTurnsFinished += 1;
  }

  @action private touchKeepAlive(id: string): void {
    this.keepAliveSchemeIds = touchKeepAlive(this.keepAliveSchemeIds, id);
  }

  hasDocument(documentId: string): boolean {
    return this.documents.some((d) => d.id === documentId);
  }

  /** Replaces the open tabs wholesale (restoring a remembered/URL state) — no scheme is built until a tab is shown. */
  @action restoreTabs(tabs: IProjectTabs): void {
    this.openTabIds = tabs.openTabIds;
    this.activeTabId = tabs.activeTabId;
    this.keepAliveSchemeIds = pruneKeepAlive(this.keepAliveSchemeIds, (id) => tabs.openTabIds.includes(id));
  }

  @action setActiveView(view: 'files' | 'tasks' | null): void {
    this.activeView = view;
  }

  get isLoadingTree(): boolean {
    return this.sync.isLoadingTree;
  }

  get isLoadingDocuments(): boolean {
    return this.sync.isLoadingDocuments;
  }

  get connectionError(): string | null {
    return this.sync.connectionError;
  }

  get buildStatus() {
    return this.sync.buildStatus;
  }

  get lastBuildResult() {
    return this.sync.lastBuildResult;
  }

  get buildErrors() {
    return this.sync.buildErrors;
  }

  get buildFiles() {
    return this.sync.buildFiles;
  }

  get isPublishing(): boolean {
    return this.sync.isPublishing;
  }

  get lastPublishedVersion() {
    return this.sync.lastPublishedVersion;
  }

  get prodRunning(): boolean {
    return this.sync.prodRunning;
  }

  get hasVersions(): boolean {
    return this.sync.hasVersions;
  }

  get isProdActionLoading(): boolean {
    return this.sync.isProdActionLoading;
  }

  /** The server-side action in flight (dev start/stop/restart, publish, prod start/stop) — drives the top loading bar. */
  get serverActivity(): TServerActivity | null {
    return resolveServerActivity({
      buildStatus: this.sync.buildStatus,
      isRestarting: this.sync.isRestarting,
      isPublishing: this.sync.isPublishing,
      isProdActionLoading: this.sync.isProdActionLoading,
      prodRunning: this.sync.prodRunning,
    });
  }

  buildProject(): Promise<void> {
    return this.sync.buildProject();
  }

  /** Whether the dev build (if any) still reflects the documents — see `ProjectSync.changedSinceBuild`. */
  get changedSinceBuild(): boolean {
    return this.sync.changedSinceBuild;
  }

  /**
   * The "Run" button's precondition (ADR 0022 (private)): a dev runner up and running code that
   * matches the current documents. Rebuilds when the runner is down or anything changed since the
   * last build (`buildProject` flushes pending saves first and terminates the dev stand's open
   * executions, so the new run is the only thing it runs). Resolves `false` on a failed build — the
   * compile errors are already in `buildErrors` for the toolbar to show.
   */
  async ensureDevBuilt(): Promise<boolean> {
    if (this.buildStatus === 'running' && !this.sync.changedSinceBuild) return true;
    await this.sync.buildProject();
    return this.buildStatus === 'running';
  }

  stopProject(): Promise<void> {
    return this.sync.stopProject();
  }

  restartProject(): Promise<void> {
    return this.sync.restartProject();
  }

  publishProject(): Promise<void> {
    return this.sync.publishProject();
  }

  startProdRunner(): Promise<void> {
    return this.sync.startProdRunner();
  }

  stopProdRunner(): Promise<void> {
    return this.sync.stopProdRunner();
  }

  /** The id of the section folder (Triggers/Functions/Types) accepting `type`, or `null` (e.g. before the tree has loaded). */
  getSectionFolderId(type: string): string | null {
    const kind = sectionForDocumentType(type);
    return kind === null ? null : (findSectionFolder(kind, this.folders)?.id ?? null);
  }

  @action createFolder(name: string, parentId: string | null = null): string {
    const id = generateUuid();
    const reason = checkFolderPlacement(id, parentId, this.folders);
    if (reason) throw new Error(reason);
    const folder: WorkflowFolder = { id, name, parentId };
    this.folders.push(folder);
    this.sync.createFolderRemote(folder);
    return id;
  }

  @action deleteFolder(id: string): void {
    if (isFixedFolder(this.folders.find((f) => f.id === id))) return;
    const allIds = new Set([id, ...this.getFolderDescendantIds(id)]);
    const docsToDelete = this.documents.filter((d) => d.folderId !== null && allIds.has(d.folderId));
    for (const doc of docsToDelete) {
      this.closeTab(doc.id);
    }
    this.documents.replace(this.documents.filter((d) => d.folderId === null || !allIds.has(d.folderId)));
    this.folders.replace(this.folders.filter((f) => !allIds.has(f.id)));
    // The backend cascades subfolders/documents on delete — only the folder itself needs a call.
    this.sync.deleteFolderRemote(id);
  }

  /** Whether another document (any type) of this project already holds `name` — case-insensitive. */
  hasDocumentName(name: string, exceptId: string | null = null): boolean {
    return Boolean(findDocumentNameConflict(this.documents, name, exceptId));
  }

  @action createDocument(type: DocumentType, name: string, folderId: string | null = null): string {
    if (this.hasDocumentName(name)) throw new Error(`A document named "${name}" already exists`);
    const id = generateUuid();
    const doc: WorkflowDocument = { id, name, type, folderId: folderId ?? this.getSectionFolderId(type) };
    this.documents.push(doc);
    this.sync.createDocumentRemote(doc);
    this.openTab(id);
    return id;
  }

  @action createTriggerFunctionDocument(
    name: string,
    bodyData: TTriggerFunctionBodyData,
    folderId: string | null = null,
  ): string {
    if (this.hasDocumentName(name)) throw new Error(`A document named "${name}" already exists`);
    const doc = buildTriggerFunctionDocument(
      name,
      bodyData,
      folderId ?? this.getSectionFolderId(TRIGGER_FUNCTION_NAME),
    );
    this.documents.push(doc);
    this.sync.createDocumentRemote(doc);
    this.openTab(doc.id);
    return doc.id;
  }

  /**
   * Renames a document locally and on the backend. Refused (no-op, `false`) for a pinned document, an
   * unknown id, an unchanged name, or one that is taken by another document (case-insensitive); the
   * caller validates first to show the reason.
   */
  @action renameDocument(id: string, name: string): boolean {
    const doc = this.documents.find((d) => d.id === id);
    const trimmed = name.trim();
    if (!doc || doc.pinned || !trimmed || trimmed === doc.name) return false;
    if (this.hasDocumentName(trimmed, id)) return false;
    doc.name = trimmed;
    this.sync.updateDocumentRemote(id, { name: trimmed });
    return true;
  }

  /** Renames a user folder; section folders (and an unchanged/empty name) are refused with `false`. */
  @action renameFolder(id: string, name: string): boolean {
    const folder = this.folders.find((f) => f.id === id);
    const trimmed = name.trim();
    if (!folder || isFixedFolder(folder) || !trimmed || trimmed === folder.name) return false;
    folder.name = trimmed;
    this.sync.updateFolderRemote(id, { name: trimmed });
    return true;
  }

  @action deleteDocument(id: string): void {
    const deleted = this.getDocument(id);
    if (deleted?.type === OBJECTS_STRUCTURE_NAME && deleted.data) {
      this.typesRegistry.updateTypesByParent(deleted.data.id, []);
    }
    this.closeTab(id);
    this.documents.replace(this.documents.filter((d) => d.id !== id));
    this.sync.deleteDocumentRemote(id);
  }

  @action moveDocument(docId: string, folderId: string | null): void {
    const doc = this.documents.find((d) => d.id === docId);
    if (!doc || doc.pinned) return;
    if (checkDocumentPlacement(doc.type, folderId, this.folders) !== null) return;
    doc.folderId = folderId;
    this.sync.updateDocumentRemote(docId, { folderId });
  }

  @action moveFolder(folderId: string, newParentId: string | null): void {
    const folder = this.folders.find((f) => f.id === folderId);
    if (!folder || isFixedFolder(folder)) return;
    if (checkFolderPlacement(folderId, newParentId, this.folders) !== null) return;
    folder.parentId = newParentId;
    this.sync.updateFolderRemote(folderId, { parentId: newParentId });
  }

  @action openTab(id: string): void {
    this.activeView = null;
    if (!this.openTabIds.includes(id)) {
      this.openTabIds = [...this.openTabIds, id];
    }
    this.activeTabId = id;
    this.selectedNodeId = null;
    this.selectedDocId = null;
  }

  /** The toolbar's "Files" button — clicking it while already open closes it back to whichever document tab was active. */
  @action toggleFilesView(): void {
    this.activeView = this.activeView === 'files' ? null : 'files';
  }

  /** The toolbar's "Tasks" button — same toggle-back-to-document shape as `toggleFilesView` above. */
  @action toggleTasksView(): void {
    this.activeView = this.activeView === 'tasks' ? null : 'tasks';
  }

  @action closeTab(id: string): void {
    this.openTabIds = this.openTabIds.filter((t) => t !== id);
    this.keepAliveSchemeIds = this.keepAliveSchemeIds.filter((item) => item !== id);
    if (this.activeTabId === id) {
      this.activeTabId = this.openTabIds.at(-1) ?? null;
    }
    if (this.selectedDocId === id) {
      this.selectedNodeId = null;
      this.selectedDocId = null;
    }
    const scheme = this.schemes.get(id);
    if (scheme) {
      scheme.dispose();
      this.schemes.delete(id);
    }
  }

  @action selectNode(docId: string, nodeId: string): void {
    this.selectedDocId = docId;
    this.selectedNodeId = nodeId;
  }

  /**
   * Opens (or activates) a document's tab and, if given a specific node, selects it and pans the
   * canvas to it — for the editor's "jump to node" affordance on a compile error (see
   * `IApiCompileError.nodeId`). A freshly-opened tab's `Scheme` hasn't laid out its icons yet on the
   * very first render, so `focusNode` runs a tick later, the same way `getScheme` already delays
   * `setSchemeStartPosition`.
   */
  jumpToNode(docId: string, nodeId?: string): void {
    this.openTab(docId);
    if (!nodeId) return;
    this.selectNode(docId, nodeId);
    const scheme = this.getScheme(docId);
    setTimeout(() => focusNode(scheme, nodeId), 10);
  }

  /**
   * The agent's cue, fired before every core (node) tool call targets `documentId` (ADR 0036, "Opening
   * a document the agent touches" amendment) — "ensure open": if `documentId` has no tab yet, opens one
   * and makes it active (reusing `openTab` exactly as the human "+" flow does, so the same `SchemeView`
   * mount/re-render machinery shows every subsequent edit live); if it already has a tab, does nothing —
   * never steals the user's active tab away from a document they're already looking at mid-run.
   */
  @action followAgentDocument(documentId: string): void {
    if (shouldOpenAgentDocumentTab(this.openTabIds, documentId)) this.openTab(documentId);
  }

  @action clearSelection(): void {
    this.selectedNodeId = null;
    this.selectedDocId = null;
  }

  getFolderDescendantIds(folderId: string): string[] {
    const direct = this.folders.filter((f) => f.parentId === folderId).map((f) => f.id);
    const result: string[] = [...direct];
    for (const childId of direct) {
      result.push(...this.getFolderDescendantIds(childId));
    }
    return result;
  }

  getDocument(id: string): WorkflowDocument | undefined {
    return this.documents.find((d) => d.id === id);
  }

  get integrationsDocument(): WorkflowDocument | undefined {
    return findIntegrationsDocument(this.documents);
  }

  @action saveIntegrationInstance(instance: IIntegrationInstance): void {
    saveIntegrationInstanceAction(this.documents, this.sync, instance);
    // A create/rename/vendor-field edit can change what `instanceTypes` derives (e.g. a struct name
    // keyed off `instance.name`) even with no new vendor data fetched — see ADR 0039 (private) §5.
    this.registerVendorDataTypes();
  }

  /** Forces the debounced `integrations` document save to happen immediately — see `ProjectSync.flushSaveCustomDocument`. */
  async flushIntegrationsSave(): Promise<void> {
    const doc = this.integrationsDocument;
    if (doc) await this.sync.flushSaveCustomDocument(doc);
  }

  /** Re-fetches the `integrations` document from the backend — needed after an OAuth2 "Connect"
   * completes, since the callback writes tokens directly into storage, bypassing this client
   * entirely (see ADR 0015 (private)). */
  async refreshIntegrationsDocument(): Promise<void> {
    const doc = this.integrationsDocument;
    if (!doc) return;
    const projectDocuments = await workflowApi.getProjectDocuments(this.projectId);
    const fresh = projectDocuments.find((candidate) => candidate.id === doc.id);
    if (fresh) {
      runInAction(() => {
        doc.customData = fresh.data;
      });
    }
  }

  @action deleteIntegrationInstance(id: string): void {
    deleteIntegrationInstanceAction(this.documents, this.sync, id);
    this.registerVendorDataTypes();
  }

  /**
   * Re-runs "Sync structure" for one instance, then re-registers its derived struct types — the
   * `IntegrationsEditor` button's action. Left as a plain re-throwing wrapper so the editor's own
   * `message.error` handling stays in one place.
   */
  async syncIntegrationSchema(instanceId: string): Promise<void> {
    await this.vendorData.sync(this.projectId, instanceId);
    this.registerVendorDataTypes();
  }

  /** Whether `getScheme(docId)` would return an already-built scheme (no side effects, unlike `getScheme` itself). */
  hasScheme(docId: string): boolean {
    return this.schemes.has(docId);
  }

  getScheme(docId: string): Scheme {
    const existing = this.schemes.get(docId);
    if (existing) return existing;
    const doc = this.getDocument(docId);
    if (!doc) throw new Error(`Document ${docId} not found`);
    if (doc.pinned) throw new Error(`Document ${docId} is pinned and has no scheme editor`);
    const scheme = this.buildScheme(doc);
    this.schemes.set(docId, scheme);
    setTimeout(() => {
      setSchemeStartPosition(scheme);
    }, 10);
    return scheme;
  }

  /**
   * The toolbar's "Debug" button: starts a session on `functionName` (`ProjectSync.buildProject`'s
   * dev build is always debug-instrumented, see ADR 0021 (private) §5, so no separate build step is
   * needed the way `debugFunction`'s own adapter still requires via `ensureDevBuilt`). Pauses on
   * entry only when the user hasn't set any breakpoints yet — otherwise a first click would run to
   * completion with nothing to show, which defeats the point of clicking "Debug" at all.
   */
  debugFunction(
    functionName: string,
    args: readonly unknown[],
    triggerPayload?: Record<string, unknown>,
  ): Promise<void> {
    const params: IDebugSessionStartParams = {
      pauseOnEntry: this.debugSession.breakpointList.length === 0,
      entry: { functionName, args, ...(triggerPayload ? { triggerPayload } : {}) },
    };
    return this.debugSession.start(params);
  }

  /** The toolbar's "Agent"/"History" buttons (ADR 0036 (private) §3): clicking the already-open panel
   *  closes it, clicking the other one switches to it. Opening `'history'` refreshes `versionHistory`,
   *  same as the old `toggleHistoryPanel` did. */
  @action toggleRightPanel(panel: 'agent' | 'history'): void {
    this.rightPanel = this.rightPanel === panel ? null : panel;
    if (this.rightPanel === 'history') this.versionHistory.refresh();
  }

  @action openDiffModal(): void {
    this.diffModalOpen = true;
  }

  @action closeDiffModal(): void {
    this.diffModalOpen = false;
  }

  /**
   * The project-level agent panel's "active document" (ADR 0036 (private) §5 / "no home document"
   * amendment): the active tab's id, if it's an agent-editable document (`isAgentEditableType`), else
   * `null` — a `null` result is perfectly normal (an empty project, or the pinned `integrations`
   * document, is still workable) and never disables Send.
   * Reads `activeTabId` fresh on every call (an observable), so an `observer` component re-evaluates it
   * on every tab switch without needing a MobX `@computed`.
   */
  getAgentActiveDocumentId(): string | null {
    const id = this.activeTabId;
    if (!id) return null;
    const doc = this.getDocument(id);
    if (!doc || doc.pinned || !isAgentEditableType(doc.type)) return null;
    return id;
  }

  /** The active document's `HistoryStore`, for the agent panel's Undo/Redo (ADR 0036 (private) §3) —
   *  `null` when no tab is active or its scheme hasn't been built yet (never forces one to be built
   *  just to answer this). Every agent-capable document already registers `HistoryModule` (see
   *  `buildScheme`), so a built scheme's container always resolves `TOKEN_HISTORY` when it's one of
   *  those — the `try`/`catch` only guards a scheme with no `HistoryModule` at all. */
  getActiveHistory(): HistoryStore | null {
    const id = this.activeTabId;
    if (!id || !this.hasScheme(id)) return null;
    try {
      return resolveService(TOKEN_HISTORY, this.getScheme(id).container);
    } catch {
      return null;
    }
  }

  /**
   * A read-only scheme for one side of the split diff view (ADR 0025 (private))
   * — an arrow-function field (not a prototype method) so `ProjectWorkspace` can pass it straight to
   * `VersionDiffView`'s `buildReadOnlyScheme` prop without losing its `this` binding. The bulk of the
   * logic lives in `versioning/build-read-only-scheme-for-diff.ts` to keep this file's size down.
   */
  buildReadOnlySchemeForDiff = (
    document: ISnapshotDocument,
    diff: INodeTreeDiff,
    side: TVersionDiffSide,
  ): Scheme | null =>
    buildReadOnlySchemeForDiffImpl({
      document,
      diff,
      side,
      projectId: this.projectId,
      container: this.container,
      theme: darkTheme,
      getCredentialInstances: () => getIntegrationInstances(this.documents),
    });

  /** The main scheme of a function/trigger-function document for a magic run, `null` for anything else. */
  private getMagicHostScheme(documentId: string): Scheme | null {
    return getMagicHostScheme(this, documentId);
  }

  /** A transient popup scheme for one magic node (`MagicEditorModal`); the caller disposes it. */
  buildMagicPopup(
    documentId: string,
    nodeId: string,
    onHeaderSpellCommitted: (prev: string, next: string) => void,
  ): IMagicPopup | null {
    const mainScheme = this.getMagicHostScheme(documentId);
    if (!mainScheme) return null;
    return buildMagicPopup({
      container: this.container,
      getCredentialInstances: () => getIntegrationInstances(this.documents),
      mainScheme,
      nodeId,
      onHeaderSpellCommitted,
      projectId: this.projectId,
      theme: darkTheme,
    });
  }

  /** The toolbar's "PDF" button: opens the selection modal (a fresh `PrintExportStore` each time). */
  @action openPrintExport(): void {
    this.printExport?.dispose();
    this.printExport = new PrintExportStore(
      createPrintExportHost({
        projectId: this.projectId,
        projectName: () => navigationStore.selectedProjectName ?? 'project',
        container: this.container,
        folders: () => this.folders,
        documents: () => this.documents,
        activeTabId: () => this.activeTabId,
        getLiveScheme: (id) => this.schemes.get(id),
        getCredentialInstances: () => getIntegrationInstances(this.documents),
      }),
    );
  }

  @action closePrintExport(): void {
    this.printExport?.dispose();
    this.printExport = null;
  }

  dispose(): void {
    this.workspaceSyncDisposer();
    this.keepAliveDisposer();
    this.printExport?.dispose();
    this.magicRuns.dispose();
    this.agentSettings.dispose();
    this.followRunDisposer();
    this.persistBreakpointsDisposer();
    this.liveRun.dispose();
    this.debugSession.dispose();
    this.documentLocksStore.dispose();
    this.scheduleStatus.dispose();
    this.tasks.dispose();
    this.vendorData.dispose();
    this.agentSession.cancel();
    for (const scheme of this.schemes.values()) scheme.dispose();
    this.schemes.clear();
  }

  private buildScheme(doc: WorkflowDocument): Scheme {
    const isFunctionDoc = doc.type === 'function' || doc.type === TRIGGER_FUNCTION_NAME;
    const scheme = buildWorkflowDocumentScheme({
      doc,
      parentContainer: this.container,
      // Every scheme follows the same project-level `liveRun` — a run's location names the document
      // it's in, and the module only highlights when that's this scheme (see `ExecutionPositionModule`).
      // `DebuggerModule` shares the same `debugSession` across every scheme the same way, per
      // ADR 0021 (private) §3.
      extraModules: [
        new ExecutionPositionModule(this.liveRun),
        new DebuggerModule({ session: this.debugSession, documentId: doc.id }),
      ],
      theme: darkTheme,
      getCredentialInstances: () => getIntegrationInstances(this.documents),
      getFieldOptionsProvider: () => createFieldOptionsProvider(this.projectId),
      getActivepiecesCatalogProvider: () => createActivepiecesCatalogProvider(),
      getActivepiecesFieldOptionsProvider: () => createActivepiecesFieldOptionsProvider(this.projectId),
      defaultInsertNodeName: () => (this.agentSettings.configured && this.magicInsert.enabled ? MAGIC_NAME : 'action'),
      onSchemeCreated: (created) => {
        if (isFunctionDoc) this.magicRuns.registerHost(doc.id, created);
      },
    });
    subscribeWorkflowDocumentSync(doc, scheme, this.typesRegistry, () => this.sync.scheduleSaveDocument(doc));
    return scheme;
  }

  /** The project-level `TypesRegistryStore` every scheme's struct pickers/Monaco hidden scope read from. */
  get typesRegistry(): TypesRegistryStore {
    return resolveService(TOKEN_TYPESCRIPT_PROJECT_SERVICE, this.container).typesRegistry;
  }

  /** Registers every loaded `objects-structure` document's interfaces up front. Before 2026-09-27 they only
   *  reached the registry from `schemeOnChanged`, i.e. after that document was opened *and edited* in this
   *  tab — so after a page reload a function referencing a project interface saw it as unknown. */
  private registerProjectStructTypes(): void {
    for (const doc of this.documents) {
      if (doc.type === OBJECTS_STRUCTURE_NAME && doc.data) updateTypesRegistryFromINode(doc.data, this.typesRegistry);
    }
  }

  /** Fetches every vendor-data-capable instance's stored data (see `VendorDataStore.loadAll`), then
   *  registers the resulting struct types — the initial-load half of ADR 0039 (private) §4/§5. */
  private loadVendorData(): void {
    const instances = getIntegrationInstances(this.documents);
    this.vendorData
      .loadAll(this.projectId, REGISTERED_INTEGRATIONS, instances)
      .then(() => this.registerVendorDataTypes())
      .catch((error: unknown) => {
        // oxlint-disable-next-line no-console
        console.error('WorkflowStore: failed to load vendor data', error);
      });
  }

  /** Re-derives every configured instance's struct types from `vendorData`'s current contents into the
   *  project's `TypesRegistryStore` — see `VendorDataStore.registerInstanceTypes`. Called after the
   *  initial load, after every `integrations` document change, and after a "Sync structure" call. */
  private registerVendorDataTypes(): void {
    this.vendorData.registerInstanceTypes(
      this.typesRegistry,
      REGISTERED_INTEGRATIONS,
      getIntegrationInstances(this.documents),
    );
  }

  /** `ScheduleStatusStore`'s "is it even worth polling" gate — see ADR 0037 (private) §7. */
  private hasScheduleTrigger(): boolean {
    return this.documents.some((doc) => getTriggerFunctionBodyData(doc)?.vendor === SCHEDULE_VENDOR);
  }
}
