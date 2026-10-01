import {
  getFolderDescendantIds,
  listTree,
  watchProject,
  type IProjectChangeEvent,
  type IProjectWatcher,
} from '@falang/desktop-project-fs';
import type { BrowserWindow } from 'electron';
import { IPC } from '../shared/ipc-channels.js';

/**
 * One `IProjectWatcher` at a time — this app opens one project per window (see
 * ADR 0029 (private)'s "Filesystem watcher" decision). Module-level state, mirroring the
 * existing `recent-projects.ts`/`settings.ts` posture (no DI container in `main`, plain module
 * singletons keyed by "there's only ever one of these running at once").
 */
let currentWatcher: IProjectWatcher | null = null;

/** Stops the previously-open project's watcher, if any. Safe to call with none active. Called both when another project opens and when the window closes. */
export const stopProjectWatcher = (): void => {
  currentWatcher?.stop();
  currentWatcher = null;
};

/** Starts watching `dir`, pushing every change to the renderer over `IPC.projectChanged`. Stops any previously-active watcher first (opening a second project replaces the first, never runs both). */
export const startProjectWatcher = (
  dir: string,
  getMainWindow: () => BrowserWindow | null,
  // ADR 0054 (private): `falang/drivers/` changed on disk (a hand edit, a git checkout, a version restore) — `main` reloads its driver registry.
  onDriversChanged?: () => void,
): void => {
  stopProjectWatcher();
  currentWatcher = watchProject(dir, (event: IProjectChangeEvent) => {
    getMainWindow()?.webContents.send(IPC.projectChanged, event);
    if (event.kind === 'drivers') onDriversChanged?.();
  });
};

/** Call around `main`'s own write into `<project>/falang/drivers/` so it does not come back as a `drivers` change. No-op if no watcher is active. */
export const markOwnDriversWrite = (): void => {
  currentWatcher?.markOwnDriversWrite();
};

/** Call right when `main` itself writes a document (the renderer's debounced autosave, via `IPC.documentWrite`) so the watcher drops the matching filesystem event instead of bouncing it back to the renderer as an external change. No-op if no watcher is active. */
export const markOwnDocumentWrite = (documentId: string): void => {
  currentWatcher?.markOwnWrite(documentId);
};

/**
 * Runs `op` (a rename/move that relocates document files on disk — a document's file is named after
 * the scheme and sits in its folder's directory) while marking `documentIds` as own writes, so the
 * app's own file moves aren't bounced back to the renderer as "changed on disk". The ids are marked
 * before the op and again after it (the debounced events can arrive after a slow op finishes).
 * `documentIds` is resolved against the tree as it is *before* the op.
 */
export const withOwnDocumentMoves = async <T>(
  dir: string,
  resolveDocumentIds: (tree: Awaited<ReturnType<typeof listTree>>) => string[],
  op: () => Promise<T>,
): Promise<T> => {
  const ids = await listTree(dir).then(resolveDocumentIds, () => [] as string[]);
  for (const id of ids) markOwnDocumentWrite(id);
  try {
    return await op();
  } finally {
    for (const id of ids) markOwnDocumentWrite(id);
  }
};

/** Ids of every document filed under `folderId` or any folder nested below it (they all move with the folder). */
export const documentIdsInFolder = (tree: Awaited<ReturnType<typeof listTree>>, folderId: string): string[] => {
  const folderIds = new Set([folderId, ...getFolderDescendantIds(tree.folders, folderId)]);
  return tree.documents.filter((doc) => doc.folderId !== null && folderIds.has(doc.folderId)).map((doc) => doc.id);
};
