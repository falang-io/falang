// oxlint-disable max-lines, require-await, no-promise-executor-return, no-await-expression-member, no-non-null-assertion, no-empty-function, no-undefined, consistent-type-imports, no-var-requires, prefer-module, prefer-event-target, consistent-function-scoping, init-declarations, no-useless-undefined -- test scaffolding: fake electron/BrowserWindow stand-ins, timer waits and loose fixtures read better with these stylistic rules off
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  handlers: new Map<string, (...args: never[]) => unknown>(),
  listeners: new Map<string, (...args: never[]) => unknown>(),
  userData: '',
  documents: '',
  showSaveDialog: vi.fn(),
  showOpenDialog: vi.fn(),
  build: {
    buildAndCompileSketch: vi.fn(),
    buildAndUploadSketch: vi.fn(),
    buildAndUploadDebugSketch: vi.fn(),
    checkArduinoCli: vi.fn(),
    listBoards: vi.fn(),
  },
  debug: {
    startDebugSession: vi.fn(),
    setDebugBreakpoints: vi.fn(),
    resumeDebugSession: vi.fn(),
    stopDebugSession: vi.fn(),
  },
  runAgentChat: vi.fn(),
  cancelAgentChat: vi.fn(),
  realWatcher: false,
}));

vi.mock('electron', () => ({
  app: { getPath: (name: string) => (name === 'documents' ? h.documents : h.userData) },
  dialog: { showSaveDialog: h.showSaveDialog, showOpenDialog: h.showOpenDialog },
  ipcMain: {
    handle: (channel: string, fn: (...args: never[]) => unknown) => h.handlers.set(channel, fn),
    on: (channel: string, fn: (...args: never[]) => unknown) => h.listeners.set(channel, fn),
    off: vi.fn(),
  },
}));
vi.mock('./arduino-build.js', () => h.build);
vi.mock('./debug-session-registry.js', () => h.debug);
// A real fs watcher per test would exhaust the host's inotify limit when the suite runs next to others;
// only the tests that assert on watcher behaviour switch it on.
vi.mock('./project-watcher-state.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./project-watcher-state.js')>();
  return {
    ...original,
    startProjectWatcher: (...args: Parameters<typeof original.startProjectWatcher>) => {
      if (h.realWatcher) original.startProjectWatcher(...args);
    },
  };
});
vi.mock('./agent-chat-handler.js', () => ({ runAgentChat: h.runAgentChat, cancelAgentChat: h.cancelAgentChat }));
vi.mock('./drivers/driver-ipc.js', () => ({ registerDriverIpcHandlers: vi.fn() }));
vi.mock('./drivers/driver-service.js', () => ({
  DriverBuildBlockedError: class DriverBuildBlockedError extends Error {},
}));
vi.mock('./mcp-server-path.js', () => ({
  resolveMcpServerCommand: async () => ({ command: 'node', args: ['mcp.js'], env: undefined }),
}));

import { readDocument, listTree, readLastEditedAt, createDocument } from '@falang/desktop-project-fs';
import { IPC } from '../shared/ipc-channels.js';
import { DriverBuildBlockedError } from './drivers/driver-service.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { stopProjectWatcher } from './project-watcher-state.js';
import { getVersionStore } from './versioning.js';
import { readArduinoProjectConfig } from './arduino-project-config.js';

const call = <T = never>(channel: string, ...args: unknown[]): Promise<T> =>
  Promise.resolve((h.handlers.get(channel) as (...a: unknown[]) => unknown)({ sender: {} }, ...args)) as Promise<T>;

const drivers = {
  registry: { reload: vi.fn(async () => {}) },
  service: {
    openProject: vi.fn(async () => {}),
    prepareBuildDrivers: vi.fn(async () => ({ built: true })),
    reloadAfterRestore: vi.fn(async () => {}),
  },
};

describe('app-arduino ipc-handlers', () => {
  let dir = '';
  const send = vi.fn();
  const rebuildMenu = vi.fn();

  beforeEach(async () => {
    h.handlers.clear();
    h.listeners.clear();
    h.userData = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-ipc-ud-'));
    h.documents = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-ipc-docs-'));
    dir = path.join(h.documents, 'Proj');
    vi.clearAllMocks();
    h.realWatcher = false;
    registerIpcHandlers(() => ({ webContents: { send } }) as never, rebuildMenu, drivers as never);
  });

  afterEach(async () => {
    stopProjectWatcher();
    await fs.rm(h.userData, { recursive: true, force: true });
    await fs.rm(h.documents, { recursive: true, force: true });
  });

  const createProject = async () => {
    await call(IPC.projectCreate, dir, { name: 'Proj', type: 'arduino', board: 'arduino:avr:uno' });
  };

  it('projectCreate: writes board config, setup/loop/Devices, adopts drivers, starts the watcher', async () => {
    const manifest = await call(IPC.projectCreate, dir, { name: 'Proj', type: 'arduino', board: 'arduino:avr:mega' });
    expect(manifest).toMatchObject({ name: 'Proj' });
    expect(await readArduinoProjectConfig(dir)).toEqual({ board: 'arduino:avr:mega' });
    const names = (await listTree(dir)).documents.map((d) => d.name).toSorted();
    expect(names).toEqual(['Devices', 'loop', 'setup']);
    expect(drivers.service.openProject).toHaveBeenCalledWith(dir);
    // .mcp.json is written best-effort (async).
    await vi.waitFor(async () => expect(await fs.stat(path.join(dir, '.mcp.json'))).toBeTruthy());
  });

  it('projectCreate: the fixed documents exist BEFORE the project is adopted/watched (ADR 0032 ordering)', async () => {
    let namesAtOpen: string[] = [];
    drivers.service.openProject.mockImplementationOnce(async () => {
      namesAtOpen = (await listTree(dir)).documents.map((d) => d.name).toSorted();
    });
    await createProject();
    expect(namesAtOpen).toEqual(['Devices', 'loop', 'setup']);
  });

  it('projectOpen: backfills a missing board config with the default and a missing Devices document', async () => {
    await createProject();
    await fs.rm(path.join(dir, 'falang', 'config', 'arduino.json'));
    const tree = await listTree(dir);
    const devices = tree.documents.find((d) => d.name === 'Devices')!;
    await call(IPC.documentDelete, dir, devices.id);
    await call(IPC.projectOpen, dir);
    expect(await readArduinoProjectConfig(dir)).toMatchObject({ board: expect.any(String) });
    expect((await listTree(dir)).documents.map((d) => d.name).toSorted()).toEqual(['Devices', 'loop', 'setup']);
  });

  it('projectEnsureDocuments re-creates a deleted fixed document', async () => {
    await createProject();
    const setup = (await listTree(dir)).documents.find((d) => d.name === 'setup')!;
    await call(IPC.documentDelete, dir, setup.id);
    await call(IPC.projectEnsureDocuments, dir);
    expect((await listTree(dir)).documents.map((d) => d.name)).toContain('setup');
  });

  it('documentWrite: an already structured-cloned document reaches the disk as-is, via withAutoVersion', async () => {
    await createProject();
    const tree = await listTree(dir);
    const setup = tree.documents.find((d) => d.name === 'setup')!;
    const original = await readDocument(dir, setup.id);
    // What actually arrives over IPC: a structured clone of a plain object (ADR 0029 (private), "edits never reach disk").
    const edited = structuredClone({
      ...original,
      root: { ...(original.root as object), data: { marker: 'edited-by-ipc' } },
    });
    await call(IPC.documentWrite, dir, edited);
    expect(JSON.stringify(await readDocument(dir, setup.id))).toContain('edited-by-ipc');
    // Went through withAutoVersion: last-edit recorded, and the pre-edit state auto-committed (first edit ever).
    expect(await readLastEditedAt(dir)).not.toBeNull();
    const commits = await getVersionStore(dir).listCommits();
    expect(commits).toHaveLength(1);
    expect(JSON.stringify(await getVersionStore(dir).getSnapshot(commits[0]!.id))).not.toContain('edited-by-ipc');
  });

  it('documentCreate/Rename/Move/Delete and folder operations hit the disk and record the edit', async () => {
    await createProject();
    const doc = { id: 'n1', type: 'function', name: 'first' };
    await call(IPC.documentCreate, dir, { document: doc, folderId: null });
    const folder = await call<{ id: string }>(IPC.folderCreate, dir, { name: 'f', parentId: null });
    await call(IPC.documentMove, dir, 'n1', folder.id);
    await call(IPC.documentRename, dir, 'n1', 'second');
    let tree = await listTree(dir);
    expect(tree.documents.find((d) => d.id === 'n1')).toMatchObject({ name: 'second', folderId: folder.id });
    await call(IPC.folderRename, dir, folder.id, 'g');
    const folder2 = await call<{ id: string }>(IPC.folderCreate, dir, { name: 'h', parentId: null });
    await call(IPC.folderMove, dir, folder.id, folder2.id);
    tree = await listTree(dir);
    expect(tree.folders.find((f) => f.id === folder.id)).toMatchObject({ name: 'g', parentId: folder2.id });
    await call(IPC.folderDelete, dir, folder2.id);
    await call(IPC.documentDelete, dir, 'n1').catch(() => undefined);
    expect((await listTree(dir)).documents.find((d) => d.id === 'n1')).toBeUndefined();
  });

  it('a failing write leaves the edit un-recorded (withAutoVersion contract)', async () => {
    await createProject();
    await expect(call(IPC.documentRename, dir, 'missing-id', 'x')).rejects.toBeTruthy();
    expect(await readLastEditedAt(dir)).toBeNull();
  });

  it('suggest-new-location picks the first free Project{N}', async () => {
    await fs.mkdir(path.join(h.documents, 'Falang', 'Project1'), { recursive: true });
    await fs.mkdir(path.join(h.documents, 'Falang', 'Project2'), { recursive: true });
    const suggestion = await call<{ name: string; dir: string; baseDir: string }>(IPC.projectSuggestNewLocation);
    expect(suggestion.name).toBe('Project3');
    expect(suggestion.dir).toBe(path.join(h.documents, 'Falang', 'Project3'));
  });

  it('dialogs: cancelled → null, chosen → the path; no window → null', async () => {
    h.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await call(IPC.dialogOpenProjectFolder)).toBeNull();
    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/x'] });
    expect(await call(IPC.dialogOpenProjectFolder)).toBe('/x');
    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/y'] });
    expect(await call(IPC.dialogNewProjectFolder, '/def')).toBe('/y');
    expect(h.showOpenDialog).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ defaultPath: '/def' }),
    );
    h.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await call(IPC.dialogNewProjectFolder)).toBeNull();
  });

  it('printToPdf: cancel → canceled, else writes the PDF bytes', async () => {
    const printToPDF = vi.fn(async () => Buffer.from('%PDF'));
    const invoke = (h.handlers.get(IPC.printToPdf) as (...a: unknown[]) => Promise<unknown>)!;
    h.showSaveDialog.mockResolvedValueOnce({ canceled: true });
    expect(await invoke({ sender: { printToPDF } }, { suggestedFileName: 'a.pdf' })).toEqual({ canceled: true });
    const out = path.join(h.documents, 'out.pdf');
    h.showSaveDialog.mockResolvedValueOnce({ canceled: false, filePath: out });
    expect(await invoke({ sender: { printToPDF } }, { suggestedFileName: 'a.pdf' })).toEqual({ path: out });
    expect(printToPDF).toHaveBeenCalledWith(expect.objectContaining({ preferCSSPageSize: true }));
    expect((await fs.readFile(out)).toString()).toBe('%PDF');
  });

  it('settings round trip; set-language rebuilds the menu', async () => {
    await call(IPC.settingsSetLanguage, 'ru');
    expect(await call(IPC.settingsGetLanguage)).toBe('ru');
    expect(rebuildMenu).toHaveBeenCalledOnce();
    await call(IPC.settingsSetAgent, { baseUrl: 'u', apiKey: 'k', model: 'm' });
    expect(await call(IPC.settingsGetAgent)).toEqual({ baseUrl: 'u', apiKey: 'k', model: 'm' });
    const v = { repoMode: 'private', author: { name: 'a', email: 'a@b.c' } };
    await call(IPC.settingsSetVersioning, v);
    expect(await call(IPC.settingsGetVersioning)).toEqual(v);
  });

  it('menu context change rebuilds the menu only when it actually changes', () => {
    const on = h.listeners.get(IPC.menuSetContext) as (e: unknown, c: unknown) => void;
    on({}, { projectType: 'arduino' });
    on({}, { projectType: 'arduino' });
    expect(rebuildMenu).toHaveBeenCalledTimes(1);
  });

  it('recent projects: add rebuilds the menu and lists', async () => {
    await call(IPC.recentProjectsAdd, '/some/path', 'Some');
    expect(rebuildMenu).toHaveBeenCalledOnce();
    expect(await call<unknown[]>(IPC.recentProjectsList)).toEqual([expect.objectContaining({ path: '/some/path' })]);
  });

  it('versioning: commit, list, snapshot, name, restore (reloads drivers; a reload failure does not fail the restore)', async () => {
    await createProject();
    const commit = await call<{ id: string }>(IPC.versioningCommit, dir, { kind: 'named', message: 'v1' });
    expect(commit.id).toBeTruthy();
    expect(await call<unknown[]>(IPC.versioningListCommits, dir)).toHaveLength(1);
    expect(await call(IPC.versioningGetSnapshot, dir, commit.id)).toHaveProperty('documents');
    expect(await call(IPC.versioningGetWorkingCopy, dir)).toHaveProperty('documents');
    expect(typeof (await call(IPC.versioningHasExtraChanges, dir))).toBe('boolean');
    await call(IPC.versioningNameCommit, dir, commit.id, 'renamed');
    drivers.service.reloadAfterRestore.mockRejectedValueOnce(new Error('reload failed'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const restored = await call<{ id: string }>(IPC.versioningRestore, dir, commit.id);
    expect(restored.id).toBe(commit.id);
    expect(drivers.service.reloadAfterRestore).toHaveBeenCalledWith(dir);
  });

  it('compile/upload/debug-upload prepare drivers first; a blocked driver build becomes a compile-error outcome', async () => {
    h.build.buildAndCompileSketch.mockResolvedValue({ stage: 'ok' });
    expect(await call(IPC.arduinoCompile, dir, [], 'fqbn')).toEqual({ stage: 'ok' });
    expect(h.build.buildAndCompileSketch).toHaveBeenCalledWith(dir, [], 'fqbn', { built: true });
    h.build.buildAndUploadSketch.mockResolvedValue({ stage: 'ok' });
    await call(IPC.arduinoUpload, dir, [], 'fqbn', 'COM1');
    h.build.buildAndUploadDebugSketch.mockResolvedValue({ stage: 'ok' });
    await call(IPC.arduinoUploadDebug, dir, [], 'fqbn', 'COM1');
    expect(h.build.buildAndUploadDebugSketch).toHaveBeenCalledWith(dir, [], 'fqbn', 'COM1', { built: true });
    drivers.service.prepareBuildDrivers.mockRejectedValueOnce(new DriverBuildBlockedError('driver broken'));
    expect(await call(IPC.arduinoCompile, dir, [], 'fqbn')).toEqual({
      stage: 'compile-error',
      message: 'driver broken',
    });
    drivers.service.prepareBuildDrivers.mockRejectedValueOnce(new Error('other'));
    await expect(call(IPC.arduinoUpload, dir, [], 'fqbn', 'p')).rejects.toThrow('other');
  });

  it('debug breakpoints persist in a sidecar; debug start forwards events to the window', async () => {
    await createProject();
    expect(await call(IPC.debugBreakpointsRead, dir)).toBeNull();
    const bps = [{ documentId: 'd', nodeId: 'n' }];
    await call(IPC.debugBreakpointsWrite, dir, bps);
    expect(await call(IPC.debugBreakpointsRead, dir)).toEqual(bps);
    h.debug.startDebugSession.mockImplementation(async (_p: unknown, emit: (e: unknown) => void) =>
      emit({ kind: 'started' }),
    );
    await call(IPC.debugStart, { any: 1 });
    expect(send).toHaveBeenCalledWith(IPC.debugEvent, { kind: 'started' });
    await call(IPC.debugSetBreakpoints, bps);
    await call(IPC.debugResume, 'continue');
    await call(IPC.debugStop);
    expect(h.debug.setDebugBreakpoints).toHaveBeenCalledWith(bps);
    expect(h.debug.resumeDebugSession).toHaveBeenCalledWith('continue');
    expect(h.debug.stopDebugSession).toHaveBeenCalled();
  });

  it('agent sessions are persisted per project; agent chat/cancel are forwarded', async () => {
    await createProject();
    const session = await call<{ id: string }>(IPC.agentSessionsCreate, dir, 'T');
    expect(await call<unknown[]>(IPC.agentSessionsList, dir)).toHaveLength(1);
    await call(IPC.agentSessionsRename, dir, session.id, 'T2');
    expect(await call(IPC.agentSessionsGet, dir, session.id)).toMatchObject({ title: 'T2' });
    await call(IPC.agentSessionsDelete, dir, session.id);
    expect(await call(IPC.agentSessionsGet, dir, session.id)).toBeNull();
    h.runAgentChat.mockResolvedValue({ text: 'hi' });
    expect(await call(IPC.agentChat, 'req1', { system: 's', messages: [], tools: [] })).toEqual({ text: 'hi' });
    await call(IPC.agentChatCancel, 'req1');
    expect(h.cancelAgentChat).toHaveBeenCalledWith('req1');
  });

  it('misc passthroughs: locks, check-cli, boards, project config', async () => {
    await createProject();
    expect(await call(IPC.locksRead, dir)).toEqual([]);
    h.build.checkArduinoCli.mockResolvedValue({ available: true });
    expect(await call(IPC.arduinoCheckCli)).toEqual({ available: true });
    h.build.listBoards.mockResolvedValue([]);
    expect(await call(IPC.arduinoListBoards)).toEqual([]);
    expect(await call(IPC.arduinoGetProjectConfig, dir)).toMatchObject({ board: expect.any(String) });
    await createDocument(dir, { document: { id: 'z', type: 'function', name: 'z' }, folderId: null });
    expect(await call(IPC.documentRead, dir, 'z')).toMatchObject({ id: 'z' });
  });
  it('every mutating document/folder handler records the edit (goes through withAutoVersion)', async () => {
    await createProject();
    await createDocument(dir, { document: { id: 'm1', type: 'function', name: 'm1' }, folderId: null });
    const folder = await call<{ id: string }>(IPC.folderCreate, dir, { name: 'mf', parentId: null });
    const ops: (() => Promise<unknown>)[] = [
      () => call(IPC.documentCreate, dir, { document: { id: 'm2', type: 'function', name: 'm2' }, folderId: null }),
      () => call(IPC.documentWrite, dir, { id: 'm1', type: 'function', name: 'm1', data: { a: 1 } }),
      () => call(IPC.documentRename, dir, 'm1', 'm1b'),
      () => call(IPC.documentMove, dir, 'm1', folder.id),
      () => call(IPC.documentDelete, dir, 'm2'),
      () => call(IPC.folderCreate, dir, { name: 'mf2', parentId: null }),
      () => call(IPC.folderRename, dir, folder.id, 'mfr'),
      () => call(IPC.folderMove, dir, folder.id, null),
      () => call(IPC.folderDelete, dir, folder.id),
    ];
    for (const op of ops) {
      // oxlint-disable-next-line no-await-in-loop -- sequential by design
      await fs.rm(path.join(dir, '.falang-versioning.json'), { force: true });
      // oxlint-disable-next-line no-await-in-loop
      await op();
      // oxlint-disable-next-line no-await-in-loop
      expect(await readLastEditedAt(dir), String(op)).not.toBeNull();
    }
  });

  const bounced = (id: string) =>
    send.mock.calls.filter((c) => c[0] === IPC.projectChanged && JSON.stringify(c[1]).includes(id));

  it('the app’s own documentCreate is not bounced back by the watcher as an external change', async () => {
    h.realWatcher = true;
    await createProject();
    await new Promise((resolve) => setTimeout(resolve, 300));
    send.mockClear();
    await call(IPC.documentCreate, dir, { document: { id: 'w1', type: 'function', name: 'w1' }, folderId: null });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(bounced('w1')).toEqual([]);
  });

  it('the app’s own documentWrite is not bounced back by the watcher as an external change', async () => {
    h.realWatcher = true;
    await createProject();
    await createDocument(dir, { document: { id: 'w2', type: 'function', name: 'w2' }, folderId: null });
    // Let the creation's event flush and the suppression window (1 s) of anything earlier pass.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    send.mockClear();
    await call(IPC.documentWrite, dir, { id: 'w2', type: 'function', name: 'w2', data: { a: 1 } });
    await new Promise((resolve) => setTimeout(resolve, 700));
    expect(bounced('w2')).toEqual([]);
  });
});
