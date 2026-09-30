// oxlint-disable max-lines -- grew past 300 lines with ADR 0033 (private)'s agent-sessions IPC handlers, on top of every other domain's own handler block; splitting this file per domain isn't worth it yet for a still-mostly-flat list of `ipcMain.handle` calls.
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
  renameDocument,
  renameFolder,
  renameSession as renameAgentSession,
  writeAgentFiles,
  writeDocument,
  type ICreateProjectParams,
  type IDocumentLock,
  type IProjectManifest,
} from '@falang/desktop-project-fs';
import type { IChatSession, IChatSessionSummary, IChatTurn } from '@falang/agent';
import type { IProjectDocument } from '@falang/dto';
import type { ILogicExportConfiguration, ILogicExportConfigurationItem } from '@falang/logic-dto';
import { readLogicExportConfiguration, writeLogicExportConfiguration } from '@falang/logic-export';
import type { IAgentSettings, IChatResult, IChatToolDefinition, TChatMessage } from '@falang/desktop-llm-client';
import { convertOldProject, isOldFormatProject } from '@falang/desktop-project-converter';
import type { IGitVersioningOptions } from '@falang/desktop-project-fs';
import type { ICommitInfo, IProjectSnapshot, TCommitKind } from '@falang/versioning';
import { IPC } from '../shared/ipc-channels.js';
import type { IProjectOpenResult } from '../shared/project-open-result.js';
import type { INewProjectLocationSuggestion } from '../shared/new-project-location.js';
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
import { cancelExportJob, runExportJob } from './export-worker/run-export-job.js';
import type { TExportWorkerResult } from '../shared/export-worker-protocol.js';

/** Only-if-absent, so it's safe to call on every project create/open (see `writeAgentFiles`'s own doc comment) — failures are reported, not thrown, since a project must still open/create successfully even if `.mcp.json`/`CLAUDE.md` couldn't be written (e.g. a read-only folder). */
const writeAgentFilesBestEffort = (dir: string, projectType: string): void => {
  const { command, args } = resolveMcpServerCommand();
  writeAgentFiles(dir, { mcpServerCommand: command, mcpServerArgs: args, projectType }).catch((error: unknown) =>
    reportError('Failed to write .mcp.json/CLAUDE.md', error),
  );
};

export const registerIpcHandlers = (
  getMainWindow: () => BrowserWindow | null,
  // Rebuilds the native `Menu` — triggered both by the recent-projects list changing and by a
  // language change (its labels are translated, see `menu-labels.ts`).
  rebuildMenu: () => void,
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
  // first `<Documents>/Falang/Project{N}` not already on disk, mirroring the old app's own
  // `NewProjectDialogState.setNewDirectoryPath`.
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
    async (_event, dir: string, params: ICreateProjectParams): Promise<IProjectManifest> => {
      const manifest = await createProject(dir, params);
      // A fresh project has no old-format-conversion story to worry about (`writeAgentFiles`'s own
      // only-if-absent semantics make this safe regardless). The renderer's `createNewProject`
      // navigates straight here without ever calling `IPC.projectOpen` (see
      // `renderer/src/project-actions.ts`), so the watcher has to start here too, not only in the
      // `projectOpen` handler below — otherwise a brand-new project would run without one until the
      // app restarts.
      writeAgentFilesBestEffort(dir, params.type);
      startProjectWatcher(dir, getMainWindow);
      return manifest;
    },
  );
  ipcMain.handle(IPC.projectOpen, async (_event, dir: string): Promise<IProjectOpenResult> => {
    // Old (`schemeVersion` 2, `project.falangproject.json`) projects are migrated in place, once,
    // the first time they're opened — see `@falang/desktop-project-converter` and
    // ADR 0005 (private)'s "Implementation notes (old-format project
    // migration)". The untouched original ends up fully preserved under `<dir>/backup/`. On failure,
    // `convertOldProject` rolls itself back to the pre-conversion state before rethrowing (same ADR
    // section) — wrapped here only to make the renderer's error message unambiguous about which step
    // failed, since `openProject` below can also throw for unrelated reasons.
    const converted = await isOldFormatProject(dir);
    if (converted) {
      try {
        await convertOldProject(dir);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to convert old-format project: ${reason}`, { cause: error });
      }
    }
    const manifest = await openProject(dir);
    // Deliberately *not* called when `converted` is true this same call — a just-converted project
    // gets `.mcp.json`/`CLAUDE.md` the next time it's opened (this function is only-if-absent and
    // idempotent, so the next open call covers it), avoiding writing agent files into a folder
    // whose conversion might itself still be worth double-checking by hand first.
    if (!converted) writeAgentFilesBestEffort(dir, manifest.type);
    startProjectWatcher(dir, getMainWindow);
    return { manifest, converted };
  });
  ipcMain.handle(IPC.projectListTree, (_event, dir: string) => listTree(dir));
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

  ipcMain.handle(
    IPC.logicExportReadConfig,
    (_event, dir: string): Promise<ILogicExportConfiguration | null> => readLogicExportConfiguration(dir),
  );
  ipcMain.handle(
    IPC.logicExportWriteConfig,
    (_event, dir: string, config: ILogicExportConfiguration): Promise<void> =>
      writeLogicExportConfiguration(dir, config),
  );
  // Codegen doesn't run inline in `main` any more (nor could it run in the renderer: it needs the file
  // system for the output, and `@falang/logic-constructor` pulls in the TypeScript compiler API, which
  // has no business in the renderer bundle) — `compile*Project`'s real `ts.Program`-per-target compile
  // is synchronous CPU-bound work with no `await` inside it, so running it inline blocked this whole
  // process's event loop (and therefore every window's IPC) for the entire export, however long that
  // took. `runExportJob` spawns it in a disposable child process instead (`@falang/desktop-worker-process`,
  // see `export-worker/worker-main.ts`) and forwards progress to the renderer as it happens; the
  // renderer sends its in-memory documents (debounced saves may still be pending) rather than having
  // `main` re-read them from disk, same as before.
  ipcMain.handle(
    IPC.logicExportRun,
    (
      _event,
      requestId: string,
      dir: string,
      params: { documents: IProjectDocument[]; exports: ILogicExportConfigurationItem[] },
    ): Promise<TExportWorkerResult> =>
      runExportJob(requestId, { kind: 'logic', dir, ...params }, (progress) =>
        getMainWindow()?.webContents.send(IPC.logicExportProgress, requestId, progress),
      ),
  );
  ipcMain.handle(IPC.logicExportCancel, (_event, requestId: string): void => cancelExportJob(requestId));

  // Same posture as `logicExportRun` above.
  ipcMain.handle(
    IPC.codeExportRun,
    (_event, requestId: string, dir: string, params: { documents: IProjectDocument[] }): Promise<TExportWorkerResult> =>
      runExportJob(requestId, { kind: 'code', dir, ...params }, (progress) =>
        getMainWindow()?.webContents.send(IPC.codeExportProgress, requestId, progress),
      ),
  );
  ipcMain.handle(IPC.codeExportCancel, (_event, requestId: string): void => cancelExportJob(requestId));

  ipcMain.handle(IPC.settingsGetLanguage, () => getLanguage());
  ipcMain.handle(IPC.settingsSetLanguage, async (_event, language: string): Promise<void> => {
    await setLanguage(language);
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
  // same posture as `logicExportRun`/`codeExportRun` above.
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

  // Runs in `main`, not the renderer — same posture as `logicExportRun`/`codeExportRun` above, but
  // for CORS/vendor-key reasons rather than filesystem/compiler-API ones (see ADR 0026 (private)):
  // Node's `fetch` has no CORS restrictions, so an OpenAI-compatible server with no CORS headers
  // (most self-hosted ones) is only reachable from here.
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
