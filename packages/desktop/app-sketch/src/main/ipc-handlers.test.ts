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
  runAgentChat: vi.fn(),
  cancelAgentChat: vi.fn(),
  realWatcher: false,
  runExportJob: vi.fn(),
  cancelExportJob: vi.fn(),
  isOldFormatProject: vi.fn(),
  convertOldProject: vi.fn(),
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
vi.mock('./export-worker/run-export-job.js', () => ({
  runExportJob: h.runExportJob,
  cancelExportJob: h.cancelExportJob,
}));
vi.mock('@falang/desktop-project-converter', () => ({
  isOldFormatProject: h.isOldFormatProject,
  convertOldProject: h.convertOldProject,
}));
vi.mock('./mcp-server-path.js', () => ({
  resolveMcpServerCommand: async () => ({ command: 'node', args: ['mcp.js'], env: undefined }),
}));

import { createDocument, listTree, readDocument, readLastEditedAt } from '@falang/desktop-project-fs';
import { IPC } from '../shared/ipc-channels.js';
import { registerIpcHandlers } from './ipc-handlers.js';
import { stopProjectWatcher } from './project-watcher-state.js';
import { getVersionStore } from './versioning.js';

const call = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> =>
  Promise.resolve((h.handlers.get(channel) as (...a: unknown[]) => unknown)({ sender: {} }, ...args)) as Promise<T>;

describe('app-sketch ipc-handlers', () => {
  let dir = '';
  const send = vi.fn();
  const rebuildMenu = vi.fn();

  beforeEach(async () => {
    h.handlers.clear();
    h.listeners.clear();
    h.userData = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-sk-ud-'));
    h.documents = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-sk-docs-'));
    dir = path.join(h.documents, 'Proj');
    vi.clearAllMocks();
    h.realWatcher = false;
    h.isOldFormatProject.mockResolvedValue(false);
    registerIpcHandlers(() => ({ webContents: { send } }) as never, rebuildMenu);
  });

  afterEach(async () => {
    stopProjectWatcher();
    await fs.rm(h.userData, { recursive: true, force: true });
    await fs.rm(h.documents, { recursive: true, force: true });
  });

  const createProject = () => call(IPC.projectCreate, dir, { name: 'Proj', type: 'text' });

  it('projectCreate creates the project, writes agent files and starts the watcher', async () => {
    expect(await createProject()).toMatchObject({ name: 'Proj' });
    await vi.waitFor(async () => expect(await fs.stat(path.join(dir, '.mcp.json'))).toBeTruthy());
  });

  it('projectOpen: a regular project is opened unconverted, with agent files', async () => {
    await createProject();
    await fs.rm(path.join(dir, '.mcp.json'), { force: true });
    const result = await call<{ converted: boolean; manifest: { name: string } }>(IPC.projectOpen, dir);
    expect(result).toMatchObject({ converted: false, manifest: { name: 'Proj' } });
    expect(h.convertOldProject).not.toHaveBeenCalled();
    await vi.waitFor(async () => expect(await fs.stat(path.join(dir, '.mcp.json'))).toBeTruthy());
  });

  it('projectOpen: an old-format project is converted first and gets no agent files this time', async () => {
    await createProject();
    await fs.rm(path.join(dir, '.mcp.json'), { force: true });
    h.isOldFormatProject.mockResolvedValue(true);
    const result = await call<{ converted: boolean }>(IPC.projectOpen, dir);
    expect(result.converted).toBe(true);
    expect(h.convertOldProject).toHaveBeenCalledWith(dir);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await expect(fs.stat(path.join(dir, '.mcp.json'))).rejects.toBeTruthy();
  });

  it('projectOpen: a failed conversion is reported as such, keeping the cause', async () => {
    await createProject();
    h.isOldFormatProject.mockResolvedValue(true);
    h.convertOldProject.mockRejectedValue(new Error('bad json'));
    await expect(call(IPC.projectOpen, dir)).rejects.toThrow('Failed to convert old-format project: bad json');
  });

  it('documentWrite: an already structured-cloned document reaches the disk, via withAutoVersion', async () => {
    await createProject();
    await createDocument(dir, { document: { id: 'd1', type: 'function', name: 'fn' }, folderId: null });
    const original = await readDocument(dir, 'd1');
    // What actually arrives over IPC: a structured clone of a plain object (ADR 0029 (private), "edits never reach disk").
    await call(IPC.documentWrite, dir, structuredClone({ ...original, data: { marker: 'edited-by-ipc' } }));
    expect(JSON.stringify(await readDocument(dir, 'd1'))).toContain('edited-by-ipc');
    expect(await readLastEditedAt(dir)).not.toBeNull();
    // First edit ever: the pre-edit working copy was auto-committed.
    const commits = await getVersionStore(dir).listCommits();
    expect(commits).toHaveLength(1);
    expect(JSON.stringify(await getVersionStore(dir).getSnapshot(commits[0]!.id))).not.toContain('edited-by-ipc');
  });

  it('document and folder operations hit the disk', async () => {
    await createProject();
    await call(IPC.documentCreate, dir, { document: { id: 'n1', type: 'function', name: 'first' }, folderId: null });
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
    expect((await listTree(dir)).documents.find((d) => d.id === 'n1')).toBeUndefined();
  });

  it('a failing write leaves the edit un-recorded', async () => {
    await createProject();
    await expect(call(IPC.documentRename, dir, 'missing-id', 'x')).rejects.toBeTruthy();
    expect(await readLastEditedAt(dir)).toBeNull();
  });

  it('documentRead / locksRead pass through', async () => {
    await createProject();
    await createDocument(dir, { document: { id: 'z', type: 'function', name: 'z' }, folderId: null });
    expect(await call(IPC.documentRead, dir, 'z')).toMatchObject({ id: 'z' });
    expect(await call(IPC.locksRead, dir)).toEqual([]);
  });

  it('suggest-new-location picks the first free Project{N}', async () => {
    await fs.mkdir(path.join(h.documents, 'Falang', 'Project1'), { recursive: true });
    expect((await call<{ name: string }>(IPC.projectSuggestNewLocation)).name).toBe('Project2');
  });

  it('dialogs: cancelled → null, chosen → the path', async () => {
    h.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await call(IPC.dialogOpenProjectFolder)).toBeNull();
    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/x'] });
    expect(await call(IPC.dialogOpenProjectFolder)).toBe('/x');
    h.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/y'] });
    expect(await call(IPC.dialogNewProjectFolder, '/def')).toBe('/y');
    h.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await call(IPC.dialogNewProjectFolder)).toBeNull();
  });

  it('printToPdf: cancel → canceled, else writes the PDF bytes with preferCSSPageSize', async () => {
    const printToPDF = vi.fn(async () => Buffer.from('%PDF'));
    const invoke = h.handlers.get(IPC.printToPdf) as (...a: unknown[]) => Promise<unknown>;
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
    on({}, { projectType: 'logic' });
    on({}, { projectType: 'logic' });
    expect(rebuildMenu).toHaveBeenCalledTimes(1);
  });

  it('recent projects: add rebuilds the menu and lists', async () => {
    await call(IPC.recentProjectsAdd, '/some/path', 'Some');
    expect(rebuildMenu).toHaveBeenCalledOnce();
    expect(await call<unknown[]>(IPC.recentProjectsList)).toEqual([expect.objectContaining({ path: '/some/path' })]);
  });

  it('logic export config round trips; export runs are forwarded with progress going to the window', async () => {
    await createProject();
    expect(await call(IPC.logicExportReadConfig, dir)).toBeNull();
    await call(IPC.logicExportWriteConfig, dir, { exports: [{ language: 'ts', path: 'out' }] });
    expect(await call(IPC.logicExportReadConfig, dir)).toMatchObject({ exports: [{ language: 'ts', path: 'out' }] });
    h.runExportJob.mockImplementation(async (_id: string, _job: unknown, progress: (p: unknown) => void) => {
      progress({ done: 1 });
      return { ok: true };
    });
    expect(await call(IPC.logicExportRun, 'r1', dir, { documents: [], exports: [] })).toEqual({ ok: true });
    expect(h.runExportJob).toHaveBeenCalledWith(
      'r1',
      expect.objectContaining({ kind: 'logic', dir }),
      expect.any(Function),
    );
    expect(send).toHaveBeenCalledWith(IPC.logicExportProgress, 'r1', { done: 1 });
    await call(IPC.codeExportRun, 'r2', dir, { documents: [] });
    expect(h.runExportJob).toHaveBeenLastCalledWith(
      'r2',
      expect.objectContaining({ kind: 'code', dir }),
      expect.any(Function),
    );
    await call(IPC.logicExportCancel, 'r1');
    await call(IPC.codeExportCancel, 'r2');
    expect(h.cancelExportJob).toHaveBeenCalledTimes(2);
  });

  it('versioning: commit, list, snapshot, working copy, name, restore', async () => {
    await createProject();
    await createDocument(dir, { document: { id: 'v', type: 'function', name: 'v' }, folderId: null });
    const commit = await call<{ id: string }>(IPC.versioningCommit, dir, { kind: 'named', message: 'v1' });
    expect(await call<unknown[]>(IPC.versioningListCommits, dir)).toHaveLength(1);
    expect(await call(IPC.versioningGetSnapshot, dir, commit.id)).toHaveProperty('documents');
    expect(await call(IPC.versioningGetWorkingCopy, dir)).toHaveProperty('documents');
    expect(typeof (await call(IPC.versioningHasExtraChanges, dir))).toBe('boolean');
    await call(IPC.versioningNameCommit, dir, commit.id, 'renamed');
    expect((await call<{ id: string }>(IPC.versioningRestore, dir, commit.id)).id).toBe(commit.id);
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
