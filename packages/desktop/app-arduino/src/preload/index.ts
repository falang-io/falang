import { contextBridge, ipcRenderer } from 'electron';
import type {
  IDocumentLock,
  IGitVersioningOptions,
  IProjectChangeEvent,
  IProjectManifest,
  IProjectTree,
} from '@falang/desktop-project-fs';
import type { IProjectDocument, IProjectTreeFolder } from '@falang/dto';
import type { IArduinoCliStatus, IConnectedBoard } from '@falang/desktop-arduino-cli';
import type { IDebugBreakpoint, TDebugEvent, TDebugResumeMode } from '@falang/debug';
import type { IAgentSettings, IChatResult, IChatToolDefinition, TChatMessage } from '@falang/desktop-llm-client';
import type { IChatSession, IChatSessionSummary, IChatTurn } from '@falang/agent';
import type { ICommitInfo, IProjectSnapshot, TCommitKind } from '@falang/versioning';
import { IPC } from '../shared/ipc-channels.js';
import type { IRecentProject } from '../shared/recent-project.js';
import type { TArduinoBuildOutcome } from '../shared/arduino-build-outcome.js';
import type { TArduinoDebugUploadOutcome } from '../shared/arduino-debug-outcome.js';
import type { IStartDebugSessionParams } from '../shared/start-debug-session-params.js';
import type { IDriverConfig } from '../shared/driver-config.js';
import type { ICreateArduinoProjectParams } from '../shared/create-arduino-project-params.js';
import type { INewProjectLocationSuggestion } from '../shared/new-project-location.js';
import type { IArduinoProjectConfig } from '../shared/board.js';

const subscribe =
  (channel: string) =>
  (listener: (...args: unknown[]) => void): (() => void) => {
    const wrapped = (_event: unknown, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => ipcRenderer.off(channel, wrapped);
  };

const falangApi = {
  dialog: {
    openProjectFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.dialogOpenProjectFolder),
    newProjectFolder: (defaultPath?: string): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialogNewProjectFolder, defaultPath),
  },
  project: {
    create: (dir: string, params: ICreateArduinoProjectParams): Promise<IProjectManifest> =>
      ipcRenderer.invoke(IPC.projectCreate, dir, params),
    open: (dir: string): Promise<IProjectManifest> => ipcRenderer.invoke(IPC.projectOpen, dir),
    listTree: (dir: string): Promise<IProjectTree> => ipcRenderer.invoke(IPC.projectListTree, dir),
    suggestNewLocation: (): Promise<INewProjectLocationSuggestion> => ipcRenderer.invoke(IPC.projectSuggestNewLocation),
    // `ensureArduinoProjectDocuments` re-run after a version restore — see that function's own doc
    // comment (`main/ensure-project-documents.ts`) and `ArduinoProjectStore.reloadAfterRestore`.
    ensureDocuments: (dir: string): Promise<void> => ipcRenderer.invoke(IPC.projectEnsureDocuments, dir),
    onChanged: subscribe(IPC.projectChanged) as (listener: (event: IProjectChangeEvent) => void) => () => void,
  },
  locks: {
    read: (dir: string): Promise<IDocumentLock[]> => ipcRenderer.invoke(IPC.locksRead, dir),
  },
  document: {
    read: (dir: string, documentId: string): Promise<IProjectDocument> =>
      ipcRenderer.invoke(IPC.documentRead, dir, documentId),
    write: (dir: string, document: IProjectDocument): Promise<void> =>
      ipcRenderer.invoke(IPC.documentWrite, dir, document),
    create: (dir: string, params: { document: IProjectDocument; folderId: string | null }): Promise<void> =>
      ipcRenderer.invoke(IPC.documentCreate, dir, params),
    delete: (dir: string, documentId: string): Promise<void> => ipcRenderer.invoke(IPC.documentDelete, dir, documentId),
    rename: (dir: string, documentId: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.documentRename, dir, documentId, name),
    move: (dir: string, documentId: string, folderId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.documentMove, dir, documentId, folderId),
  },
  folder: {
    create: (dir: string, params: { name: string; parentId: string | null }): Promise<IProjectTreeFolder> =>
      ipcRenderer.invoke(IPC.folderCreate, dir, params),
    rename: (dir: string, folderId: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.folderRename, dir, folderId, name),
    move: (dir: string, folderId: string, parentId: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.folderMove, dir, folderId, parentId),
    delete: (dir: string, folderId: string): Promise<void> => ipcRenderer.invoke(IPC.folderDelete, dir, folderId),
  },
  recentProjects: {
    list: (): Promise<IRecentProject[]> => ipcRenderer.invoke(IPC.recentProjectsList),
    add: (projectPath: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.recentProjectsAdd, projectPath, name),
  },
  arduino: {
    checkCli: (): Promise<IArduinoCliStatus> => ipcRenderer.invoke(IPC.arduinoCheckCli),
    getProjectConfig: (dir: string): Promise<IArduinoProjectConfig | null> =>
      ipcRenderer.invoke(IPC.arduinoGetProjectConfig, dir),
    listBoards: (): Promise<readonly IConnectedBoard[]> => ipcRenderer.invoke(IPC.arduinoListBoards),
    compile: (dir: string, documents: IProjectDocument[], fqbn: string): Promise<TArduinoBuildOutcome> =>
      ipcRenderer.invoke(IPC.arduinoCompile, dir, documents, fqbn),
    upload: (dir: string, documents: IProjectDocument[], fqbn: string, port: string): Promise<TArduinoBuildOutcome> =>
      ipcRenderer.invoke(IPC.arduinoUpload, dir, documents, fqbn, port),
    uploadDebug: (
      dir: string,
      documents: IProjectDocument[],
      fqbn: string,
      port: string,
    ): Promise<TArduinoDebugUploadOutcome> => ipcRenderer.invoke(IPC.arduinoUploadDebug, dir, documents, fqbn, port),
  },
  debug: {
    start: (params: IStartDebugSessionParams): Promise<void> => ipcRenderer.invoke(IPC.debugStart, params),
    setBreakpoints: (breakpoints: IDebugBreakpoint[]): Promise<void> =>
      ipcRenderer.invoke(IPC.debugSetBreakpoints, breakpoints),
    resume: (mode: TDebugResumeMode): Promise<void> => ipcRenderer.invoke(IPC.debugResume, mode),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.debugStop),
    onEvent: subscribe(IPC.debugEvent) as (listener: (event: TDebugEvent) => void) => () => void,
    readBreakpoints: (dir: string): Promise<IDebugBreakpoint[] | null> =>
      ipcRenderer.invoke(IPC.debugBreakpointsRead, dir),
    writeBreakpoints: (dir: string, breakpoints: IDebugBreakpoint[]): Promise<void> =>
      ipcRenderer.invoke(IPC.debugBreakpointsWrite, dir, breakpoints),
  },
  drivers: {
    list: (): Promise<readonly IDriverConfig[]> => ipcRenderer.invoke(IPC.driversList),
  },
  settings: {
    getLanguage: (): Promise<string | null> => ipcRenderer.invoke(IPC.settingsGetLanguage),
    setLanguage: (language: string): Promise<void> => ipcRenderer.invoke(IPC.settingsSetLanguage, language),
    getAgentSettings: (): Promise<IAgentSettings | null> => ipcRenderer.invoke(IPC.settingsGetAgent),
    setAgentSettings: (settings: IAgentSettings): Promise<void> => ipcRenderer.invoke(IPC.settingsSetAgent, settings),
    getVersioningSettings: (): Promise<IGitVersioningOptions> => ipcRenderer.invoke(IPC.settingsGetVersioning),
    setVersioningSettings: (settings: IGitVersioningOptions): Promise<void> =>
      ipcRenderer.invoke(IPC.settingsSetVersioning, settings),
  },
  agent: {
    chat: (
      requestId: string,
      params: { system: string; messages: readonly TChatMessage[]; tools: readonly IChatToolDefinition[] },
    ): Promise<IChatResult> => ipcRenderer.invoke(IPC.agentChat, requestId, params),
    cancelChat: (requestId: string): Promise<void> => ipcRenderer.invoke(IPC.agentChatCancel, requestId),
  },
  // `IAgentSessionStore` over IPC, one method per `@falang/agent` interface method — see
  // ADR 0033 (private) and `renderer/src/agent/electron-agent-session-store.ts`,
  // which wraps this 1:1.
  agentSessions: {
    list: (dir: string): Promise<IChatSessionSummary[]> => ipcRenderer.invoke(IPC.agentSessionsList, dir),
    create: (dir: string, title?: string): Promise<IChatSession> =>
      ipcRenderer.invoke(IPC.agentSessionsCreate, dir, title),
    get: (dir: string, id: string): Promise<IChatSession | null> => ipcRenderer.invoke(IPC.agentSessionsGet, dir, id),
    rename: (dir: string, id: string, title: string): Promise<void> =>
      ipcRenderer.invoke(IPC.agentSessionsRename, dir, id, title),
    delete: (dir: string, id: string): Promise<void> => ipcRenderer.invoke(IPC.agentSessionsDelete, dir, id),
    appendTurn: (dir: string, sessionId: string, turn: IChatTurn): Promise<void> =>
      ipcRenderer.invoke(IPC.agentSessionsAppendTurn, dir, sessionId, turn),
  },
  // `IVersionStore` over IPC, one method per `@falang/versioning` interface method — see
  // ADR 0025 (private) (package E2) and `renderer/src/versioning/
  // electron-version-store.ts`, which wraps this 1:1.
  versioning: {
    listCommits: (dir: string): Promise<ICommitInfo[]> => ipcRenderer.invoke(IPC.versioningListCommits, dir),
    getSnapshot: (dir: string, commitId: string): Promise<IProjectSnapshot> =>
      ipcRenderer.invoke(IPC.versioningGetSnapshot, dir, commitId),
    getWorkingCopy: (dir: string): Promise<IProjectSnapshot> => ipcRenderer.invoke(IPC.versioningGetWorkingCopy, dir),
    commit: (dir: string, params: { kind: TCommitKind; message: string }): Promise<ICommitInfo | null> =>
      ipcRenderer.invoke(IPC.versioningCommit, dir, params),
    nameCommit: (dir: string, commitId: string, message: string): Promise<ICommitInfo> =>
      ipcRenderer.invoke(IPC.versioningNameCommit, dir, commitId, message),
    restore: (dir: string, commitId: string): Promise<ICommitInfo> =>
      ipcRenderer.invoke(IPC.versioningRestore, dir, commitId),
  },
  print: {
    // Native save dialog + `webContents.printToPDF` in `main` (ADR 0048 (private)).
    toPdf: (params: { suggestedFileName: string }): Promise<{ canceled: true } | { path: string }> =>
      ipcRenderer.invoke(IPC.printToPdf, params),
  },
  menu: {
    onNewProject: subscribe(IPC.menuNewProject),
    onOpenProject: subscribe(IPC.menuOpenProject) as (listener: (recentPath?: string) => void) => () => void,
    onSaveDocument: subscribe(IPC.menuSaveDocument),
    onOpenBuildPanel: subscribe(IPC.menuOpenBuildPanel),
    onOpenSettings: subscribe(IPC.menuOpenSettings),
    onOpenVersioningSettings: subscribe(IPC.menuOpenVersioningSettings),
    onOpenLanguageSettings: subscribe(IPC.menuOpenLanguageSettings),
    onToggleVersionHistory: subscribe(IPC.menuToggleVersionHistory),
    onToggleAgent: subscribe(IPC.menuToggleAgent),
    onExportPdf: subscribe(IPC.menuExportPdf),
  },
  app: {
    // `main`'s graceful-close flow (see `main/index.ts`) — the window's `close` event is intercepted
    // once, this fires, and `flushBeforeCloseComplete` must be called (even with nothing pending) for
    // the window to actually close.
    onFlushBeforeClose: subscribe(IPC.appFlushBeforeClose),
    flushBeforeCloseComplete: (): void => ipcRenderer.send(IPC.appFlushBeforeCloseComplete),
  },
};

export type FalangApi = typeof falangApi;

contextBridge.exposeInMainWorld('falang', falangApi);
