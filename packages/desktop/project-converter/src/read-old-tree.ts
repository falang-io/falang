import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { IOldScheme } from './old-types.js';

const OLD_SCHEME_SUFFIX = '.falang.json';

export interface IOldDocumentEntry {
  /** Path segments from `falang/schemas/` down to (but not including) the document's own file. */
  relativeDir: string[];
  scheme: IOldScheme;
  /** Absolute path of the source `*.falang.json` file, for error messages. */
  filePath: string;
}

const exists = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Recursively collects every old document under `<projectDir>/falang/schemas/`, preserving the
 * folder nesting it was found under (folder nesting there mirrors the project tree 1:1 — one
 * `*.falang.json` file per document, real folders on disk for the tree's own folders — confirmed
 * against `old/resources/test-projects/{arrays,objects}`, both of which nest documents under
 * `Folder1`/`Folder2`/`TestFunctions1`/`TestFunctions2`).
 */
const walkOldSchemaDir = async (dir: string, relativeDir: string[]): Promise<IOldDocumentEntry[]> => {
  const dirEntries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    dirEntries.map(async (dirEntry): Promise<IOldDocumentEntry[]> => {
      const fullPath = path.join(dir, dirEntry.name);
      if (dirEntry.isDirectory()) return walkOldSchemaDir(fullPath, [...relativeDir, dirEntry.name]);
      if (!dirEntry.isFile() || !dirEntry.name.endsWith(OLD_SCHEME_SUFFIX)) return [];

      const raw = JSON.parse(await fs.readFile(fullPath, 'utf8')) as Record<string, unknown>;
      if (typeof raw.id !== 'string' || typeof raw.type !== 'string' || typeof raw.root !== 'object')
        throw new Error(`Invalid old document at ${fullPath}`);
      // The old app named each file `<scheme name>.falang.json` (all 61 real fixtures agree: the JSON's own
      // `name` equals the file name). The JSON `name` wins when present (it is the unsanitized original);
      // a missing/blank one falls back to the file name, so the new `<name>.json` never ends up empty.
      if (typeof raw.name !== 'string' || raw.name.trim() === '')
        raw.name = dirEntry.name.slice(0, -OLD_SCHEME_SUFFIX.length);
      return [{ relativeDir, scheme: raw as unknown as IOldScheme, filePath: fullPath }];
    }),
  );
  return nested.flat();
};

export const readOldDocumentEntries = async (projectDir: string): Promise<IOldDocumentEntry[]> => {
  const schemasDir = path.join(projectDir, 'falang', 'schemas');
  if (!(await exists(schemasDir))) return [];
  return walkOldSchemaDir(schemasDir, []);
};

export interface IOldFolderSpec {
  /** Joined relative-dir path (e.g. `'Folder1/Sub'`) — unique key, never `''` (the project root). */
  path: string;
  name: string;
  /** Parent folder's `path` key, or `null` for a top-level folder. */
  parentPath: string | null;
}

/**
 * Lists every distinct `relativeDir` seen across `entries` — one folder per old directory level —
 * in parent-before-child order, ready to be created one at a time through `@falang/desktop-project-fs`'s
 * `createFolder` (which assigns each folder's real id itself; this converter has no id of its own
 * to give it, unlike documents/nodes — see ADR 0005 (private)'s "Implementation notes").
 */
export const listOldFolderSpecs = (entries: IOldDocumentEntry[]): IOldFolderSpec[] => {
  const specs = new Map<string, IOldFolderSpec>();

  const ensureFolder = (segments: string[]): void => {
    if (segments.length === 0) return;
    const key = segments.join('/');
    if (specs.has(key)) return;
    ensureFolder(segments.slice(0, -1));
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null;
    specs.set(key, { path: key, name: segments.at(-1) as string, parentPath });
  };

  for (const entry of entries) ensureFolder(entry.relativeDir);
  // Insertion order is already parent-before-child (`ensureFolder` recurses into the parent first).
  return [...specs.values()];
};
