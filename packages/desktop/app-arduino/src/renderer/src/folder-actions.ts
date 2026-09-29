import { runInAction } from 'mobx';
import { reportError } from '../../shared/report-error.js';
import type { ArduinoProjectStore } from './arduino-project-store.js';

/**
 * Folder CRUD for `ArduinoProjectStore`, pulled out into free functions (bound to the store instance
 * via its first parameter) purely to keep that class under the repo's line-count lint budget — not a
 * reusable module, `arduino-project-store.ts`'s own thin `@action` methods are the only caller.
 */
export const getFolderDescendantIds = (store: ArduinoProjectStore, folderId: string): string[] => {
  const direct = store.folders.filter((f) => f.parentId === folderId).map((f) => f.id);
  const result: string[] = [...direct];
  for (const childId of direct) result.push(...getFolderDescendantIds(store, childId));
  return result;
};

export const createFolder = async (
  store: ArduinoProjectStore,
  name: string,
  parentId: string | null,
): Promise<void> => {
  const folder = await globalThis.falang.folder.create(store.projectDir, { name, parentId });
  runInAction(() => store.folders.push(folder));
};

export const renameFolder = (store: ArduinoProjectStore, id: string, name: string): void => {
  const folder = store.folders.find((f) => f.id === id);
  if (!folder) return;
  folder.name = name;
  globalThis.falang.folder
    .rename(store.projectDir, id, name)
    .catch((error: unknown) => reportError('Failed to rename folder', error));
};

export const moveFolder = (store: ArduinoProjectStore, folderId: string, parentId: string | null): void => {
  if (parentId !== null) {
    if (folderId === parentId) return;
    if (getFolderDescendantIds(store, folderId).includes(parentId)) return;
  }
  const folder = store.folders.find((f) => f.id === folderId);
  if (!folder) return;
  folder.parentId = parentId;
  globalThis.falang.folder
    .move(store.projectDir, folderId, parentId)
    .catch((error: unknown) => reportError('Failed to move folder', error));
};

export const deleteFolder = (store: ArduinoProjectStore, id: string): void => {
  const allIds = new Set([id, ...getFolderDescendantIds(store, id)]);
  const docsToDelete = store.documents.filter((d) => d.folderId !== null && allIds.has(d.folderId));
  for (const doc of docsToDelete) store.closeTab(doc.id);
  store.documents.replace(store.documents.filter((d) => d.folderId === null || !allIds.has(d.folderId)));
  store.folders.replace(store.folders.filter((f) => !allIds.has(f.id)));
  globalThis.falang.folder
    .delete(store.projectDir, id)
    .catch((error: unknown) => reportError('Failed to delete folder', error));
};
