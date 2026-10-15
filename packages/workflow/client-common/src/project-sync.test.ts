// oxlint-disable init-declarations, max-lines, no-await-in-loop, no-empty-function, no-promise-executor-return, no-undefined, no-useless-undefined, consistent-function-scoping, numeric-separators-style -- test file: fixture-style helpers and fake-timer plumbing, not production code
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  getProjectTree: vi.fn(),
  getProjectDocuments: vi.fn(),
  getDevStatus: vi.fn(),
  getProdStatus: vi.fn(),
  listVersions: vi.fn(),
  build: vi.fn(),
  stop: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  createDocument: vi.fn(),
  updateDocument: vi.fn(),
  deleteDocument: vi.fn(),
  publish: vi.fn(),
  startProd: vi.fn(),
  stopProd: vi.fn(),
}));
vi.mock('./api-client.js', async () => {
  const lock = await import('./api-document-lock-error.js');
  const compile = await import('./api-compile-error.js');
  return {
    workflowApi: api,
    ApiCompileErrorsError: compile.ApiCompileErrorsError,
    DocumentLockedError: lock.DocumentLockedError,
  };
});
vi.mock('@falang/scheme', () => ({ getGlobalI18n: () => ({ t: (key: string) => `T:${key}` }) }));

const { ProjectSync } = await import('./project-sync.js');
const { DocumentLockedError } = await import('./api-document-lock-error.js');
const { ApiCompileErrorsError } = await import('./api-compile-error.js');
const { ApiCodedError } = await import('./api-coded-error.js');
const { eventTracker } = await import('./analytics/event-tracker.js');

const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

interface IHooks {
  locked: Set<string>;
  owner: string | null;
  conflict: ReturnType<typeof vi.fn<(documentId: string, lockExpiresAt: string) => void>>;
}

const makeSync = (options: { readOnly?: boolean } = {}) => {
  const hooks: IHooks = {
    locked: new Set(),
    owner: null,
    conflict: vi.fn<(documentId: string, lockExpiresAt: string) => void>(),
  };
  const onTree = vi.fn();
  const onDocs = vi.fn();
  const sync = new ProjectSync(
    'p1',
    {
      isDocumentLocked: (id: string) => hooks.locked.has(id),
      onDocumentLockConflict: hooks.conflict,
      getOwnLockOwner: () => hooks.owner,
    },
    onTree,
    onDocs,
    options,
  );
  return { sync, hooks, onTree, onDocs };
};

const doc = (data: unknown, name = 'doc') => ({ id: 'd1', name, type: 'function', folderId: null, data }) as never;

describe('ProjectSync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const fn of Object.values(api)) fn.mockReset();
    api.getProjectTree.mockResolvedValue({ folders: [], documents: [] });
    api.getProjectDocuments.mockResolvedValue([]);
    api.getDevStatus.mockResolvedValue({ running: false });
    api.getProdStatus.mockResolvedValue({ running: false });
    api.listVersions.mockResolvedValue([]);
    api.updateDocument.mockResolvedValue(null);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('loads tree then documents', async () => {
      api.getProjectTree.mockResolvedValue({
        folders: [{ id: 'f', name: 'F', parentId: null }],
        documents: [{ id: 'd', name: 'D', type: 'function', folderId: 'f', pinned: false, extra: 1 }],
      });
      const { sync, onTree, onDocs } = makeSync();
      await settle();
      expect(onTree).toHaveBeenCalledWith(
        [{ id: 'f', name: 'F', parentId: null }],
        [{ id: 'd', name: 'D', type: 'function', folderId: 'f', pinned: false }],
      );
      expect(onDocs).toHaveBeenCalled();
      expect(sync.isLoadingTree).toBe(false);
      expect(sync.isLoadingDocuments).toBe(false);
    });

    it('reports a tree load failure and skips documents', async () => {
      api.getProjectTree.mockRejectedValue(new Error('tree down'));
      const { sync } = makeSync();
      await settle();
      expect(sync.connectionError).toBe('tree down');
      expect(sync.isLoadingDocuments).toBe(false);
      expect(api.getProjectDocuments).not.toHaveBeenCalled();
    });

    it('reports a documents load failure', async () => {
      api.getProjectDocuments.mockRejectedValue(new Error('docs down'));
      const { sync } = makeSync();
      await settle();
      expect(sync.connectionError).toBe('docs down');
      expect(sync.isLoadingTree).toBe(false);
      expect(sync.isLoadingDocuments).toBe(false);
    });

    it('restores running dev/prod state', async () => {
      api.getDevStatus.mockResolvedValue({ running: true });
      api.getProdStatus.mockResolvedValue({ running: true, suspendedReason: 'balance' });
      api.listVersions.mockResolvedValue([{ id: 'v' }]);
      const { sync } = makeSync();
      await settle();
      expect(sync.buildStatus).toBe('running');
      expect(sync.prodRunning).toBe(true);
      expect(sync.hasVersions).toBe(true);
      expect(sync.suspendedReason).toBe('balance');
    });

    it('read-only mode loads but writes nothing and skips status loads', async () => {
      const { sync } = makeSync({ readOnly: true });
      await settle();
      expect(api.getDevStatus).not.toHaveBeenCalled();
      expect(api.getProdStatus).not.toHaveBeenCalled();
      sync.createFolderRemote({ id: 'f', name: 'F', parentId: null } as never);
      sync.updateFolderRemote('f', { name: 'x' });
      sync.deleteFolderRemote('f');
      sync.createDocumentRemote(doc({}));
      sync.updateDocumentRemote('d1', { name: 'x' });
      sync.deleteDocumentRemote('d1');
      sync.scheduleSaveDocument(doc({ id: 'n' }));
      sync.scheduleSaveCustomDocument(doc({}));
      await sync.flushSaveCustomDocument(doc({}));
      vi.advanceTimersByTime(5000);
      for (const fn of [
        api.createFolder,
        api.updateFolder,
        api.deleteFolder,
        api.createDocument,
        api.updateDocument,
        api.deleteDocument,
      ]) {
        expect(fn).not.toHaveBeenCalled();
      }
      expect(sync.changedSinceBuild).toBe(false);
    });
  });

  describe('folder/document remote calls', () => {
    it('forwards folder and document calls, marking changes and reporting failures', async () => {
      api.createFolder.mockResolvedValue(null);
      api.updateFolder.mockRejectedValue(new Error('upd folder'));
      api.deleteFolder.mockResolvedValue(null);
      api.createDocument.mockResolvedValue(null);
      api.updateDocument.mockResolvedValue(null);
      api.deleteDocument.mockResolvedValue(null);
      const { sync } = makeSync();
      await settle();

      sync.createFolderRemote({ id: 'f', name: 'F', parentId: null } as never);
      expect(api.createFolder).toHaveBeenCalledWith('p1', { id: 'f', name: 'F', parentId: null });
      expect(sync.changedSinceBuild).toBe(false);

      sync.updateFolderRemote('f', { name: 'G' });
      expect(api.updateFolder).toHaveBeenCalledWith('p1', 'f', { name: 'G' });
      await settle();
      expect(sync.connectionError).toBe('upd folder');

      sync.deleteFolderRemote('f');
      expect(api.deleteFolder).toHaveBeenCalledWith('p1', 'f');

      sync.createDocumentRemote({ id: 'd1', type: 'function', name: 'n', folderId: null, data: { a: 1 } } as never);
      expect(api.createDocument).toHaveBeenCalledWith('p1', {
        id: 'd1',
        type: 'function',
        name: 'n',
        folderId: null,
        root: { a: 1 },
      });
      expect(sync.changedSinceBuild).toBe(true);
    });

    it('updateDocumentRemote marks the project changed and routes a 409 to the lock hook', async () => {
      api.updateDocument.mockRejectedValue(new DocumentLockedError('d1', '2030-01-01'));
      const { sync, hooks } = makeSync();
      await settle();
      sync.updateDocumentRemote('d1', { name: 'new' });
      expect(api.updateDocument).toHaveBeenCalledWith('p1', 'd1', { name: 'new' });
      expect(sync.changedSinceBuild).toBe(true);
      await settle();
      expect(hooks.conflict).toHaveBeenCalledWith('d1', '2030-01-01');
      expect(sync.connectionError).toBeNull();
    });

    it('deleteDocumentRemote cancels a pending save for that document', async () => {
      const { sync } = makeSync();
      await settle();
      sync.scheduleSaveDocument(doc({ id: 'n' }));
      api.deleteDocument.mockResolvedValue(null);
      sync.deleteDocumentRemote('d1');
      vi.advanceTimersByTime(2000);
      expect(api.updateDocument).not.toHaveBeenCalled();
      expect(api.deleteDocument).toHaveBeenCalledWith('p1', 'd1');
    });
  });

  describe('debounced saves', () => {
    it('coalesces rapid edits into one PATCH with the latest state', async () => {
      const { sync } = makeSync();
      await settle();
      const d = doc({ v: 1 });
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(300);
      (d as { data: unknown }).data = { v: 2 };
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(300);
      (d as { data: unknown }).data = { v: 3 };
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(499);
      expect(api.updateDocument).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
      expect(api.updateDocument).toHaveBeenCalledWith('p1', 'd1', { name: 'doc', root: { v: 3 } });
    });

    it('does not send anything for a document without a root', async () => {
      const { sync } = makeSync();
      await settle();
      sync.scheduleSaveDocument(doc(undefined));
      vi.advanceTimersByTime(1000);
      expect(api.updateDocument).not.toHaveBeenCalled();
    });

    it('an edit during an in-flight save produces another PATCH with the newer state', async () => {
      const resolvers: (() => void)[] = [];
      api.updateDocument.mockImplementation(() => new Promise<null>((resolve) => resolvers.push(() => resolve(null))));
      const { sync } = makeSync();
      await settle();
      const d = doc({ v: 1 });
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(500);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
      (d as { data: unknown }).data = { v: 2 };
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(500);
      expect(api.updateDocument).toHaveBeenCalledTimes(2);
      expect(api.updateDocument.mock.calls[0][2].root).toEqual({ v: 1 });
      expect(api.updateDocument.mock.calls[1][2].root).toEqual({ v: 2 });
      for (const resolve of resolvers) resolve();
    });

    // Saves of one document are not serialised: the second PATCH is sent while the first is still in flight, so a
    // slow first response could in principle be applied by the server after the second. Product decision pending.
    it.todo('serialises PATCHes of one document (the next one waits for the in-flight one)');

    it("passes the tab's own lock owner so a save does not 409 against itself", async () => {
      const { sync, hooks } = makeSync();
      await settle();
      hooks.owner = 'tab-1';
      sync.scheduleSaveDocument(doc({ v: 1 }));
      vi.advanceTimersByTime(500);
      expect(api.updateDocument.mock.calls[0][2]).toEqual({ name: 'doc', root: { v: 1 }, lockOwner: 'tab-1' });
      sync.scheduleSaveCustomDocument(doc(undefined));
      vi.advanceTimersByTime(500);
      expect(api.updateDocument.mock.calls[1][2]).toMatchObject({ lockOwner: 'tab-1' });
      await sync.flushSaveCustomDocument(doc(undefined));
      expect(api.updateDocument.mock.calls[2][2]).toMatchObject({ lockOwner: 'tab-1' });
      hooks.owner = null;
      sync.scheduleSaveDocument(doc({ v: 2 }));
      vi.advanceTimersByTime(500);
      expect(api.updateDocument.mock.calls[3][2]).not.toHaveProperty('lockOwner');
    });

    it('custom documents save their customData', async () => {
      const { sync } = makeSync();
      await settle();
      const d = { id: 'i', name: 'Integrations', type: 'custom', customData: { x: 1 } } as never;
      sync.scheduleSaveCustomDocument(d);
      vi.advanceTimersByTime(500);
      expect(api.updateDocument).toHaveBeenCalledWith('p1', 'i', { name: 'Integrations', data: { x: 1 } });
      expect(sync.changedSinceBuild).toBe(true);
    });

    it('flushSaveCustomDocument cancels the pending debounce and saves at once', async () => {
      const { sync } = makeSync();
      await settle();
      const d = { id: 'i', name: 'I', type: 'custom', customData: { x: 1 } } as never;
      sync.scheduleSaveCustomDocument(d);
      await sync.flushSaveCustomDocument(d);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2000);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
    });
  });

  describe('flushPendingSaves', () => {
    it('sends pending saves immediately and waits for them', async () => {
      let resolveSave: () => void = () => {};
      api.updateDocument.mockImplementation(() => new Promise<null>((resolve) => (resolveSave = () => resolve(null))));
      const { sync } = makeSync();
      await settle();
      sync.scheduleSaveDocument(doc({ v: 1 }));
      let done = false;
      const flushed = sync.flushPendingSaves().then(() => (done = true));
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
      await settle();
      expect(done).toBe(false);
      resolveSave();
      await flushed;
      expect(done).toBe(true);
      vi.advanceTimersByTime(2000);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
    });

    it('resolves immediately with nothing pending', async () => {
      const { sync } = makeSync();
      await settle();
      await sync.flushPendingSaves();
      expect(api.updateDocument).not.toHaveBeenCalled();
    });
  });

  describe('locks', () => {
    it('suspends a save while the document is locked and replays it when unlocked', async () => {
      const { sync, hooks } = makeSync();
      await settle();
      hooks.locked.add('d1');
      sync.scheduleSaveDocument(doc({ v: 1 }));
      vi.advanceTimersByTime(5000);
      expect(api.updateDocument).not.toHaveBeenCalled();

      // still locked: nothing happens, the save is kept
      sync.onLocksChanged();
      vi.advanceTimersByTime(5000);
      expect(api.updateDocument).not.toHaveBeenCalled();

      hooks.locked.delete('d1');
      sync.onLocksChanged();
      vi.advanceTimersByTime(500);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
      expect(api.updateDocument.mock.calls[0][2].root).toEqual({ v: 1 });

      // consumed: a second notification does not resend
      sync.onLocksChanged();
      vi.advanceTimersByTime(2000);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
    });

    it('a locked document drops its earlier debounced timer and keeps only the newest suspended save', async () => {
      const { sync, hooks } = makeSync();
      await settle();
      const d = doc({ v: 1 });
      sync.scheduleSaveDocument(d);
      hooks.locked.add('d1');
      (d as { data: unknown }).data = { v: 2 };
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(5000);
      expect(api.updateDocument).not.toHaveBeenCalled();
      hooks.locked.delete('d1');
      sync.onLocksChanged();
      vi.advanceTimersByTime(500);
      expect(api.updateDocument).toHaveBeenCalledTimes(1);
      expect(api.updateDocument.mock.calls[0][2].root).toEqual({ v: 2 });
    });

    it('flushPendingSaves does not push a lock-suspended save', async () => {
      const { sync, hooks } = makeSync();
      await settle();
      hooks.locked.add('d1');
      sync.scheduleSaveDocument(doc({ v: 1 }));
      await sync.flushPendingSaves();
      expect(api.updateDocument).not.toHaveBeenCalled();
    });

    it('deleting a document forgets its suspended save', async () => {
      const { sync, hooks } = makeSync();
      await settle();
      hooks.locked.add('d1');
      sync.scheduleSaveDocument(doc({ v: 1 }));
      api.deleteDocument.mockResolvedValue(null);
      sync.deleteDocumentRemote('d1');
      hooks.locked.delete('d1');
      sync.onLocksChanged();
      vi.advanceTimersByTime(2000);
      expect(api.updateDocument).not.toHaveBeenCalled();
    });

    it('a 409 on a debounced save reports the conflict and keeps the edit replayable', async () => {
      api.updateDocument.mockRejectedValueOnce(new DocumentLockedError('d1', '2030-01-01T00:00:00Z'));
      const { sync, hooks } = makeSync();
      await settle();
      const d = doc({ v: 1 });
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(500);
      await settle();
      expect(hooks.conflict).toHaveBeenCalledWith('d1', '2030-01-01T00:00:00Z');
      expect(sync.connectionError).toBeNull();
      // the lock poll now knows; the next edit is suspended, and replayed after unlock with the data intact
      hooks.locked.add('d1');
      sync.scheduleSaveDocument(d);
      hooks.locked.delete('d1');
      sync.onLocksChanged();
      vi.advanceTimersByTime(500);
      expect(api.updateDocument).toHaveBeenCalledTimes(2);
      expect(api.updateDocument.mock.calls[1][2].root).toEqual({ v: 1 });
    });

    it('a network error shows in connectionError and the next edit saves again', async () => {
      api.updateDocument.mockRejectedValueOnce(new Error('offline'));
      const { sync } = makeSync();
      await settle();
      const d = doc({ v: 1 });
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(500);
      await settle();
      expect(sync.connectionError).toBe('offline');
      (d as { data: unknown }).data = { v: 2 };
      sync.scheduleSaveDocument(d);
      vi.advanceTimersByTime(500);
      expect(api.updateDocument).toHaveBeenCalledTimes(2);
      expect(api.updateDocument.mock.calls[1][2].root).toEqual({ v: 2 });
    });

    it('a non-Error rejection falls back to a generic message', async () => {
      api.updateDocument.mockRejectedValueOnce('weird');
      const { sync } = makeSync();
      await settle();
      sync.scheduleSaveDocument(doc({ v: 1 }));
      vi.advanceTimersByTime(500);
      await settle();
      expect(sync.connectionError).toBe('Failed to reach the workflow backend');
    });
  });

  describe('build / stop', () => {
    it('build flushes pending saves first, then compiles', async () => {
      const order: string[] = [];
      api.updateDocument.mockImplementation(() => {
        order.push('save');
        return Promise.resolve(null);
      });
      api.build.mockImplementation(() => {
        order.push('build');
        return Promise.resolve({ taskQueue: 'q' });
      });
      const { sync } = makeSync();
      await settle();
      sync.scheduleSaveDocument(doc({ v: 1 }));
      expect(sync.changedSinceBuild).toBe(true);
      sync.suspendedReason = 'balance';
      await sync.buildProject();
      expect(order).toEqual(['save', 'build']);
      expect(sync.buildStatus).toBe('running');
      expect(sync.changedSinceBuild).toBe(false);
      expect(sync.suspendedReason).toBeNull();
    });

    it('compile errors reach buildErrors/buildFiles, not connectionError', async () => {
      const errors = [{ documentId: 'd', message: 'bad' }];
      const files = [{ name: 'a.ts', content: 'x' }];
      api.build.mockRejectedValue(new ApiCompileErrorsError(errors as never, files as never));
      const { sync } = makeSync();
      await settle();
      await sync.buildProject();
      expect(sync.buildStatus).toBe('error');
      expect(sync.buildErrors).toEqual(errors);
      expect(sync.buildFiles).toEqual(files);
      expect(sync.connectionError).toBeNull();
    });

    it('stop success resets, stop failure reports', async () => {
      api.stop.mockResolvedValueOnce(undefined).mockRejectedValueOnce('x');
      const { sync } = makeSync();
      await settle();
      await sync.stopProject();
      expect(sync.buildStatus).toBe('idle');
      await sync.stopProject();
      expect(sync.buildStatus).toBe('error');
      expect(sync.connectionError).toBe('Stop failed');
    });
  });

  describe('publish / prod', () => {
    const suspended = (reason?: string) =>
      new ApiCodedError('suspended', 'project_suspended', reason ? { code: 'project_suspended', reason } : undefined);

    it('publishProject success records the version and tracks the event', async () => {
      const handler = { track: vi.fn() };
      eventTracker.setHandler(handler);
      api.publish.mockResolvedValue({ id: 'v1', version: 3 });
      const { sync } = makeSync();
      await settle();
      await sync.publishProject();
      eventTracker.setHandler(null);
      expect(sync.lastPublishedVersion).toEqual({ id: 'v1', version: 3 });
      expect(sync.hasVersions).toBe(true);
      expect(sync.isPublishing).toBe(false);
      expect(handler.track).toHaveBeenCalledWith('version_published', undefined);
    });

    it('publishProject failure: plain message, localised 402, and suspension pill', async () => {
      const { sync } = makeSync();
      await settle();

      api.publish.mockRejectedValueOnce(new Error('nope'));
      await sync.publishProject();
      expect(sync.connectionError).toBe('nope');
      expect(sync.isPublishing).toBe(false);

      api.publish.mockRejectedValueOnce(new ApiCodedError('x', 'insufficient_balance'));
      await sync.publishProject();
      expect(sync.connectionError).toBe('T:client:start-errors.insufficient-balance');

      api.publish.mockRejectedValueOnce(suspended('admin'));
      await sync.publishProject();
      expect(sync.suspendedReason).toBe('admin');
      expect(sync.connectionError).toBeNull();
    });

    it('a suspension without a recognisable reason defaults to balance; non-Error uses the fallback', async () => {
      const { sync } = makeSync();
      await settle();
      api.startProd.mockRejectedValueOnce(suspended());
      await sync.startProdRunner();
      expect(sync.suspendedReason).toBe('balance');
      api.startProd.mockRejectedValueOnce('boom');
      await sync.startProdRunner();
      expect(sync.connectionError).toBe('Failed to start production');
    });

    it('startProdRunner success marks prod running and clears the suspension', async () => {
      api.startProd.mockResolvedValue(undefined);
      const { sync } = makeSync();
      await settle();
      sync.suspendedReason = 'balance';
      await sync.startProdRunner();
      expect(sync.prodRunning).toBe(true);
      expect(sync.suspendedReason).toBeNull();
      expect(sync.isProdActionLoading).toBe(false);
    });

    it('startProdRunner 423 shows the pill without an inline error', async () => {
      api.startProd.mockRejectedValue(suspended('balance'));
      const { sync } = makeSync();
      await settle();
      await sync.startProdRunner();
      expect(sync.prodRunning).toBe(false);
      expect(sync.suspendedReason).toBe('balance');
      expect(sync.connectionError).toBeNull();
      expect(sync.isProdActionLoading).toBe(false);
    });

    it('stopProdRunner success and failure', async () => {
      api.stopProd.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('cannot stop'));
      const { sync } = makeSync();
      await settle();
      sync.prodRunning = true;
      await sync.stopProdRunner();
      expect(sync.prodRunning).toBe(false);
      sync.prodRunning = true;
      await sync.stopProdRunner();
      expect(sync.prodRunning).toBe(true);
      expect(sync.connectionError).toBe('cannot stop');
      expect(sync.isProdActionLoading).toBe(false);

      api.stopProd.mockRejectedValueOnce('x');
      await sync.stopProdRunner();
      expect(sync.connectionError).toBe('Failed to stop production');
    });
  });
});
