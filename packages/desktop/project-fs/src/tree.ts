import type { IProjectTreeDocument, IProjectTreeFolder } from '@falang/dto';
import { readManifest } from './manifest.js';

export interface IProjectTree {
  folders: IProjectTreeFolder[];
  documents: IProjectTreeDocument[];
}

/**
 * Structure-only listing (no `root`/`data` payloads), read straight from the manifest — mirrors
 * `packages/workflow/backend`'s `TreeController`. Callers load this first, then fetch individual
 * documents' full payloads via `readDocument` on demand (e.g. when a tab is opened).
 */
export const listTree = async (projectDir: string): Promise<IProjectTree> => {
  const manifest = await readManifest(projectDir);
  return { folders: manifest.folders, documents: manifest.documents };
};
