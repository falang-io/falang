import { promises as fs } from 'node:fs';
import { nanoid } from 'nanoid';
import type { IProjectTreeFolder } from '@falang/dto';
import { computeDirName, folderDirPath } from './layout.js';
import { writeManifest } from './manifest.js';
import { withProjectLock } from './project-lock.js';
import { movePath, pruneEmptyDirs, readLayoutManifest } from './reconcile-layout.js';
import type { IManifestFolder, IProjectManifest } from './types.js';

const findFolder = (manifest: IProjectManifest, folderId: string): IManifestFolder => {
  const folder = manifest.folders.find((entry) => entry.id === folderId);
  if (!folder) throw new Error(`Folder "${folderId}" not found in this project`);
  return folder;
};

const createFolderUnlocked = async (
  projectDir: string,
  params: { name: string; parentId: string | null },
): Promise<IProjectTreeFolder> => {
  const manifest = await readLayoutManifest(projectDir);
  const folder: IManifestFolder = { id: nanoid(), name: params.name, parentId: params.parentId };
  folder.dirName = computeDirName(manifest, folder, params.parentId);
  await fs.mkdir(folderDirPath(projectDir, { ...manifest, folders: [...manifest.folders, folder] }, folder.id), {
    recursive: true,
  });
  manifest.folders.push(folder);
  await writeManifest(projectDir, manifest);
  return { id: folder.id, name: folder.name, parentId: folder.parentId };
};

export const createFolder = (
  projectDir: string,
  params: { name: string; parentId: string | null },
): Promise<IProjectTreeFolder> => withProjectLock(projectDir, () => createFolderUnlocked(projectDir, params));

const renameFolderUnlocked = async (projectDir: string, folderId: string, name: string): Promise<void> => {
  const manifest = await readLayoutManifest(projectDir);
  const folder = findFolder(manifest, folderId);
  const oldDir = folderDirPath(projectDir, manifest, folderId);
  folder.name = name;
  folder.dirName = computeDirName(manifest, folder, folder.parentId);
  await movePath(oldDir, folderDirPath(projectDir, manifest, folderId));
  await writeManifest(projectDir, manifest);
};

export const renameFolder = (projectDir: string, folderId: string, name: string): Promise<void> =>
  withProjectLock(projectDir, () => renameFolderUnlocked(projectDir, folderId, name));

/** IDs of every folder nested (at any depth) under `folderId`, not including `folderId` itself. */
export const getFolderDescendantIds = (folders: readonly IProjectTreeFolder[], folderId: string): string[] => {
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
const moveFolderUnlocked = async (projectDir: string, folderId: string, parentId: string | null): Promise<void> => {
  const manifest = await readLayoutManifest(projectDir);
  const folder = findFolder(manifest, folderId);
  if (parentId !== null) {
    if (parentId === folderId) throw new Error('A folder cannot be moved into itself');
    if (getFolderDescendantIds(manifest.folders, folderId).includes(parentId))
      throw new Error('A folder cannot be moved into its own descendant');
  }
  const oldDir = folderDirPath(projectDir, manifest, folderId);
  folder.parentId = parentId;
  folder.dirName = computeDirName(manifest, folder, parentId);
  await movePath(oldDir, folderDirPath(projectDir, manifest, folderId));
  await writeManifest(projectDir, manifest);
  await pruneEmptyDirs(projectDir, manifest);
};

export const moveFolder = (projectDir: string, folderId: string, parentId: string | null): Promise<void> =>
  withProjectLock(projectDir, () => moveFolderUnlocked(projectDir, folderId, parentId));

/**
 * Cascading delete, matching `packages/workflow/backend`'s `ON DELETE CASCADE` on both
 * `Folder.parentId` and `Document.folderId`: removes `folderId` plus every folder nested under
 * it, plus every document filed under any of those folders (the folder's directory is removed
 * recursively, which takes their payload files with it).
 */
const deleteFolderUnlocked = async (projectDir: string, folderId: string): Promise<void> => {
  const manifest = await readLayoutManifest(projectDir);
  const dir = manifest.folders.some((folder) => folder.id === folderId)
    ? folderDirPath(projectDir, manifest, folderId)
    : null;

  const folderIdsToDelete = new Set<string>([folderId, ...getFolderDescendantIds(manifest.folders, folderId)]);
  manifest.folders = manifest.folders.filter((folder) => !folderIdsToDelete.has(folder.id));
  manifest.documents = manifest.documents.filter(
    (doc) => !(doc.folderId !== null && folderIdsToDelete.has(doc.folderId)),
  );
  await writeManifest(projectDir, manifest);

  if (dir) await fs.rm(dir, { recursive: true, force: true });
  await pruneEmptyDirs(projectDir, manifest);
};

export const deleteFolder = (projectDir: string, folderId: string): Promise<void> =>
  withProjectLock(projectDir, () => deleteFolderUnlocked(projectDir, folderId));
