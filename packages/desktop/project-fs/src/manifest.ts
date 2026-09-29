import { promises as fs } from 'node:fs';
import type { IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';
import { manifestPath } from './paths.js';
import { FORMAT_VERSION, type IProjectManifest } from './types.js';

const isTreeFolder = (value: unknown): value is IProjectTreeFolder => {
  if (typeof value !== 'object' || value === null) return false;
  const folder = value as Record<string, unknown>;
  return (
    typeof folder.id === 'string' &&
    typeof folder.name === 'string' &&
    (typeof folder.parentId === 'string' || folder.parentId === null)
  );
};

const isTreeDocument = (value: unknown): value is IProjectTreeDocument => {
  if (typeof value !== 'object' || value === null) return false;
  const document = value as Record<string, unknown>;
  return (
    typeof document.id === 'string' &&
    typeof document.type === 'string' &&
    typeof document.name === 'string' &&
    (typeof document.folderId === 'string' || document.folderId === null)
  );
};

const parseManifest = (raw: unknown, sourcePath: string): IProjectManifest => {
  if (typeof raw !== 'object' || raw === null)
    throw new Error(`Invalid project manifest at ${sourcePath}: not an object`);
  const manifest = raw as Record<string, unknown>;
  if (typeof manifest.name !== 'string') throw new Error(`Invalid project manifest at ${sourcePath}: missing "name"`);
  if (typeof manifest.type !== 'string') throw new Error(`Invalid project manifest at ${sourcePath}: missing "type"`);
  if (typeof manifest.formatVersion !== 'number')
    throw new Error(`Invalid project manifest at ${sourcePath}: missing "formatVersion"`);
  if (!Array.isArray(manifest.folders) || !manifest.folders.every(isTreeFolder))
    throw new Error(`Invalid project manifest at ${sourcePath}: "folders" must be IProjectTreeFolder[]`);
  if (!Array.isArray(manifest.documents) || !manifest.documents.every(isTreeDocument))
    throw new Error(`Invalid project manifest at ${sourcePath}: "documents" must be IProjectTreeDocument[]`);

  return {
    name: manifest.name,
    type: manifest.type,
    formatVersion: manifest.formatVersion,
    folders: manifest.folders,
    documents: manifest.documents,
  };
};

export const readManifest = async (projectDir: string): Promise<IProjectManifest> => {
  const filePath = manifestPath(projectDir);
  const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
  return parseManifest(raw, filePath);
};

export const writeManifest = async (projectDir: string, manifest: IProjectManifest): Promise<void> => {
  await fs.writeFile(manifestPath(projectDir), JSON.stringify(manifest, null, 2));
};

export const createEmptyManifest = (params: { name: string; type: string }): IProjectManifest => ({
  name: params.name,
  type: params.type,
  formatVersion: FORMAT_VERSION,
  folders: [],
  documents: [],
});
