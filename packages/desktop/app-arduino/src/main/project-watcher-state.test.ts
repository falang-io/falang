// oxlint-disable max-lines, require-await, no-promise-executor-return, no-await-expression-member, no-non-null-assertion, no-empty-function, no-undefined, consistent-type-imports, no-var-requires, prefer-module, prefer-event-target, consistent-function-scoping, init-declarations, no-useless-undefined -- test scaffolding: fake electron/BrowserWindow stand-ins, timer waits and loose fixtures read better with these stylistic rules off
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({}));

import { createDocument, createFolder, createProject, listTree, writeDocument } from '@falang/desktop-project-fs';
import { IPC } from '../shared/ipc-channels.js';
import {
  documentIdsInFolder,
  markOwnDocumentWrite,
  markOwnDriversWrite,
  startProjectWatcher,
  stopProjectWatcher,
  withOwnDocumentMoves,
} from './project-watcher-state.js';

const doc = (id: string, name: string) => ({ id, type: 'function', name, root: undefined });
const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

describe('project-watcher-state', () => {
  let dir = '';
  const send = vi.fn();
  const win = { webContents: { send } };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-watch-'));
    await createProject(dir, { name: 'P', type: 'arduino' });
    send.mockReset();
  });
  afterEach(async () => {
    stopProjectWatcher();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('no-ops safely without an active watcher', () => {
    expect(() => {
      stopProjectWatcher();
      markOwnDocumentWrite('x');
      markOwnDriversWrite();
    }).not.toThrow();
  });

  it('forwards an external change to the renderer, but drops the app’s own write', async () => {
    await createDocument(dir, { document: doc('d1', 'one'), folderId: null });
    startProjectWatcher(dir, () => win as never);
    await settle(200);
    // The app's own write (marked first, like the IPC handler does) is suppressed ...
    markOwnDocumentWrite('d1');
    await writeDocument(dir, doc('d1', 'one'));
    await settle(600);
    expect(send).not.toHaveBeenCalled();
    // ... an external write (nobody marked it) is delivered, once the 1 s suppression window has passed.
    await settle(1000);
    await writeDocument(dir, { ...doc('d1', 'one'), data: { changed: 1 } });
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith(IPC.projectChanged, expect.anything()), { timeout: 3000 });
  });

  it('starting a second watcher stops the first', async () => {
    startProjectWatcher(dir, () => win as never);
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'falang-watch2-'));
    try {
      await createProject(other, { name: 'Q', type: 'arduino' });
      startProjectWatcher(other, () => win as never);
      await settle(200);
      send.mockReset();
      await createDocument(dir, { document: doc('d9', 'late'), folderId: null });
      await settle(800);
      expect(send).not.toHaveBeenCalled();
    } finally {
      stopProjectWatcher();
      await fs.rm(other, { recursive: true, force: true });
    }
  });

  it('withOwnDocumentMoves marks ids before and after the op, and runs the op', async () => {
    await createDocument(dir, { document: doc('d1', 'one'), folderId: null });
    const order: string[] = [];
    const result = await withOwnDocumentMoves(
      dir,
      (tree) => {
        order.push(`resolve:${tree.documents.length}`);
        return ['d1'];
      },
      async () => {
        order.push('op');
        return 42;
      },
    );
    expect(result).toBe(42);
    expect(order).toEqual(['resolve:1', 'op']);
  });

  it('withOwnDocumentMoves still runs the op if the tree cannot be listed, and propagates op errors', async () => {
    const missing = path.join(dir, 'nope');
    await expect(
      withOwnDocumentMoves(
        missing,
        () => ['never'],
        async () => 'ran',
      ),
    ).resolves.toBe('ran');
    await expect(
      withOwnDocumentMoves(
        dir,
        () => [],
        async () => {
          throw new Error('op failed');
        },
      ),
    ).rejects.toThrow('op failed');
  });

  it('documentIdsInFolder includes nested folders and excludes root/other-folder documents', async () => {
    const a = await createFolder(dir, { name: 'a', parentId: null });
    const b = await createFolder(dir, { name: 'b', parentId: a.id ?? (a as never) });
    const other = await createFolder(dir, { name: 'other', parentId: null });
    await createDocument(dir, { document: doc('in-a', 'ina'), folderId: a.id });
    await createDocument(dir, { document: doc('in-b', 'inb'), folderId: b.id });
    await createDocument(dir, { document: doc('in-other', 'ino'), folderId: other.id });
    await createDocument(dir, { document: doc('root', 'root'), folderId: null });
    const tree = await listTree(dir);
    expect(documentIdsInFolder(tree, a.id).toSorted()).toEqual(['in-a', 'in-b']);
  });
});
