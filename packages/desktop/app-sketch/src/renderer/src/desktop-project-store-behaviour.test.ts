// oxlint-disable typescript-eslint/no-explicit-any, require-await, no-undefined, unicorn/no-useless-undefined, no-promise-executor-return, unicorn/consistent-function-scoping, unicorn/no-object-as-default-parameter -- fake-IPC harness: loosely typed `window.falang` stand-in, async mock fns and resolver capture
// @vitest-environment jsdom
// oxlint-disable max-lines -- one fake-IPC harness shared by many small behaviour groups; splitting would duplicate it.
import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INode, IProjectDocument } from '@falang/dto';
import type { IProjectTree } from '@falang/desktop-project-fs';
import { diffNodeTrees } from '@falang/versioning';
import { DesktopProjectStore } from './desktop-project-store.js';

const functionRoot = (prefix: string, bodyData: unknown = { parameters: [] }): INode => ({
  id: `${prefix}-root`,
  name: 'function',
  children: [
    { id: `${prefix}-header`, name: 'function-header', data: '' },
    { id: `${prefix}-body`, name: 'function-body', children: [], data: bodyData },
    { id: `${prefix}-footer`, name: 'function-footer', data: '' },
  ],
});

interface IFakeDocSpec {
  id: string;
  name: string;
  type: string;
  folderId?: string | null;
  root?: INode;
}

interface IFakeIpc {
  /** What `document.read` serves — mutate to simulate an external edit. */
  disk: Map<string, IProjectDocument>;
  tree: IProjectTree;
  locks: { documentId: string }[];
  falang: Record<string, any>;
  emit: (event: { kind: string; documentIds?: string[] }) => void;
  unsubscribeChanged: ReturnType<typeof vi.fn>;
  progressHandlers: ((requestId: string, progress: { done: number; total: number; label: string }) => void)[];
}

const setUpIpc = (docs: IFakeDocSpec[], folders: IProjectTree['folders'] = []): IFakeIpc => {
  const disk = new Map<string, IProjectDocument>();
  for (const doc of docs) {
    disk.set(doc.id, {
      id: doc.id,
      name: doc.name,
      type: doc.type,
      root: doc.root ?? functionRoot(doc.id),
    } as IProjectDocument);
  }
  const tree: IProjectTree = {
    folders,
    documents: docs.map((doc) => ({ id: doc.id, name: doc.name, type: doc.type, folderId: doc.folderId ?? null })),
  } as IProjectTree;
  const changedHandlers: ((event: { kind: string; documentIds?: string[] }) => void)[] = [];
  const unsubscribeChanged = vi.fn();
  const progressHandlers: IFakeIpc['progressHandlers'] = [];
  const ipc: IFakeIpc = {
    disk,
    tree,
    locks: [],
    unsubscribeChanged,
    progressHandlers,
    emit: (event) => {
      for (const handler of changedHandlers) handler(event);
    },
    falang: {},
  };
  ipc.falang = {
    project: {
      listTree: vi.fn(async () => structuredClone(ipc.tree)),
      onChanged: vi.fn((handler: (event: { kind: string }) => void) => {
        changedHandlers.push(handler);
        return unsubscribeChanged;
      }),
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
      create: vi.fn(async (_dir: string, params: { name: string; parentId: string | null }) => ({
        id: 'new-folder',
        ...params,
      })),
      rename: vi.fn().mockResolvedValue(null),
      move: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
    },
    locks: { read: vi.fn(async () => ipc.locks) },
    logicExport: {
      onProgress: vi.fn((handler: IFakeIpc['progressHandlers'][number]) => {
        progressHandlers.push(handler);
        return vi.fn();
      }),
      readConfig: vi.fn().mockResolvedValue(null),
      writeConfig: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({ result: { items: [] } }),
    },
    codeExport: {
      onProgress: vi.fn().mockReturnValue(vi.fn()),
      run: vi.fn().mockResolvedValue({ result: { items: [] } }),
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

const openStore = async (projectType = 'logic'): Promise<DesktopProjectStore> => {
  const store = new DesktopProjectStore('/fake/project', projectType);
  await vi.waitFor(() => expect(store.isLoadingTree).toBe(false));
  return store;
};

const spyOnReportedErrors = () => vi.spyOn(console, 'error').mockImplementation(() => undefined);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DesktopProjectStore — watcher events (ADR 0029 (private))', () => {
  it('a "manifest" event refreshes names in place, keeping object identity, and closes tabs of vanished documents', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'aaa', type: 'function' },
      { id: 'b', name: 'bbb', type: 'function' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      const before = store.getDocument('a');
      ipc.tree = {
        folders: [],
        documents: [{ id: 'a', name: 'renamed', type: 'function', folderId: null }],
      } as IProjectTree;
      ipc.emit({ kind: 'manifest' });
      await vi.waitFor(() => expect(store.documents.map((d) => d.id)).toEqual(['a']));
      expect(store.getDocument('a')).toBe(before);
      expect(before?.name).toBe('renamed');
      expect(store.openTabIds).toEqual(['a']);
      expect(store.activeTabId).toBe('a');
    } finally {
      store.dispose();
    }
  });

  it('a "manifest" event adds documents created externally (without reading their content)', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      ipc.tree = {
        folders: [{ id: 'f1', name: 'dir', parentId: null }],
        documents: [
          { id: 'a', name: 'aaa', type: 'function', folderId: null },
          { id: 'z', name: 'zzz', type: 'function', folderId: 'f1' },
        ],
      } as IProjectTree;
      ipc.emit({ kind: 'manifest' });
      await vi.waitFor(() => expect(store.getDocument('z')).toMatchObject({ name: 'zzz', folderId: 'f1' }));
      expect(store.folders.map((f) => f.id)).toEqual(['f1']);
      expect(store.getDocument('z')?.root).toBeUndefined();
    } finally {
      store.dispose();
    }
  });

  it('a "document" event on a clean document reloads it from disk and forces a scheme remount', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      const firstScheme = store.getScheme('a');
      const disposeSpy = vi.spyOn(firstScheme, 'dispose');
      expect(store.getReloadVersion('a')).toBe(0);
      ipc.disk.set('a', {
        id: 'a',
        name: 'edited-on-disk',
        type: 'function',
        root: functionRoot('a2'),
      } as IProjectDocument);
      ipc.emit({ kind: 'document', documentIds: ['a'] });
      await vi.waitFor(() => expect(store.getReloadVersion('a')).toBe(1));
      expect(disposeSpy).toHaveBeenCalled();
      expect(store.getDocument('a')?.name).toBe('edited-on-disk');
      expect(store.getDocument('a')?.root?.id).toBe('a2-root');
      expect(store.getScheme('a')).not.toBe(firstScheme);
    } finally {
      store.dispose();
    }
  });

  it('a "document" event with no ids does nothing', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      const readsBefore = ipc.falang.document.read.mock.calls.length;
      ipc.emit({ kind: 'document' });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(ipc.falang.document.read.mock.calls.length).toBe(readsBefore);
    } finally {
      store.dispose();
    }
  });

  it('a "document" event for a document deleted on disk drops it from the tree and tabs', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'aaa', type: 'function' },
      { id: 'b', name: 'bbb', type: 'function' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      ipc.disk.delete('b');
      ipc.emit({ kind: 'document', documentIds: ['b'] });
      await vi.waitFor(() => expect(store.getDocument('b')).toBeUndefined());
      expect(store.openTabIds).toEqual(['a']);
    } finally {
      store.dispose();
    }
  });

  it('a "document" event for a document created externally refreshes the tree first, then loads it', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      ipc.disk.set('n', { id: 'n', name: 'newOne', type: 'function', root: functionRoot('n') } as IProjectDocument);
      ipc.tree = {
        folders: [],
        documents: [
          { id: 'a', name: 'aaa', type: 'function', folderId: null },
          { id: 'n', name: 'newOne', type: 'function', folderId: null },
        ],
      } as IProjectTree;
      ipc.emit({ kind: 'document', documentIds: ['n'] });
      await vi.waitFor(() => expect(store.getDocument('n')?.root?.id).toBe('n-root'));
    } finally {
      store.dispose();
    }
  });

  it('a changed document that is unknown even after a tree refresh is ignored', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      ipc.disk.set('ghost', { id: 'ghost', name: 'g', type: 'function', root: functionRoot('g') } as IProjectDocument);
      ipc.emit({ kind: 'document', documentIds: ['ghost'] });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(store.getDocument('ghost')).toBeUndefined();
      expect(store.documents).toHaveLength(1);
    } finally {
      store.dispose();
    }
  });

  it('a dirty document queues a Reload / Keep-mine conflict instead of being clobbered (queued once)', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      // `scheduleSave` is what a scheme edit does; calling it marks the document dirty.
      (store as unknown as { scheduleSave: (id: string) => void }).scheduleSave('a');
      const reads = ipc.falang.document.read.mock.calls.length;
      ipc.emit({ kind: 'document', documentIds: ['a'] });
      ipc.emit({ kind: 'document', documentIds: ['a'] });
      await vi.waitFor(() => expect(store.conflictQueue).toEqual(['a']));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(store.conflictQueue).toEqual(['a']);
      expect(ipc.falang.document.read.mock.calls.length).toBe(reads);

      store.resolveConflictKeepMine('a');
      expect(store.conflictQueue).toEqual([]);
      expect(ipc.falang.document.read.mock.calls.length).toBe(reads);
    } finally {
      store.dispose();
    }
  });

  it('"Reload" on a conflict clears the queue entry and re-reads the file', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      (store as unknown as { scheduleSave: (id: string) => void }).scheduleSave('a');
      ipc.emit({ kind: 'document', documentIds: ['a'] });
      await vi.waitFor(() => expect(store.conflictQueue).toEqual(['a']));
      ipc.disk.set('a', { id: 'a', name: 'aaa', type: 'function', root: functionRoot('fresh') } as IProjectDocument);
      store.resolveConflictReload('a');
      expect(store.conflictQueue).toEqual([]);
      await vi.waitFor(() => expect(store.getDocument('a')?.root?.id).toBe('fresh-root'));
      expect(store.getReloadVersion('a')).toBe(1);
    } finally {
      store.dispose();
    }
  });

  it('a locked document is skipped entirely by "document" events', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    ipc.locks = [{ documentId: 'a' }];
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.getLock('a')).toBeDefined());
      const reads = ipc.falang.document.read.mock.calls.length;
      ipc.emit({ kind: 'document', documentIds: ['a'] });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(ipc.falang.document.read.mock.calls.length).toBe(reads);
      expect(store.conflictQueue).toEqual([]);
    } finally {
      store.dispose();
    }
  });

  it('a lock that clears reloads a document with nothing pending', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    ipc.locks = [{ documentId: 'a' }];
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.getLock('a')).toBeDefined());
      ipc.disk.set('a', { id: 'a', name: 'aaa', type: 'function', root: functionRoot('mcp') } as IProjectDocument);
      ipc.locks = [];
      ipc.emit({ kind: 'locks' });
      await vi.waitFor(() => expect(store.getDocument('a')?.root?.id).toBe('mcp-root'));
      expect(store.getLock('a')).toBeUndefined();
    } finally {
      store.dispose();
    }
  });

  it('a lock that clears flushes a pending autosave instead of reloading', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    ipc.locks = [{ documentId: 'a' }];
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.getLock('a')).toBeDefined());
      (store as unknown as { scheduleSave: (id: string) => void }).scheduleSave('a');
      const reads = ipc.falang.document.read.mock.calls.length;
      ipc.locks = [];
      ipc.emit({ kind: 'locks' });
      await vi.waitFor(() => expect(ipc.falang.document.write).toHaveBeenCalledTimes(1));
      expect(ipc.falang.document.read.mock.calls.length).toBe(reads);
    } finally {
      store.dispose();
    }
  });

  it('failures while handling an event are reported, not thrown', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    const errors = spyOnReportedErrors();
    try {
      ipc.falang.project.listTree.mockRejectedValueOnce(new Error('disk gone'));
      ipc.emit({ kind: 'manifest' });
      await vi.waitFor(() => expect(errors).toHaveBeenCalledWith('Failed to refresh project tree', expect.any(Error)));
      ipc.falang.locks.read.mockRejectedValueOnce(new Error('locks gone'));
      ipc.emit({ kind: 'locks' });
      await vi.waitFor(() =>
        expect(errors).toHaveBeenCalledWith('Failed to refresh document locks', expect.any(Error)),
      );
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — exports', () => {
  it('exportLogicCode sends plain documents plus the configured exports and tracks progress while running', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    ipc.falang.logicExport.readConfig.mockResolvedValue({ exports: [{ language: 'cpp', path: 'out/falang.cpp' }] });
    const store = await openStore();
    try {
      await vi.waitFor(() => expect(store.logicExportConfiguration.getConfig().exports).toHaveLength(1));
      let release: (value: unknown) => void = () => undefined;
      ipc.falang.logicExport.run.mockImplementation(() => new Promise((resolve) => (release = resolve)));
      const pending = store.exportLogicCode();
      expect(store.exportProgress.active).toBe(true);
      const [requestId, projectDir, payload] = ipc.falang.logicExport.run.mock.calls[0] ?? [];
      expect(projectDir).toBe('/fake/project');
      expect(payload.exports).toEqual([{ language: 'cpp', path: 'out/falang.cpp' }]);
      expect(payload.documents.map((d: IProjectDocument) => d.id)).toEqual(['a']);
      expect(() => structuredClone(payload)).not.toThrow();
      // progress events reach the store through the subscription made in the constructor
      ipc.progressHandlers[0]?.(requestId, { done: 1, total: 4, label: 'compiling' });
      expect(store.exportProgress.done).toBe(1);
      expect(store.exportProgress.label).toBe('compiling');
      release({ result: { marker: 'ok' } });
      await expect(pending).resolves.toEqual({ marker: 'ok' });
      expect(store.exportProgress.active).toBe(false);
    } finally {
      store.dispose();
    }
  });

  it('exportLogicCode finishes the progress tracker even when the run rejects', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      ipc.falang.logicExport.run.mockRejectedValue(new Error('worker died'));
      await expect(store.exportLogicCode()).rejects.toThrow('worker died');
      expect(store.exportProgress.active).toBe(false);
    } finally {
      store.dispose();
    }
  });

  it('exportCodeDocuments sends only simple-code documents', async () => {
    const ipc = setUpIpc(
      [
        { id: 'c', name: 'code', type: 'simple-code-cpp', root: { id: 'c-root', name: 'function' } },
        { id: 'f', name: 'fn', type: 'function' },
      ],
      [],
    );
    const store = await openStore('simple-code-cpp');
    try {
      ipc.falang.codeExport.run.mockResolvedValue({ result: { marker: 'code' } });
      await expect(store.exportCodeDocuments()).resolves.toEqual({ marker: 'code' });
      const [, dir, payload] = ipc.falang.codeExport.run.mock.calls[0] ?? [];
      expect(dir).toBe('/fake/project');
      expect(payload.documents.map((d: IProjectDocument) => d.id)).toEqual(['c']);
      expect(store.exportProgress.active).toBe(false);
    } finally {
      store.dispose();
    }
  });

  it('saveLogicExportConfiguration writes the current configuration', async () => {
    const ipc = setUpIpc([]);
    const store = await openStore();
    try {
      await store.saveLogicExportConfiguration();
      expect(ipc.falang.logicExport.writeConfig).toHaveBeenCalledWith(
        '/fake/project',
        store.logicExportConfiguration.getConfig(),
      );
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — folder and document operations', () => {
  const folders = [
    { id: 'f1', name: 'one', parentId: null },
    { id: 'f2', name: 'two', parentId: 'f1' },
    { id: 'f3', name: 'three', parentId: 'f2' },
  ];

  it('createFolder adds the folder returned by main', async () => {
    const ipc = setUpIpc([]);
    const store = await openStore();
    try {
      await store.createFolder('fresh', 'f9');
      expect(ipc.falang.folder.create).toHaveBeenCalledWith('/fake/project', { name: 'fresh', parentId: 'f9' });
      expect(store.folders.map((f) => f.id)).toEqual(['new-folder']);
    } finally {
      store.dispose();
    }
  });

  it('renameFolder updates state and tells main; an unknown folder is a no-op', async () => {
    const ipc = setUpIpc([], folders);
    const store = await openStore();
    try {
      store.renameFolder('f1', 'renamed');
      expect(store.folders.find((f) => f.id === 'f1')?.name).toBe('renamed');
      expect(ipc.falang.folder.rename).toHaveBeenCalledWith('/fake/project', 'f1', 'renamed');
      store.renameFolder('nope', 'x');
      expect(ipc.falang.folder.rename).toHaveBeenCalledTimes(1);
    } finally {
      store.dispose();
    }
  });

  it('moveFolder refuses a move into itself or its own descendant, accepts a legal one', async () => {
    const ipc = setUpIpc([], folders);
    const store = await openStore();
    try {
      store.moveFolder('f1', 'f1');
      store.moveFolder('f1', 'f3');
      store.moveFolder('missing', null);
      expect(ipc.falang.folder.move).not.toHaveBeenCalled();
      expect(store.folders.find((f) => f.id === 'f1')?.parentId).toBeNull();

      store.moveFolder('f3', null);
      expect(store.folders.find((f) => f.id === 'f3')?.parentId).toBeNull();
      expect(ipc.falang.folder.move).toHaveBeenCalledWith('/fake/project', 'f3', null);
    } finally {
      store.dispose();
    }
  });

  it('deleteFolder removes the subtree, its documents and their tabs', async () => {
    const ipc = setUpIpc(
      [
        { id: 'in-f2', name: 'inner', type: 'function', folderId: 'f2' },
        { id: 'outside', name: 'outer', type: 'function', folderId: null },
      ],
      folders,
    );
    const store = await openStore();
    try {
      store.openTab('in-f2');
      store.openTab('outside');
      store.deleteFolder('f2');
      expect(store.folders.map((f) => f.id)).toEqual(['f1']);
      expect(store.documents.map((d) => d.id)).toEqual(['outside']);
      expect(store.openTabIds).toEqual(['outside']);
      expect(ipc.falang.folder.delete).toHaveBeenCalledWith('/fake/project', 'f2');
    } finally {
      store.dispose();
    }
  });

  it('createDocument tells main with the default root and opens the tab; rename/move/delete follow', async () => {
    const ipc = setUpIpc([], folders);
    const store = await openStore();
    try {
      const id = store.createDocument('function', 'myFn', 'f1');
      expect(ipc.falang.document.create).toHaveBeenCalledWith(
        '/fake/project',
        expect.objectContaining({
          folderId: 'f1',
          document: expect.objectContaining({ id, type: 'function', name: 'myFn' }),
        }),
      );
      expect(store.activeTabId).toBe(id);

      store.renameDocument(id, 'otherFn');
      expect(store.getDocument(id)?.name).toBe('otherFn');
      expect(ipc.falang.document.rename).toHaveBeenCalledWith('/fake/project', id, 'otherFn');
      store.renameDocument('unknown', 'zzz');
      expect(ipc.falang.document.rename).toHaveBeenCalledTimes(1);

      store.moveDocument(id, 'f2');
      expect(store.getDocument(id)?.folderId).toBe('f2');
      expect(ipc.falang.document.move).toHaveBeenCalledWith('/fake/project', id, 'f2');
      store.moveDocument('unknown', null);
      expect(ipc.falang.document.move).toHaveBeenCalledTimes(1);

      store.deleteDocument(id);
      expect(store.getDocument(id)).toBeUndefined();
      expect(store.openTabIds).toEqual([]);
      expect(ipc.falang.document.delete).toHaveBeenCalledWith('/fake/project', id);
    } finally {
      store.dispose();
    }
  });

  it('IPC failures of fire-and-forget operations are reported, not thrown', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }], folders);
    const store = await openStore();
    const errors = spyOnReportedErrors();
    try {
      ipc.falang.folder.rename.mockRejectedValue(new Error('x'));
      ipc.falang.folder.move.mockRejectedValue(new Error('x'));
      ipc.falang.folder.delete.mockRejectedValue(new Error('x'));
      ipc.falang.document.rename.mockRejectedValue(new Error('x'));
      ipc.falang.document.move.mockRejectedValue(new Error('x'));
      ipc.falang.document.delete.mockRejectedValue(new Error('x'));
      ipc.falang.document.create.mockRejectedValue(new Error('x'));
      store.renameFolder('f1', 'n');
      store.moveFolder('f3', null);
      store.deleteFolder('f1');
      store.renameDocument('a', 'bbb');
      store.moveDocument('a', null);
      store.deleteDocument('a');
      store.createDocument('function', 'newOne');
      await vi.waitFor(() => {
        const messages = errors.mock.calls.map((call) => call[0]);
        for (const expected of [
          'Failed to rename folder',
          'Failed to move folder',
          'Failed to delete folder',
          'Failed to rename document',
          'Failed to move document',
          'Failed to delete document',
          'Failed to create document',
        ]) {
          expect(messages).toContain(expected);
        }
      });
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — schemes, history, tabs', () => {
  it('getScheme throws for an unknown document and caches the scheme per document', async () => {
    setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      expect(() => store.getScheme('nope')).toThrow('Document nope not found');
      expect(store.getScheme('a')).toBe(store.getScheme('a'));
    } finally {
      store.dispose();
    }
  });

  it('closing a tab disposes its scheme; the active tab falls back to the last remaining one', async () => {
    setUpIpc([
      { id: 'a', name: 'aaa', type: 'function' },
      { id: 'b', name: 'bbb', type: 'function' },
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
      expect(store.getScheme('b')).not.toBe(scheme);
    } finally {
      store.dispose();
    }
  });

  it('getActiveHistory is null when the active tab points at a document that no longer exists', async () => {
    setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      store.openTab('ghost');
      expect(store.getActiveHistory()).toBeNull();
      expect(store.getAgentActiveDocumentId()).toBeNull();
    } finally {
      store.dispose();
    }
  });

  it('a link click inside a scheme opens the linked document, but only when it exists', async () => {
    setUpIpc([
      { id: 'a', name: 'aaa', type: 'function' },
      { id: 'b', name: 'bbb', type: 'function' },
    ]);
    const store = await openStore();
    try {
      const { EVENT_LINK_CLICKED } = await import('@falang/text-scheme');
      const scheme = store.getScheme('a');
      scheme.events.fireEvent(EVENT_LINK_CLICKED, { documentId: 'b' } as never);
      expect(store.openTabIds).toEqual(['b']);
      scheme.events.fireEvent(EVENT_LINK_CLICKED, { documentId: 'missing' } as never);
      expect(store.openTabIds).toEqual(['b']);
    } finally {
      store.dispose();
    }
  });

  it('saveAllOpenTabsNow writes every open tab (not closed ones)', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'aaa', type: 'function' },
      { id: 'b', name: 'bbb', type: 'function' },
      { id: 'c', name: 'ccc', type: 'function' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      store.saveAllOpenTabsNow();
      await vi.waitFor(() => expect(ipc.falang.document.write).toHaveBeenCalledTimes(2));
      const written = ipc.falang.document.write.mock.calls.map((call) => call[1].id).toSorted();
      expect(written).toEqual(['a', 'b']);
    } finally {
      store.dispose();
    }
  });

  it('a failed save is reported, not thrown', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    const errors = spyOnReportedErrors();
    try {
      ipc.falang.document.write.mockRejectedValue(new Error('disk full'));
      store.saveDocumentNow('a');
      await vi.waitFor(() => expect(errors).toHaveBeenCalledWith('Failed to save document', expect.any(Error)));
    } finally {
      store.dispose();
    }
  });

  it('a document without a loaded root is never written', async () => {
    const ipc = setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      const doc = store.getDocument('a');
      if (doc) doc.root = undefined;
      store.saveDocumentNow('a');
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(ipc.falang.document.write).not.toHaveBeenCalled();
    } finally {
      store.dispose();
    }
  });

  it('dispose unsubscribes from main and cancels the agent session', async () => {
    const ipc = setUpIpc([]);
    const store = await openStore();
    const cancel = vi.spyOn(store.agentSession, 'cancel');
    store.dispose();
    expect(ipc.unsubscribeChanged).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalled();
  });

  it('getValidationCounts is zero for a document without validation', async () => {
    setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore('text');
    try {
      store.getScheme('a');
      expect(store.getValidationCounts('a')).toEqual({ errors: 0, warnings: 0 });
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — PDF export (ADR 0048 (private))', () => {
  it('lists printable documents in tree order with the active one flagged, then saves through print.toPdf', async () => {
    const ipc = setUpIpc(
      [
        { id: 'root-doc', name: 'rootDoc', type: 'function', folderId: null },
        { id: 'nested', name: 'nested', type: 'function', folderId: 'f1' },
        { id: 'custom', name: 'custom', type: 'not-a-scheme-type', folderId: null },
      ],
      [{ id: 'f1', name: 'dir', parentId: null }],
    );
    const store = await openStore();
    try {
      store.openTab('root-doc');
      store.openPrintExport();
      const print = store.printExport;
      expect(print).not.toBeNull();
      // folders come first (depth-first), then the folder-less documents; the unknown type is not printable
      expect(print?.documents.map((d) => [d.id, d.isActive])).toEqual([
        ['nested', false],
        ['root-doc', true],
      ]);
      print?.selectActiveOnly();
      print?.startPreview();
      expect(print?.pages.map((p) => p.documentId)).toEqual(['root-doc']);
      print?.markMeasured('root-doc', { left: 0, right: 100, width: 100, height: 100 } as never);
      await print?.save();
      expect(ipc.falang.print.toPdf).toHaveBeenCalledWith({ suggestedFileName: expect.stringContaining('project') });
    } finally {
      store.dispose();
    }
  });

  it('a live scheme is what gets printed (unsaved edits included); closing the modal disposes the state', async () => {
    setUpIpc([{ id: 'a', name: 'aaa', type: 'function' }]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.getScheme('a');
      store.openPrintExport();
      const first = store.printExport;
      first?.startPreview();
      expect(first?.pages).toHaveLength(1);
      store.openPrintExport();
      expect(store.printExport).not.toBe(first);
      store.closePrintExport();
      expect(store.printExport).toBeNull();
    } finally {
      store.dispose();
    }
  });
});

describe('DesktopProjectStore — version history', () => {
  it('opening the history panel refreshes the commit list; the agent panel does not', async () => {
    const ipc = setUpIpc([]);
    const store = await openStore();
    try {
      store.toggleRightPanel('agent');
      expect(ipc.falang.versioning.listCommits).not.toHaveBeenCalled();
      store.toggleRightPanel('history');
      expect(store.rightPanel).toBe('history');
      await vi.waitFor(() => expect(ipc.falang.versioning.listCommits).toHaveBeenCalledWith('/fake/project'));
    } finally {
      store.dispose();
    }
  });

  it('diff modal opens and closes', async () => {
    setUpIpc([]);
    const store = await openStore();
    try {
      store.openDiffModal();
      expect(store.diffModalOpen).toBe(true);
      store.closeDiffModal();
      expect(store.diffModalOpen).toBe(false);
    } finally {
      store.dispose();
    }
  });

  it('builds a read-only scheme for one side of a diff', async () => {
    setUpIpc([]);
    const store = await openStore();
    try {
      const left = functionRoot('v1');
      const right = functionRoot('v1', { parameters: [{ name: 'x' }] });
      const scheme = store.buildReadOnlySchemeForDiff(
        { id: 'd', type: 'function', name: 'fn', folderId: null, pinned: false, root: right },
        diffNodeTrees(left, right),
        'right',
      );
      expect(scheme).not.toBeNull();
      scheme?.dispose();
    } finally {
      store.dispose();
    }
  });

  it('a restore closes every tab, reloads the tree and reopens the previously active tab if it survives', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'aaa', type: 'function' },
      { id: 'b', name: 'bbb', type: 'function' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      store.openTab('b');
      const schemeB = store.getScheme('b');
      const disposeSpy = vi.spyOn(schemeB, 'dispose');
      ipc.disk.set('b', {
        id: 'b',
        name: 'restored',
        type: 'function',
        root: functionRoot('restored'),
      } as IProjectDocument);
      ipc.tree = {
        folders: [],
        documents: [{ id: 'b', name: 'restored', type: 'function', folderId: null }],
      } as IProjectTree;
      const configReads = ipc.falang.logicExport.readConfig.mock.calls.length;
      await store.versionHistory.restore('c1');
      await vi.waitFor(() => expect(store.documents.map((d) => d.id)).toEqual(['b']));
      await vi.waitFor(() => expect(store.activeTabId).toBe('b'));
      expect(ipc.falang.versioning.restore).toHaveBeenCalledWith('/fake/project', 'c1');
      expect(disposeSpy).toHaveBeenCalled();
      expect(store.openTabIds).toEqual(['b']);
      expect(store.getDocument('b')?.root?.id).toBe('restored-root');
      expect(ipc.falang.logicExport.readConfig.mock.calls.length).toBeGreaterThan(configReads);
    } finally {
      store.dispose();
    }
  });

  it('a restore that removed the previously active document does not reopen it (a lone remaining document is auto-opened)', async () => {
    const ipc = setUpIpc([
      { id: 'a', name: 'aaa', type: 'function' },
      { id: 'b', name: 'bbb', type: 'function' },
    ]);
    const store = await openStore();
    try {
      store.openTab('a');
      ipc.disk.delete('a');
      ipc.tree = {
        folders: [],
        documents: [{ id: 'b', name: 'bbb', type: 'function', folderId: null }],
      } as IProjectTree;
      await store.versionHistory.restore('c1');
      await vi.waitFor(() => expect(store.documents.map((d) => d.id)).toEqual(['b']));
      expect(store.openTabIds).toEqual(['b']);
      expect(store.activeTabId).toBe('b');
      expect(store.openTabIds).not.toContain('a');
    } finally {
      store.dispose();
    }
  });
});
