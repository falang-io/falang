import { promises as fs } from 'node:fs';
import { nanoid } from 'nanoid';
import type { IProjectTreeFolder } from '@falang/dto';
import { readManifest, writeManifest } from './manifest.js';
import { documentPath } from './paths.js';

export const createFolder = async (
  projectDir: string,
  params: { name: string; parentId: string | null },
): Promise<IProjectTreeFolder> => {
  const manifest = await readManifest(projectDir);
  const folder: IProjectTreeFolder = { id: nanoid(), name: params.name, parentId: params.parentId };
  manifest.folders.push(folder);
  await writeManifest(projectDir, manifest);
  return folder;
};

export const renameFolder = async (projectDir: string, folderId: string, name: string): Promise<void> => {
  const manifest = await readManifest(projectDir);
  const folder = manifest.folders.find((entry) => entry.id === folderId);
  if (!folder) throw new Error(`Folder "${folderId}" not found in this project`);
  folder.name = name;
  await writeManifest(projectDir, manifest);
};

/** IDs of every folder nested (at any depth) under `folderId`, not including `folderId` itself. */
export const getFolderDescendantIds = (folders: IProjectTreeFolder[], folderId: string): string[] => {
  const descendantIds = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (
        folder.parentId !== null &&
        (folder.parentId === folderId || descendantIds.has(folder.parentId)) &&
        !descendantIds.has(folder.id)
      ) {
        descendantIds.add(folder.id);
        grew = true;
      }
    }
  }
  return [...descendantIds];
};

/** Moves a folder under a different parent (or to the project root, when `parentId` is `null`). */
export const moveFolder = async (projectDir: string, folderId: string, parentId: string | null): Promise<void> => {
  const manifest = await readManifest(projectDir);
  const folder = manifest.folders.find((entry) => entry.id === folderId);
  if (!folder) throw new Error(`Folder "${folderId}" not found in this project`);
  if (parentId !== null) {
    if (parentId === folderId) throw new Error('A folder cannot be moved into itself');
    if (getFolderDescendantIds(manifest.folders, folderId).includes(parentId))
      throw new Error('A folder cannot be moved into its own descendant');
  }
  folder.parentId = parentId;
  await writeManifest(projectDir, manifest);
};

/**
 * Cascading delete, matching `packages/workflow/backend`'s `ON DELETE CASCADE` on both
 * `Folder.parentId` and `Document.folderId`: removes `folderId` plus every folder nested under
 * it, plus every document filed under any of those folders (including their payload files).
 */
export const deleteFolder = async (projectDir: string, folderId: string): Promise<void> => {
  const manifest = await readManifest(projectDir);

  const folderIdsToDelete = new Set<string>([folderId, ...getFolderDescendantIds(manifest.folders, folderId)]);

  const documentsToDelete = manifest.documents.filter(
    (doc) => doc.folderId !== null && folderIdsToDelete.has(doc.folderId),
  );

  manifest.folders = manifest.folders.filter((folder) => !folderIdsToDelete.has(folder.id));
  manifest.documents = manifest.documents.filter(
    (doc) => !(doc.folderId !== null && folderIdsToDelete.has(doc.folderId)),
  );
  await writeManifest(projectDir, manifest);

  await Promise.all(documentsToDelete.map((doc) => fs.rm(documentPath(projectDir, doc.id), { force: true })));
};
