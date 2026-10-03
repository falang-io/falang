import type { IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';
import { readManifest } from './manifest.js';
import { withProjectLock } from './project-lock.js';

export interface IProjectTree {
  folders: IProjectTreeFolder[];
  documents: IProjectTreeDocument[];
}

const toTreeFolder = (folder: IProjectTreeFolder & { dirName?: string }): IProjectTreeFolder => {
  const { dirName: _dirName, ...rest } = folder;
  return rest;
};

const toTreeDocument = (document: IProjectTreeDocument & { fileName?: string }): IProjectTreeDocument => {
  const { fileName: _fileName, ...rest } = document;
  return rest;
};

/**
 * Structure-only listing (no `root`/`data` payloads), read straight from the manifest — mirrors
 * `packages/workflow/backend`'s `TreeController`. Callers load this first, then fetch individual
 * documents' full payloads via `readDocument` on demand (e.g. when a tab is opened). The manifest's
 * internal on-disk segments (`fileName`/`dirName`) are not part of the listing.
 */
export const listTree = (projectDir: string): Promise<IProjectTree> =>
  withProjectLock(projectDir, async () => {
    const manifest = await readManifest(projectDir);
    return { folders: manifest.folders.map(toTreeFolder), documents: manifest.documents.map(toTreeDocument) };
  });
