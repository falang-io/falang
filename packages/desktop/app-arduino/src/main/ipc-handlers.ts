// oxlint-disable max-lines -- grew past 300 lines with ADR 0032 (private)'s new-project-location/
// board handlers on top of the existing project/document/versioning/agent/debug/driver surface; a
// single `registerIpcHandlers` stays the simplest place to keep every `ipcMain.handle` call visible
// together, same posture `@falang/desktop-app-arduino`'s `arduino-project-store.ts` already takes.
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { app, dialog, ipcMain, type BrowserWindow } from 'electron';
import {
  appendTurn as appendAgentSessionTurn,
  createDocument,
  createFolder,
  createProject,
  createSession as createAgentSession,
  deleteDocument,
  deleteFolder,
  deleteSession as deleteAgentSession,
  getSession as getAgentSession,
  listSessions as listAgentSessions,
  listTree,
  moveDocument,
  moveFolder,
  openProject,
  readDocument,
  readLocks,
  readSidecar,
  renameDocument,
  renameFolder,
  renameSession as renameAgentSession,
  writeAgentFiles,
  writeDocument,
  writeSidecar,
  type IDocumentLock,
  type IProjectManifest,
} from '@falang/desktop-project-fs';
import type { IChatSession, IChatSessionSummary, IChatTurn } from '@falang/agent';
import type { IProjectDocument } from '@falang/dto';
import type { IDebugBreakpoint, TDebugResumeMode } from '@falang/debug';
import type { IAgentSettings, IChatResult, IChatToolDefinition, TChatMessage } from '@falang/desktop-llm-client';
import type { IGitVersioningOptions } from '@falang/desktop-project-fs';
import type { ICommitInfo, IProjectSnapshot, TCommitKind } from '@falang/versioning';
import type { IStartDebugSessionParams } from '../shared/start-debug-session-params.js';
import { IPC } from '../shared/ipc-channels.js';
import type { IDriverConfig } from '../shared/driver-config.js';
import type { ICreateArduinoProjectParams } from '../shared/create-arduino-project-params.js';
import type { INewProjectLocationSuggestion } from '../shared/new-project-location.js';
import { DEFAULT_BOARD_FQBN, type IArduinoProjectConfig } from '../shared/board.js';
import { readArduinoProjectConfig, writeArduinoProjectConfig } from './arduino-project-config.js';
import { ensureArduinoProjectDocuments } from './ensure-project-documents.js';
import { addRecentProject, listRecentProjects } from './recent-projects.js';
import { cancelAgentChat, runAgentChat } from './agent-chat-handler.js';
import {
  getAgentSettings,
  getLanguage,
  getVersioningSettings,
  setAgentSettings,
  setLanguage,
  setVersioningSettings,
} from './settings.js';
import { getVersionStore, withAutoVersion } from './versioning.js';
import { markOwnDocumentWrite, startProjectWatcher } from './project-watcher-state.js';
import { resolveMcpServerCommand } from './mcp-server-path.js';
import { reportError } from '../shared/report-error.js';
import {
  buildAndCompileSketch,
  buildAndUploadDebugSketch,
  buildAndUploadSketch,
  checkArduinoCli,
  listBoards,
} from './arduino-build.js';
import {
  resumeDebugSession,
  setDebugBreakpoints,
  startDebugSession,
  stopDebugSession,
} from './debug-session-registry.js';
import type { IDriverRegistry } from './drivers/driver-registry.js';

/** `.falang-debug.json` next to `falang.json` — session-store level, host-saved (ADR 0021 (private) §3): breakpoints aren't part of the program when writing it, so they don't belong in a node's `meta` or in the exported project format. */
const DEBUG_BREAKPOINTS_SIDECAR_NAME = '.falang-debug';

/** Only-if-absent, so it's safe to call on every project create/open (see `writeAgentFiles`'s own doc comment) — failures are reported, not thrown, since a project must still open/create successfully even if `.mcp.json`/`CLAUDE.md` couldn't be written (e.g. a read-only folder). */
const writeAgentFilesBestEffort = (dir: string, projectType: string): void => {
  const { command, args } = resolveMcpServerCommand();
  writeAgentFiles(dir, { mcpServerCommand: command, mcpServerArgs: args, projectType }).catch((error: unknown) =>
    reportError('Failed to write .mcp.json/CLAUDE.md', error),
  );
};

export const registerIpcHandlers = (
  getMainWindow: () => BrowserWindow | null,
  // Rebuilds the native `Menu` — named generically since it's triggered both by the recent-projects
  // list changing (its original purpose) and, since the "Settings → Language…" menu item was added,
  // by a language change (the menu's own labels are translated, see `menu-labels.ts`).
  rebuildMenu: () => void,
  driverRegistry: IDriverRegistry,
): void => {
  ipcMain.handle(IPC.printToPdf, async (event, params: { suggestedFileName: string }) => {
    const window = getMainWindow();
    if (!window) return { canceled: true };
    const save = await dialog.showSaveDialog(window, {
      defaultPath: path.join(app.getPath('documents'), params.suggestedFileName),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (save.canceled || !save.filePath) return { canceled: true };
    // `preferCSSPageSize`: each print sheet declares its own named `@page` size (A4…A1), without it
    // Chromium flattens every page to Letter. Margins are already 0 in the page CSS.
    const pdf = await event.sender.printToPDF({
      preferCSSPageSize: true,
      printBackground: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    await fs.writeFile(save.filePath, pdf);
    return { path: save.filePath };
  });

  ipcMain.handle(IPC.dialogOpenProjectFolder, async () => {
    const window = getMainWindow();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.dialogNewProjectFolder, async (_event, defaultPath?: string) => {
    const window = getMainWindow();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  // The new-project dialog's initial suggestion (`new-project-dialog-store.ts`'s `open()`) — the
  // first `<Documents>/Falang/Project{N}` not already on disk, mirroring
  // `@falang/desktop-app-sketch`'s handler of the same name (see ADR 0032 (private), task A).
  ipcMain.handle(IPC.projectSuggestNewLocation, async (): Promise<INewProjectLocationSuggestion> => {
    const baseDir = path.join(app.getPath('documents'), 'Falang');
    const exists = (dir: string): Promise<boolean> =>
      fs
        .access(dir)
        .then(() => true)
        .catch(() => false);
    let index = 1;
    let name = `Project${index}`;
    let dir = path.join(baseDir, name);
    // oxlint-disable-next-line no-await-in-loop -- sequential probing of "does Project{N} already exist" one index at a time is the whole point here
    while (await exists(dir)) {
      index += 1;
      name = `Project${index}`;
      dir = path.join(baseDir, name);
    }
    return { baseDir, dir, name };
  });

  ipcMain.handle(
    IPC.projectCreate,
    async (_event, dir: string, params: ICreateArduinoProjectParams): Promise<IProjectManifest> => {
      const manifest = await createProject(dir, params);
      // The board is chosen once, here, and never changes again (see ADR 0032 (private), "Decision → 1") — written right after `createProject` so it
      // exists before the watcher/agent files below can ever observe the project directory.
      await writeArduinoProjectConfig(dir, { board: params.board });
      // `setup`/`loop`/`Devices` are created here, once, in `main` — never by the renderer's
      // `ArduinoProjectStore.loadTree` (see `ensure-project-documents.ts`'s own doc comment for the
      // StrictMode double-create bug that used to cause). Runs before `startProjectWatcher` so these
      // creates don't themselves generate watcher events for a project nobody has opened yet.
      await ensureArduinoProjectDocuments(dir);
      // The renderer's `createNewProject` navigates straight here without ever calling
      // `IPC.projectOpen` (see `renderer/src/project-actions.ts`), so the watcher/agent files have
      // to start here too, not only in the `projectOpen` handler below — otherwise a brand-new
      // project would run without a watcher until the app restarts.
      writeAgentFilesBestEffort(dir, params.type);
      startProjectWatcher(dir, getMainWindow);
      return manifest;
    },
  );
  ipcMain.handle(IPC.projectOpen, async (_event, dir: string): Promise<IProjectManifest> => {
    const manifest = await openProject(dir);
    // A pre-existing project created before ADR 0032 (private) (or one whose `arduino.json` was
    // otherwise lost) has no board bound yet — treat it as `DEFAULT_BOARD_FQBN` and write the file so
    // it's bound like any new project from here on (see that ADR's "Decision → 1").
    if (!(await readArduinoProjectConfig(dir))) await writeArduinoProjectConfig(dir, { board: DEFAULT_BOARD_FQBN });
    // Backfills `setup`/`loop`/`Devices` for a project that predates one of them — same reasoning and
    // same "before the watcher starts" ordering as the `projectCreate` handler above.
    await ensureArduinoProjectDocuments(dir);
    writeAgentFilesBestEffort(dir, manifest.type);
    startProjectWatcher(dir, getMainWindow);
    return manifest;
  });
  ipcMain.handle(IPC.projectListTree, (_event, dir: string) => listTree(dir));
  // Re-run after a version restore (`ArduinoProjectStore.reloadAfterRestore`) — a restored snapshot
  // may itself predate one of the three fixed documents. Unlike the two handlers above, this one runs
  // while the watcher is already active; see `ensure-project-documents.ts`'s doc comment for why
  // that's fine (`handleDocumentsChanged`/`reloadDocumentFromDisk` already handle a not-yet-known id).
  ipcMain.handle(
    IPC.projectEnsureDocuments,
    (_event, dir: string): Promise<void> => ensureArduinoProjectDocuments(dir),
  );
  ipcMain.handle(IPC.locksRead, (_event, dir: string): Promise<IDocumentLock[]> => readLocks(dir));

  ipcMain.handle(
    IPC.documentRead,
    (_event, dir: string, documentId: string): Promise<IProjectDocument> => readDocument(dir, documentId),
  );
  ipcMain.handle(IPC.documentWrite, (_event, dir: string, document: IProjectDocument): Promise<void> => {
    markOwnDocumentWrite(document.id);
    return withAutoVersion(dir, () => writeDocument(dir, document));
  });
  ipcMain.handle(
    IPC.documentCreate,
    (_event, dir: string, params: { document: IProjectDocument; folderId: string | null }): Promise<void> =>
      withAutoVersion(dir, () => createDocument(dir, params)),
  );
  ipcMain.handle(
    IPC.documentDelete,
    (_event, dir: string, documentId: string): Promise<void> =>
      withAutoVersion(dir, () => deleteDocument(dir, documentId)),
  );
  ipcMain.handle(
    IPC.documentRename,
    (_event, dir: string, documentId: string, name: string): Promise<void> =>
      withAutoVersion(dir, () => renameDocument(dir, documentId, name)),
  );
  ipcMain.handle(
    IPC.documentMove,
    (_event, dir: string, documentId: string, folderId: string | null): Promise<void> =>
      withAutoVersion(dir, () => moveDocument(dir, documentId, folderId)),
  );

  ipcMain.handle(IPC.folderCreate, (_event, dir: string, params: { name: string; parentId: string | null }) =>
    withAutoVersion(dir, () => createFolder(dir, params)),
  );
  ipcMain.handle(
    IPC.folderRename,
    (_event, dir: string, folderId: string, name: string): Promise<void> =>
      withAutoVersion(dir, () => renameFolder(dir, folderId, name)),
  );
  ipcMain.handle(
    IPC.folderMove,
    (_event, dir: string, folderId: string, parentId: string | null): Promise<void> =>
      withAutoVersion(dir, () => moveFolder(dir, folderId, parentId)),
  );
  ipcMain.handle(
    IPC.folderDelete,
    (_event, dir: string, folderId: string): Promise<void> => withAutoVersion(dir, () => deleteFolder(dir, folderId)),
  );

  ipcMain.handle(IPC.recentProjectsList, () => listRecentProjects());
  ipcMain.handle(IPC.recentProjectsAdd, async (_event, projectPath: string, name: string): Promise<void> => {
    await addRecentProject(projectPath, name);
    rebuildMenu();
  });

  ipcMain.handle(IPC.arduinoCheckCli, () => checkArduinoCli());
  ipcMain.handle(
    IPC.arduinoGetProjectConfig,
    (_event, dir: string): Promise<IArduinoProjectConfig | null> => readArduinoProjectConfig(dir),
  );
  ipcMain.handle(IPC.arduinoListBoards, () => listBoards());
  ipcMain.handle(IPC.arduinoCompile, (_event, dir: string, documents: IProjectDocument[], fqbn: string) =>
    buildAndCompileSketch(dir, documents, fqbn, driverRegistry.drivers),
  );
  ipcMain.handle(IPC.arduinoUpload, (_event, dir: string, documents: IProjectDocument[], fqbn: string, port: string) =>
    buildAndUploadSketch(dir, documents, fqbn, port, driverRegistry.drivers),
  );
  ipcMain.handle(
    IPC.arduinoUploadDebug,
    (_event, dir: string, documents: IProjectDocument[], fqbn: string, port: string) =>
      buildAndUploadDebugSketch(dir, documents, fqbn, port, driverRegistry.drivers),
  );

  ipcMain.handle(IPC.debugStart, (_event, params: IStartDebugSessionParams): void => {
    startDebugSession(params, (debugEvent) => {
      getMainWindow()?.webContents.send(IPC.debugEvent, debugEvent);
    });
  });
  ipcMain.handle(
    IPC.debugSetBreakpoints,
    (_event, breakpoints: IDebugBreakpoint[]): Promise<void> => setDebugBreakpoints(breakpoints),
  );
  ipcMain.handle(IPC.debugResume, (_event, mode: TDebugResumeMode): Promise<void> => resumeDebugSession(mode));
  ipcMain.handle(IPC.debugStop, (): Promise<void> => stopDebugSession());

  ipcMain.handle(
    IPC.debugBreakpointsRead,
    (_event, dir: string): Promise<IDebugBreakpoint[] | null> => readSidecar(dir, DEBUG_BREAKPOINTS_SIDECAR_NAME),
  );
  ipcMain.handle(
    IPC.debugBreakpointsWrite,
    (_event, dir: string, breakpoints: IDebugBreakpoint[]): Promise<void> =>
      writeSidecar(dir, DEBUG_BREAKPOINTS_SIDECAR_NAME, breakpoints),
  );

  ipcMain.handle(IPC.driversList, (): readonly IDriverConfig[] =>
    driverRegistry.drivers.map((driver) => driver.config),
  );

  ipcMain.handle(IPC.settingsGetLanguage, () => getLanguage());
  ipcMain.handle(IPC.settingsSetLanguage, async (_event, language: string): Promise<void> => {
    await setLanguage(language);
    // The native `Menu`'s own labels are translated (see `menu.ts`/`menu-labels.ts`) and read the
    // persisted language fresh on every rebuild, so it just needs to be told to rebuild.
    rebuildMenu();
  });
  ipcMain.handle(IPC.settingsGetAgent, () => getAgentSettings());
  ipcMain.handle(IPC.settingsSetAgent, (_event, settings: IAgentSettings): Promise<void> => setAgentSettings(settings));
  ipcMain.handle(IPC.settingsGetVersioning, () => getVersioningSettings());
  ipcMain.handle(
    IPC.settingsSetVersioning,
    (_event, settings: IGitVersioningOptions): Promise<void> => setVersioningSettings(settings),
  );

  // One `IVersionStore` per project directory (`getVersionStore`, cached) — see
  // ADR 0025 (private) (package E2). Runs in `main` for filesystem/git access,
  // same posture as the Arduino compile/upload handlers above.
  ipcMain.handle(
    IPC.versioningListCommits,
    (_event, dir: string): Promise<ICommitInfo[]> => getVersionStore(dir).listCommits(),
  );
  ipcMain.handle(
    IPC.versioningGetSnapshot,
    (_event, dir: string, commitId: string): Promise<IProjectSnapshot> => getVersionStore(dir).getSnapshot(commitId),
  );
  ipcMain.handle(
    IPC.versioningGetWorkingCopy,
    (_event, dir: string): Promise<IProjectSnapshot> => getVersionStore(dir).getWorkingCopy(),
  );
  ipcMain.handle(
    IPC.versioningCommit,
    (_event, dir: string, params: { kind: TCommitKind; message: string }): Promise<ICommitInfo | null> =>
      getVersionStore(dir).commit(params),
  );
  ipcMain.handle(
    IPC.versioningNameCommit,
    (_event, dir: string, commitId: string, message: string): Promise<ICommitInfo> =>
      getVersionStore(dir).nameCommit(commitId, message),
  );
  ipcMain.handle(
    IPC.versioningRestore,
    (_event, dir: string, commitId: string): Promise<ICommitInfo> => getVersionStore(dir).restore(commitId),
  );

  // Runs in `main`, not the renderer — same posture as `packages/desktop/app-sketch`'s own `agentChat`
  // handler (see ADR 0026 (private)): Node's `fetch` has no CORS restrictions, so
  // a self-hosted OpenAI-compatible server with no CORS headers is only reachable from here.
  ipcMain.handle(
    IPC.agentChat,
    (
      _event,
      requestId: string,
      params: { system: string; messages: readonly TChatMessage[]; tools: readonly IChatToolDefinition[] },
    ): Promise<IChatResult> => runAgentChat(requestId, params),
  );
  ipcMain.handle(IPC.agentChatCancel, (_event, requestId: string): void => cancelAgentChat(requestId));

  // `IAgentSessionStore` over `@falang/desktop-project-fs`'s agent-sessions module (stateless file
  // I/O, no per-project cache needed — unlike `getVersionStore` above, which caches a stateful
  // `GitVersionStore` for its own serial queue) — see ADR 0033 (private).
  ipcMain.handle(
    IPC.agentSessionsList,
    (_event, dir: string): Promise<IChatSessionSummary[]> => listAgentSessions(dir),
  );
  ipcMain.handle(
    IPC.agentSessionsCreate,
    (_event, dir: string, title?: string): Promise<IChatSession> => createAgentSession(dir, title),
  );
  ipcMain.handle(
    IPC.agentSessionsGet,
    (_event, dir: string, id: string): Promise<IChatSession | null> => getAgentSession(dir, id),
  );
  ipcMain.handle(
    IPC.agentSessionsRename,
    (_event, dir: string, id: string, title: string): Promise<void> => renameAgentSession(dir, id, title),
  );
  ipcMain.handle(
    IPC.agentSessionsDelete,
    (_event, dir: string, id: string): Promise<void> => deleteAgentSession(dir, id),
  );
  ipcMain.handle(
    IPC.agentSessionsAppendTurn,
    (_event, dir: string, sessionId: string, turn: IChatTurn): Promise<void> =>
      appendAgentSessionTurn(dir, sessionId, turn),
  );
};
