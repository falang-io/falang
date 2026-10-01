import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IProjectDocument } from '@falang/dto';
import { computeFileName, documentFilePath } from './layout.js';
import { writeManifest } from './manifest.js';
import { withProjectLock } from './project-lock.js';
import { movePath, pruneEmptyDirs, readLayoutManifest, reconcileProjectLayoutUnlocked } from './reconcile-layout.js';
import type { IManifestDocument, IProjectManifest } from './types.js';

const parseDocument = (raw: unknown, sourcePath: string): IProjectDocument => {
  if (typeof raw !== 'object' || raw === null) throw new Error(`Invalid document at ${sourcePath}: not an object`);
  const document = raw as Record<string, unknown>;
  if (typeof document.id !== 'string') throw new Error(`Invalid document at ${sourcePath}: missing "id"`);
  if (typeof document.type !== 'string') throw new Error(`Invalid document at ${sourcePath}: missing "type"`);
  if (typeof document.name !== 'string') throw new Error(`Invalid document at ${sourcePath}: missing "name"`);
  return document as unknown as IProjectDocument;
};

const findEntry = (manifest: IProjectManifest, documentId: string): IManifestDocument => {
  const entry = manifest.documents.find((doc) => doc.id === documentId);
  if (!entry) throw new Error(`Document "${documentId}" not found in this project`);
  return entry;
};

const readFileAt = async (filePath: string): Promise<IProjectDocument> =>
  parseDocument(JSON.parse(await fs.readFile(filePath, 'utf8')), filePath);

/** Reads `entry`'s payload file given an already-loaded manifest — no repair pass, no manifest re-read (for bulk readers). */
export const readDocumentFile = (
  projectDir: string,
  manifest: IProjectManifest,
  entry: IManifestDocument,
): Promise<IProjectDocument> => readFileAt(documentFilePath(projectDir, manifest, entry));

const isNotFound = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * Reads a document's payload file — located through the manifest (`falang/schemes/<folder path>/<name>.json`).
 * If the file isn't at its expected path (moved by hand, crash between a file move and the manifest
 * write, …) the layout is reconciled once (`reconcileProjectLayout` finds it by `id`) before giving up.
 */
const readDocumentUnlocked = async (projectDir: string, documentId: string): Promise<IProjectDocument> => {
  const manifest = await readLayoutManifest(projectDir);
  try {
    return await readFileAt(documentFilePath(projectDir, manifest, findEntry(manifest, documentId)));
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }
  const repaired = await reconcileProjectLayoutUnlocked(projectDir);
  return readFileAt(documentFilePath(projectDir, repaired, findEntry(repaired, documentId)));
};

export const readDocument = (projectDir: string, documentId: string): Promise<IProjectDocument> =>
  withProjectLock(projectDir, () => readDocumentUnlocked(projectDir, documentId));

/** Overwrites a document's payload file only — the manifest's tree entry is untouched. The document must be in the manifest. */
const writeDocumentUnlocked = async (projectDir: string, document: IProjectDocument): Promise<void> => {
  const manifest = await readLayoutManifest(projectDir);
  const filePath = documentFilePath(projectDir, manifest, findEntry(manifest, document.id));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(document, null, 2));
};

export const writeDocument = (projectDir: string, document: IProjectDocument): Promise<void> =>
  withProjectLock(projectDir, () => writeDocumentUnlocked(projectDir, document));

const createDocumentUnlocked = async (
  projectDir: string,
  params: { document: IProjectDocument; folderId: string | null },
): Promise<void> => {
  const manifest = await readLayoutManifest(projectDir);
  if (manifest.documents.some((doc) => doc.id === params.document.id))
    throw new Error(`Document "${params.document.id}" already exists in this project`);

  const entry: IManifestDocument = {
    id: params.document.id,
    type: params.document.type,
    name: params.document.name,
    folderId: params.folderId,
    fileName: computeFileName(manifest, params.document, params.folderId),
  };
  const filePath = documentFilePath(projectDir, manifest, entry);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(params.document, null, 2));
  manifest.documents.push(entry);
  await writeManifest(projectDir, manifest);
};

export const createDocument = (
  projectDir: string,
  params: { document: IProjectDocument; folderId: string | null },
): Promise<void> => withProjectLock(projectDir, () => createDocumentUnlocked(projectDir, params));

const deleteDocumentUnlocked = async (projectDir: string, documentId: string): Promise<void> => {
  const manifest = await readLayoutManifest(projectDir);
  const entry = manifest.documents.find((doc) => doc.id === documentId);
  const filePath = entry ? documentFilePath(projectDir, manifest, entry) : null;
  manifest.documents = manifest.documents.filter((doc) => doc.id !== documentId);
  await writeManifest(projectDir, manifest);
  if (filePath) await fs.rm(filePath, { force: true });
  await pruneEmptyDirs(projectDir, manifest);
};

export const deleteDocument = (projectDir: string, documentId: string): Promise<void> =>
  withProjectLock(projectDir, () => deleteDocumentUnlocked(projectDir, documentId));

/** Renames a document: keeps the manifest entry, the document's own `name` and its file name on disk in sync. */
const renameDocumentUnlocked = async (projectDir: string, documentId: string, name: string): Promise<void> => {
  const document = await readDocumentUnlocked(projectDir, documentId);
  const manifest = await readLayoutManifest(projectDir);
  const entry = findEntry(manifest, documentId);

  const oldPath = documentFilePath(projectDir, manifest, entry);
  entry.name = name;
  entry.fileName = computeFileName(manifest, entry, entry.folderId);
  const newPath = documentFilePath(projectDir, manifest, entry);

  await movePath(oldPath, newPath);
  await fs.writeFile(newPath, JSON.stringify({ ...document, name }, null, 2));
  await writeManifest(projectDir, manifest);
};

export const renameDocument = (projectDir: string, documentId: string, name: string): Promise<void> =>
  withProjectLock(projectDir, () => renameDocumentUnlocked(projectDir, documentId, name));

/** Moves a document to a different folder (or to the project root, when `folderId` is `null`). */
const moveDocumentUnlocked = async (projectDir: string, documentId: string, folderId: string | null): Promise<void> => {
  const manifest = await readLayoutManifest(projectDir);
  const entry = findEntry(manifest, documentId);

  const oldPath = documentFilePath(projectDir, manifest, entry);
  entry.folderId = folderId;
  entry.fileName = computeFileName(manifest, entry, folderId);
  const newPath = documentFilePath(projectDir, manifest, entry);

  await movePath(oldPath, newPath);
  await writeManifest(projectDir, manifest);
  await pruneEmptyDirs(projectDir, manifest);
};

export const moveDocument = (projectDir: string, documentId: string, folderId: string | null): Promise<void> =>
  withProjectLock(projectDir, () => moveDocumentUnlocked(projectDir, documentId, folderId));
