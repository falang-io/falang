// oxlint-disable max-lines -- one fake-IPC harness shared by many small behaviour groups; splitting would duplicate it.
// @vitest-environment jsdom
import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import type { IProjectTree } from '@falang/desktop-project-fs';
import { CMD_INSERT_NODE } from '@falang/scheme';
import { DEVICES_DOCUMENT_TYPE } from '../../shared/devices-document.js';
import { ArduinoProjectStore } from './arduino-project-store.js';
import { driversRegistry } from './drivers-registry-store.js';

const functionRoot = (prefix: string): INode => ({
  id: `${prefix}-root`,
  name: 'function',
  children: [
    { id: `${prefix}-header`, name: 'function-header', data: '' },
    { id: `${prefix}-body`, name: 'function-body', children: [], data: { parameters: [] } },
    { id: `${prefix}-footer`, name: 'function-footer', data: '' },
  ],
});

interface IDocSpec {
  id: string;
  name: string;
  type?: string;
  folderId?: string | null;
  data?: unknown;
}

interface IFakeIpc {
  disk: Map<string, IProjectDocument>;
  tree: IProjectTree;
  locks: { documentId: string }[];
  falang: Record<string, any>;
  emit: (event: { kind: string; documentIds?: string[] }) => void;
}

const setUpIpc = (docs: IDocSpec[]): IFakeIpc => {
  const disk = new Map<string, IProjectDocument>();
  for (const doc of docs) {
    const type = doc.type ?? 'function';
    disk.set(
      doc.id,
      (type === DEVICES_DOCUMENT_TYPE
        ? { id: doc.id, name: doc.name, type, data: doc.data ?? { devices: [], pins: [] } }
        : { id: doc.id, name: doc.name, type, root: functionRoot(doc.id) }) as IProjectDocument,
    );
  }
  const changed: ((event: { kind: string; documentIds?: string[] }) => void)[] = [];
  const ipc: IFakeIpc = {
    disk,
    tree: {
      folders: [],
      documents: docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        type: doc.type ?? 'function',
        folderId: doc.folderId ?? null,
      })),
    } as IProjectTree,
    locks: [],
    emit: (event) => {
      for (const handler of changed) handler(event);
    },
    falang: {},
  };
  ipc.falang = {
    arduino: { getProjectConfig: vi.fn().mockResolvedValue(null) },
    debug: {
      onEvent: vi.fn().mockReturnValue(vi.fn()),
      readBreakpoints: vi.fn().mockResolvedValue([]),
      writeBreakpoints: vi.fn().mockImplementation(() => Promise.resolve()),
    },
    drivers: {
      list: vi.fn().mockResolvedValue({ drivers: [], loadErrors: [] }),
      adoptReferenced: vi.fn().mockResolvedValue({ adopted: [], missing: [] }),
      onChanged: vi.fn().mockReturnValue(vi.fn()),
    },
    document: {
      read: vi.fn(async (_dir: string, id: string) => {
        const doc = disk.get(id);
        if (!doc) throw new Error(`no such document ${id}`);
        return structuredClone(doc);
      }),
      write: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
      rename: vi.fn().mockResolvedValue(null),
      move: vi.fn().mockResolvedValue(null),
    },
    folder: {
      create: vi.fn(async (_dir: string, params: object) => ({ id: 'new-folder', ...params })),
      rename: vi.fn().mockResolvedValue(null),
      move: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
    },
    locks: { read: vi.fn(async () => ipc.locks) },
    project: {
      listTree: vi.fn(async () => structuredClone(ipc.tree)),
      onChanged: vi.fn((handler: (event: { kind: string }) => void) => {
        changed.push(handler);
        return vi.fn();
      }),
      ensureDocuments: vi.fn().mockResolvedValue(undefined),
    },
    versioning: {
      listCommits: vi.fn().mockResolvedValue([]),
      getWorkingCopy: vi.fn().mockResolvedValue({ documents: [] }),
      hasExtraChanges: vi.fn().mockResolvedValue(false),
      getSnapshot: vi.fn().mockResolvedValue({ documents: [] }),
      restore: vi.fn().mockResolvedValue({ id: 'c1' }),
    },
    print: { toPdf: vi.fn().mockResolvedValue(null) },
  };
  (globalThis as { falang?: unknown }).falang = ipc.falang;
  return ipc;
};

const openStore = async (): Promise<ArduinoProjectStore> => {
  const store = new ArduinoProjectStore('/fake/project');
  await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
  return store;
};

const spyOnErrors = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

const settle = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ArduinoProjectStore — watcher: locks and external edits', () => {
  it('a "locks" event re-reads the locks; an unlocked clean document is reloaded from disk and its reload version bumped', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    ipc.locks = [{ documentId: 'a' }];
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.getLock('a')).toBeDefined());
      ipc.disk.set('a', { id: 'a', name: 'alphaRenamed', type: 'function', root: functionRoot('x') } as never);
      ipc.locks = [];
      ipc.emit({ kind: 'locks' });
      await vi.waitFor(() => expect(store.getReloadVersion('a')).toBe(1));
      expect(store.getLock('a')).toBeUndefined();
      expect(store.getDocument('a')?.name).toBe('alphaRenamed');
      expect(store.getDocument('a')?.root?.id).toBe('x-root');
    } finally {
      store.dispose();
    }
  });

  it('while a document is locked, its autosave is held back and flushed once the lock clears', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    ipc.locks = [{ documentId: 'a' }];
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.getLock('a')).toBeDefined());
      const scheme = store.getScheme('a');
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: { id: 'n1', name: 'action', data: 'x = 1' },
        parentId: 'a-body',
      });
      store.saveDocumentNow('a');
      await settle();
      expect(ipc.falang.document.write).not.toHaveBeenCalled();
      ipc.locks = [];
      ipc.emit({ kind: 'locks' });
      await vi.waitFor(() => expect(ipc.falang.document.write).toHaveBeenCalledTimes(1));
      expect(JSON.stringify(ipc.falang.document.write.mock.calls[0][1])).toContain('n1');
      expect(store.getReloadVersion('a')).toBe(0);
    } finally {
      store.dispose();
    }
  });

  it('a changed document that is locked is ignored by the "documents" event', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    ipc.locks = [{ documentId: 'a' }];
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.getLock('a')).toBeDefined());
      ipc.falang.document.read.mockClear();
      ipc.emit({ kind: 'documents', documentIds: ['a'] });
      await settle();
      expect(ipc.falang.document.read).not.toHaveBeenCalled();
      expect(store.getReloadVersion('a')).toBe(0);
    } finally {
      store.dispose();
    }
  });

  it('a dirty document changed on disk is queued for a Reload / Keep-mine decision, once', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    try {
      const scheme = store.getScheme('a');
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: { id: 'n1', name: 'action', data: 'x = 1' },
        parentId: 'a-body',
      });
      ipc.emit({ kind: 'documents', documentIds: ['a'] });
      ipc.emit({ kind: 'documents', documentIds: ['a'] });
      await vi.waitFor(() => expect(store.conflictQueue).toEqual(['a']));
      await settle();
      expect(store.conflictQueue).toEqual(['a']);

      store.resolveConflictKeepMine('a');
      expect(store.conflictQueue).toEqual([]);
      expect(store.getReloadVersion('a')).toBe(0);
    } finally {
      store.dispose();
    }
  });

  it('"Reload" from the conflict modal drops the queue entry and re-reads the file, rebuilding the scheme', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    try {
      const scheme = store.getScheme('a');
      const disposeSpy = vi.spyOn(scheme, 'dispose');
      scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: { id: 'n1', name: 'action', data: 'x = 1' },
        parentId: 'a-body',
      });
      ipc.emit({ kind: 'documents', documentIds: ['a'] });
      await vi.waitFor(() => expect(store.conflictQueue).toEqual(['a']));

      store.resolveConflictReload('a');
      expect(store.conflictQueue).toEqual([]);
      await vi.waitFor(() => expect(store.getReloadVersion('a')).toBe(1));
      expect(disposeSpy).toHaveBeenCalled();
      expect(JSON.stringify(store.getDocument('a')?.root)).not.toContain('n1');
    } finally {
      store.dispose();
    }
  });

  it('an external edit to a document the store has not seen yet refreshes the tree first and then loads it', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    try {
      ipc.disk.set('b', { id: 'b', name: 'beta', type: 'function', root: functionRoot('b') } as never);
      ipc.tree.documents.push({ id: 'b', name: 'beta', type: 'function', folderId: null } as never);
      ipc.emit({ kind: 'documents', documentIds: ['b'] });
      await vi.waitFor(() => expect(store.getDocument('b')?.root?.id).toBe('b-root'));
      expect(store.getReloadVersion('b')).toBe(1);
    } finally {
      store.dispose();
    }
  });

  it('a document deleted externally (read fails) vanishes from the tree and its tab closes', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      ipc.disk.delete('b');
      ipc.emit({ kind: 'documents', documentIds: ['b'] });
      await vi.waitFor(() => expect(store.getDocument('b')).toBeUndefined());
      expect(store.openTabIds).toEqual(['a']);
      expect(store.activeTabId).toBe('a');
    } finally {
      store.dispose();
    }
  });

  it('a "manifest" event keeps object identity, updates names/folders and closes tabs of removed documents', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      const before = store.getDocument('a');
      ipc.tree = {
        folders: [{ id: 'f', name: 'dir', parentId: null }],
        documents: [{ id: 'a', name: 'alphaNew', type: 'function', folderId: 'f' }],
      } as never;
      ipc.emit({ kind: 'manifest' });
      await vi.waitFor(() => expect(store.getDocument('b')).toBeUndefined());
      expect(store.getDocument('a')).toBe(before);
      expect(before?.name).toBe('alphaNew');
      expect(before?.folderId).toBe('f');
      expect(store.folders.map((f) => f.id)).toEqual(['f']);
      expect(store.openTabIds).toEqual(['a']);
    } finally {
      store.dispose();
    }
  });

  it('reports (does not throw on) a failing watcher handler', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    const errors = spyOnErrors();
    try {
      ipc.falang.project.listTree.mockRejectedValueOnce(new Error('disk gone'));
      ipc.emit({ kind: 'manifest' });
      await vi.waitFor(() => expect(errors).toHaveBeenCalledWith('Failed to refresh project tree', expect.any(Error)));
      ipc.falang.locks.read.mockRejectedValueOnce(new Error('no locks'));
      ipc.emit({ kind: 'locks' });
      await vi.waitFor(() =>
        expect(errors).toHaveBeenCalledWith('Failed to refresh document locks', expect.any(Error)),
      );
    } finally {
      store.dispose();
    }
  });
});

describe('ArduinoProjectStore — document operations and pinning', () => {
  it('createDocument with an invalid name is refused: reported, no IPC, no tab', async () => {
    const ipc = setUpIpc([]);
    const store = await openStore();
    const errors = spyOnErrors();
    try {
      expect(store.createDocument('Bad Name')).toBeNull();
      expect(errors).toHaveBeenCalledWith('Invalid function name', expect.any(Error));
      expect(ipc.falang.document.create).not.toHaveBeenCalled();
      expect(store.openTabIds).toEqual([]);
    } finally {
      store.dispose();
    }
  });

  it('createDocument persists it in the given folder, opens and activates the tab', async () => {
    const ipc = setUpIpc([]);
    const store = await openStore();
    try {
      const id = store.createDocument('myFunc', 'f1') as string;
      expect(ipc.falang.document.create).toHaveBeenCalledWith(
        '/fake/project',
        expect.objectContaining({
          folderId: 'f1',
          document: expect.objectContaining({ id, name: 'myFunc', type: 'function' }),
        }),
      );
      expect(store.activeTabId).toBe(id);
      expect(store.getDocument(id)?.folderId).toBe('f1');
    } finally {
      store.dispose();
    }
  });

  it('deletes, renames and moves an ordinary document through IPC', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ]);
    const store = await openStore();
    try {
      store.renameDocument('a', 'alphaTwo');
      expect(store.getDocument('a')?.name).toBe('alphaTwo');
      expect(ipc.falang.document.rename).toHaveBeenCalledWith('/fake/project', 'a', 'alphaTwo');

      store.moveDocument('a', 'f1');
      expect(store.getDocument('a')?.folderId).toBe('f1');
      expect(ipc.falang.document.move).toHaveBeenCalledWith('/fake/project', 'a', 'f1');

      store.openTab('b');
      store.deleteDocument('b');
      expect(store.getDocument('b')).toBeUndefined();
      expect(store.openTabIds).toEqual([]);
      expect(ipc.falang.document.delete).toHaveBeenCalledWith('/fake/project', 'b');
    } finally {
      store.dispose();
    }
  });

  it('renameDocument rejects an invalid name and an unknown id silently', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    const errors = spyOnErrors();
    try {
      store.renameDocument('a', 'not valid');
      expect(store.getDocument('a')?.name).toBe('alpha');
      expect(errors).toHaveBeenCalledWith('Invalid function name', expect.any(Error));
      store.renameDocument('missing', 'ok');
      store.moveDocument('missing', null);
      expect(ipc.falang.document.rename).not.toHaveBeenCalled();
      expect(ipc.falang.document.move).not.toHaveBeenCalled();
    } finally {
      store.dispose();
    }
  });

  it('pinned documents (root setup/loop, Devices) cannot be deleted, renamed or moved; the same names in a folder can', async () => {
    const ipc = setUpIpc([
      { id: 's', name: 'setup' },
      { id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE },
      { id: 'inner', name: 'loop', folderId: 'f' },
    ]);
    const store = await openStore();
    const errors = spyOnErrors();
    try {
      expect(store.isPinned('s')).toBe(true);
      expect(store.isPinned('d')).toBe(true);
      expect(store.isPinned('inner')).toBe(false);
      expect(store.isPinned('unknown')).toBe(false);

      store.deleteDocument('s');
      store.renameDocument('s', 'other');
      store.moveDocument('d', 'f');
      expect(errors).toHaveBeenCalledTimes(3);
      expect(store.getDocument('s')?.name).toBe('setup');
      expect(store.getDocument('d')?.folderId).toBeNull();
      expect(ipc.falang.document.delete).not.toHaveBeenCalled();
      expect(ipc.falang.document.rename).not.toHaveBeenCalled();
      expect(ipc.falang.document.move).not.toHaveBeenCalled();

      store.deleteDocument('inner');
      expect(ipc.falang.document.delete).toHaveBeenCalledWith('/fake/project', 'inner');
    } finally {
      store.dispose();
    }
  });

  it('closing the active tab activates the previous remaining one and disposes its scheme', async () => {
    setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      const scheme = store.getScheme('b');
      const disposeSpy = vi.spyOn(scheme, 'dispose');
      store.closeTab('b');
      expect(disposeSpy).toHaveBeenCalled();
      expect(store.activeTabId).toBe('a');
      store.closeTab('a');
      expect(store.activeTabId).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('getScheme caches per document, throws for unknown ids and for the Devices document', async () => {
    setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE },
    ]);
    const store = await openStore();
    try {
      expect(store.getScheme('a')).toBe(store.getScheme('a'));
      expect(() => store.getScheme('nope')).toThrow('not found');
      expect(() => store.getScheme('d')).toThrow('Devices document');
    } finally {
      store.dispose();
    }
  });

  it('folder operations delegate to IPC', async () => {
    const ipc = setUpIpc([]);
    const store = await openStore();
    try {
      await store.createFolder('dir');
      expect(ipc.falang.folder.create).toHaveBeenCalledWith('/fake/project', { name: 'dir', parentId: null });
      expect(store.folders.map((f) => f.id)).toContain('new-folder');
      store.renameFolder('new-folder', 'dir2');
      expect(ipc.falang.folder.rename).toHaveBeenCalledWith('/fake/project', 'new-folder', 'dir2');
      store.deleteFolder('new-folder');
      expect(ipc.falang.folder.delete).toHaveBeenCalled();
    } finally {
      store.dispose();
    }
  });
});

describe('ArduinoProjectStore — Devices document', () => {
  const deviceData = (driverId: string) => ({
    pins: [],
    devices: [{ id: 'dev1', driverId, name: 'lcd', params: {} }],
  });

  it('getDevicesDocumentData is empty without a Devices document or with unparseable data', async () => {
    setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    try {
      expect(store.getDevicesDocumentData().devices).toEqual([]);
      expect(store.getConnectedDriverIds().size).toBe(0);
    } finally {
      store.dispose();
    }
    setUpIpc([{ id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE, data: { devices: 'garbage' } }]);
    const store2 = await openStore();
    try {
      expect(store2.getDevicesDocumentData().devices).toEqual([]);
    } finally {
      store2.dispose();
    }
  });

  it('setDevicesDocumentData updates the document, schedules a save writing `data` (not `root`)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const ipc = setUpIpc([{ id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE }]);
      const store = new ArduinoProjectStore('/fake/project');
      await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
      try {
        store.setDevicesDocumentData('d', deviceData('lcd1602-i2c') as never);
        expect(store.getConnectedDriverIds().has('lcd1602-i2c')).toBe(true);
        expect(ipc.falang.document.write).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(5000);
        expect(ipc.falang.document.write).toHaveBeenCalledTimes(1);
        const written = ipc.falang.document.write.mock.calls[0][1];
        expect(written).toEqual({
          id: 'd',
          type: DEVICES_DOCUMENT_TYPE,
          name: 'Devices',
          data: deviceData('lcd1602-i2c'),
        });
        expect('root' in written).toBe(false);
        store.setDevicesDocumentData('unknown', deviceData('x') as never);
      } finally {
        store.dispose();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('setDevicesFromAgent bumps the reload version; without a Devices document it throws', async () => {
    setUpIpc([{ id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE }]);
    const store = await openStore();
    try {
      store.setDevicesFromAgent(deviceData('lcd1602-i2c') as never);
      expect(store.getReloadVersion('d')).toBe(1);
      expect(store.getDevicesDocumentData().devices).toHaveLength(1);
    } finally {
      store.dispose();
    }
    setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store2 = await openStore();
    try {
      expect(() => store2.setDevicesFromAgent(deviceData('x') as never)).toThrow('no Devices document');
    } finally {
      store2.dispose();
    }
  });

  it('saving a Devices document that never got data writes nothing', async () => {
    const ipc = setUpIpc([{ id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE }]);
    ipc.disk.set('d', { id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE } as never);
    const store = await openStore();
    try {
      await store.flushPendingSaves();
      store.saveDocumentNow('d');
      store.saveDocumentNow('unknown');
      await settle();
      expect(ipc.falang.document.write).not.toHaveBeenCalled();
    } finally {
      store.dispose();
    }
  });

  it('adopts a library driver referenced by a Devices instance, after the save lands', async () => {
    const ipc = setUpIpc([{ id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE }]);
    const store = await openStore();
    vi.spyOn(driversRegistry, 'scopeOf').mockImplementation((id) => (id === 'libdrv' ? 'library' : 'project'));
    try {
      store.setDevicesDocumentData('d', deviceData('projdrv') as never);
      await settle();
      expect(ipc.falang.drivers.adoptReferenced).not.toHaveBeenCalled();
      store.setDevicesDocumentData('d', deviceData('libdrv') as never);
      await vi.waitFor(() => expect(ipc.falang.drivers.adoptReferenced).toHaveBeenCalledTimes(1));
      expect(ipc.falang.document.write).toHaveBeenCalled();
    } finally {
      store.dispose();
    }
  });
});

describe('ArduinoProjectStore — drivers rebuild, restore, export', () => {
  it('rebuildOpenSchemes disposes built schemes, bumps the reload version of every open tab and keeps undo history', async () => {
    setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      const sa = store.getScheme('a');
      const disposeSpy = vi.spyOn(sa, 'dispose');
      sa.commands.dispatchCommand(CMD_INSERT_NODE, {
        index: 0,
        node: { id: 'n1', name: 'action', data: 'x = 1' },
        parentId: 'a-body',
      });
      store.openTab('a');
      const history = store.getActiveHistory();
      expect(history).not.toBeNull();
      await store.rebuildOpenSchemes();
      expect(disposeSpy).toHaveBeenCalled();
      expect(store.getReloadVersion('a')).toBe(1);
      expect(store.getReloadVersion('b')).toBe(1);
      // the pending doc.root was pinned from the scheme, so the rebuilt scheme keeps the inserted node
      expect(JSON.stringify(store.getDocument('a')?.root)).toContain('n1');
      const rebuilt = store.getScheme('a');
      expect(rebuilt).not.toBe(sa);
      expect(store.getActiveHistory()).toBe(history);
    } finally {
      store.dispose();
    }
  });

  it('refreshDrivers rebuilds only when the driver set changed', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.getScheme('a');
      await store.refreshDrivers();
      expect(store.getReloadVersion('a')).toBe(0);
      ipc.falang.drivers.list.mockResolvedValue({
        drivers: [
          {
            scope: 'project',
            status: 'ok',
            config: { id: 'zz', label: 'ZZ', includes: [], sourceFiles: [], declarations: [], actions: [] },
          },
        ],
        loadErrors: [],
      });
      await store.refreshDrivers();
      expect(store.getReloadVersion('a')).toBe(1);
    } finally {
      store.dispose();
    }
  });

  it('a version restore closes tabs, re-ensures documents, reloads the tree and reopens the previously active tab', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      ipc.tree = { folders: [], documents: [{ id: 'b', name: 'beta', type: 'function', folderId: null }] } as never;
      ipc.disk.delete('a');
      await store.versionHistory.restore('c1');
      await vi.waitFor(() => expect(ipc.falang.project.ensureDocuments).toHaveBeenCalledWith('/fake/project'));
      await vi.waitFor(() => expect(store.documents.map((d) => d.id)).toEqual(['b']));
      await vi.waitFor(() => expect(store.activeTabId).toBe('b'));
      expect(store.openTabIds).toEqual(['b']);
    } finally {
      store.dispose();
    }
  });

  it('a version restore after which the active document is gone leaves no active tab', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    try {
      store.openTab('a');
      ipc.tree = { folders: [], documents: [] } as never;
      await store.versionHistory.restore('c1');
      await vi.waitFor(() => expect(store.documents).toEqual([]));
      expect(store.activeTabId).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('toProjectDocuments is plain JSON (no MobX proxies) with id/type/name/root/data', async () => {
    setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE },
    ]);
    const store = await openStore();
    try {
      const docs = store.toProjectDocuments();
      expect(docs.map((d) => d.id)).toEqual(['a', 'd']);
      expect(() => structuredClone(docs)).not.toThrow();
      expect(docs[0]?.root?.id).toBe('a-root');
      expect(docs[1]?.data).toEqual({ devices: [], pins: [] });
    } finally {
      store.dispose();
    }
  });

  it('print export and version-diff modal flags open and close; Devices is not printable', async () => {
    setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'l', name: 'loop' },
      { id: 's', name: 'setup' },
      { id: 'd', name: 'Devices', type: DEVICES_DOCUMENT_TYPE },
    ]);
    const store = await openStore();
    try {
      expect(store.printExport).toBeNull();
      store.openPrintExport();
      expect(store.printExport).not.toBeNull();
      const first = store.printExport;
      store.openPrintExport();
      expect(store.printExport).not.toBe(first);
      store.closePrintExport();
      expect(store.printExport).toBeNull();

      store.openDiffModal();
      expect(store.diffModalOpen).toBe(true);
      store.closeDiffModal();
      expect(store.diffModalOpen).toBe(false);
    } finally {
      store.dispose();
    }
  });

  it('toggleRightPanel("history") refreshes the commit list; board falls back to the default and reads the project config', async () => {
    const ipc = setUpIpc([]);
    ipc.falang.arduino.getProjectConfig.mockResolvedValue({ board: 'arduino:avr:mega' });
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.board).toBe('arduino:avr:mega'));
      ipc.falang.versioning.listCommits.mockClear();
      store.toggleRightPanel('history');
      await vi.waitFor(() => expect(ipc.falang.versioning.listCommits).toHaveBeenCalled());
      store.toggleRightPanel('agent');
      expect(store.rightPanel).toBe('agent');
    } finally {
      store.dispose();
    }
  });

  it('debugSketch pauses on entry only while no breakpoints are set', async () => {
    setUpIpc([]);
    const store = await openStore();
    try {
      const start = vi.spyOn(store.debugSession, 'start').mockResolvedValue(undefined as never);
      await store.debugSketch('arduino:avr:uno', '/dev/ttyUSB0');
      expect(start).toHaveBeenCalledWith({
        pauseOnEntry: true,
        entry: { fqbn: 'arduino:avr:uno', port: '/dev/ttyUSB0' },
      });
    } finally {
      store.dispose();
    }
  });

  it('dispose flushes a pending autosave instead of dropping it', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    const scheme = store.getScheme('a');
    scheme.commands.dispatchCommand(CMD_INSERT_NODE, {
      index: 0,
      node: { id: 'n1', name: 'action', data: 'x = 1' },
      parentId: 'a-body',
    });
    store.dispose();
    await vi.waitFor(() => expect(ipc.falang.document.write).toHaveBeenCalledTimes(1));
  });

  it('saveAllOpenTabsNow writes every open tab', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'alpha' },
      { id: 'b', name: 'beta' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      store.saveAllOpenTabsNow();
      await vi.waitFor(() => expect(ipc.falang.document.write).toHaveBeenCalledTimes(2));
    } finally {
      store.dispose();
    }
  });

  it('validation counts are zero for unbuilt and clean documents', async () => {
    setUpIpc([{ id: 'a', name: 'alpha' }]);
    const store = await openStore();
    try {
      expect(store.getValidationCounts('a')).toEqual({ errors: 0, warnings: 0 });
      store.getScheme('a');
      expect(store.getValidationCounts('a')).toEqual({ errors: 0, warnings: 0 });
      expect(store.getValidationCounts('unknown')).toEqual({ errors: 0, warnings: 0 });
    } finally {
      store.dispose();
    }
  });
});
