import { promises as fs } from 'node:fs';
import type { IProjectDocument } from '@falang/dto';
import { readManifest, writeManifest } from './manifest.js';
import { documentPath } from './paths.js';

const parseDocument = (raw: unknown, sourcePath: string): IProjectDocument => {
  if (typeof raw !== 'object' || raw === null) throw new Error(`Invalid document at ${sourcePath}: not an object`);
  const document = raw as Record<string, unknown>;
  if (typeof document.id !== 'string') throw new Error(`Invalid document at ${sourcePath}: missing "id"`);
  if (typeof document.type !== 'string') throw new Error(`Invalid document at ${sourcePath}: missing "type"`);
  if (typeof document.name !== 'string') throw new Error(`Invalid document at ${sourcePath}: missing "name"`);
  return document as unknown as IProjectDocument;
};

export const readDocument = async (projectDir: string, documentId: string): Promise<IProjectDocument> => {
  const filePath = documentPath(projectDir, documentId);
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return parseDocument(raw, filePath);
};

/** Overwrites a document's payload file only — the manifest's tree entry is untouched. */
export const writeDocument = async (projectDir: string, document: IProjectDocument): Promise<void> => {
  await fs.writeFile(documentPath(projectDir, document.id), JSON.stringify(document, null, 2));
};

export const createDocument = async (
  projectDir: string,
  params: { document: IProjectDocument; folderId: string | null },
): Promise<void> => {
  const manifest = await readManifest(projectDir);
  if (manifest.documents.some((doc) => doc.id === params.document.id))
    throw new Error(`Document "${params.document.id}" already exists in this project`);

  await writeDocument(projectDir, params.document);
  manifest.documents.push({
    id: params.document.id,
    type: params.document.type,
    name: params.document.name,
    folderId: params.folderId,
  });
  await writeManifest(projectDir, manifest);
};

export const deleteDocument = async (projectDir: string, documentId: string): Promise<void> => {
  const manifest = await readManifest(projectDir);
  manifest.documents = manifest.documents.filter((doc) => doc.id !== documentId);
  await writeManifest(projectDir, manifest);
  await fs.rm(documentPath(projectDir, documentId), { force: true });
};

/** Renames a document, keeping the manifest's tree entry and the document file's own `name` in sync. */
export const renameDocument = async (projectDir: string, documentId: string, name: string): Promise<void> => {
  const manifest = await readManifest(projectDir);
  const entry = manifest.documents.find((doc) => doc.id === documentId);
  if (!entry) throw new Error(`Document "${documentId}" not found in this project`);
  entry.name = name;
  await writeManifest(projectDir, manifest);

  const document = await readDocument(projectDir, documentId);
  await writeDocument(projectDir, { ...document, name });
};

/** Moves a document to a different folder (or to the project root, when `folderId` is `null`). */
export const moveDocument = async (projectDir: string, documentId: string, folderId: string | null): Promise<void> => {
  const manifest = await readManifest(projectDir);
  const entry = manifest.documents.find((doc) => doc.id === documentId);
  if (!entry) throw new Error(`Document "${documentId}" not found in this project`);
  entry.folderId = folderId;
  await writeManifest(projectDir, manifest);
};
